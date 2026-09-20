import logging
from typing import Any, Dict, Optional

from app.workflow.checkpointer import get_default_checkpointer
from app.workflow.graph import create_review_graph
from app.workflow.state import ReviewState
from app.workflow.workflow_engine import WorkflowEngine

logger = logging.getLogger("prism.workflow.langgraph_engine")


class LangGraphWorkflowEngine(WorkflowEngine):
    """
    Concrete WorkflowEngine implementation backed by LangGraph StateGraph.
    Encapsulates state checkpointing, parallel branch dispatch, and human-in-the-loop
    resumption behind the clean WorkflowEngine protocol interface.
    """

    def __init__(self, checkpointer=None):
        self.checkpointer = checkpointer or get_default_checkpointer()
        self.graph = create_review_graph(checkpointer=self.checkpointer)

    def _get_config(self, review_run_id: str) -> Dict[str, Any]:
        return {"configurable": {"thread_id": review_run_id}}

    async def run(self, initial_state: ReviewState) -> ReviewState:
        """
        Execute the review workflow for the given initial state.
        Executes until completion or until paused at the Human Approval Queue.
        """
        run_id = initial_state["review_run_id"]
        config = self._get_config(run_id)
        logger.info(f"Starting review workflow run '{run_id}' for {initial_state['repo_name']} PR #{initial_state['pr_number']}")

        result = await self.graph.ainvoke(initial_state, config=config)
        return result

    async def resume(
        self, review_run_id: str, human_input: Dict[str, Any]
    ) -> ReviewState:
        """
        Resume a paused workflow run that was routed to Human Approval.
        Applies developer feedback and triggers final posting to GitHub.
        """
        config = self._get_config(review_run_id)
        logger.info(f"Resuming review workflow run '{review_run_id}' with human input: {human_input}")

        # Update state with human approval decision
        state_snapshot = self.graph.get_state(config)
        if not state_snapshot or not state_snapshot.values:
            raise ValueError(f"No checkpointed state found for review run '{review_run_id}'")

        current_values = dict(state_snapshot.values)
        current_values["status"] = "IN_PROGRESS"
        if "approved_findings" in human_input:
            current_values["verified_findings"] = human_input["approved_findings"]

        # Run resume node to finalize and post
        resume_update = {
            "status": "COMPLETED",
            "routing_decision": "POST_GITHUB",
        }
        self.graph.update_state(config, resume_update, as_node="human_approval_queue")
        result = await self.graph.ainvoke(None, config=config)
        return result

    async def get_state(self, review_run_id: str) -> Optional[ReviewState]:
        """Retrieve latest checkpointed ReviewState snapshot for the review run."""
        config = self._get_config(review_run_id)
        state_snapshot = self.graph.get_state(config)
        if state_snapshot and state_snapshot.values:
            return state_snapshot.values
        return None


# Global default workflow engine singleton
workflow_engine = LangGraphWorkflowEngine()
