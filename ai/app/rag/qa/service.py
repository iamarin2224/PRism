import logging
import time
from typing import Any
from openai import AsyncOpenAI

from app.config import settings
from app.rag.models import QARequest, QAResponse, SourceReference
from app.rag.retrieval.retriever import code_retriever

logger = logging.getLogger("prism.rag.qa")

QA_SYSTEM_PROMPT = """You are the PRism Code Intelligence Assistant.
Answer developer questions accurately based on the provided repository code snippets.
When explaining, reference the relevant file paths and line numbers where possible.
If the provided snippets do not contain enough information to answer the question completely, state clearly what is missing."""


class RepositoryQAService:
    """
    Question-answering engine using the RAG retriever and configured Mid-tier LLM model (Qwen 3 Coder).
    Directly instantiates the OpenAI client from application settings with OpenRouter fallback.
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

        answer_text = ""

        # 3. Call primary Mid-tier model (AICredits MID_MODEL) directly using settings
        if settings.AICREDITS_API_KEY.strip():
            try:
                primary_client = AsyncOpenAI(
                    api_key=settings.AICREDITS_API_KEY,
                    base_url=settings.AICREDITS_BASE_URL,
                )
                response = await primary_client.chat.completions.create(
                    model=settings.MID_MODEL,
                    messages=[
                        {"role": "system", "content": QA_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.2,
                    max_tokens=2048,
                )
                if response.choices and response.choices[0].message and response.choices[0].message.content:
                    answer_text = response.choices[0].message.content.strip()
            except Exception as e:
                logger.warning(f"Primary MID_MODEL Q&A generation error ({e}). Attempting OpenRouter fallback...")

        # 4. Fallback to OpenRouter if primary failed, not configured, or returned empty text
        if not answer_text and settings.OPENROUTER_API_KEY.strip():
            try:
                fallback_client = AsyncOpenAI(
                    api_key=settings.OPENROUTER_API_KEY,
                    base_url=settings.OPENROUTER_BASE_URL,
                )
                fallback_resp = await fallback_client.chat.completions.create(
                    model=settings.OPENROUTER_MODEL,
                    messages=[
                        {"role": "system", "content": QA_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.2,
                    max_tokens=2048,
                )
                if fallback_resp.choices and fallback_resp.choices[0].message and fallback_resp.choices[0].message.content:
                    answer_text = fallback_resp.choices[0].message.content.strip()
            except Exception as fb_err:
                logger.error(f"Fallback Q&A generation error: {fb_err}")

        # 5. Deterministic grounded response from retrieved chunks if models were unavailable
        if not answer_text:
            if retrieval_result.chunks:
                file_list = ", ".join(list(dict.fromkeys(c.file_path for c in retrieval_result.chunks)))
                answer_text = (
                    f"Found {len(retrieval_result.chunks)} relevant code snippet(s) in `{file_list}` "
                    f"for query: \"{request.query}\".\n\n"
                    f"Please inspect the referenced code sources below for details on these components."
                )
            else:
                answer_text = f"No relevant code chunks found in repository `{request.repo_name}` for query: \"{request.query}\"."

        # 6. Extract structured source citations
        sources = [
            SourceReference(
                file_path=c.file_path,
                start_line=c.start_line,
                end_line=c.end_line,
                symbol=c.symbol,
                similarity=round(c.similarity, 4),
                content=c.content,
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
