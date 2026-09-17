from typing import Optional, Literal
from pydantic import BaseModel, Field


class ReviewRequest(BaseModel):
    """Simple test prompt request model."""
    prompt: str = Field(..., description="Prompt or query to send to the LLM")


class StructuredTestRequest(BaseModel):
    """Request model for testing structured code analysis."""
    code: Optional[str] = Field(
        default=None,
        description="Optional source code snippet to analyze. If omitted, a standard test snippet is used."
    )


class LLMResponse(BaseModel):
    """Raw text response model from the LLM."""
    response: str = Field(..., description="Text response returned by the LLM")


class Finding(BaseModel):
    """Structured code finding representing a single issue or observation."""
    severity: Literal["low", "medium", "high", "critical"] = Field(
        ..., description="Severity level of the finding"
    )
    category: Literal["security", "correctness", "performance", "error_handling", "code_quality"] = Field(
        ..., description="Classification category of the finding"
    )
    title: str = Field(..., description="Short summary of the issue")
    description: str = Field(..., description="Detailed explanation of the issue and why it matters")
    line: Optional[int] = Field(default=None, description="Line number in the code where the issue occurs, if applicable")


class ReviewResponse(BaseModel):
    """Structured review containing a list of code findings."""
    findings: list[Finding] = Field(
        default_factory=list, description="List of structured findings identified in the code"
    )
