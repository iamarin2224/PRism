import logging
import re
from typing import Literal, Optional
from pydantic import BaseModel, Field

from app.rag.indexing.pipeline import indexing_pipeline
from app.rag.models import IndexStatus
from app.rag.retrieval.retriever import code_retriever
from app.rag.vectorstore.pgvector import vector_store
from app.tools.base import BaseTool, ToolResult
from app.tools.context import ToolContext

logger = logging.getLogger("prism.tools.code.search")


class SearchCodebaseInput(BaseModel):
    query: str = Field(
        ...,
        description="Code snippet, symbol name, error message, or natural-language query to search for.",
    )
    mode: Literal["auto", "semantic", "exact"] = Field(
        default="auto",
        description=(
            "Search strategy. 'semantic' uses RAG vector embeddings (requires indexed repository), "
            "'exact' uses deterministic substring search across codebase, and 'auto' automatically "
            "selects between exact identifier search and semantic retrieval."
        ),
    )
    top_k: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Maximum number of code results to return.",
    )
    file_path: Optional[str] = Field(
        default=None,
        description="Optional file path filter to scope search to a specific file.",
    )


def _is_exact_identifier(query: str) -> bool:
    """Heuristic: Check if query looks like a code identifier, symbol, camelCase, or path."""
    clean = query.strip()
    # Single word or camelCase/snake_case/PascalCase
    if re.fullmatch(r"^[a-zA-Z0-9_\.\:\-\/]+$", clean):
        return True
    # Quoted query or function call syntax
    if (clean.startswith('"') and clean.endswith('"')) or clean.endswith("()") or "::" in clean or "." in clean:
        return True
    return False


class SearchCodebaseTool(BaseTool[SearchCodebaseInput]):
    name = "search_codebase"
    description = (
        "Search the current repository for relevant code. "
        "Use 'semantic' mode for natural-language questions regarding repository logic, architecture, or behavior (backed by pgvector RAG). "
        "Use 'exact' mode for deterministic string, symbol, or keyword matches. "
        "When mode is 'auto', it intelligently routes identifiers to exact search and conceptual questions to semantic RAG. "
        "Respects repository indexing state and provides informative fallback when unindexed."
    )
    input_schema = SearchCodebaseInput

    async def execute(self, params: SearchCodebaseInput, context: Optional[ToolContext] = None) -> ToolResult:
        if not context or not context.repository:
            return ToolResult.fail("ToolContext with valid repository is required to search codebase.")

        repo_name = context.repository
        query = params.query.strip()
        if not query:
            return ToolResult.fail("Search query cannot be empty.")

        # Check repository index status
        repo_state = await indexing_pipeline.get_or_create_repo_record(repo_name)
        is_indexed = repo_state.status in (IndexStatus.INDEXED, IndexStatus.STALE) and repo_state.total_chunks > 0

        # Determine effective mode
        effective_mode = params.mode
        if effective_mode == "auto":
            effective_mode = "exact" if _is_exact_identifier(query) else "semantic"

        # 1. Semantic search execution (RAG)
        if effective_mode == "semantic":
            if not is_indexed:
                # If unindexed, provide exact search fallback with clear notice
                logger.info(f"Repository {repo_name} is not indexed ({repo_state.status.value}). Falling back to exact search.")
                exact_results = await vector_store.exact_text_search(
                    query=query,
                    repo_name=repo_name,
                    limit=params.top_k,
                    file_path_filter=params.file_path,
                )
                if exact_results:
                    return ToolResult.ok(
                        {
                            "mode_used": "exact_fallback",
                            "message": (
                                f"Repository {repo_name} is not indexed for semantic vector search "
                                f"(status: {repo_state.status.value}). Performed exact text match fallback."
                            ),
                            "results": exact_results,
                        },
                        metadata={"indexed": False, "total_chunks": 0},
                    )
                return ToolResult.fail(
                    f"Repository '{repo_name}' is not indexed for semantic RAG search (status: {repo_state.status.value}). "
                    f"No exact matches found for query '{query}'."
                )

            # Perform semantic vector retrieval
            retrieval = await code_retriever.retrieve(
                repo_name=repo_name,
                query=query,
                top_k=params.top_k,
                file_path_filter=params.file_path,
            )

            formatted_results = [
                {
                    "file_path": c.file_path,
                    "language": c.language,
                    "start_line": c.start_line,
                    "end_line": c.end_line,
                    "symbol": c.symbol,
                    "content": c.content,
                    "similarity_score": round(c.similarity, 4),
                }
                for c in retrieval.chunks
            ]

            return ToolResult.ok(
                {
                    "mode_used": "semantic",
                    "results": formatted_results,
                    "count": len(formatted_results),
                },
                metadata={
                    "indexed": True,
                    "latency_ms": retrieval.latency_ms,
                    "total_chunks_in_repo": repo_state.total_chunks,
                },
            )

        # 2. Exact deterministic search execution
        exact_results = await vector_store.exact_text_search(
            query=query,
            repo_name=repo_name,
            limit=params.top_k,
            file_path_filter=params.file_path,
        )

        return ToolResult.ok(
            {
                "mode_used": "exact",
                "results": exact_results,
                "count": len(exact_results),
            },
            metadata={"indexed": is_indexed, "query": query},
        )


search_codebase_tool = SearchCodebaseTool()
