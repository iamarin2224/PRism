import os
import re
import logging
from typing import List, Optional
from pydantic import BaseModel, Field

from app.rag.vectorstore.pgvector import vector_store
from app.tools.base import BaseTool, ToolResult
from app.tools.context import ToolContext

logger = logging.getLogger("prism.tools.code.tests")

TEST_DIR_PATTERNS = {"tests", "test", "__tests__", "spec", "specs"}
TEST_FILE_PATTERNS = [
    r"\.test\.[a-zA-Z0-9]+$",
    r"\.spec\.[a-zA-Z0-9]+$",
    r"^test_.*\.py$",
    r".*_test\.go$",
    r".*Test\.java$",
]


class GetRelatedTestsInput(BaseModel):
    target: str = Field(
        ...,
        description="Source file path (e.g. 'src/services/payment.ts') or function/symbol name to find associated tests for.",
    )
    limit: int = Field(
        default=10,
        ge=1,
        le=30,
        description="Maximum number of test matches to return.",
    )


def _is_test_file(path: str) -> bool:
    normalized = path.replace("\\", "/").lower()
    parts = normalized.split("/")
    # Check directory conventions
    if any(p in TEST_DIR_PATTERNS for p in parts[:-1]):
        return True
    # Check filename conventions
    filename = parts[-1]
    for pat in TEST_FILE_PATTERNS:
        if re.search(pat, filename, re.IGNORECASE):
            return True
    return False


def _derive_candidate_test_names(source_path: str) -> List[str]:
    """Generates candidate test file naming patterns for a given source file."""
    base_name = os.path.basename(source_path)
    name_without_ext, ext = os.path.splitext(base_name)

    candidates = [
        f"{name_without_ext}.test{ext}",
        f"{name_without_ext}.spec{ext}",
        f"test_{name_without_ext}.py",
        f"{name_without_ext}_test{ext}",
        f"{name_without_ext}Test{ext}",
        name_without_ext,
    ]
    return candidates


class GetRelatedTestsTool(BaseTool[GetRelatedTestsInput]):
    name = "get_related_tests"
    description = (
        "Find existing test suites and test files related to a source file, module, or symbol. "
        "Recognizes standard test conventions (tests/, __tests__/, *.test.*, *.spec.*, test_*.py) "
        "and searches for symbol references inside test files. "
        "Does NOT run tests; only identifies relevant test suites to assess regression risk."
    )
    input_schema = GetRelatedTestsInput

    async def execute(self, params: GetRelatedTestsInput, context: Optional[ToolContext] = None) -> ToolResult:
        if not context or not context.repository:
            return ToolResult.fail("ToolContext with valid repository is required to find related tests.")

        target = params.target.strip()
        if not target:
            return ToolResult.fail("Target cannot be empty.")

        repo_name = context.repository
        related_tests = []
        seen_paths = set()

        # Strategy 1: If target is a file path, look for direct test file naming matches
        if "/" in target or "." in target:
            candidates = _derive_candidate_test_names(target)
            for cand in candidates:
                results = await vector_store.exact_text_search(
                    query=cand,
                    repo_name=repo_name,
                    limit=10,
                )
                for r in results:
                    file_p = r["file_path"]
                    if _is_test_file(file_p) and file_p not in seen_paths:
                        seen_paths.add(file_p)
                        related_tests.append({
                            "test_file": file_p,
                            "relevance_reason": f"Matches test file naming convention for '{target}'",
                            "sample_line": r["start_line"],
                            "matching_snippet": r["content"][:200],
                        })

        # Strategy 2: Search for symbol or module imports in files identified as tests
        symbol_query = os.path.splitext(os.path.basename(target))[0] if ("/" in target) else target
        symbol_matches = await vector_store.find_symbol_references(
            symbol=symbol_query,
            repo_name=repo_name,
            limit=params.limit * 2,
        )

        for m in symbol_matches:
            file_p = m["file_path"]
            if _is_test_file(file_p) and file_p not in seen_paths:
                seen_paths.add(file_p)
                related_tests.append({
                    "test_file": file_p,
                    "relevance_reason": f"Test file references symbol '{symbol_query}' ({m['reference_type']})",
                    "sample_line": m["start_line"],
                    "matching_snippet": m["content"][:200],
                })

        return ToolResult.ok(
            {
                "target": target,
                "related_tests": related_tests[: params.limit],
                "count": len(related_tests[: params.limit]),
            },
            metadata={"target": target, "found": len(related_tests)},
        )


get_related_tests_tool = GetRelatedTestsTool()
