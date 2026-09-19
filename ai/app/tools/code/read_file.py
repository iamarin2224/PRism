import base64
import os
import ssl
import logging
from typing import Optional
import certifi
import httpx
from pydantic import BaseModel, Field

from app.config import settings
from app.rag.chunking.splitter import detect_language
from app.tools.base import BaseTool, ToolResult
from app.tools.context import ToolContext

logger = logging.getLogger("prism.tools.code.read_file")

MAX_READ_BYTES = 500_000  # 500 KB limit for single file inspection


class ReadFileInput(BaseModel):
    path: str = Field(
        ...,
        description="Path of the repository file to read (e.g. 'src/auth/jwt.ts').",
    )
    start_line: Optional[int] = Field(
        default=None,
        ge=1,
        description="Optional 1-based starting line number to read from.",
    )
    end_line: Optional[int] = Field(
        default=None,
        ge=1,
        description="Optional 1-based ending line number (inclusive).",
    )
    commit_sha: Optional[str] = Field(
        default=None,
        description="Optional specific commit SHA or branch ref to read from (defaults to context commit).",
    )


class ReadFileTool(BaseTool[ReadFileInput]):
    name = "read_file"
    description = (
        "Read exact source code content from the repository at the relevant commit ref. "
        "Supports 1-based optional start_line and end_line slicing. "
        "Use this tool to inspect implementation details, function definitions, configurations, or context around modified code."
    )
    input_schema = ReadFileInput

    async def execute(self, params: ReadFileInput, context: Optional[ToolContext] = None) -> ToolResult:
        if not context or not context.repository:
            return ToolResult.fail("ToolContext with valid repository is required to read repository files.")

        norm_path = params.path.replace("\\", "/").strip("/")
        if not norm_path or ".." in norm_path.split("/"):
            return ToolResult.fail(f"Invalid repository file path: '{params.path}'. Path traversal is prohibited.")

        ref = params.commit_sha or context.commit_sha or "main"
        token = context.github_token or settings.GITHUB_TOKEN or None

        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "PRism-Agentic-Code-Review",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"

        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        url = f"https://api.github.com/repos/{context.repository}/contents/{norm_path}?ref={ref}"

        try:
            async with httpx.AsyncClient(headers=headers, verify=ssl_ctx, timeout=30.0) as client:
                res = await client.get(url)

            if res.status_code == 404:
                return ToolResult.fail(f"File '{norm_path}' does not exist in {context.repository} at ref '{ref}'.")
            if res.status_code != 200:
                return ToolResult.fail(f"GitHub contents API returned error ({res.status_code}): {res.text}")

            data = res.json()
            if isinstance(data, list):
                return ToolResult.fail(f"Path '{norm_path}' is a directory, not a file.")

            if data.get("encoding") != "base64" or "content" not in data:
                # Handle large files via download_url if raw content is omitted
                download_url = data.get("download_url")
                if download_url:
                    async with httpx.AsyncClient(headers=headers, verify=ssl_ctx, timeout=30.0) as client:
                        raw_res = await client.get(download_url)
                    if raw_res.status_code != 200:
                        return ToolResult.fail(f"Failed to download raw file '{norm_path}'.")
                    raw_bytes = raw_res.content
                else:
                    return ToolResult.fail(f"Unable to retrieve content for '{norm_path}'.")
            else:
                raw_bytes = base64.b64decode(data["content"])

            if len(raw_bytes) > MAX_READ_BYTES:
                return ToolResult.fail(
                    f"File '{norm_path}' ({len(raw_bytes)} bytes) exceeds maximum allowable size (500KB)."
                )

            try:
                full_text = raw_bytes.decode("utf-8")
            except UnicodeDecodeError:
                return ToolResult.fail(f"File '{norm_path}' contains binary or non-UTF-8 encoded content.")

            lines = full_text.splitlines()
            total_lines = len(lines)

            # Apply 1-based line range slicing if specified
            start_l = params.start_line or 1
            end_l = params.end_line or total_lines

            if start_l > total_lines:
                return ToolResult.fail(
                    f"start_line ({start_l}) exceeds total lines in file ({total_lines})."
                )

            end_l = min(end_l, total_lines)
            if start_l > end_l:
                return ToolResult.fail(
                    f"start_line ({start_l}) cannot be greater than end_line ({end_l})."
                )

            selected_lines = lines[start_l - 1 : end_l]
            content = "\n".join(selected_lines)

            _, lang_name = detect_language(norm_path)

            return ToolResult.ok(
                {
                    "path": norm_path,
                    "content": content,
                    "language": lang_name,
                    "start_line": start_l,
                    "end_line": end_l,
                    "total_lines": total_lines,
                    "commit_sha": ref,
                },
                metadata={"total_file_lines": total_lines, "sliced_lines": len(selected_lines)},
            )
        except Exception as e:
            return ToolResult.fail(f"Unexpected error reading file '{norm_path}': {str(e)}")


read_file_tool = ReadFileTool()
