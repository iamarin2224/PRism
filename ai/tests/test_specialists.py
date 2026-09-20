import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.config import settings
from app.models.review import Finding
from app.services.model_router import model_router
from app.workflow.agents import (
    docs_agent,
    quality_agent,
    security_agent,
    tests_agent,
)
from app.workflow.nodes import (
    docs_specialist_node,
    quality_specialist_node,
    security_specialist_node,
    tests_specialist_node as run_tests_specialist_node,
)
from app.workflow.state import create_initial_review_state


def test_model_router_tier_resolution():
    model_router.reset_quota_status()
    # Role tier resolution
    assert model_router.get_tier_for_role("security") == "high"
    assert model_router.get_tier_for_role("critic") == "high"
    assert model_router.get_tier_for_role("quality") == "mid"
    assert model_router.get_tier_for_role("tests") == "mid"
    assert model_router.get_tier_for_role("docs") == "free"

    # When AICREDITS_API_KEY is present
    with patch.object(settings, "AICREDITS_API_KEY", "aicredits_key_test"):
        high_model, high_url, high_key = model_router.get_model_and_endpoint("high")
        assert high_model == settings.HIGH_MODEL
        assert high_url == settings.AICREDITS_BASE_URL
        assert high_key == "aicredits_key_test"

        mid_model, mid_url, mid_key = model_router.get_model_and_endpoint("mid")
        assert mid_model == settings.MID_MODEL
        assert mid_url == settings.AICREDITS_BASE_URL
        assert mid_key == "aicredits_key_test"

        free_model, free_url, free_key = model_router.get_model_and_endpoint("free")
        assert free_model == settings.OPENROUTER_MODEL
        assert free_url == settings.OPENROUTER_BASE_URL

    # When AICREDITS_API_KEY is missing, full fallback to OpenRouter
    with patch.object(settings, "AICREDITS_API_KEY", ""), patch.object(settings, "OPENROUTER_API_KEY", "openrouter_key_test"):
        high_model, high_url, high_key = model_router.get_model_and_endpoint("high")
        assert high_model == settings.OPENROUTER_MODEL
        assert high_url == settings.OPENROUTER_BASE_URL
        assert high_key == "openrouter_key_test"


def test_specialist_output_parsing():
    sample_json_response = """
    ```json
    [
      {
        "file_path": "src/auth/jwt.ts",
        "start_line": 24,
        "end_line": 30,
        "category": "security",
        "severity": "high",
        "title": "Unsigned JWT Verification",
        "description": "The verify function does not validate algorithm header.",
        "suggestion": "Specify algorithms: ['HS256'] explicitly.",
        "confidence": 0.95
      }
    ]
    ```
    """
    findings = security_agent.parse_findings(sample_json_response)
    assert len(findings) == 1
    assert findings[0].file_path == "src/auth/jwt.ts"
    assert findings[0].start_line == 24
    assert findings[0].severity == "high"
    assert findings[0].specialist == "security"
    assert findings[0].confidence == 0.95


def test_specialist_build_prompt():
    state = create_initial_review_state(
        review_run_id="run-spec-01",
        repo_name="iamarin2224/PRism",
        pr_number=99,
        commit_sha="c1",
        pr_metadata={"title": "Fix sql vulnerability", "body": "Sanitizes user input."},
        diff_summary={"files_content": {"db.py": "SELECT * FROM users WHERE id = %s"}},
    )
    state["procedural_rules"] = [
        {"id": "SEC-001", "domain": "security", "severity": "critical", "title": "SQL Injection", "description": "Use parameterized queries."}
    ]
    state["episodic_context"] = [
        {"pr_number": 5, "file_path": "db.py", "title": "SQL Injection", "feedback_type": "ACCEPTED", "comment": "Valid fix"}
    ]

    prompt = security_agent.build_user_prompt(state)
    assert "iamarin2224/PRism" in prompt
    assert "Fix sql vulnerability" in prompt
    assert "SEC-001" in prompt
    assert "Past PR #5" in prompt
    assert "db.py" in prompt


def test_specialist_nodes_execution_mocked():
    state = create_initial_review_state(
        review_run_id="run-spec-exec",
        repo_name="iamarin2224/PRism",
        pr_number=101,
        commit_sha="c101",
    )

    # Mock raw response
    mock_choice = MagicMock()
    mock_choice.message.tool_calls = None
    mock_choice.message.content = """
    [
      {
        "file_path": "src/api/routes.py",
        "start_line": 15,
        "end_line": 18,
        "category": "security",
        "severity": "critical",
        "title": "Hardcoded API Key",
        "description": "Sensitive key exposed in source code.",
        "suggestion": "Read from environment variable.",
        "confidence": 0.99
      }
    ]
    """
    mock_usage = MagicMock()
    mock_usage.prompt_tokens = 250
    mock_usage.completion_tokens = 75

    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]
    mock_resp.usage = mock_usage

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)

    with patch.object(model_router, "get_async_client", return_value=(mock_client, "deepseek/deepseek-v4.1-flash")):
        # 1. Security Specialist
        sec_out = asyncio.run(security_specialist_node(state))
        assert len(sec_out["specialist_results"]) == 1
        sec_result = sec_out["specialist_results"][0]
        assert sec_result.specialist_name == "security"
        assert len(sec_result.findings) == 1
        assert sec_result.findings[0].severity == "critical"
        assert sec_result.tokens_in == 250
        assert sec_result.tokens_out == 75

        # 2. Quality Specialist
        qual_out = asyncio.run(quality_specialist_node(state))
        assert len(qual_out["specialist_results"]) == 1
        assert qual_out["specialist_results"][0].specialist_name == "quality"

        # 3. Tests Specialist
        test_out = asyncio.run(run_tests_specialist_node(state))
        assert len(test_out["specialist_results"]) == 1
        assert test_out["specialist_results"][0].specialist_name == "tests"

        # 4. Docs Specialist
        docs_out = asyncio.run(docs_specialist_node(state))
        assert len(docs_out["specialist_results"]) == 1
        assert docs_out["specialist_results"][0].specialist_name == "docs"


def test_specialist_multi_turn_tool_calling():
    state = create_initial_review_state(
        review_run_id="run-tool-call",
        repo_name="iamarin2224/PRism",
        pr_number=202,
        commit_sha="c202",
    )

    # 1. First turn: LLM requests a tool call (read_file)
    mock_tool_call = MagicMock()
    mock_tool_call.id = "call_abc123"
    mock_tool_call.function.name = "read_file"
    mock_tool_call.function.arguments = '{"file_path": "src/auth/jwt.py"}'

    turn1_choice = MagicMock()
    turn1_choice.message.tool_calls = [mock_tool_call]
    turn1_choice.message.model_dump.return_value = {
        "role": "assistant",
        "tool_calls": [{"id": "call_abc123", "type": "function", "function": {"name": "read_file", "arguments": '{"file_path": "src/auth/jwt.py"}'}}],
    }

    turn1_resp = MagicMock()
    turn1_resp.choices = [turn1_choice]
    turn1_resp.usage = MagicMock(prompt_tokens=100, completion_tokens=20)

    # 2. Second turn: LLM returns final findings
    turn2_choice = MagicMock()
    turn2_choice.message.tool_calls = None
    turn2_choice.message.content = """
    [
      {
        "file_path": "src/auth/jwt.py",
        "start_line": 10,
        "end_line": 12,
        "category": "security",
        "severity": "high",
        "title": "Unvalidated Secret",
        "description": "JWT secret is hardcoded.",
        "suggestion": "Use os.environ",
        "confidence": 0.92
      }
    ]
    """

    turn2_resp = MagicMock()
    turn2_resp.choices = [turn2_choice]
    turn2_resp.usage = MagicMock(prompt_tokens=150, completion_tokens=40)

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=[turn1_resp, turn2_resp])

    with patch.object(model_router, "get_async_client", return_value=(mock_client, "deepseek/deepseek-v4.1-flash")):
        with patch("app.tools.code.read_file.read_file_tool.execute", AsyncMock(return_value=MagicMock(model_dump=lambda: {"success": True, "data": {"content": "SECRET = '123'"}}))):
            output = asyncio.run(security_agent.execute(state))

            assert output.specialist_name == "security"
            assert len(output.findings) == 1
            assert output.findings[0].title == "Unvalidated Secret"
            assert output.tokens_in == 250  # 100 + 150
            assert output.tokens_out == 60  # 20 + 40
            assert mock_client.chat.completions.create.call_count == 2
