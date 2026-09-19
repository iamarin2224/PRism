import logging
import time

from app.rag.models import QARequest, QAResponse, SourceReference
from app.rag.retrieval.retriever import code_retriever
from app.services.llm import llm_service

logger = logging.getLogger("prism.rag.qa")

QA_SYSTEM_PROMPT = """You are the PRism Code Intelligence Assistant.
Answer developer questions accurately based on the provided repository code snippets.
When explaining, reference the relevant file paths and line numbers where possible.
If the provided snippets do not contain enough information to answer the question completely, state clearly what is missing."""


class RepositoryQAService:
    """
    Question-answering engine reusing the RAG retriever and OpenRouter LLM service.
    """

    async def answer_question(self, request: QARequest) -> QAResponse:
        start_time = time.perf_counter()

        # 1. Retrieve top-K relevant chunks strictly scoped to the repository
        retrieval_result = await code_retriever.retrieve(
            repo_name=request.repo_name,
            query=request.query,
            top_k=request.top_k,
        )

        # 2. Format context for prompt injection
        context_str = code_retriever.format_context(retrieval_result.chunks)

        user_prompt = f"""Repository Context:
{context_str}

Question:
{request.query}

Please provide a clear and helpful explanation based on the code above:"""

        # 3. Call LLM service via OpenRouter
        answer_text = llm_service.generate_text(
            prompt=user_prompt,
            system_message=QA_SYSTEM_PROMPT,
        )

        # 4. Extract structured source citations
        sources = [
            SourceReference(
                file_path=c.file_path,
                start_line=c.start_line,
                end_line=c.end_line,
                symbol=c.symbol,
                similarity=round(c.similarity, 4),
            )
            for c in retrieval_result.chunks
        ]

        total_latency_ms = (time.perf_counter() - start_time) * 1000

        return QAResponse(
            query=request.query,
            repo_name=request.repo_name,
            answer=answer_text,
            sources=sources,
            latency_ms=round(total_latency_ms, 2),
        )


# Global Q&A service singleton
qa_service = RepositoryQAService()
