import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.models.review import Finding
from app.rag.models import RetrievedChunk, RetrievalResult
from app.workflow.langgraph_engine import LangGraphWorkflowEngine
from app.workflow.state import create_initial_review_state


def test_full_workflow_end_to_end_auto_post():
    """
    Simulates a full end-to-end review graph run where all specialists output findings,
    findings are deduplicated, verified by critic, and auto-posted to GitHub.
    """
    initial_state = create_initial_review_state(
        review_run_id="run-e2e-001",
        repo_name="iamarin2224/PRism",
        pr_number=77,
        commit_sha="c77000",
        pr_metadata={"title": "Feature: OAuth Auth", "body": "Adds GitHub OAuth login."},
        diff_summary={
            "files_content": {
                "src/auth.py": "def login(): pass\n"
            }
        },
    )

    # 1. Mock RAG retrieval
    mock_rag = RetrievalResult(
        repo_name="iamarin2224/PRism",
        query="Feature: OAuth Auth Adds GitHub OAuth login.",
        chunks=[
            RetrievedChunk(
                id="c1",
                repo_name="iamarin2224/PRism",
                file_path="src/auth.py",
                language="python",
                start_line=1,
                end_line=5,
                content="def login(): pass",
                similarity=0.90,
            )
        ],
        count=1,
        top_k=5,
        latency_ms=10.0,
    )

    # 2. Mock Specialist LLM Response (High confidence, medium severity)
    specialist_json = """
    [
      {
        "file_path": "src/auth.py",
        "start_line": 1,
        "end_line": 2,
        "category": "security",
        "severity": "medium",
        "title": "Missing State CSRF Check",
        "description": "OAuth login does not validate state parameter.",
        "suggestion": "Validate state in callback.",
        "confidence": 0.95
      }
    ]
    """
    mock_spec_choice = MagicMock()
    mock_spec_choice.message.tool_calls = None
    mock_spec_choice.message.content = specialist_json
    mock_spec_resp = MagicMock(choices=[mock_spec_choice], usage=MagicMock(prompt_tokens=100, completion_tokens=50))

    # 3. Mock Critic LLM Response (Validates finding)
    critic_json = """
    [
      {
        "index": 0,
        "is_valid": true,
        "adjusted_confidence": 0.95,
        "verification_notes": "Confirmed CSRF flaw"
      }
    ]
    """
    mock_critic_choice = MagicMock()
    mock_critic_choice.message.content = critic_json
    mock_critic_resp = MagicMock(choices=[mock_critic_choice], usage=None)

    mock_client = AsyncMock()
    # Return mock_spec_resp for specialists and mock_critic_resp for critic
    mock_client.chat.completions.create = AsyncMock(side_effect=[
        mock_spec_resp,  # Security
        mock_spec_resp,  # Quality
        mock_spec_resp,  # Tests
        mock_spec_resp,  # Docs
        mock_critic_resp, # Critic
    ])

    engine = LangGraphWorkflowEngine()

    with patch("app.workflow.nodes.code_retriever.retrieve", AsyncMock(return_value=mock_rag)), \
         patch("app.workflow.nodes.episodic_memory_service.query_episodic_memory", AsyncMock(return_value=[])), \
         patch("app.workflow.events.spine.events_spine.emit_event", AsyncMock(return_value="evt-123")), \
         patch("app.services.model_router.model_router.get_async_client", return_value=(mock_client, "mock-model")):

        final_state = asyncio.run(engine.run(initial_state))

        assert final_state["status"] == "COMPLETED"
        assert final_state["routing_decision"] == "POST_GITHUB"
        assert len(final_state["merged_findings"]) == 1  # Deduplicated from 4 specialists
        assert len(final_state["verified_findings"]) == 1
        assert final_state["verified_findings"][0].title == "Missing State CSRF Check"
        assert "review_summary_markdown" in final_state


def test_full_workflow_end_to_end_human_approval():
    """
    Simulates a full end-to-end review graph run where a critical finding routes
    to the human approval queue.
    """
    initial_state = create_initial_review_state(
        review_run_id="run-e2e-002",
        repo_name="iamarin2224/PRism",
        pr_number=78,
        commit_sha="c78000",
    )

    mock_rag = RetrievalResult(
        repo_name="iamarin2224/PRism",
        query="pull request changes",
        chunks=[],
        count=0,
        top_k=5,
        latency_ms=5.0,
    )

    specialist_critical_json = """
    [
      {
        "file_path": "src/api.py",
        "start_line": 10,
        "end_line": 15,
        "category": "security",
        "severity": "critical",
        "title": "Remote Code Execution",
        "description": "Unsafe eval on user payload.",
        "suggestion": "Remove eval.",
        "confidence": 0.99
      }
    ]
    """
    mock_spec_choice = MagicMock()
    mock_spec_choice.message.tool_calls = None
    mock_spec_choice.message.content = specialist_critical_json
    mock_spec_resp = MagicMock(choices=[mock_spec_choice], usage=MagicMock(prompt_tokens=120, completion_tokens=60))

    critic_json = """
    [
      {
        "index": 0,
        "is_valid": true,
        "adjusted_confidence": 0.99,
        "verification_notes": "Confirmed critical RCE"
      }
    ]
    """
    mock_critic_choice = MagicMock()
    mock_critic_choice.message.content = critic_json
    mock_critic_resp = MagicMock(choices=[mock_critic_choice], usage=None)

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=[
        mock_spec_resp,
        mock_spec_resp,
        mock_spec_resp,
        mock_spec_resp,
        mock_critic_resp,
    ])

    engine = LangGraphWorkflowEngine()

    with patch("app.workflow.nodes.code_retriever.retrieve", AsyncMock(return_value=mock_rag)), \
         patch("app.workflow.nodes.episodic_memory_service.query_episodic_memory", AsyncMock(return_value=[])), \
         patch("app.workflow.events.spine.events_spine.emit_event", AsyncMock(return_value="evt-456")), \
         patch("app.services.model_router.model_router.get_async_client", return_value=(mock_client, "mock-model")):

        final_state = asyncio.run(engine.run(initial_state))

        assert final_state["status"] == "AWAITING_HUMAN_APPROVAL"
        assert final_state["routing_decision"] == "REQUIRE_HUMAN_APPROVAL"
        assert len(final_state["verified_findings"]) == 1
        assert final_state["verified_findings"][0].severity == "critical"
