import io
import os
import ssl
import tarfile
import logging
import certifi
from dataclasses import dataclass
from typing import List, Optional, Set, Tuple
import httpx

from app.rag.chunking.splitter import count_tokens

logger = logging.getLogger("prism.rag.ingestion")

MAX_FILE_SIZE_BYTES = 1024 * 1024  # 1MB
MAX_FILE_TOKENS = 20000

Tuple_Skip = Tuple[bool, str]

IGNORED_DIRS: Set[str] = {
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".venv",
    "venv",
    "env",
    "__pycache__",
    ".cache",
    ".turbo",
    ".parcel-cache",
    "coverage",
    ".nyc_output",
    "out",
    ".idea",
    ".vscode",
}

IGNORED_FILES: Set[str] = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "composer.lock",
    "Cargo.lock",
    "Gemfile.lock",
    "poetry.lock",
    "Pipfile.lock",
}

BINARY_EXTENSIONS: Set[str] = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".bmp", ".tiff",
    ".mp3", ".wav", ".ogg", ".mp4", ".mov", ".avi", ".webm",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".wasm",
    ".pyc", ".pyo", ".pyd", ".class", ".jar",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".iso", ".dmg", ".img",
}


@dataclass
class IngestedFile:
    path: str
    content: str
    size_bytes: int
    token_count: int


def should_skip_file(file_path: str, size_bytes: int = 0) -> Tuple_Skip:
    normalized = file_path.replace("\\", "/").strip("/")
    parts = normalized.split("/")

    for part in parts[:-1]:
        if part in IGNORED_DIRS or part.startswith("."):
            return True, f"Ignored directory '{part}'"

    filename = parts[-1]
    if filename in IGNORED_FILES:
        return True, f"Ignored lock/build file '{filename}'"

    _, ext = os.path.splitext(filename.lower())

    if ext in BINARY_EXTENSIONS:
        return True, f"Binary file extension '{ext}'"

    if size_bytes > MAX_FILE_SIZE_BYTES:
        return True, f"File size {size_bytes} exceeds 1MB limit"

    return False, ""


class RepositoryIngestionService:
    """
    Handles fetching and filtering files from a GitHub repository at a target commit.
    """

    async def fetch_repository_files_github(
        self,
        repo_full_name: str,
        commit_sha: str,
        token: Optional[str] = None,
    ) -> List[IngestedFile]:
        """
        Downloads the full repository archive as a single tarball in 1 network request
        and extracts code files in-memory in ~1-2 seconds.
        """
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "PRism-Agentic-Code-Review",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"

        ssl_context = ssl.create_default_context(cafile=certifi.where())

        # GitHub redirects tarball downloads to codeload.github.com
        tarball_url = f"https://api.github.com/repos/{repo_full_name}/tarball/{commit_sha}"

        async with httpx.AsyncClient(headers=headers, verify=ssl_context, timeout=60.0, follow_redirects=True) as client:
            res = await client.get(tarball_url)
            if res.status_code != 200:
                raise RuntimeError(f"GitHub archive download failed ({res.status_code}): {res.text}")

        ingested_files: List[IngestedFile] = []

        # Decompress tarball stream in memory
        with tarfile.open(fileobj=io.BytesIO(res.content), mode="r:gz") as tar:
            for member in tar.getmembers():
                if not member.isfile():
                    continue

                # Strip root prefix (GitHub prefixes tarball paths with '{owner}-{repo}-{short_sha}/')
                parts = member.name.split("/", 1)
                if len(parts) < 2:
                    continue
                rel_path = parts[1]

                skip, reason = should_skip_file(rel_path, member.size)
                if skip:
                    logger.debug(f"Skipping {rel_path}: {reason}")
                    continue

                f = tar.extractfile(member)
                if f is None:
                    continue

                raw_bytes = f.read()
                try:
                    text_content = raw_bytes.decode("utf-8")
                except UnicodeDecodeError:
                    # Non-UTF8 or encoded binary file caught during parsing
                    continue

                # Fast heuristic: 20,000 tokens ≈ 80,000 characters (~4 chars/token).
                # Skip massive minified / data files immediately without running heavy tokenizer.
                if len(text_content) > 80_000:
                    tokens = count_tokens(text_content)
                    if tokens > MAX_FILE_TOKENS:
                        logger.warning(f"Skipping {rel_path}: contains {tokens} tokens (exceeds {MAX_FILE_TOKENS})")
                        continue
                else:
                    tokens = len(text_content) // 4  # Fast estimate for file-level metadata

                ingested_files.append(
                    IngestedFile(
                        path=rel_path,
                        content=text_content,
                        size_bytes=member.size,
                        token_count=tokens,
                    )
                )

        logger.info(f"Extracted {len(ingested_files)} valid code files from archive in-memory.")
        return ingested_files

    def filter_local_files(self, raw_files: List[dict]) -> List[IngestedFile]:
        results: List[IngestedFile] = []
        for item in raw_files:
            path = item.get("path", "")
            content = item.get("content", "")
            size = len(content.encode("utf-8"))

            skip, reason = should_skip_file(path, size)
            if skip:
                logger.debug(f"Skipping {path}: {reason}")
                continue

            if len(content) > 80_000:
                tokens = count_tokens(content)
                if tokens > MAX_FILE_TOKENS:
                    logger.warning(f"Skipping {path}: contains {tokens} tokens")
                    continue
            else:
                tokens = len(content) // 4

            results.append(
                IngestedFile(
                    path=path,
                    content=content,
                    size_bytes=size,
                    token_count=tokens,
                )
            )
        return results


ingestion_service = RepositoryIngestionService()