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
        Applies developer feedback, persists approved findings, and routes directly
        to post_review_github without marking the state COMPLETED prematurely.
        """
        config = self._get_config(review_run_id)
        logger.info(
            f"Resuming review workflow run '{review_run_id}' with human input: {human_input}"
        )

        # 1. Load checkpointed state snapshot asynchronously
        state_snapshot = await self.graph.aget_state(config)
        if not state_snapshot or not state_snapshot.values:
            raise ValueError(f"No checkpointed state found for review run '{review_run_id}'")

        # 2. Extract and preserve or update verified findings
        current_values = dict(state_snapshot.values)
        existing_verified = current_values.get("verified_findings", [])
        approved_findings = human_input.get("approved_findings")

        state_updates: Dict[str, Any] = {
            "status": "IN_PROGRESS",
            "routing_decision": human_input.get("routing_decision", "POST_GITHUB"),
        }

        if approved_findings is not None:
            state_updates["verified_findings"] = approved_findings
            logger.info(
                f"[{review_run_id}] Updated verified_findings with {len(approved_findings)} approved findings."
            )
        else:
            state_updates["verified_findings"] = existing_verified
            logger.info(
                f"[{review_run_id}] Retained existing {len(existing_verified)} verified findings (no approved_findings provided)."
            )

        # 3. Persist state update as resume_after_human_approval node
        # In the graph topology: resume_after_human_approval -> post_review_github -> END
        # Updating state as_node="resume_after_human_approval" schedules the next node as post_review_github.
        await self.graph.aupdate_state(
            config,
            state_updates,
            as_node="resume_after_human_approval",
        )

        # 4. Invoke graph resumption
        result = await self.graph.ainvoke(None, config=config)
        final_status = result.get("status", "UNKNOWN")
        logger.info(
            f"Review workflow run '{review_run_id}' resumed and finalized with status='{final_status}'"
        )
        return result

    async def get_state(self, review_run_id: str) -> Optional[ReviewState]:
        """Retrieve latest checkpointed ReviewState snapshot for the review run."""
        config = self._get_config(review_run_id)
        state_snapshot = await self.graph.aget_state(config)
        if state_snapshot and state_snapshot.values:
            return state_snapshot.values
        return None


# Global default workflow engine singleton
workflow_engine = LangGraphWorkflowEngine()

