import logging
from typing import Any, Dict, List
from app.models.review import Finding
from app.workflow.state import ReviewState

logger = logging.getLogger("prism.workflow.post")


class GitHubReviewPoster:
    """
    Formats verified review findings into clear, developer-friendly Markdown
    and posts review comments to GitHub via GitHub API or API response payload.
    """

    @staticmethod
    def format_markdown_review(
        repo_name: str,
        pr_number: int,
        findings: List[Finding],
        routing_decision: str,
    ) -> str:
        """
        Formats a structured Markdown review report suitable for GitHub PR comments.
        """
        if not findings:
            return f"### PRism Code Review: Clean PR\n\nNo blocking issues, vulnerabilities, or quality defects found in PR #{pr_number}. LGTM!"

        severity_emojis = {
            "critical": "[CRITICAL]",
            "high": "[HIGH]",
            "medium": "[MEDIUM]",
            "low": "[LOW]",
            "info": "[INFO]",
        }

        lines = [
            f"### PRism Automated Code Review (PR #{pr_number})",
            f"**Repository:** `{repo_name}` | **Status:** `{routing_decision}`\n",
            "| Severity | Category | File | Line(s) | Title |",
            "| :--- | :--- | :--- | :--- | :--- |",
        ]

        for f in findings:
            sev_badge = severity_emojis.get(f.severity.lower(), f.severity.upper())
            line_str = f"L{f.start_line}" if f.start_line else "General"
            if f.start_line and f.end_line and f.end_line != f.start_line:
                line_str = f"L{f.start_line}-L{f.end_line}"
            lines.append(
                f"| **{sev_badge}** | {f.category} | `{f.file_path}` | {line_str} | **{f.title}** |"
            )

        lines.append("\n---\n")
        lines.append("### Detailed Actionable Findings\n")

        for idx, f in enumerate(findings, 1):
            sev_badge = severity_emojis.get(f.severity.lower(), f.severity.upper())
            lines.append(f"#### {idx}. {f.title} ({sev_badge})")
            lines.append(f"- **File:** `{f.file_path}`")
            if f.start_line:
                lines.append(f"- **Lines:** {f.start_line} - {f.end_line or f.start_line}")
            lines.append(f"- **Specialist:** `{f.specialist}` (Agreement count: {f.agreement_count}, Confidence: {f.confidence:.2f})")
            lines.append(f"\n**Description:**\n{f.description}\n")
            if f.suggestion:
                lines.append(f"**Actionable Suggestion:**\n```suggestion\n{f.suggestion}\n```\n")
            lines.append("\n---\n")

        return "\n".join(lines)

    async def post_review(
        self,
        state: ReviewState,
    ) -> Dict[str, Any]:
        """
        Posts review comments to GitHub or saves final formatted review to state.
        """
        findings = state.get("verified_findings", [])
        repo_name = state.get("repo_name", "")
        pr_number = state.get("pr_number", 0)

        markdown_report = self.format_markdown_review(
            repo_name=repo_name,
            pr_number=pr_number,
            findings=findings,
            routing_decision="POST_GITHUB",
        )

        logger.info(f"[{state['review_run_id']}] Formatted review markdown for {repo_name} PR #{pr_number} ({len(findings)} findings).")

        return {
            "status": "COMPLETED",
            "routing_decision": "POST_GITHUB",
            "review_summary_markdown": markdown_report,
        }


# Global review poster instance
github_review_poster = GitHubReviewPoster()
