import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.config import settings
from app.models.review import Finding
from app.services.model_router import model_router
from app.workflow.agents import security_agent
from app.workflow.nodes.critic import critic_verifier_service
from app.workflow.state import create_initial_review_state


def test_credit_exhaustion_detection():
    err1 = Exception("Error: insufficient_quota for current billing cycle")
    err2 = Exception("HTTP 402: Out of credits")
    err3 = Exception("quota_exceeded on key")
    err4 = Exception("Internal server error 500")

    assert model_router.is_credit_exhaustion_error(err1) is True
    assert model_router.is_credit_exhaustion_error(err2) is True
    assert model_router.is_credit_exhaustion_error(err3) is True
    assert model_router.is_credit_exhaustion_error(err4) is False


def test_agent_dynamic_fallback_on_credit_exhaustion():
    model_router.reset_quota_status()
    state = create_initial_review_state(
        review_run_id="run-fallback-test",
        repo_name="iamarin2224/PRism",
        pr_number=505,
        commit_sha="c505",
    )

    # 1. Primary call throws insufficient_quota
    mock_primary_client = AsyncMock()
    mock_primary_client.chat.completions.create = AsyncMock(
        side_effect=Exception("Error code 402: insufficient_quota. You ran out of credits.")
    )

    # 2. Fallback call succeeds with OpenRouter free model
    mock_fallback_choice = MagicMock()
    mock_fallback_choice.message.tool_calls = None
    mock_fallback_choice.message.content = """
    [
      {
        "file_path": "src/auth.py",
        "start_line": 5,
        "end_line": 10,
        "category": "security",
        "severity": "high",
        "title": "Fallback Finding",
        "description": "Captured via free fallback.",
        "suggestion": "Fix issue",
        "confidence": 0.90
      }
    ]
    """
    mock_fallback_resp = MagicMock(choices=[mock_fallback_choice], usage=MagicMock(prompt_tokens=50, completion_tokens=25))
    mock_fallback_client = AsyncMock()
    mock_fallback_client.chat.completions.create = AsyncMock(return_value=mock_fallback_resp)

    def get_client_side_effect(role_or_tier, force_fallback=False):
        if force_fallback or model_router._aicredits_exhausted:
            return mock_fallback_client, "openrouter/free"
        return mock_primary_client, "deepseek/deepseek-v4.1-flash"

    with patch.object(model_router, "get_async_client", side_effect=get_client_side_effect):
        output = asyncio.run(security_agent.execute(state))

        assert output.specialist_name == "security"
        assert len(output.findings) == 1
        assert output.findings[0].title == "Fallback Finding"
        assert output.error is None
        assert model_router._aicredits_exhausted is True

    # Subsequent call to critic also uses fallback
    with patch.object(model_router, "get_async_client", side_effect=get_client_side_effect):
        f = output.findings[0]
        verified = asyncio.run(critic_verifier_service.verify_findings([f], state))
        assert len(verified) == 1
