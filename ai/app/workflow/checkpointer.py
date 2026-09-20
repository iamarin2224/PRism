import logging
from typing import Optional
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver

logger = logging.getLogger("prism.workflow.checkpointer")

_global_checkpointer: Optional[BaseCheckpointSaver] = None


def get_default_checkpointer() -> BaseCheckpointSaver:
    """
    Returns the singleton checkpoint saver instance for StateGraph persistence,
    allowing human-in-the-loop pauses, state inspection, and resumption.
    """
    global _global_checkpointer
    if _global_checkpointer is None:
        _global_checkpointer = MemorySaver()
    return _global_checkpointer


def reset_checkpointer_for_testing():
    """Reset the checkpointer state for clean test isolation."""
    global _global_checkpointer
    _global_checkpointer = MemorySaver()
