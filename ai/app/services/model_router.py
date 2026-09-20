import logging
import time
from typing import Literal, Optional, Tuple
from langchain_openai import ChatOpenAI
from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger("prism.services.model_router")

ModelTier = Literal["high", "mid", "free"]
SpecialistRole = Literal["security", "quality", "tests", "docs", "critic"]


class ModelRouter:
    """
    Tiered Model Router with Dynamic Fallback & Credit Exhaustion Protection:
    Selects and instantiates the correct LLM provider, base URL, API key,
    and model identifier based on the operational tier and specialist role.

    - High Tier (HIGH_MODEL): Used by Security specialist and Critic/Verifier node.
    - Mid Tier (MID_MODEL): Used by Quality and Tests specialists.
    - Free Tier (OPENROUTER_MODEL): Used by Docs specialist.

    Dynamic Fallback Mechanics:
    - If AICREDITS_API_KEY is not provided OR if AICredits exhausts its quota/balance,
      the router dynamically and seamlessly falls back all operations to OPENROUTER_MODEL,
      OPENROUTER_BASE_URL, and OPENROUTER_API_KEY.
    """

    def __init__(self):
        self._aicredits_exhausted: bool = False

    def mark_aicredits_exhausted(self, reason: Optional[str] = None) -> None:
        """Globally flips the router to OpenRouter fallback mode for all subsequent calls."""
        if not self._aicredits_exhausted:
            self._aicredits_exhausted = True
            logger.warning(
                f"AICredits quota exhausted or credits finished ({reason or 'no reason given'}). "
                f"Dynamically switching entire routing stack to OpenRouter free fallback."
            )

    def reset_quota_status(self) -> None:
        """Resets the exhaustion flag (e.g. for retrying or testing)."""
        self._aicredits_exhausted = False

    def is_credit_exhaustion_error(self, error: Exception | str) -> bool:
        """
        Detects if an error is due to insufficient balance, quota exhaustion, or credit expiry.
        """
        err_str = str(error).lower()
        exhaustion_indicators = [
            "insufficient_quota",
            "insufficient quota",
            "credit",
            "quota_exceeded",
            "quota exceeded",
            "balance",
            "out of credits",
            "exceeded your current quota",
            "billing",
            "payment required",
            "402",
        ]
        return any(indicator in err_str for indicator in exhaustion_indicators)

    @staticmethod
    def get_tier_for_role(role: SpecialistRole) -> ModelTier:
        if role in ("security", "critic"):
            return "high"
        elif role in ("quality", "tests"):
            return "mid"
        elif role == "docs":
            return "free"
        return "mid"

    def get_model_and_endpoint(self, tier: ModelTier, force_fallback: bool = False) -> Tuple[str, str, str]:
        """
        Returns (model_id, base_url, api_key) for the given tier.
        If AICREDITS_API_KEY is not provided, or marked exhausted, or force_fallback is True,
        high and mid tiers cleanly fallback to OpenRouter.
        """
        if force_fallback or self._aicredits_exhausted or not settings.AICREDITS_API_KEY.strip():
            return settings.OPENROUTER_MODEL, settings.OPENROUTER_BASE_URL, settings.OPENROUTER_API_KEY

        if tier == "high":
            return settings.HIGH_MODEL, settings.AICREDITS_BASE_URL, settings.AICREDITS_API_KEY
        elif tier == "mid":
            return settings.MID_MODEL, settings.AICREDITS_BASE_URL, settings.AICREDITS_API_KEY
        elif tier == "free":
            return settings.OPENROUTER_MODEL, settings.OPENROUTER_BASE_URL, settings.OPENROUTER_API_KEY
        else:
            return settings.MID_MODEL, settings.AICREDITS_BASE_URL, settings.AICREDITS_API_KEY

    def get_chat_model(
        self,
        role_or_tier: SpecialistRole | ModelTier,
        temperature: float = 0.1,
        max_tokens: int = 4096,
        force_fallback: bool = False,
    ) -> ChatOpenAI:
        """
        Instantiates a configured ChatOpenAI instance for LangChain / LangGraph usage.
        """
        if role_or_tier in ("security", "quality", "tests", "docs", "critic"):
            tier = self.get_tier_for_role(role_or_tier)  # type: ignore[arg-type]
        else:
            tier = role_or_tier  # type: ignore[assignment]

        model, base_url, api_key = self.get_model_and_endpoint(tier, force_fallback=force_fallback)
        logger.debug(f"Routing model for '{role_or_tier}' -> Tier '{tier}': {model} @ {base_url}")

        return ChatOpenAI(
            model=model,
            openai_api_key=api_key or "placeholder_key",
            openai_api_base=base_url,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    def get_async_client(
        self,
        role_or_tier: SpecialistRole | ModelTier,
        force_fallback: bool = False,
    ) -> Tuple[AsyncOpenAI, str]:
        """
        Instantiates a raw AsyncOpenAI client and returns (client, model_id).
        """
        if role_or_tier in ("security", "quality", "tests", "docs", "critic"):
            tier = self.get_tier_for_role(role_or_tier)  # type: ignore[arg-type]
        else:
            tier = role_or_tier  # type: ignore[assignment]

        model, base_url, api_key = self.get_model_and_endpoint(tier, force_fallback=force_fallback)
        client = AsyncOpenAI(
            api_key=api_key or "placeholder_key",
            base_url=base_url,
        )
        return client, model


# Global model router singleton
model_router = ModelRouter()
