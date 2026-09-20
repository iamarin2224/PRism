import os
from pathlib import PurePosixPath
from typing import List
from app.sandbox.models import FilePayload

# Disallowed paths and prefixes
BLOCKED_EXACT_NAMES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    ".git",
    ".gitignore",
    ".ssh",
    ".aws",
    ".bashrc",
    ".profile",
    ".zshrc",
}

BLOCKED_PATH_PARTS = {
    "..",
    ".git",
    ".ssh",
    ".aws",
}

MAX_FILES = 500
MAX_SINGLE_FILE_BYTES = 2 * 1024 * 1024  # 2MB
MAX_TOTAL_PAYLOAD_BYTES = 10 * 1024 * 1024  # 10MB


class ValidationError(ValueError):
    """Raised when file payloads or paths fail security checks."""
    pass


def validate_file_path(path: str) -> str:
    """
    Validate that a path is safe and strictly relative inside the workspace.
    
    Rules:
    - Must not be empty or whitespace.
    - Must not be an absolute path (no leading '/' or drive letters).
    - Must not contain traversal segments ('..').
    - Must not target sensitive files (e.g. .env, .git, .ssh).
    - Must normalize to a clean relative POSIX path.
    """
    if not path or not path.strip():
        raise ValidationError("File path cannot be empty.")

    clean_str = path.strip().replace("\\", "/")
    
    # Check for absolute path
    if clean_str.startswith("/") or (len(clean_str) > 1 and clean_str[1] == ":"):
        raise ValidationError(f"Absolute paths are forbidden: '{path}'")

    posix_path = PurePosixPath(clean_str)

    # Check parts
    for part in posix_path.parts:
        if part in BLOCKED_PATH_PARTS or part == "..":
            raise ValidationError(f"Invalid path component '{part}' in '{path}'")
        if "\x00" in part:
            raise ValidationError(f"Null byte detected in path '{path}'")

    # Check filename
    filename = posix_path.name
    if filename in BLOCKED_EXACT_NAMES:
        raise ValidationError(f"Access to sensitive file '{filename}' is blocked.")

    # Check normalized string does not escape
    norm = os.path.normpath(clean_str)
    if norm.startswith("..") or norm.startswith("/"):
        raise ValidationError(f"Path traversal detected in '{path}'")

    return norm


def validate_file_payloads(files: List[FilePayload]) -> None:
    """Validate all files in a sandbox request for size and safety."""
    if not files:
        raise ValidationError("File payload list cannot be empty.")

    if len(files) > MAX_FILES:
        raise ValidationError(f"Exceeded maximum file count ({len(files)} > {MAX_FILES})")

    total_bytes = 0
    seen_paths = set()

    for file in files:
        norm_path = validate_file_path(file.path)
        if norm_path in seen_paths:
            raise ValidationError(f"Duplicate file path detected: '{norm_path}'")
        seen_paths.add(norm_path)

        file_bytes = len(file.content.encode("utf-8"))
        if file_bytes > MAX_SINGLE_FILE_BYTES:
            raise ValidationError(
                f"File '{file.path}' exceeds maximum allowed size of {MAX_SINGLE_FILE_BYTES} bytes ({file_bytes} bytes)."
            )
        total_bytes += file_bytes

    if total_bytes > MAX_TOTAL_PAYLOAD_BYTES:
        raise ValidationError(
            f"Total payload size ({total_bytes} bytes) exceeds maximum limit of {MAX_TOTAL_PAYLOAD_BYTES} bytes."
        )
