import logging
import time
from typing import Optional
from app.config import settings
from app.sandbox.detector import ProjectDetector
from app.sandbox.models import (
    CommandCategory,
    ExecutionStatus,
    RuntimeType,
    SandboxRequest,
    SandboxResult,
)
from app.sandbox.validator import ValidationError, validate_file_payloads

logger = logging.getLogger(__name__)

WORKSPACE_PATH = "/home/user/workspace"

try:
    from e2b import Sandbox, CommandExitException
except ImportError:
    try:
        from e2b_code_interpreter import Sandbox
        from e2b.exceptions import CommandExitException
    except ImportError:
        Sandbox = None
        CommandExitException = Exception


class SandboxExecutorService:
    """Service to safely execute controlled checks in an isolated E2B sandbox."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        template: Optional[str] = None,
        detector: Optional[ProjectDetector] = None,
    ):
        self.api_key = api_key or settings.E2B_API_KEY
        self.template = template or settings.E2B_TEMPLATE
        self.detector = detector or ProjectDetector()

    def execute(self, request: SandboxRequest) -> SandboxResult:
        """
        Execute a controlled operation on the provided files in an isolated sandbox.
        
        Lifecycle:
        1. Validate all file payloads and paths for security and size limits.
        2. Detect project runtime and determine safe allowlisted command.
        3. If unsupported or operation not configured, return immediately.
        4. Spawn a fresh E2B sandbox.
        5. Write files to the fixed workspace.
        6. Execute allowlisted command inside the workspace directory.
        7. Collect stdout, stderr, exit code, and execution duration.
        8. Guarantee sandbox termination in the finally block.
        """
        start_time = time.perf_counter()

        # Step 1: Validate file payloads
        try:
            validate_file_payloads(request.files)
        except ValidationError as e:
            return SandboxResult(
                status=ExecutionStatus.ERROR,
                operation=request.operation,
                message=f"Validation error: {str(e)}",
                duration_ms=(time.perf_counter() - start_time) * 1000,
            )

        # Convert files to lookup dict
        files_dict = {f.path: f.content for f in request.files}

        # Step 2: Detect runtime and resolve safe allowlisted command
        runtime_type, command = self.detector.resolve_command(files_dict, request.operation)

        if runtime_type == RuntimeType.UNSUPPORTED or not command:
            duration_ms = (time.perf_counter() - start_time) * 1000
            msg = (
                f"Project runtime '{runtime_type.value}' does not have a configured command "
                f"for operation '{request.operation.value}'."
            )
            return SandboxResult(
                status=ExecutionStatus.UNSUPPORTED_OR_NOT_CONFIGURED,
                runtime=runtime_type,
                operation=request.operation,
                command=command,
                message=msg,
                duration_ms=duration_ms,
            )

        if not self.api_key:
            return SandboxResult(
                status=ExecutionStatus.ERROR,
                runtime=runtime_type,
                operation=request.operation,
                command=command,
                message="E2B_API_KEY is not configured.",
                duration_ms=(time.perf_counter() - start_time) * 1000,
            )

        if Sandbox is None:
            return SandboxResult(
                status=ExecutionStatus.ERROR,
                runtime=runtime_type,
                operation=request.operation,
                command=command,
                message="E2B Python SDK is not installed.",
                duration_ms=(time.perf_counter() - start_time) * 1000,
            )

        # Step 3: Execute in fresh sandbox
        sandbox = None
        sandbox_id = None
        try:
            # Create fresh sandbox
            if hasattr(Sandbox, "create"):
                sandbox = Sandbox.create(self.template, api_key=self.api_key)
            else:
                sandbox = Sandbox(template=self.template, api_key=self.api_key)

            sandbox_id = getattr(sandbox, "sandbox_id", getattr(sandbox, "id", None))

            # Clean/prepare workspace directory
            sandbox.commands.run(f"rm -rf {WORKSPACE_PATH} && mkdir -p {WORKSPACE_PATH}")

            # Write files to fixed workspace
            for file_payload in request.files:
                target_file_path = f"{WORKSPACE_PATH}/{file_payload.path}"
                sandbox.files.write(target_file_path, file_payload.content)

            # Execute the allowlisted command
            exec_timeout = request.timeout_seconds or 60.0
            try:
                proc = sandbox.commands.run(
                    command,
                    cwd=WORKSPACE_PATH,
                    timeout=exec_timeout,
                )
                stdout = getattr(proc, "stdout", "") or ""
                stderr = getattr(proc, "stderr", "") or ""
                exit_code = getattr(proc, "exit_code", 0)
                status = ExecutionStatus.SUCCESS if exit_code == 0 else ExecutionStatus.FAILURE

            except CommandExitException as cmd_err:
                stdout = getattr(cmd_err, "stdout", "") or ""
                stderr = getattr(cmd_err, "stderr", "") or ""
                exit_code = getattr(cmd_err, "exit_code", 1)
                status = ExecutionStatus.FAILURE

            duration_ms = (time.perf_counter() - start_time) * 1000

            return SandboxResult(
                status=status,
                exit_code=exit_code,
                stdout=stdout.strip(),
                stderr=stderr.strip(),
                duration_ms=duration_ms,
                sandbox_id=sandbox_id,
                runtime=runtime_type,
                operation=request.operation,
                command=command,
            )

        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.exception("Error during sandbox execution")
            return SandboxResult(
                status=ExecutionStatus.ERROR,
                duration_ms=duration_ms,
                sandbox_id=sandbox_id,
                runtime=runtime_type,
                operation=request.operation,
                command=command,
                message=f"Sandbox execution failed: {str(e)}",
            )

        finally:
            if sandbox is not None:
                try:
                    sandbox.kill()
                except Exception:
                    try:
                        sandbox.close()
                    except Exception:
                        pass
