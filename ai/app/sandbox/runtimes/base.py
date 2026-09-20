from abc import ABC, abstractmethod
from typing import Dict, Optional
from app.sandbox.models import CommandCategory, RuntimeType


class BaseRuntimeAdapter(ABC):
    """Abstract base class for language/runtime execution adapters."""

    @property
    @abstractmethod
    def runtime_type(self) -> RuntimeType:
        """The RuntimeType enum represented by this adapter."""
        pass

    @property
    def priority(self) -> int:
        """
        Priority order for runtime detection.
        Higher numbers are evaluated first (e.g. TypeScript > JavaScript).
        """
        return 0

    @abstractmethod
    def detect(self, files: Dict[str, str]) -> bool:
        """
        Detect if the repository files match this runtime.
        
        :param files: Dict mapping relative file path to file string content.
        :return: True if this runtime adapter should handle the project.
        """
        pass

    @abstractmethod
    def get_command(self, category: CommandCategory, files: Dict[str, str]) -> Optional[str]:
        """
        Resolve the safe allowlisted command to execute for the given operation.
        
        :param category: CommandCategory (TEST, LINT, TYPECHECK)
        :param files: Dict mapping relative file path to file string content.
        :return: The command string to execute, or None if the operation is unsupported.
        """
        pass
