from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class CommandCategory(str, Enum):
    """Supported controlled sandbox operations."""
    LINT = "lint"
    TEST = "test"
    TYPECHECK = "typecheck"


class RuntimeType(str, Enum):
    """Detected language/project runtime."""
    PYTHON = "python"
    JAVASCRIPT = "javascript"
    TYPESCRIPT = "typescript"
    CPP = "cpp"
    JAVA = "java"
    GO = "go"
    UNSUPPORTED = "unsupported"


class ExecutionStatus(str, Enum):
    """Sandbox execution outcome status."""
    SUCCESS = "success"
    FAILURE = "failure"
    ERROR = "error"
    UNSUPPORTED_OR_NOT_CONFIGURED = "unsupported_or_not_configured"


class FilePayload(BaseModel):
    """A file to be written to the sandbox workspace."""
    path: str = Field(..., description="Relative path of the file within the workspace")
    content: str = Field(..., description="File content as text")


# Alias for callers and tools referring to SandboxFile
SandboxFile = FilePayload


class SandboxRequest(BaseModel):
    """Request payload for sandbox execution."""
    files: List[FilePayload] = Field(..., description="Repository files to populate into sandbox workspace")
    operation: CommandCategory = Field(..., description="Operation to perform: test, lint, or typecheck")
    timeout_seconds: Optional[float] = Field(60.0, description="Max execution timeout in seconds")


class SandboxResult(BaseModel):
    """Structured execution result returned by the sandbox service."""
    status: ExecutionStatus
    exit_code: Optional[int] = None
    stdout: str = ""
    stderr: str = ""
    duration_ms: float = 0.0
    sandbox_id: Optional[str] = None
    runtime: RuntimeType = RuntimeType.UNSUPPORTED
    operation: CommandCategory
    command: Optional[str] = None
    message: Optional[str] = None
