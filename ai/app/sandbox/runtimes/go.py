from typing import Dict, Optional
from app.sandbox.models import CommandCategory, RuntimeType
from app.sandbox.runtimes.base import BaseRuntimeAdapter


class GoRuntimeAdapter(BaseRuntimeAdapter):
    """Runtime adapter for Go projects."""

    GO_MANIFESTS = {"go.mod", "go.sum", "go.work"}

    @property
    def runtime_type(self) -> RuntimeType:
        return RuntimeType.GO

    @property
    def priority(self) -> int:
        return 4

    def detect(self, files: Dict[str, str]) -> bool:
        paths = set(files.keys())
        if any(m in paths for m in self.GO_MANIFESTS):
            return True
        if any(p.endswith(".go") for p in paths):
            return True
        return False

    def get_command(self, category: CommandCategory, files: Dict[str, str]) -> Optional[str]:
        if category == CommandCategory.TEST:
            return "go test -v ./..."

        if category == CommandCategory.LINT:
            return "go vet ./..."

        if category == CommandCategory.TYPECHECK:
            return "go build ./..."

        return None
