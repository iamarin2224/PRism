import logging
from typing import List, Optional

from app.rag.embeddings.client import embedding_service
from app.rag.models import RetrievedChunk, RetrievalResult
from app.rag.vectorstore.pgvector import vector_store

logger = logging.getLogger("prism.rag.retrieval")


class CodeRetriever:
    """
    High-level retriever interface that coordinates query embedding,
    strictly scoped vector similarity search, and context formatting.
    """

    async def retrieve(
        self,
        repo_name: str,
        query: str,
        top_k: int = 5,
        file_path_filter: Optional[str] = None,
    ) -> RetrievalResult:
        """
        Embeds the query and retrieves top-K relevant code chunks strictly from repo_name.
        """
        if not query.strip():
            return RetrievalResult(
                query=query,
                repo_name=repo_name,
                chunks=[],
                top_k=top_k,
                latency_ms=0.0,
            )

        # 1. Generate query embedding using AICredits
        query_vector = embedding_service.embed_query(query)

        # 2. Query pgvector store with strict repository filter
        result = await vector_store.similarity_search(
            query=query,
            query_vector=query_vector,
            repo_name=repo_name,
            top_k=top_k,
            file_path_filter=file_path_filter,
        )

        logger.info(
            f"Retrieved {len(result.chunks)} chunks for query in {repo_name} (latency: {result.latency_ms}ms)"
        )
        return result

    def format_context(self, chunks: List[RetrievedChunk]) -> str:
        """
        Formats retrieved chunks into structured context for LLM prompt injection.
        """
        if not chunks:
            return "No relevant repository context found."

        formatted_sections = []
        for i, chunk in enumerate(chunks, 1):
            symbol_str = f" | Symbol: {chunk.symbol}" if chunk.symbol else ""
            header = f"[{i}] File: {chunk.file_path} (Lines {chunk.start_line}-{chunk.end_line}{symbol_str}) | Similarity: {chunk.similarity:.2f}"
            content_block = f"{header}\n```\n{chunk.content}\n```"
            formatted_sections.append(content_block)

        return "\n\n".join(formatted_sections)


# Global retriever singleton
code_retriever = CodeRetriever()
