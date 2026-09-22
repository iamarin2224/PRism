import operator
from typing import Annotated, Any, Dict, List, Optional
from typing_extensions import TypedDict
from pydantic import BaseModel, Field

from app.models.review import Finding


class SpecialistOutput(BaseModel):
    """Execution output from a single parallel specialist agent."""
    specialist_name: str = Field(..., description="Specialist identifier (e.g. security, quality, tests, docs)")
    findings: List[Finding] = Field(default_factory=list, description="Findings detected by the specialist")
    tokens_in: int = Field(default=0, description="Prompt tokens consumed")
    tokens_out: int = Field(default=0, description="Completion tokens consumed")
    tokens_used: int = Field(default=0, description="Total tokens consumed")
    execution_time_ms: float = Field(default=0.0, description="Specialist execution duration in milliseconds")
    error: Optional[str] = Field(default=None, description="Error message if specialist execution encountered a failure")

    def model_post_init(self, __context):
        if self.tokens_used == 0 and (self.tokens_in > 0 or self.tokens_out > 0):
            self.tokens_used = self.tokens_in + self.tokens_out


class ReviewState(TypedDict):
    """
    Typed, immutable-by-default state passed through the LangGraph StateGraph.
    Uses Annotated reducer functions (e.g. operator.add) to safely aggregate
    parallel branch outputs.
    """
    review_run_id: str
    repo_name: str
    pr_number: int
    commit_sha: str
    base_sha: str
    pr_metadata: Dict[str, Any]
    diff_summary: Dict[str, Any]
    semantic_context: Dict[str, Any]
    procedural_rules: List[Dict[str, Any]]
    episodic_context: List[Dict[str, Any]]
    specialist_results: Annotated[List[SpecialistOutput], operator.add]
    merged_findings: List[Finding]
    verified_findings: List[Finding]
    routing_decision: Optional[str]  # "POST_GITHUB", "REQUIRE_HUMAN_APPROVAL", "DISMISSED"
    status: str                      # "QUEUED", "IN_PROGRESS", "COMPLETED", "FAILED", "AWAITING_HUMAN_APPROVAL"
    total_tokens_in: int
    total_tokens_out: int
    total_cost_inr: float
    review_summary_markdown: Optional[str]
    errors: Annotated[List[str], operator.add]


def create_initial_review_state(
    review_run_id: str,
    repo_name: str,
    pr_number: int,
    commit_sha: str,
    base_sha: str = "main",
    pr_metadata: Optional[Dict[str, Any]] = None,
    diff_summary: Optional[Dict[str, Any]] = None,
) -> ReviewState:
    """Helper to initialize a clean ReviewState dictionary."""
    return {
        "review_run_id": review_run_id,
        "repo_name": repo_name,
        "pr_number": pr_number,
        "commit_sha": commit_sha,
        "base_sha": base_sha,
        "pr_metadata": pr_metadata or {},
        "diff_summary": diff_summary or {},
        "semantic_context": {},
        "procedural_rules": [],
        "episodic_context": [],
        "specialist_results": [],
        "merged_findings": [],
        "verified_findings": [],
        "routing_decision": None,
        "status": "QUEUED",
        "total_tokens_in": 0,
        "total_tokens_out": 0,
        "total_cost_inr": 0.0,
        "review_summary_markdown": None,
        "errors": [],
    }
