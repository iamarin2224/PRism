import logging
from typing import List
from openai import OpenAI, OpenAIError

from app.config import settings

logger = logging.getLogger("prism.rag.embeddings")


class EmbeddingService:
    def __init__(self):
        self._client: OpenAI | None = None

    @property
    def client(self) -> OpenAI:
        """Lazily initialize OpenAI client configured for AICredits endpoint."""
        if not settings.AICREDITS_API_KEY:
            raise ValueError("AICREDITS_API_KEY is not configured in settings.")
        if self._client is None:
            self._client = OpenAI(
                base_url=settings.AICREDITS_BASE_URL,
                api_key=settings.AICREDITS_API_KEY,
            )
        return self._client

    def embed_texts(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        """
        Generates vector embeddings for a list of texts using AICredits
        and the configured embedding model (e.g. openai/text-embedding-3-small).
        """
        if not texts:
            return []

        embeddings: List[List[float]] = []
        client = self.client

        model_id = settings.EMBEDDING_MODEL
        # Normalize model ID for AICredits (e.g. openai/text-embedding-3-small -> text-embedding-3-small)
        if model_id.startswith("openai/"):
            model_id = model_id.replace("openai/", "")

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            # Replace empty strings to avoid embedding errors
            cleaned_batch = [t if t.strip() else " " for t in batch]

            try:
                response = client.embeddings.create(
                    model=model_id,
                    input=cleaned_batch,
                )

                # Sort by index to preserve input order
                sorted_data = sorted(response.data, key=lambda x: x.index)
                batch_vectors = [item.embedding for item in sorted_data]
                embeddings.extend(batch_vectors)
            except OpenAIError as e:
                err_msg = getattr(e, "message", str(e))
                logger.error(f"Embedding generation failed: {err_msg}")
                raise RuntimeError(f"AICredits embedding error: {err_msg}")
            except Exception as e:
                logger.error(f"Unexpected error during embedding generation: {e}")
                raise RuntimeError(f"Embedding error: {str(e)}")

        return embeddings

    def embed_query(self, query: str) -> List[float]:
        """Generates embedding for a single search query."""
        results = self.embed_texts([query])
        if not results:
            raise ValueError("Failed to generate embedding for query.")
        return results[0]


# Global embedding service singleton
embedding_service = EmbeddingService()
