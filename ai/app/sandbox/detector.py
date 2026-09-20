from typing import Dict, List, Optional, Tuple
from app.sandbox.models import CommandCategory, RuntimeType
from app.sandbox.runtimes.base import BaseRuntimeAdapter
from app.sandbox.runtimes.cpp import CppRuntimeAdapter
from app.sandbox.runtimes.go import GoRuntimeAdapter
from app.sandbox.runtimes.java import JavaRuntimeAdapter
from app.sandbox.runtimes.javascript import JavaScriptRuntimeAdapter
from app.sandbox.runtimes.python import PythonRuntimeAdapter
from app.sandbox.runtimes.typescript import TypeScriptRuntimeAdapter


class ProjectDetector:
    """Detects repository project runtime and resolves allowlisted execution commands."""

    def __init__(self, adapters: Optional[List[BaseRuntimeAdapter]] = None):
        if adapters is None:
            self.adapters: List[BaseRuntimeAdapter] = [
                TypeScriptRuntimeAdapter(),
                JavaScriptRuntimeAdapter(),
                GoRuntimeAdapter(),
                JavaRuntimeAdapter(),
                CppRuntimeAdapter(),
                PythonRuntimeAdapter(),
            ]
        else:
            self.adapters = list(adapters)

        # Sort adapters by descending priority
        self.adapters.sort(key=lambda a: a.priority, reverse=True)

    def register_adapter(self, adapter: BaseRuntimeAdapter) -> None:
        """Register a new runtime adapter (e.g. for Rust, Ruby, etc.)."""
        self.adapters.append(adapter)
        self.adapters.sort(key=lambda a: a.priority, reverse=True)

    def detect_runtime(self, files: Dict[str, str]) -> Tuple[RuntimeType, Optional[BaseRuntimeAdapter]]:
        """
        Evaluate registered adapters to detect the project runtime.
        Returns the matching (RuntimeType, Adapter) tuple or (RuntimeType.UNSUPPORTED, None).
        """
        for adapter in self.adapters:
            if adapter.detect(files):
                return adapter.runtime_type, adapter
        return RuntimeType.UNSUPPORTED, None

    def resolve_command(
        self, files: Dict[str, str], operation: CommandCategory
    ) -> Tuple[RuntimeType, Optional[str]]:
        """
        Identify runtime and determine the safe allowlisted command for the requested operation.
        Returns (RuntimeType, Optional[command_string]).
        """
        runtime_type, adapter = self.detect_runtime(files)
        if adapter is None:
            return RuntimeType.UNSUPPORTED, None

        command = adapter.get_command(operation, files)
        return runtime_type, command
