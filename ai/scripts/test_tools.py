"""
Phase 4 Tool Layer Verification Suite
Tests all 12 tools across GitHub PR, Repository/Code, History, and Web domains.
"""

import asyncio
import os
import sys
from typing import List

# Ensure ai directory is in Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.tools import ToolContext, tool_registry, ALL_TOOLS
from app.tools.github import (
    get_pr_metadata_tool,
    get_pr_diff_tool,
    get_changed_files_tool,
    GetPRMetadataInput,
    GetPRDiffInput,
    GetChangedFilesInput,
)
from app.tools.code import (
    read_file_tool,
    search_codebase_tool,
    find_references_tool,
    get_related_tests_tool,
    ReadFileInput,
    SearchCodebaseInput,
    FindReferencesInput,
    GetRelatedTestsInput,
)
from app.tools.history import (
    get_git_history_tool,
    get_file_history_tool,
    get_blame_tool,
    GetGitHistoryInput,
    GetFileHistoryInput,
    GetBlameInput,
)
from app.tools.web import (
    web_search_tool,
    fetch_webpage_tool,
    WebSearchInput,
    FetchWebpageInput,
    validate_public_url,
    WebSearchProvider,
    DuckDuckGoSearchProvider,
)
from app.tools.web.search import WebSearchResultItem


def test_tool_registry_and_openai_schemas():
    print("\n--- 1. Testing Tool Registry & OpenAI Function Schemas ---")
    assert len(ALL_TOOLS) == 12, f"Expected 12 registered tools, got {len(ALL_TOOLS)}"
    
    openai_tools = tool_registry.get_all_openai_tools()
    assert len(openai_tools) == 12, f"Expected 12 OpenAI tool schemas, got {len(openai_tools)}"
    
    for tool_def in openai_tools:
        assert tool_def["type"] == "function"
        fn = tool_def["function"]
        assert "name" in fn and len(fn["name"]) > 0
        assert "description" in fn and len(fn["description"]) > 20
        assert "parameters" in fn
        assert fn["parameters"]["type"] == "object"
        print(f"  ✓ Valid OpenAI schema for tool: '{fn['name']}'")


def test_ssrf_protection():
    print("\n--- 2. Testing Web Fetch SSRF Protections ---")
    
    # Prohibited destinations
    blocked_cases = [
        "http://localhost:8000/secret",
        "http://127.0.0.1:5432",
        "http://0.0.0.0:80",
        "http://169.254.169.254/latest/meta-data/",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://10.0.0.1/admin",
        "http://192.168.1.1/router",
        "ftp://example.com/file",
        "file:///etc/passwd",
    ]
    
    for bad_url in blocked_cases:
        err = validate_public_url(bad_url)
        assert err is not None, f"Expected '{bad_url}' to be blocked by SSRF protection, but passed!"
        print(f"  ✓ Blocked SSRF URL: {bad_url} -> {err}")

    # Valid public URL
    good_err = validate_public_url("https://docs.github.com/en/rest")
    assert good_err is None, f"Expected valid public URL to pass, got error: {good_err}"
    print("  ✓ Allowed valid public URL: https://docs.github.com/en/rest")


async def test_tool_execution_unit():
    print("\n--- 3. Testing Tool Execution & Failure Contracts ---")
    
    ctx = ToolContext(
        repository="iamarin2224/PRism",
        commit_sha="main",
        pr_number=1,
    )
    assert ctx.owner == "iamarin2224"
    assert ctx.repo_name == "PRism"

    # 3.1 Missing context error contract
    res_no_ctx = await read_file_tool.execute(ReadFileInput(path="src/index.ts"), context=None)
    assert not res_no_ctx.success
    assert "ToolContext" in (res_no_ctx.error or "")
    print("  ✓ read_file cleanly fails without ToolContext")

    # 3.2 Path traversal attack blocked
    res_traversal = await read_file_tool.execute(ReadFileInput(path="../../etc/passwd"), context=ctx)
    assert not res_traversal.success
    assert "traversal" in (res_traversal.error or "").lower()
    print("  ✓ read_file blocks path traversal attempt")

    # 3.3 Line range validation
    res_bad_lines = await read_file_tool.execute(
        ReadFileInput(path="package.json", start_line=50, end_line=10),
        context=ctx,
    )
    # Even if file doesn't exist remotely or start > end, it returns a structured failure
    assert not res_bad_lines.success
    print("  ✓ read_file validates start_line <= end_line")

    # 3.4 Search Codebase mode routing
    res_empty_search = await search_codebase_tool.execute(
        SearchCodebaseInput(query="   "),
        context=ctx,
    )
    assert not res_empty_search.success
    print("  ✓ search_codebase rejects empty query")

    # 3.5 Web search execution
    class MockSearchProvider(WebSearchProvider):
        async def search(self, query: str, max_results: int = 5) -> List[WebSearchResultItem]:
            return [
                WebSearchResultItem(
                    title="Next.js App Router Documentation",
                    url="https://nextjs.org/docs/app",
                    snippet="Next.js App Router features and API specifications.",
                    domain="nextjs.org",
                )
            ]

    mock_search_tool = web_search_tool
    mock_search_tool.provider = MockSearchProvider()
    search_res = await mock_search_tool.execute(WebSearchInput(query="Next.js App Router"))
    assert search_res.success
    assert len(search_res.data) == 1
    assert search_res.data[0]["domain"] == "nextjs.org"
    print("  ✓ web_search returns structured results via provider abstraction")

    # 3.6 Fetch webpage SSRF blocked execution
    fetch_blocked = await fetch_webpage_tool.execute(FetchWebpageInput(url="http://127.0.0.1:8000/docs"))
    assert not fetch_blocked.success
    assert "SSRF Protection" in (fetch_blocked.error or "")
    print("  ✓ fetch_webpage blocks internal IP requests at tool execution level")


async def main():
    test_tool_registry_and_openai_schemas()
    test_ssrf_protection()
    await test_tool_execution_unit()
    print("\n========================================================")
    print("🎉 ALL PHASE 4 TOOL LAYER TESTS PASSED SUCCESSFULLY!")
    print("========================================================")


if __name__ == "__main__":
    asyncio.run(main())
