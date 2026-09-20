import logging
from typing import Dict, Tuple

logger = logging.getLogger("prism.workflow.events.cost")

# Approximate pricing per 1M tokens (USD)
# Format: (input_cost_per_1m, output_cost_per_1m)
MODEL_PRICING: Dict[str, Tuple[float, float]] = {
    # High tier (DeepSeek V3 / R1)
    "deepseek/deepseek-v4.1-flash": (0.14, 0.28),
    "deepseek/deepseek-chat": (0.14, 0.28),
    "deepseek/deepseek-reasoner": (0.55, 2.19),
    "gpt-4o": (2.50, 10.00),
    "claude-3-5-sonnet": (3.00, 15.00),
    
    # Mid tier (Qwen / Mini)
    "qwen/qwen3-coder-30b-a3b-instruct": (0.07, 0.14),
    "gpt-4o-mini": (0.15, 0.60),
    "claude-3-5-haiku": (0.80, 4.00),

    # Free tier
    "openrouter/free": (0.0, 0.0),
}


class CostCalculator:
    """
    Computes dollar costs from model token usage metrics.
    """

    @staticmethod
    def calculate_cost_usd(
        model_name: str,
        tokens_in: int,
        tokens_out: int,
    ) -> float:
        pricing = MODEL_PRICING.get(model_name)
        if not pricing:
            # Fallback default: $0.15 / 1M in, $0.60 / 1M out
            pricing = (0.15, 0.60)

        cost_in = (tokens_in / 1_000_000.0) * pricing[0]
        cost_out = (tokens_out / 1_000_000.0) * pricing[1]
        return round(cost_in + cost_out, 6)


cost_calculator = CostCalculator()
