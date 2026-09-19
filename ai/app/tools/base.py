from abc import ABC, abstractmethod
from typing import Any, Dict, Generic, Optional, Type, TypeVar
from pydantic import BaseModel, Field

from app.tools.context import ToolContext

TInput = TypeVar("TInput", bound=BaseModel)


class ToolResult(BaseModel):
    """
    Standardized structured response format for all tools.
    """
    success: bool = Field(..., description="Whether the tool execution succeeded")
    data: Optional[Any] = Field(default=None, description="Structured payload on success")
    error: Optional[str] = Field(default=None, description="Error message on failure")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Execution metrics or metadata")

    @classmethod
    def ok(cls, data: Any, metadata: Optional[Dict[str, Any]] = None) -> "ToolResult":
        return cls(success=True, data=data, error=None, metadata=metadata or {})

    @classmethod
    def fail(cls, error: str, metadata: Optional[Dict[str, Any]] = None) -> "ToolResult":
        return cls(success=False, data=None, error=error, metadata=metadata or {})


class BaseTool(ABC, Generic[TInput]):
    """
    Abstract base class for all PRism tools.
    Every tool defines its name, LLM-friendly description, Pydantic input schema,
    and async execution method.
    """
    name: str
    description: str
    input_schema: Type[TInput]

    @abstractmethod
    async def execute(self, params: TInput, context: Optional[ToolContext] = None) -> ToolResult:
        """
        Executes the tool with the given validated parameters and repository context.
        """
        pass

    def to_openai_tool(self) -> Dict[str, Any]:
        """
        Returns the OpenAI-compatible function-calling schema dynamically
        derived from the tool's Pydantic input model.
        """
        schema = self.input_schema.model_json_schema()
        # Clean up title and type if present in top level
        properties = schema.get("properties", {})
        required = schema.get("required", [])

        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description.strip(),
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                },
            },
        }
