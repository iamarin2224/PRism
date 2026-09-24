import logging
from typing import Any, Dict, List, Optional
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
        pr_metadata: Optional[Dict[str, Any]] = None,
        pr_summary: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Formats a structured, developer-friendly Markdown review report for GitHub PR comments.
        Combines dedicated PR change summary with specialist findings.
        """
        pr_title = pr_metadata.get("title", f"PR #{pr_number}") if pr_metadata else f"PR #{pr_number}"
        
        lines = [
            f"# 🤖 PRism Automated Code Intelligence Report",
            f"**Pull Request:** `#{pr_number}` — *{pr_title}*",
            f"**Repository:** `{repo_name}` | **Verdict:** `{routing_decision}`\n",
            "---",
        ]

        # 1. Dedicated PR Summary Section
        if pr_summary:
            overview = pr_summary.get("overview", "")
            key_changes = pr_summary.get("key_changes", [])
            file_changes = pr_summary.get("file_changes", [])
            arch_impact = pr_summary.get("architectural_impact", "")
            risk_assess = pr_summary.get("risk_assessment", "")

            lines.append("### 📖 Pull Request Overview & Intent")
            if overview:
                lines.append(f"{overview}\n")
            
            if key_changes:
                lines.append("**Key Changes:**")
                for kc in key_changes:
                    lines.append(f"- {kc}")
                lines.append("")

            if file_changes:
                lines.append("**File Changes Breakdown:**")
                lines.append("| File | Action | Summary |")
                lines.append("| :--- | :--- | :--- |")
                for fc in file_changes:
                    fpath = fc.get("file_path", "")
                    action = fc.get("action", "modified").capitalize()
                    fsum = fc.get("summary", "")
                    lines.append(f"| `{fpath}` | **{action}** | {fsum} |")
                lines.append("")

            if arch_impact:
                lines.append(f"**Architectural & Scope Impact:** {arch_impact}")
            if risk_assess:
                lines.append(f"**Risk Assessment:** `{risk_assess}`\n")

            lines.append("---\n")

        # 2. Executive Status & Specialist Matrix
        lines.append("### 🧭 Multi-Agent Specialist Matrix")
        if not findings:
            lines.append(
                "✅ **Clean Pull Request:** PRism specialists analyzed this changeset across security, architectural quality, test coverage, and documentation. No blocking vulnerabilities or quality defects were detected.\n"
            )
        else:
            crit_count = sum(1 for f in findings if getattr(f, "severity", "").lower() == "critical")
            high_count = sum(1 for f in findings if getattr(f, "severity", "").lower() == "high")
            lines.append(
                f"⚠️ **Actionable Findings Detected:** PRism identified **{len(findings)} finding(s)** ({crit_count} critical, {high_count} high) that require attention before merging.\n"
            )

        # Specialist Status Table
        lines.extend([
            "| Specialist | Focus Domain | Status | Notes |",
            "| :--- | :--- | :--- | :--- |",
            "| 🛡️ **Security** | Vulnerabilities, Auth, Secrets, CVEs | " + ("⚠️ Action Required" if any(f.category == "SECURITY" for f in findings) else "✅ Passed") + " | " + ("Vulnerabilities identified" if any(f.category == "SECURITY" for f in findings) else "Zero CVEs or token leaks detected") + " |",
            "| 💎 **Quality** | Code Smells, AST Architecture, Clean Code | " + ("⚠️ Action Required" if any(f.category in ("BUG", "DESIGN", "PERFORMANCE") for f in findings) else "✅ Passed") + " | " + ("Defects flagged" if any(f.category in ("BUG", "DESIGN", "PERFORMANCE") for f in findings) else "Adheres to idioms and modular structure") + " |",
            "| 🧪 **Tests** | Coverage Gaps, Assertions, Edge Cases | " + ("⚠️ Action Required" if any(f.category == "TEST_COVERAGE" for f in findings) else "✅ Passed") + " | " + ("Test gaps found" if any(f.category == "TEST_COVERAGE" for f in findings) else "Test changes and specs verified") + " |",
            "| 📚 **Docs** | Interface Types, README, JSDoc | " + ("⚠️ Action Required" if any(f.category == "DOCUMENTATION" for f in findings) else "✅ Passed") + " | " + ("Doc gaps found" if any(f.category == "DOCUMENTATION" for f in findings) else "Documentation up to date") + " |",
            "\n---\n",
        ])

        if findings:
            severity_emojis = {
                "critical": "[CRITICAL]",
                "high": "[HIGH]",
                "medium": "[MEDIUM]",
                "low": "[LOW]",
                "info": "[INFO]",
            }

            lines.extend([
                "### 📋 Actionable Findings Summary\n",
                "| Severity | Category | File | Line(s) | Title |",
                "| :--- | :--- | :--- | :--- | :--- |",
            ])

            for f in findings:
                sev_badge = severity_emojis.get(f.severity.lower(), f.severity.upper())
                line_str = f"L{f.start_line}" if f.start_line else "General"
                if f.start_line and f.end_line and f.end_line != f.start_line:
                    line_str = f"L{f.start_line}-L{f.end_line}"
                lines.append(
                    f"| **{sev_badge}** | {f.category} | `{f.file_path}` | {line_str} | **{f.title}** |"
                )

            lines.append("\n---\n")
            lines.append("### 🔍 Detailed Specialist Recommendations\n")

            for idx, f in enumerate(findings, 1):
                sev_badge = severity_emojis.get(f.severity.lower(), f.severity.upper())
                lines.append(f"#### {idx}. {f.title} ({sev_badge})")
                lines.append(f"- **File:** `{f.file_path}`")
                if f.start_line:
                    lines.append(f"- **Lines:** {f.start_line} - {f.end_line or f.start_line}")
                lines.append(f"- **Specialist:** `{f.specialist}` (Agreement count: {f.agreement_count}, Confidence: {f.confidence:.2f})")
                lines.append(f"\n**Description:**\n{f.description}\n")
                if f.suggestion:
                    lines.append(f"**Actionable Code Suggestion:**\n```suggestion\n{f.suggestion}\n```\n")
                lines.append("\n---\n")

        lines.append("\n*Generated automatically by PRism Swarm Intelligence*")
        return "\n".join(lines)

    async def post_review(
        self,
        state: ReviewState,
    ) -> Dict[str, Any]:
        """
        Posts review comments to GitHub via Next.js GitHub API endpoint.
        """
        import httpx
        from app.config import settings

        findings = state.get("verified_findings", [])
        repo_name = state.get("repo_name", "")
        pr_number = state.get("pr_number", 0)
        pr_metadata = state.get("pr_metadata", {})
        pr_summary = state.get("pr_summary")

        markdown_report = self.format_markdown_review(
            repo_name=repo_name,
            pr_number=pr_number,
            findings=findings,
            routing_decision="POST_GITHUB",
            pr_metadata=pr_metadata,
            pr_summary=pr_summary,
        )

        # Build inline comments for GitHub review
        comments_payload = []
        for f in findings:
            f_path = getattr(f, "file_path", "") or ""
            f_line = getattr(f, "start_line", None) or 1
            if f_path:
                suggestion_block = f"\n\n```suggestion\n{getattr(f, 'suggestion')}\n```" if getattr(f, "suggestion", None) else ""
                comments_payload.append({
                    "path": f_path,
                    "line": int(f_line),
                    "body": f"### [{getattr(f, 'severity', 'INFO').upper()}] {getattr(f, 'title', 'Finding')}\n\n{getattr(f, 'description', '')}{suggestion_block}",
                })

        # Post to Next.js API
        nextjs_url = settings.NEXTJS_URL or "http://localhost:5050"
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.post(
                    f"{nextjs_url}/api/github/post-review",
                    json={
                        "repoFullName": repo_name,
                        "prNumber": pr_number,
                        "reviewMarkdown": markdown_report,
                        "comments": comments_payload,
                        "event": "REQUEST_CHANGES" if any(getattr(f, "severity", "").lower() == "critical" for f in findings) else "COMMENT",
                    },
                )
                if res.status_code == 200:
                    logger.info(f"[{state['review_run_id']}] Successfully posted GitHub review to {repo_name} PR #{pr_number}")
                else:
                    logger.warning(
                        f"[{state['review_run_id']}] Next.js post-review API returned {res.status_code}: {res.text}"
                    )
        except Exception as post_err:
            logger.error(f"[{state['review_run_id']}] Failed to post review to GitHub: {post_err}")

        return {
            "status": "COMPLETED",
            "routing_decision": "POST_GITHUB",
            "review_summary_markdown": markdown_report,
        }


# Global review poster instance
github_review_poster = GitHubReviewPoster()
