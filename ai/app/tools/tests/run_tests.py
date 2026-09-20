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


class RunTestsInput(BaseModel):
    """Input payload for the run_tests tool."""
    files: List[SandboxFile] = Field(
        ...,
        description=(
            "List of repository files (path and string content) needed to run the test suite. "
            "Must include source files, test files, and package manifests (e.g. pyproject.toml, package.json)."
        ),
    )


class RunTestsTool(BaseTool[RunTestsInput]):
    """
    Agent-facing tool to execute repository test suites in an isolated multi-language E2B sandbox.
    
    Intended LangGraph Agent Use:
    An agent should invoke this tool only after it has gathered sufficient repository context
    (e.g., modified code, relevant test files, configuration manifests like pyproject.toml or package.json).
    The sandbox automatically detects the project runtime, selects the appropriate allowlisted
    test command (e.g. pytest, npm test), executes it in a clean sandbox workspace, and returns
    detailed test execution results.
    """
    name: str = "run_tests"
    description: str = (
        "Execute repository test suites in an isolated multi-language sandbox. "
        "Intended for code review agents to verify test outcomes and detect regressions after gathering relevant files. "
        "Accepts repository files and runs controlled allowlisted test commands (e.g., pytest, npm test)."
    )
    input_schema = RunTestsInput

    def __init__(self, executor: Optional[SandboxExecutorService] = None):
        self.executor = executor or SandboxExecutorService()

    async def execute(
        self, params: RunTestsInput, context: Optional[ToolContext] = None
    ) -> SandboxResult:
        """
        Execute the test operation using the configured SandboxExecutorService.
        Returns the structured SandboxResult model unchanged.
        """
        request = SandboxRequest(
            files=params.files,
            operation=CommandCategory.TEST,
        )
        return self.executor.execute(request)


run_tests_tool = RunTestsTool()
run_tests = run_tests_tool
