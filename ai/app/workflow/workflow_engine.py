from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from app.workflow.state import ReviewState


class WorkflowEngine(ABC):
    """
    Abstract Protocol interface for PRism review workflow orchestration.
    Decouples external callers (FastAPI routes, ARQ workers, Next.js frontend)
    from internal LangGraph orchestration implementation.
    """

    @abstractmethod
    async def run(self, initial_state: ReviewState) -> ReviewState:
        """
        Execute a complete or initial workflow run from start to completion or HITL pause.
        
        :param initial_state: The initial ReviewState dictionary.
        :return: The updated ReviewState after execution.
        """
        pass

    @abstractmethod
    async def resume(
        self, review_run_id: str, human_input: Dict[str, Any]
    ) -> ReviewState:
        """
        Resume a paused workflow run that was routed to the Human Approval Queue.
        
        :param review_run_id: Unique review execution ID.
        :param human_input: Decision and feedback provided by the human reviewer.
        :return: The updated ReviewState after resumption.
        """
        pass

    @abstractmethod
    async def get_state(self, review_run_id: str) -> Optional[ReviewState]:
        """
        Retrieve the latest checkpointed state for a given review run.
        
        :param review_run_id: Unique review execution ID.
        :return: Current ReviewState or None if not found.
        """
        pass
