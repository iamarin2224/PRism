from typing import List, Optional
from pydantic import BaseModel, Field

from app.sandbox.models import (
    CommandCategory,
    SandboxFile,
    SandboxRequest,
    SandboxResult,
)
from app.sandbox.service import SandboxExecutorService
from app.tools.base import BaseTool
from app.tools.context import ToolContext


class RunLinterInput(BaseModel):
    """Input payload for the run_linter tool."""
    files: List[SandboxFile] = Field(
        ...,
        description=(
            "List of repository files (path and string content) needed to run code linting. "
            "Must include target source files and configuration manifests (e.g. pyproject.toml, ruff.toml, package.json)."
        ),
    )


class RunLinterTool(BaseTool[RunLinterInput]):
    """
    Agent-facing tool to execute code linters and static checks in an isolated multi-language E2B sandbox.
    
    Intended LangGraph Agent Use:
    An agent should invoke this tool only after it has gathered sufficient repository context
    (e.g., modified code files and linter configurations).
    The sandbox automatically detects the project runtime, selects the appropriate allowlisted
    lint command (e.g. ruff check ., npm run lint), executes it in a clean sandbox workspace,
    and returns detailed lint diagnostic results.
    """
    name: str = "run_linter"
    description: str = (
        "Execute repository code linters and static analysis in an isolated multi-language sandbox. "
        "Intended for code review agents to verify style, syntax, and static analysis issues after gathering relevant files. "
        "Accepts repository files and runs controlled allowlisted linter commands (e.g., ruff check ., npm run lint)."
    )
    input_schema = RunLinterInput

    def __init__(self, executor: Optional[SandboxExecutorService] = None):
        self.executor = executor or SandboxExecutorService()

    async def execute(
        self, params: RunLinterInput, context: Optional[ToolContext] = None
    ) -> SandboxResult:
        """
        Execute the lint operation using the configured SandboxExecutorService.
        Returns the structured SandboxResult model unchanged.
        """
        request = SandboxRequest(
            files=params.files,
            operation=CommandCategory.LINT,
        )
        return self.executor.execute(request)


run_linter_tool = RunLinterTool()
run_linter = run_linter_tool
