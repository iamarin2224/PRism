from typing import List, Literal, Optional
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
    id: Optional[str] = Field(default=None, description="Unique finding ID if generated")
    specialist: Optional[str] = Field(default=None, description="Specialist name that emitted this finding (security, quality, tests, docs)")
    severity: Literal["info", "low", "medium", "high", "critical"] = Field(
        ..., description="Severity level of the finding"
    )
    category: Literal[
        "security", "correctness", "performance", "error_handling", "code_quality",
        "bug", "design", "test_coverage", "documentation", "compliance"
    ] = Field(
        ..., description="Classification category of the finding"
    )
    title: str = Field(..., description="Short summary of the issue")
    description: str = Field(..., description="Detailed explanation of the issue and why it matters")
    file_path: Optional[str] = Field(default=None, description="Repository file path where the finding applies")
    start_line: Optional[int] = Field(default=None, description="1-based starting line number")
    end_line: Optional[int] = Field(default=None, description="1-based ending line number (inclusive)")
    line: Optional[int] = Field(default=None, description="Legacy 1-based line number for backward compatibility")
    suggestion: Optional[str] = Field(default=None, description="Concrete proposed replacement code or action")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Confidence score from 0.0 to 1.0")
    agreement_count: int = Field(default=1, description="Number of specialists agreeing on this finding")
    is_verified: bool = Field(default=False, description="Whether the finding was verified by the Critic")

    def model_post_init(self, __context):
        # Sync line and start_line for backwards compatibility
        if self.start_line is None and self.line is not None:
            self.start_line = self.line
        elif self.line is None and self.start_line is not None:
            self.line = self.start_line
        if self.end_line is None and self.start_line is not None:
            self.end_line = self.start_line


class ReviewResponse(BaseModel):
    """Structured review containing a list of code findings."""
    findings: List[Finding] = Field(
        default_factory=list, description="List of structured findings identified in the code"
    )
