import ssl
import logging
from typing import Optional
import certifi
import httpx
from pydantic import BaseModel, Field

from app.config import settings
from app.tools.base import BaseTool, ToolResult
from app.tools.context import ToolContext

logger = logging.getLogger("prism.tools.github.pr")


class GetPRMetadataInput(BaseModel):
    """Input model for get_pr_metadata. Uses review context repository and PR number automatically."""
    pr_number: Optional[int] = Field(
        default=None,
        description="Optional PR number override if not inferred from review context.",
    )


class GetPRDiffInput(BaseModel):
    """Input model for get_pr_diff."""
    pr_number: Optional[int] = Field(
        default=None,
        description="Optional PR number override if not inferred from review context.",
    )


class GetChangedFilesInput(BaseModel):
    """Input model for get_changed_files."""
    pr_number: Optional[int] = Field(
        default=None,
        description="Optional PR number override if not inferred from review context.",
    )


def _get_github_headers(token: Optional[str] = None) -> dict:
    resolved_token = token or settings.GITHUB_TOKEN or None
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "PRism-Agentic-Code-Review",
    }
    if resolved_token:
        headers["Authorization"] = f"Bearer {resolved_token}"
    return headers


class GetPRMetadataTool(BaseTool[GetPRMetadataInput]):
    name = "get_pr_metadata"
    description = (
        "Retrieve comprehensive metadata for the current pull request including title, body description, "
        "author, state, base/head branch names, commit SHAs, and timestamp information. "
        "Use this tool to understand the PR purpose, context, and review targets."
    )
    input_schema = GetPRMetadataInput

    async def execute(self, params: GetPRMetadataInput, context: Optional[ToolContext] = None) -> ToolResult:
        if not context or not context.repository:
            return ToolResult.fail("ToolContext with valid repository is required for get_pr_metadata.")

        pr_num = params.pr_number or context.pr_number
        if not pr_num:
            return ToolResult.fail("PR number is required but was not provided in params or review context.")

        headers = _get_github_headers(context.github_token)
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        url = f"https://api.github.com/repos/{context.repository}/pulls/{pr_num}"

        try:
            async with httpx.AsyncClient(headers=headers, verify=ssl_ctx, timeout=30.0) as client:
                res = await client.get(url)

            if res.status_code == 404:
                return ToolResult.fail(f"Pull request #{pr_num} not found in repository {context.repository}.")
            if res.status_code == 401 or res.status_code == 403:
                return ToolResult.fail(f"GitHub authentication or rate limit error ({res.status_code}): {res.text}")
            if res.status_code != 200:
                return ToolResult.fail(f"Failed to fetch PR metadata from GitHub ({res.status_code}): {res.text}")

            data = res.json()
            metadata = {
                "number": data.get("number"),
                "title": data.get("title"),
                "body": data.get("body") or "",
                "author": data.get("user", {}).get("login"),
                "state": data.get("state"),
                "base_branch": data.get("base", {}).get("ref"),
                "base_sha": data.get("base", {}).get("sha"),
                "head_branch": data.get("head", {}).get("ref"),
                "head_sha": data.get("head", {}).get("sha"),
                "created_at": data.get("created_at"),
                "updated_at": data.get("updated_at"),
                "additions": data.get("additions"),
                "deletions": data.get("deletions"),
                "changed_files_count": data.get("changed_files"),
            }
            return ToolResult.ok(metadata)
        except Exception as e:
            return ToolResult.fail(f"Unexpected error fetching PR metadata: {str(e)}")


class GetPRDiffTool(BaseTool[GetPRDiffInput]):
    name = "get_pr_diff"
    description = (
        "Retrieve the unified patch/diff for all changed files in the current pull request. "
        "Returns file paths, modification status (added/modified/deleted), addition/deletion metrics, "
        "and standard git patches. Use this to inspect the exact code modifications under review."
    )
    input_schema = GetPRDiffInput

    async def execute(self, params: GetPRDiffInput, context: Optional[ToolContext] = None) -> ToolResult:
        if not context or not context.repository:
            return ToolResult.fail("ToolContext with valid repository is required for get_pr_diff.")

        pr_num = params.pr_number or context.pr_number
        if not pr_num:
            return ToolResult.fail("PR number is required but was not provided in params or review context.")

        headers = _get_github_headers(context.github_token)
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        url = f"https://api.github.com/repos/{context.repository}/pulls/{pr_num}/files?per_page=100"

        try:
            async with httpx.AsyncClient(headers=headers, verify=ssl_ctx, timeout=30.0) as client:
                res = await client.get(url)

            if res.status_code != 200:
                return ToolResult.fail(f"Failed to fetch PR files from GitHub ({res.status_code}): {res.text}")

            files = res.json()
            diff_entries = []
            for f in files:
                diff_entries.append({
                    "path": f.get("filename"),
                    "status": f.get("status"),
                    "additions": f.get("additions", 0),
                    "deletions": f.get("deletions", 0),
                    "changes": f.get("changes", 0),
                    "patch": f.get("patch") or "",
                })

            return ToolResult.ok(diff_entries, metadata={"total_files": len(diff_entries)})
        except Exception as e:
            return ToolResult.fail(f"Unexpected error fetching PR diff: {str(e)}")


class GetChangedFilesTool(BaseTool[GetChangedFilesInput]):
    name = "get_changed_files"
    description = (
        "Retrieve a concise structured list of files modified, added, or deleted in the current pull request "
        "along with line addition/deletion counts. Does NOT return full diff patches or file contents. "
        "Use this tool to get an overview of which files were modified in the PR."
    )
    input_schema = GetChangedFilesInput

    async def execute(self, params: GetChangedFilesInput, context: Optional[ToolContext] = None) -> ToolResult:
        if not context or not context.repository:
            return ToolResult.fail("ToolContext with valid repository is required for get_changed_files.")

        pr_num = params.pr_number or context.pr_number
        if not pr_num:
            return ToolResult.fail("PR number is required but was not provided in params or review context.")

        headers = _get_github_headers(context.github_token)
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        url = f"https://api.github.com/repos/{context.repository}/pulls/{pr_num}/files?per_page=100"

        try:
            async with httpx.AsyncClient(headers=headers, verify=ssl_ctx, timeout=30.0) as client:
                res = await client.get(url)

            if res.status_code != 200:
                return ToolResult.fail(f"Failed to fetch changed files from GitHub ({res.status_code}): {res.text}")

            files = res.json()
            summary = [
                {
                    "path": f.get("filename"),
                    "status": f.get("status"),
                    "additions": f.get("additions", 0),
                    "deletions": f.get("deletions", 0),
                    "changes": f.get("changes", 0),
                }
                for f in files
            ]
            return ToolResult.ok(summary, metadata={"count": len(summary)})
        except Exception as e:
            return ToolResult.fail(f"Unexpected error fetching changed files list: {str(e)}")


get_pr_metadata_tool = GetPRMetadataTool()
get_pr_diff_tool = GetPRDiffTool()
get_changed_files_tool = GetChangedFilesTool()
