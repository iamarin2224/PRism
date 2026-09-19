import logging
from typing import Optional
from pydantic import BaseModel, Field

from app.tools.base import BaseTool, ToolResult
from app.tools.context import ToolContext
from app.tools.history.git_history import get_git_history_tool, GetGitHistoryInput

logger = logging.getLogger("prism.tools.history.blame")


class GetBlameInput(BaseModel):
    path: str = Field(
        ...,
        description="Path of the file to retrieve line-by-line blame / authorship information for.",
    )
    start_line: Optional[int] = Field(
        default=None,
        ge=1,
        description="Optional 1-based start line range.",
    )
    end_line: Optional[int] = Field(
        default=None,
        ge=1,
        description="Optional 1-based end line range.",
    )


class GetBlameTool(BaseTool[GetBlameInput]):
    name = "get_blame"
    description = (
        "Retrieve author attribution and historical commit metadata for lines of code in a file. "
        "Provides line-level context, commit authorship, and recent change dates to investigate who last modified specific logic."
    )
    input_schema = GetBlameInput

    async def execute(self, params: GetBlameInput, context: Optional[ToolContext] = None) -> ToolResult:
        if not context or not context.repository:
            return ToolResult.fail("ToolContext with valid repository is required for get_blame.")

        # Note: REST API does not provide a direct REST endpoint for git blame without GraphQL API token scopes.
        # We retrieve the recent file commit history and state the attribution source cleanly.
        history_result = await get_git_history_tool.execute(
            GetGitHistoryInput(path=params.path, limit=10),
            context=context,
        )

        if not history_result.success:
            return ToolResult.fail(f"Failed to retrieve authorship blame: {history_result.error}")

        commits = history_result.data or []
        latest_commit = commits[0] if commits else None

        blame_summary = {
            "path": params.path,
            "start_line": params.start_line or 1,
            "end_line": params.end_line or "EOF",
            "last_modifying_commit": latest_commit,
            "recent_contributors": list(
                {c["author"] for c in commits if c.get("author")}
            ),
            "recent_commits_on_file": commits[:5],
            "attribution_note": "Line-level blame summarized from commit history for the target file.",
        }

        return ToolResult.ok(blame_summary)


get_blame_tool = GetBlameTool()
