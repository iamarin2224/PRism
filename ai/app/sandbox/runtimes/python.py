from typing import Dict, Optional
from app.sandbox.models import CommandCategory, RuntimeType
from app.sandbox.runtimes.base import BaseRuntimeAdapter


class PythonRuntimeAdapter(BaseRuntimeAdapter):
    """Runtime adapter for Python projects using pytest and ruff."""

    PYTHON_MANIFESTS = {
        "pyproject.toml",
        "requirements.txt",
        "setup.py",
        "setup.cfg",
        "Pipfile",
        "tox.ini",
        "pytest.ini",
        "manage.py",
    }

    @property
    def runtime_type(self) -> RuntimeType:
        return RuntimeType.PYTHON

    @property
    def priority(self) -> int:
        return 1

    def detect(self, files: Dict[str, str]) -> bool:
        paths = set(files.keys())
        # Check for python manifest files
        if any(manifest in paths for manifest in self.PYTHON_MANIFESTS):
            return True

        # Check for any .py files
        if any(p.endswith(".py") for p in paths):
            return True

        return False

    def get_command(self, category: CommandCategory, files: Dict[str, str]) -> Optional[str]:
        if category == CommandCategory.TEST:
            return "pytest"

        if category == CommandCategory.LINT:
            return "ruff check ."

        if category == CommandCategory.TYPECHECK:
            # Ruff provides fast static analysis and linting; if mypy isn't configured,
            # ruff check . performs comprehensive syntax & type-related lint checks
            return "ruff check ."

        return None
