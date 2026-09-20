import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.models.review import Finding
from app.workflow.nodes.critic import critic_verifier_service
from app.workflow.nodes.merge import deduplication_service
from app.workflow.nodes.post import github_review_poster
from app.workflow.state import create_initial_review_state


def test_merge_exact_and_overlapping_findings():
    f1 = Finding(
        file_path="src/auth/jwt.py",
        start_line=10,
        end_line=15,
        category="security",
        severity="medium",
        title="Insecure Token Parsing",
        description="JWT token parsed without verification.",
        suggestion="Use jwt.decode with verify=True",
        confidence=0.80,
        specialist="security",
    )
    f2 = Finding(
        file_path="src/auth/jwt.py",
        start_line=12,
        end_line=18,
        category="security",
        severity="critical",
        title="Unverified JWT Decoding",
        description="Token verification flag omitted.",
        suggestion="Ensure algorithm HS256 is pinned.",
        confidence=0.95,
        specialist="quality",
    )
    f3 = Finding(
        file_path="src/utils/logger.py",
        start_line=50,
        end_line=55,
        category="code_quality",
        severity="low",
        title="Verbose Logging",
        description="Log level should be debug.",
        confidence=0.70,
        specialist="quality",
    )

    merged = deduplication_service.deduplicate([f1, f2, f3])
    assert len(merged) == 2

    # Verify merged auth finding
    jwt_finding = next(f for f in merged if f.file_path == "src/auth/jwt.py")
    assert jwt_finding.severity == "critical"  # Max severity taken
    assert jwt_finding.confidence == 0.95      # Max confidence taken
    assert jwt_finding.agreement_count == 2     # Cross-specialist agreement incremented
    assert "security+quality" in jwt_finding.specialist
    assert jwt_finding.start_line == 10
    assert jwt_finding.end_line == 18
    assert "jwt.decode" in jwt_finding.suggestion
    assert "algorithm HS256" in jwt_finding.suggestion


def test_critic_verifier_rejection_and_acceptance():
    state = create_initial_review_state(
        review_run_id="run-critic-01",
        repo_name="iamarin2224/PRism",
        pr_number=88,
        commit_sha="c88",
        diff_summary={"files_content": {"src/api.py": "def handle(): pass"}},
    )

    f_valid = Finding(
        file_path="src/api.py",
        start_line=1,
        end_line=2,
        category="security",
        severity="high",
        title="Real Flaw",
        description="Real issue",
        confidence=0.85,
        specialist="security",
    )
    f_invalid = Finding(
        file_path="src/api.py",
        start_line=50,
        end_line=60,
        category="code_quality",
        severity="low",
        title="Hallucinated Issue",
        description="Line 50 doesn't exist",
        confidence=0.90,
        specialist="quality",
    )

    mock_verdicts = """
    ```json
    [
      {
        "index": 0,
        "is_valid": true,
        "adjusted_confidence": 0.92,
        "verification_notes": "Valid"
      },
      {
        "index": 1,
        "is_valid": false,
        "adjusted_confidence": 0.10,
        "verification_notes": "Rejected: Line range out of bounds"
      }
    ]
    ```
    """
    mock_resp = MagicMock()
    mock_resp.choices = [MagicMock(message=MagicMock(content=mock_verdicts))]
    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_resp)

    with patch("app.services.model_router.model_router.get_async_client", return_value=(mock_client, "deepseek/deepseek-v4.1-flash")):
        verified = asyncio.run(critic_verifier_service.verify_findings([f_valid, f_invalid], state))
        assert len(verified) == 1
        assert verified[0].title == "Real Flaw"
        assert verified[0].is_verified is True
        assert verified[0].confidence == 0.92


def test_post_review_markdown_formatting():
    f = Finding(
        file_path="src/db.py",
        start_line=25,
        end_line=30,
        category="security",
        severity="critical",
        title="SQL Injection in raw query",
        description="User input directly concatenated into SQL.",
        suggestion="cursor.execute('SELECT * FROM users WHERE id = %s', (user_id,))",
        confidence=0.98,
        specialist="security",
        agreement_count=2,
    )

    report = github_review_poster.format_markdown_review(
        repo_name="iamarin2224/PRism",
        pr_number=12,
        findings=[f],
        routing_decision="POST_GITHUB",
    )

    assert "### PRism Automated Code Review (PR #12)" in report
    assert "[CRITICAL]" in report
    assert "src/db.py" in report
    assert "L25-L30" in report
    assert "SQL Injection in raw query" in report
    assert "cursor.execute" in report
