import asyncio
from unittest.mock import AsyncMock, patch

from app.rag.models import RetrievedChunk, RetrievalResult
from app.workflow.memory import (
    BUILTIN_PROCEDURAL_RULES,
    episodic_memory_service,
    load_procedural_rules,
    parse_custom_rules_content,
)
from app.workflow.nodes import build_context_node
from app.workflow.state import create_initial_review_state


def test_builtin_procedural_rules_defaults():
    rules = load_procedural_rules(repo_name="iamarin2224/PRism", repo_files=None)
    assert len(rules) >= len(BUILTIN_PROCEDURAL_RULES)
    rule_ids = {r["id"] for r in rules}
    assert "SEC-001" in rule_ids
    assert "SEC-002" in rule_ids
    assert "QUAL-001" in rule_ids
    assert "TEST-001" in rule_ids
    assert "DOC-001" in rule_ids


def test_parse_custom_yaml_rules():
    yaml_content = """
    - id: ORG-SEC-01
      domain: security
      title: Mandatory OAuth2 Scopes
      description: All API endpoints must enforce granular OAuth2 scopes.
      severity: critical
    - id: ORG-QUAL-01
      domain: quality
      title: No Mutable Defaults
      description: Avoid mutable default arguments in function definitions.
      severity: medium
    """
    custom = parse_custom_rules_content(".prism/rules.yml", yaml_content)
    assert len(custom) == 2
    assert custom[0]["id"] == "ORG-SEC-01"
    assert custom[0]["severity"] == "critical"
    assert custom[0]["source"] == "repo"
    assert custom[1]["id"] == "ORG-QUAL-01"


def test_parse_custom_markdown_rules():
    md_content = """
    # PRism Review Guidelines
    - Enforce snake_case naming for all internal Python functions.
    - All database writes must be wrapped inside a transaction block.
    """
    custom = parse_custom_rules_content(".prism/rules.md", md_content)
    assert len(custom) == 2
    assert custom[0]["source"] == "repo"
    assert "snake_case" in custom[0]["description"]


def test_episodic_finding_hash_deterministic():
    h1 = episodic_memory_service.compute_finding_hash("src/auth/jwt.ts", "SQL Injection Vulnerability")
    h2 = episodic_memory_service.compute_finding_hash("src/auth/jwt.ts", "SQL Injection Vulnerability")
    h3 = episodic_memory_service.compute_finding_hash("src/auth/jwt.ts", "Different Title")

    assert h1 == h2
    assert h1 != h3
    assert len(h1) == 64  # SHA256 hex string


def test_build_context_node_multi_source_grounding():
    state = create_initial_review_state(
        review_run_id="run-grounding-01",
        repo_name="iamarin2224/PRism",
        pr_number=55,
        commit_sha="abc12345",
        pr_metadata={"title": "Refactor authentication flow", "body": "Updates JWT signing logic"},
        diff_summary={
            "files_content": {
                ".prism/rules.yml": "- id: CUSTOM-1\n  domain: security\n  title: Custom Rule\n  description: Custom check\n  severity: high\n"
            }
        },
    )

    mock_chunks = [
        RetrievedChunk(
            id="chunk-1",
            repo_name="iamarin2224/PRism",
            file_path="src/auth/jwt.ts",
            language="typescript",
            start_line=1,
            end_line=25,
            content="export function verifyToken(token: string) {}",
            similarity=0.92,
        )
    ]
    mock_retrieval_res = RetrievalResult(
        repo_name="iamarin2224/PRism",
        query="Refactor authentication flow Updates JWT signing logic",
        chunks=mock_chunks,
        count=1,
        top_k=5,
        latency_ms=12.5,
    )

    mock_episodic_data = [
        {
            "id": "mem-1",
            "repo_name": "iamarin2224/PRism",
            "pr_number": 12,
            "feedback_type": "ACCEPTED",
            "file_path": "src/auth/jwt.ts",
            "title": "Missing signature expiration check",
            "comment": "Good catch",
            "similarity": 0.88,
        }
    ]

    with patch("app.workflow.nodes.context.code_retriever.retrieve", AsyncMock(return_value=mock_retrieval_res)), \
         patch("app.workflow.nodes.context.episodic_memory_service.query_episodic_memory", AsyncMock(return_value=mock_episodic_data)):

        update = asyncio.run(build_context_node(state))

        assert update["status"] == "IN_PROGRESS"
        # Semantic memory contains both current PR semantics and retrieved repository context
        semantic_mem = update["semantic_context"]
        assert isinstance(semantic_mem, dict)
        assert "pr" in semantic_mem
        assert "repository" in semantic_mem
        assert semantic_mem["pr"]["title"] == "Refactor authentication flow"
        assert semantic_mem["pr"]["pr_number"] == 55
        assert ".prism/rules.yml" in semantic_mem["pr"]["changed_files"]
        assert len(semantic_mem["pr"]["changes"]) == 1
        assert semantic_mem["pr"]["changes"][0]["file_path"] == ".prism/rules.yml"
        assert len(semantic_mem["repository"]["retrieved_chunks"]) == 1
        assert semantic_mem["repository"]["retrieved_chunks"][0]["file_path"] == "src/auth/jwt.ts"

        # Procedural memory
        assert len(update["procedural_rules"]) > len(BUILTIN_PROCEDURAL_RULES)
        custom_ids = [r["id"] for r in update["procedural_rules"]]
        assert "CUSTOM-1" in custom_ids

        # Episodic memory
        assert len(update["episodic_context"]) == 1
        assert update["episodic_context"][0]["title"] == "Missing signature expiration check"


def test_build_context_node_semantic_rag_fallback():
    """Test that when code_retriever fails, PR semantics remain intact in Semantic Memory."""
    state = create_initial_review_state(
        review_run_id="run-fallback-test",
        repo_name="iamarin2224/PRism",
        pr_number=50,
        commit_sha="c50",
        pr_metadata={"title": "Fix memory leak", "body": "Clean up buffer"},
        diff_summary={"files_content": {"src/buffer.py": "def clean(): pass"}},
    )

    with patch("app.workflow.nodes.context.code_retriever.retrieve", AsyncMock(side_effect=RuntimeError("Vector DB offline"))), \
         patch("app.workflow.nodes.context.episodic_memory_service.query_episodic_memory", AsyncMock(return_value=[])):

        update = asyncio.run(build_context_node(state))

        assert update["status"] == "IN_PROGRESS"
        semantic_mem = update["semantic_context"]
        assert isinstance(semantic_mem, dict)
        assert semantic_mem["pr"]["title"] == "Fix memory leak"
        assert "src/buffer.py" in semantic_mem["pr"]["changed_files"]
        assert semantic_mem["repository"]["retrieved_chunks"] == []


def test_specialist_tool_permissions_configuration():
    """Verify specialist tool permissions match exact architecture specifications."""
    from app.workflow.agents import security_agent, quality_agent, tests_agent, docs_agent

    assert set(security_agent.tool_names) == {
        "read_file", "search_codebase", "find_references", "get_related_tests",
        "get_git_history", "get_file_history", "get_blame", "web_search", "fetch_webpage"
    }

    assert set(quality_agent.tool_names) == {
        "read_file", "search_codebase", "find_references", "get_related_tests",
        "get_git_history", "get_file_history", "get_blame", "run_linter", "web_search", "fetch_webpage"
    }

    assert set(tests_agent.tool_names) == {
        "read_file", "search_codebase", "find_references", "get_related_tests",
        "run_tests", "run_linter", "web_search", "fetch_webpage"
    }

    assert set(docs_agent.tool_names) == {
        "read_file", "web_search", "fetch_webpage"
    }

