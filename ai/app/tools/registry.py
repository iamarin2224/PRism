from typing import Any, Dict, List, Optional
from app.tools.base import BaseTool
from app.tools.github.pr import (
    get_pr_metadata_tool,
    get_pr_diff_tool,
    get_changed_files_tool,
)
from app.tools.code.read_file import read_file_tool
from app.tools.code.search import search_codebase_tool
from app.tools.code.references import find_references_tool
from app.tools.code.tests import get_related_tests_tool
from app.tools.history.git_history import (
    get_git_history_tool,
    get_file_history_tool,
)
from app.tools.history.blame import get_blame_tool
from app.tools.web.search import web_search_tool
from app.tools.web.fetch import fetch_webpage_tool
from app.tools.tests import (
    run_tests_tool,
    run_linter_tool,
)


ALL_TOOLS: List[BaseTool] = [
    # GitHub / PR Tools
    get_pr_metadata_tool,
    get_pr_diff_tool,
    get_changed_files_tool,
    # Repository / Code Investigation Tools
    read_file_tool,
    search_codebase_tool,
    find_references_tool,
    get_related_tests_tool,
    # History Tools
    get_git_history_tool,
    get_file_history_tool,
    get_blame_tool,
    # External Knowledge / Web Tools
    web_search_tool,
    fetch_webpage_tool,
    # Dynamic Sandbox Execution Tools
    run_tests_tool,
    run_linter_tool,
]

_TOOL_MAP: Dict[str, BaseTool] = {tool.name: tool for tool in ALL_TOOLS}


class ToolRegistry:
    """
    Central registry for PRism tools.
    Provides tool lookup, discovery, and export of OpenAI-compatible schemas
    for downstream consumption by LangGraph/LLM tool binding.
    """

    @classmethod
    def get_all_tools(cls) -> List[BaseTool]:
        """Returns a list of all registered tool instances."""
        return list(ALL_TOOLS)

    @classmethod
    def get_tool(cls, name: str) -> Optional[BaseTool]:
        """Looks up a tool by its unique name."""
        return _TOOL_MAP.get(name)

    @classmethod
    def get_all_openai_tools(cls) -> List[Dict[str, Any]]:
        """
        Returns OpenAI-compatible function tool definitions for all registered tools,
        ready for direct passing to `llm.bind_tools()` or API payload `tools` parameter.
        """
        return [tool.to_openai_tool() for tool in ALL_TOOLS]


tool_registry = ToolRegistry()
