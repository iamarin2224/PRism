import ssl
import logging
from typing import Optional
import certifi
import httpx
from pydantic import BaseModel, Field

from app.config import settings
from app.tools.base import BaseTool, ToolResult
from app.tools.context import ToolContext

logger = logging.getLogger("prism.tools.history.git_history")


class GetGitHistoryInput(BaseModel):
    path: Optional[str] = Field(
        default=None,
        description="Optional file path to scope commit history to a specific file. If omitted, returns repository-wide commits.",
    )
    limit: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum number of commits to retrieve.",
    )


class GetFileHistoryInput(BaseModel):
    path: str = Field(
        ...,
        description="Path of the file to retrieve commit history for.",
    )
    limit: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum number of commits to retrieve.",
    )


class GetGitHistoryTool(BaseTool[GetGitHistoryInput]):
    name = "get_git_history"
    description = (
        "Retrieve recent commit history for the repository or scoped to a specific file. "
        "Returns commit SHA, author, date, and commit message. "
        "Use this tool to understand the evolution of the codebase, recent refactorings, or past intent."
    )
    input_schema = GetGitHistoryInput

    async def execute(self, params: GetGitHistoryInput, context: Optional[ToolContext] = None) -> ToolResult:
        if not context or not context.repository:
            return ToolResult.fail("ToolContext with valid repository is required to fetch git history.")

        token = context.github_token or settings.GITHUB_TOKEN or None
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "PRism-Agentic-Code-Review",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"

        ref = context.commit_sha or "main"
        url = f"https://api.github.com/repos/{context.repository}/commits?sha={ref}&per_page={params.limit}"
        if params.path:
            url += f"&path={params.path.replace('\\', '/').strip('/')}"

        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        try:
            async with httpx.AsyncClient(headers=headers, verify=ssl_ctx, timeout=30.0) as client:
                res = await client.get(url)

            if res.status_code == 404:
                return ToolResult.fail(f"Repository {context.repository} or path '{params.path}' not found on GitHub.")
            if res.status_code != 200:
                return ToolResult.fail(f"GitHub commits API returned error ({res.status_code}): {res.text}")

            raw_commits = res.json()
            commits = []
            for c in raw_commits:
                commit_obj = c.get("commit", {})
                author_obj = commit_obj.get("author", {})
                commits.append({
                    "sha": c.get("sha"),
                    "author": author_obj.get("name") or c.get("author", {}).get("login"),
                    "email": author_obj.get("email"),
                    "date": author_obj.get("date"),
                    "message": commit_obj.get("message", "").strip(),
                })

            return ToolResult.ok(
                commits,
                metadata={"scoped_path": params.path, "count": len(commits)},
            )
        except Exception as e:
            return ToolResult.fail(f"Unexpected error fetching commit history: {str(e)}")


class GetFileHistoryTool(BaseTool[GetFileHistoryInput]):
    name = "get_file_history"
    description = (
        "Retrieve the commit change history specifically for a single file. "
        "Returns chronological list of commits modifying this file with authors, timestamps, and messages. "
        "Answers: 'How has this file evolved and who recently modified it?'"
    )
    input_schema = GetFileHistoryInput

    async def execute(self, params: GetFileHistoryInput, context: Optional[ToolContext] = None) -> ToolResult:
        # Internally delegates to the git history service
        history_tool = GetGitHistoryTool()
        return await history_tool.execute(
            GetGitHistoryInput(path=params.path, limit=params.limit),
            context=context,
        )


get_git_history_tool = GetGitHistoryTool()
get_file_history_tool = GetFileHistoryTool()
