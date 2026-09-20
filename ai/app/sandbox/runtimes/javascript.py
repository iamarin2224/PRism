import json
from typing import Dict, Optional
from app.sandbox.models import CommandCategory, RuntimeType
from app.sandbox.runtimes.base import BaseRuntimeAdapter


class JavaScriptRuntimeAdapter(BaseRuntimeAdapter):
    """Runtime adapter for JavaScript / Node.js projects."""

    JS_EXTENSIONS = (".js", ".mjs", ".cjs", ".jsx")
    DEFAULT_NPM_TEST_STUB = 'echo "Error: no test specified" && exit 1'

    @property
    def runtime_type(self) -> RuntimeType:
        return RuntimeType.JAVASCRIPT

    @property
    def priority(self) -> int:
        return 5

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

        # If tsconfig.json or .ts files exist, TypeScript adapter should take it
        if "tsconfig.json" in paths or any(p.endswith((".ts", ".tsx", ".mts", ".cts")) for p in paths):
            return False

        if "package.json" in paths or "jsconfig.json" in paths:
            return True

        if any(p.endswith(self.JS_EXTENSIONS) for p in paths):
            return True

        return False

    def get_command(self, category: CommandCategory, files: Dict[str, str]) -> Optional[str]:
        pkg = self._parse_package_json(files)
        scripts = pkg.get("scripts", {}) if pkg and isinstance(pkg.get("scripts"), dict) else {}

        if category == CommandCategory.TEST:
            test_script = scripts.get("test", "").strip()
            if test_script and test_script != self.DEFAULT_NPM_TEST_STUB:
                return "npm test"
            
            # If test files exist (e.g. *.test.js, test.js, tests/*.js), fallback to node --test
            has_test_files = any(
                p.endswith((".test.js", ".spec.js", "test.js")) or p.startswith("test/") or p.startswith("tests/")
                for p in files.keys()
            )
            if has_test_files:
                return "node --test"

            return None

        if category == CommandCategory.LINT:
            if "lint" in scripts:
                return "npm run lint"
            if "check" in scripts:
                return "npm run check"
            return None

        if category == CommandCategory.TYPECHECK:
            if "typecheck" in scripts:
                return "npm run typecheck"
            if "check" in scripts:
                return "npm run check"
            return None

        return None
