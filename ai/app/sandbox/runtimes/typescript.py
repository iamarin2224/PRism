import json
from typing import Dict, Optional
from app.sandbox.models import CommandCategory, RuntimeType
from app.sandbox.runtimes.base import BaseRuntimeAdapter


class TypeScriptRuntimeAdapter(BaseRuntimeAdapter):
    """Runtime adapter for TypeScript projects."""

    TS_EXTENSIONS = (".ts", ".tsx", ".mts", ".cts")
    DEFAULT_NPM_TEST_STUB = 'echo "Error: no test specified" && exit 1'

    @property
    def runtime_type(self) -> RuntimeType:
        return RuntimeType.TYPESCRIPT

    @property
    def priority(self) -> int:
        return 10  # Higher priority than JavaScript

    def _parse_package_json(self, files: Dict[str, str]) -> Optional[dict]:
        content = files.get("package.json")
        if not content:
            return None
        try:
            return json.loads(content)
        except Exception:
            return None

    def detect(self, files: Dict[str, str]) -> bool:
        paths = set(files.keys())
        if "tsconfig.json" in paths:
            return True
        if any(p.endswith(self.TS_EXTENSIONS) for p in paths):
            return True
        return False

    def get_command(self, category: CommandCategory, files: Dict[str, str]) -> Optional[str]:
        pkg = self._parse_package_json(files)
        scripts = pkg.get("scripts", {}) if pkg and isinstance(pkg.get("scripts"), dict) else {}
        paths = set(files.keys())

        if category == CommandCategory.TYPECHECK:
            if "typecheck" in scripts:
                return "npm run typecheck"
            if "check" in scripts:
                return "npm run check"
            if "tsconfig.json" in paths or any(p.endswith(self.TS_EXTENSIONS) for p in paths):
                return "tsc --noEmit"
            return None

        if category == CommandCategory.TEST:
            test_script = scripts.get("test", "").strip()
            if test_script and test_script != self.DEFAULT_NPM_TEST_STUB:
                return "npm test"
            return None

        if category == CommandCategory.LINT:
            if "lint" in scripts:
                return "npm run lint"
            if "check" in scripts:
                return "npm run check"
            return None

        return None
