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

    def _embed_batch_with_retry(self, batch: List[str], max_retries: int = 4) -> List[List[float]]:
        """Embeds a single batch of texts with retry, backoff, and adaptive sub-batch splitting."""
        import time

        if not batch:
            return []

        client = self.client
        model_id = settings.EMBEDDING_MODEL
        # Normalize model ID for AICredits (e.g. openai/text-embedding-3-small -> text-embedding-3-small)
        clean_model_id = model_id.replace("openai/", "") if model_id.startswith("openai/") else model_id

        cleaned_batch = [t if t.strip() else " " for t in batch]

        # Truncate text if individual chunk exceeds maximum embedding token length (~8000 chars safety limit)
        cleaned_batch = [t[:8000] if len(t) > 8000 else t for t in cleaned_batch]

        for attempt in range(1, max_retries + 1):
            try:
                response = client.embeddings.create(
                    model=clean_model_id,
                    input=cleaned_batch,
                )
                sorted_data = sorted(response.data, key=lambda x: x.index)
                return [item.embedding for item in sorted_data]
            except OpenAIError as e:
                err_msg = getattr(e, "message", str(e))
                logger.warning(
                    f"[Embeddings] Upstream error (attempt {attempt}/{max_retries}) for batch of {len(batch)} items: {err_msg}"
                )
                if attempt == max_retries:
                    # If batch has more than 1 item, try splitting into smaller sub-batches
                    if len(batch) > 1:
                        mid = len(batch) // 2
                        logger.info(f"[Embeddings] Splitting failing batch of {len(batch)} items into {mid} and {len(batch) - mid}")
                        left = self._embed_batch_with_retry(batch[:mid], max_retries=2)
                        right = self._embed_batch_with_retry(batch[mid:], max_retries=2)
                        return left + right
                    raise RuntimeError(f"AICredits embedding error: {err_msg}")
                # Exponential backoff with jitter
                sleep_time = (2 ** (attempt - 1)) + 0.5
                time.sleep(sleep_time)
            except Exception as e:
                logger.warning(f"[Embeddings] Unexpected error (attempt {attempt}/{max_retries}): {e}")
                if attempt == max_retries:
                    if len(batch) > 1:
                        mid = len(batch) // 2
                        left = self._embed_batch_with_retry(batch[:mid], max_retries=2)
                        right = self._embed_batch_with_retry(batch[mid:], max_retries=2)
                        return left + right
                    raise RuntimeError(f"Embedding error: {str(e)}")
                time.sleep(2)

        return []

    def embed_texts(self, texts: List[str], batch_size: int = 25) -> List[List[float]]:
        """
        Generates vector embeddings for a list of texts using AICredits
        and the configured embedding model (e.g. text-embedding-3-small).
        """
        if not texts:
            return []

        embeddings: List[List[float]] = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            batch_vectors = self._embed_batch_with_retry(batch)
            embeddings.extend(batch_vectors)

        return embeddings

    def embed_query(self, query: str) -> List[float]:
        """Generates embedding for a single search query."""
        results = self.embed_texts([query])
        if not results:
            raise ValueError("Failed to generate embedding for query.")
        return results[0]


# Global embedding service singleton
embedding_service = EmbeddingService()
