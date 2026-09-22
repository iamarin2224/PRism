import logging
from typing import Dict, Optional, Tuple

from app.config import settings

logger = logging.getLogger("prism.workflow.events.cost")

# Pricing per 1M tokens in Indian Rupees (INR - ₹)
# Format: (input_cost_inr_per_1m, output_cost_inr_per_1m)
MODEL_PRICING_INR: Dict[str, Tuple[float, float]] = {
    # High tier: DeepSeek V4.1 Flash (₹15.10 / 1M input, ₹60.40 / 1M output)
    "deepseek/deepseek-v4.1-flash": (15.10, 60.40),

    # Mid tier: Qwen3 Coder 30B A3B Instruct (₹7.05 / 1M input, ₹27.18 / 1M output)
    "qwen/qwen3-coder-30b-a3b-instruct": (7.05, 27.18),

    # Free tier: OpenRouter Free
    "openrouter/free": (0.0, 0.0),
}


class CostCalculator:
    """
    Computes token and rupee (INR) costs from model token usage metrics.
    Supports dynamic fallback to HM/MM environment pricing variables,
    and returns None when no pricing data exists to indicate insufficient data.
    """

    @staticmethod
    def calculate_cost_inr(
        model_name: str,
        tokens_in: int,
        tokens_out: int,
    ) -> Optional[float]:
        """
        Calculates cost in Indian Rupees (INR - ₹) based on token usage.
        Returns None if pricing mapping is missing (insufficient data).
        """
        pricing: Optional[Tuple[float, float]] = MODEL_PRICING_INR.get(model_name)

        if not pricing:
            # Fallback to optional env vars if configured
            if model_name == settings.HIGH_MODEL and settings.HM_INPUT_COST is not None and settings.HM_OUTPUT_COST is not None:
                pricing = (settings.HM_INPUT_COST, settings.HM_OUTPUT_COST)
            elif model_name == settings.MID_MODEL and settings.MM_INPUT_COST is not None and settings.MM_OUTPUT_COST is not None:
                pricing = (settings.MM_INPUT_COST, settings.MM_OUTPUT_COST)
            elif model_name == settings.OPENROUTER_MODEL:
                pricing = (0.0, 0.0)

        if not pricing:
            logger.warning(
                f"No pricing configuration found for model '{model_name}'. "
                "Cost calculation marked as insufficient data (None)."
            )
            return None

        cost_in = (tokens_in / 1_000_000.0) * pricing[0]
        cost_out = (tokens_out / 1_000_000.0) * pricing[1]
        return round(cost_in + cost_out, 6)

    # Backward compatibility alias
    calculate_cost_usd = calculate_cost_inr


cost_calculator = CostCalculator()

