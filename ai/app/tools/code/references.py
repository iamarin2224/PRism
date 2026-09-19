import logging
from typing import Optional
from pydantic import BaseModel, Field

from app.rag.vectorstore.pgvector import vector_store
from app.tools.base import BaseTool, ToolResult
from app.tools.context import ToolContext

logger = logging.getLogger("prism.tools.code.references")


class FindReferencesInput(BaseModel):
    symbol: str = Field(
        ...,
        description="Exact symbol, class name, function name, or variable to find references for (e.g. 'validateSession').",
    )
    limit: int = Field(
        default=25,
        ge=1,
        le=100,
        description="Maximum number of references to return.",
    )


class FindReferencesTool(BaseTool[FindReferencesInput]):
    name = "find_references"
    description = (
        "Find definitions, imports, and usages/references of a symbol or identifier across the current repository. "
        "Performs fast, deterministic database queries against the indexed code chunks, categorizing results into "
        "'definition', 'import', or 'reference'. "
        "Use this tool to evaluate the blast radius and impact of modified functions, interfaces, or classes."
    )
    input_schema = FindReferencesInput

    async def execute(self, params: FindReferencesInput, context: Optional[ToolContext] = None) -> ToolResult:
        if not context or not context.repository:
            return ToolResult.fail("ToolContext with valid repository is required to find symbol references.")

        symbol = params.symbol.strip()
        if not symbol:
            return ToolResult.fail("Symbol cannot be empty.")

        matches = await vector_store.find_symbol_references(
            symbol=symbol,
            repo_name=context.repository,
            limit=params.limit,
        )

        formatted = [
            {
                "file_path": m["file_path"],
                "start_line": m["start_line"],
                "end_line": m["end_line"],
                "reference_type": m["reference_type"],
                "symbol": m["symbol"],
                "content_snippet": m["content"][:300] + ("..." if len(m["content"]) > 300 else ""),
            }
            for m in matches
        ]

        definitions_count = sum(1 for f in formatted if f["reference_type"] == "definition")
        usages_count = len(formatted) - definitions_count

        return ToolResult.ok(
            {
                "symbol": symbol,
                "references": formatted,
                "total_matches": len(formatted),
                "definitions_found": definitions_count,
                "usages_found": usages_count,
            },
            metadata={"symbol": symbol, "count": len(formatted)},
        )


find_references_tool = FindReferencesTool()
