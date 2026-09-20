import logging
from typing import Literal, Tuple
from langchain_openai import ChatOpenAI
from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger("prism.services.model_router")

ModelTier = Literal["high", "mid", "free"]
SpecialistRole = Literal["security", "quality", "tests", "docs", "critic"]


class ModelRouter:
    """
    Tiered Model Router:
    Selects and instantiates the correct LLM provider, base URL, API key,
    and model identifier based on the operational tier and specialist role.

    - High Tier (HIGH_MODEL): Used by Security specialist and Critic/Verifier node.
    - Mid Tier (MID_MODEL): Used by Quality and Tests specialists.
    - Free Tier (OPENROUTER_MODEL): Used by Docs specialist.
    """

    @staticmethod
    def get_tier_for_role(role: SpecialistRole) -> ModelTier:
        if role in ("security", "critic"):
            return "high"
        elif role in ("quality", "tests"):
            return "mid"
        elif role == "docs":
            return "free"
        return "mid"

    @staticmethod
    def get_model_and_endpoint(tier: ModelTier) -> Tuple[str, str, str]:
        """
        Returns (model_id, base_url, api_key) for the given tier.
        """
        if tier == "high":
            api_key = settings.AICREDITS_API_KEY
            base_url = settings.AICREDITS_BASE_URL
            model = settings.HIGH_MODEL
            return model, base_url, api_key
        elif tier == "mid":
            api_key = settings.AICREDITS_API_KEY
            base_url = settings.AICREDITS_BASE_URL
            model = settings.MID_MODEL
            return model, base_url, api_key
        elif tier == "free":
            api_key = settings.OPENROUTER_API_KEY
            base_url = settings.OPENROUTER_BASE_URL
            model = settings.OPENROUTER_MODEL
            return model, base_url, api_key
        else:
            api_key = settings.OPENROUTER_API_KEY
            base_url = settings.OPENROUTER_BASE_URL
            model = settings.OPENROUTER_MODEL
            return model, base_url, api_key

    def get_chat_model(
        self,
        role_or_tier: SpecialistRole | ModelTier,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> ChatOpenAI:
        """
        Instantiates a configured ChatOpenAI instance for LangChain / LangGraph usage.
        """
        if role_or_tier in ("security", "quality", "tests", "docs", "critic"):
            tier = self.get_tier_for_role(role_or_tier)  # type: ignore[arg-type]
        else:
            tier = role_or_tier  # type: ignore[assignment]

        model, base_url, api_key = self.get_model_and_endpoint(tier)
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
    ) -> Tuple[AsyncOpenAI, str]:
        """
        Instantiates a raw AsyncOpenAI client and returns (client, model_id).
        """
        if role_or_tier in ("security", "quality", "tests", "docs", "critic"):
            tier = self.get_tier_for_role(role_or_tier)  # type: ignore[arg-type]
        else:
            tier = role_or_tier  # type: ignore[assignment]

        model, base_url, api_key = self.get_model_and_endpoint(tier)
        client = AsyncOpenAI(
            api_key=api_key or "placeholder_key",
            base_url=base_url,
        )
        return client, model


# Global model router singleton
model_router = ModelRouter()
