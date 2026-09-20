import asyncio
from unittest.mock import MagicMock, patch

from app.sandbox.models import (
    CommandCategory,
    ExecutionStatus,
    RuntimeType,
    SandboxFile,
    SandboxRequest,
    SandboxResult,
)
from app.sandbox.service import SandboxExecutorService
from app.tools.tests.run_linter import RunLinterInput, RunLinterTool, run_linter
from app.tools.tests.run_tests import RunTestsInput, RunTestsTool, run_tests


def test_run_tests_delegates_with_test_operation():
    mock_executor = MagicMock(spec=SandboxExecutorService)
    expected_result = SandboxResult(
        status=ExecutionStatus.SUCCESS,
        exit_code=0,
        stdout="1 passed in 0.02s",
        stderr="",
        duration_ms=1200.0,
        sandbox_id="test-sandbox-123",
        runtime=RuntimeType.PYTHON,
        operation=CommandCategory.TEST,
        command="pytest",
    )
    mock_executor.execute.return_value = expected_result

    tool = RunTestsTool(executor=mock_executor)
    files = [
        SandboxFile(path="main.py", content="def add(a, b): return a + b"),
        SandboxFile(path="test_main.py", content="from main import add\ndef test_add(): assert add(1, 2) == 3"),
    ]
    params = RunTestsInput(files=files)

    result = asyncio.run(tool.execute(params))

    # Verify delegation to executor
    mock_executor.execute.assert_called_once()
    called_request: SandboxRequest = mock_executor.execute.call_args[0][0]
    assert called_request.operation == CommandCategory.TEST
    assert len(called_request.files) == 2
    assert called_request.files[0].path == "main.py"
    assert called_request.files[1].path == "test_main.py"

    # Verify structured result is returned unchanged
    assert result == expected_result
    assert result.status == ExecutionStatus.SUCCESS
    assert result.exit_code == 0
    assert result.sandbox_id == "test-sandbox-123"
    assert result.runtime == RuntimeType.PYTHON
    assert result.operation == CommandCategory.TEST
    assert result.command == "pytest"


def test_run_linter_delegates_with_lint_operation():
    mock_executor = MagicMock(spec=SandboxExecutorService)
    expected_result = SandboxResult(
        status=ExecutionStatus.FAILURE,
        exit_code=1,
        stdout="main.py:1:1: F401 `os` imported but unused",
        stderr="",
        duration_ms=850.0,
        sandbox_id="test-sandbox-456",
        runtime=RuntimeType.PYTHON,
        operation=CommandCategory.LINT,
        command="ruff check .",
    )
    mock_executor.execute.return_value = expected_result

    tool = RunLinterTool(executor=mock_executor)
    files = [
        SandboxFile(path="main.py", content="import os\nprint('hello')"),
    ]
    params = RunLinterInput(files=files)

    result = asyncio.run(tool.execute(params))

    # Verify delegation to executor
    mock_executor.execute.assert_called_once()
    called_request: SandboxRequest = mock_executor.execute.call_args[0][0]
    assert called_request.operation == CommandCategory.LINT
    assert len(called_request.files) == 1
    assert called_request.files[0].path == "main.py"

    # Verify structured result is returned unchanged
    assert result == expected_result
    assert result.status == ExecutionStatus.FAILURE
    assert result.exit_code == 1
    assert result.runtime == RuntimeType.PYTHON
    assert result.operation == CommandCategory.LINT
    assert result.command == "ruff check ."


def test_results_pass_through_unchanged_unsupported():
    mock_executor = MagicMock(spec=SandboxExecutorService)
    unsupported_result = SandboxResult(
        status=ExecutionStatus.UNSUPPORTED_OR_NOT_CONFIGURED,
        exit_code=None,
        stdout="",
        stderr="",
        duration_ms=1.5,
        sandbox_id=None,
        runtime=RuntimeType.UNSUPPORTED,
        operation=CommandCategory.TEST,
        command=None,
        message="Project runtime 'unsupported' does not have a configured command for operation 'test'.",
    )
    mock_executor.execute.return_value = unsupported_result

    tool = RunTestsTool(executor=mock_executor)
    files = [SandboxFile(path="README.md", content="# Docs only")]
    result = asyncio.run(tool.execute(RunTestsInput(files=files)))

    assert result == unsupported_result
    assert result.status == ExecutionStatus.UNSUPPORTED_OR_NOT_CONFIGURED
    assert result.sandbox_id is None
    assert result.command is None


def test_results_pass_through_unchanged_error():
    mock_executor = MagicMock(spec=SandboxExecutorService)
    error_result = SandboxResult(
        status=ExecutionStatus.ERROR,
        exit_code=None,
        stdout="",
        stderr="",
        duration_ms=0.5,
        sandbox_id=None,
        runtime=RuntimeType.PYTHON,
        operation=CommandCategory.LINT,
        command="ruff check .",
        message="E2B_API_KEY is not configured.",
    )
    mock_executor.execute.return_value = error_result

    tool = RunLinterTool(executor=mock_executor)
    files = [SandboxFile(path="app.py", content="print(1)")]
    result = asyncio.run(tool.execute(RunLinterInput(files=files)))

    assert result == error_result
    assert result.status == ExecutionStatus.ERROR
    assert result.message == "E2B_API_KEY is not configured."


def test_no_e2b_api_call_for_invalid_or_unsupported_inputs():
    """
    Verify with the real SandboxExecutorService that invalid paths (e.g. traversal, sensitive files)
    or unsupported projects never attempt to create an E2B Sandbox.
    """
    real_executor = SandboxExecutorService(api_key="fake-key", template="fake-template")
    tool_tests = RunTestsTool(executor=real_executor)
    tool_linter = RunLinterTool(executor=real_executor)

    with patch("e2b.Sandbox.create") as mock_sandbox_create:
        # 1. Invalid path traversal input
        invalid_files = [SandboxFile(path="../secret.txt", content="malicious")]
        res_invalid = asyncio.run(tool_tests.execute(RunTestsInput(files=invalid_files)))
        assert res_invalid.status == ExecutionStatus.ERROR
        assert "Validation error" in res_invalid.message
        mock_sandbox_create.assert_not_called()

        # 2. Blocked sensitive file
        sensitive_files = [SandboxFile(path=".env", content="SECRET=123")]
        res_sensitive = asyncio.run(tool_linter.execute(RunLinterInput(files=sensitive_files)))
        assert res_sensitive.status == ExecutionStatus.ERROR
        assert "Validation error" in res_sensitive.message
        mock_sandbox_create.assert_not_called()

        # 3. Unsupported project runtime
        unsupported_files = [SandboxFile(path="notes.txt", content="just notes")]
        res_unsupported = asyncio.run(tool_tests.execute(RunTestsInput(files=unsupported_files)))
        assert res_unsupported.status == ExecutionStatus.UNSUPPORTED_OR_NOT_CONFIGURED
        mock_sandbox_create.assert_not_called()


def test_openai_tool_schema_export():
    """Verify tool metadata and OpenAI schema exports have no command injection parameters."""
    test_schema = run_tests.to_openai_tool()
    assert test_schema["type"] == "function"
    assert test_schema["function"]["name"] == "run_tests"
    assert "files" in test_schema["function"]["parameters"]["properties"]
    # Ensure no arbitrary command or shell arguments are exposed in the schema
    assert "command" not in test_schema["function"]["parameters"]["properties"]
    assert "cmd" not in test_schema["function"]["parameters"]["properties"]

    lint_schema = run_linter.to_openai_tool()
    assert lint_schema["type"] == "function"
    assert lint_schema["function"]["name"] == "run_linter"
    assert "files" in lint_schema["function"]["parameters"]["properties"]
    assert "command" not in lint_schema["function"]["parameters"]["properties"]
