import os
import asyncio
import logging
import ssl
import certifi
from dataclasses import dataclass
from typing import List, Optional, Set
import httpx



from app.rag.chunking.splitter import count_tokens

logger = logging.getLogger("prism.rag.ingestion")

MAX_FILE_SIZE_BYTES = 1024 * 1024  # 1MB
MAX_FILE_TOKENS = 20000

# Ignored directory and file patterns
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

# Binary and non-code file extensions
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
    """
    Checks if a file should be ignored during indexing based on path,
    binary extension, directory exclusion, or size limit (>1MB).
    """
    # Normalize path separators
    normalized = file_path.replace("\\", "/").strip("/")
    parts = normalized.split("/")

    # Check directory exclusion
    for part in parts[:-1]:
        if part in IGNORED_DIRS or part.startswith("."):
            return True, f"Ignored directory '{part}'"

    filename = parts[-1]
    if filename in IGNORED_FILES:
        return True, f"Ignored lock/build file '{filename}'"

    _, ext = os.path.splitext(filename.lower())

    # Check binary extensions
    if ext in BINARY_EXTENSIONS:
        return True, f"Binary file extension '{ext}'"

    # Check size limit (> 1MB)
    if size_bytes > MAX_FILE_SIZE_BYTES:
        return True, f"File size {size_bytes} exceeds 1MB limit"

    return False, ""


Tuple_Skip = tuple[bool, str]


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
        Fetches repository tree and content from GitHub API at a specific commit.
        """
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "PRism-Agentic-Code-Review",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"

        ssl_context = ssl.create_default_context(cafile=certifi.where())

        async with httpx.AsyncClient(headers=headers, verify=ssl_context, timeout=30.0) as client:
            # 1. Fetch recursive git tree at target commit
            tree_url = f"https://api.github.com/repos/{repo_full_name}/git/trees/{commit_sha}?recursive=1"
            res = await client.get(tree_url)

            if res.status_code != 200:
                raise RuntimeError(f"GitHub API tree error ({res.status_code}): {res.text}")

            tree_data = res.json()
            tree = tree_data.get("tree", [])

            # 2. Filter blobs
            candidate_items = []
            for item in tree:
                if item.get("type") != "blob":
                    continue

                path = item.get("path", "")
                size = item.get("size", 0)

                skip, reason = should_skip_file(path, size)
                if skip:
                    logger.debug(f"Skipping {path}: {reason}")
                    continue

                candidate_items.append(item)

            # 3. Concurrent fetching with semaphore
            sem = asyncio.Semaphore(10)
            ingested_files: List[IngestedFile] = []

            async def fetch_blob(item: dict) -> Optional[IngestedFile]:
                async with sem:
                    path = item.get("path", "")
                    size = item.get("size", 0)
                    blob_url = item.get("url")
                    if not blob_url:
                        return None

                    try:
                        blob_res = await client.get(blob_url, headers={"Accept": "application/vnd.github.raw+json"})
                        if blob_res.status_code == 200:
                            text_content = blob_res.text
                            tokens = count_tokens(text_content)

                            if tokens > MAX_FILE_TOKENS:
                                logger.warning(f"Skipping {path}: contains {tokens} tokens (exceeds {MAX_FILE_TOKENS})")
                                return None

                            return IngestedFile(
                                path=path,
                                content=text_content,
                                size_bytes=size or len(text_content.encode("utf-8")),
                                token_count=tokens,
                            )
                    except Exception as err:
                        logger.warning(f"Failed to fetch blob {path}: {err}")
                    return None

            fetched = await asyncio.gather(*[fetch_blob(item) for item in candidate_items])
            ingested_files = [f for f in fetched if f is not None]

        return ingested_files


    def filter_local_files(self, raw_files: List[dict]) -> List[IngestedFile]:
        """
        Filters and wraps provided file payloads (e.g. from local test snapshot or direct API).
        Each item is expected to have 'path' and 'content'.
        """
        results: List[IngestedFile] = []
        for item in raw_files:
            path = item.get("path", "")
            content = item.get("content", "")
            size = len(content.encode("utf-8"))

            skip, reason = should_skip_file(path, size)
            if skip:
                logger.debug(f"Skipping {path}: {reason}")
                continue

            tokens = count_tokens(content)
            if tokens > MAX_FILE_TOKENS:
                logger.warning(f"Skipping {path}: contains {tokens} tokens")
                continue

            results.append(
                IngestedFile(
                    path=path,
                    content=content,
                    size_bytes=size,
                    token_count=tokens,
                )
            )
        return results


# Global ingestion service singleton
ingestion_service = RepositoryIngestionService()
