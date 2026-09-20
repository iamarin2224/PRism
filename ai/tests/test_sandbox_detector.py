import pytest
from app.sandbox.detector import ProjectDetector
from app.sandbox.models import CommandCategory, RuntimeType
from app.sandbox.validator import (
    ValidationError,
    validate_file_path,
    validate_file_payloads,
    FilePayload,
)


def test_validator_safe_paths():
    assert validate_file_path("src/index.ts") == "src/index.ts"
    assert validate_file_path("test/utils/helper.py") == "test/utils/helper.py"
    assert validate_file_path("package.json") == "package.json"


def test_validator_blocked_paths():
    with pytest.raises(ValidationError, match="Absolute paths"):
        validate_file_path("/etc/passwd")

    with pytest.raises(ValidationError, match="Invalid path component"):
        validate_file_path("../secret.txt")

    with pytest.raises(ValidationError, match="Invalid path component"):
        validate_file_path("src/../../secret.txt")

    with pytest.raises(ValidationError, match="Access to sensitive file"):
        validate_file_path(".env")

    with pytest.raises(ValidationError, match="Invalid path component"):
        validate_file_path(".git/config")


def test_validator_payload_limits():
    payloads = [
        FilePayload(path="main.py", content="print('hello')"),
        FilePayload(path="main.py", content="print('duplicate')"),
    ]
    with pytest.raises(ValidationError, match="Duplicate file path"):
        validate_file_payloads(payloads)


def test_python_detection_and_commands():
    detector = ProjectDetector()

    files = {
        "main.py": "def add(a, b): return a + b\n",
        "test_main.py": "from main import add\ndef test_add(): assert add(1, 2) == 3\n",
        "requirements.txt": "pytest==8.3.5\n",
    }

    runtime, adapter = detector.detect_runtime(files)
    assert runtime == RuntimeType.PYTHON
    assert adapter is not None

    _, test_cmd = detector.resolve_command(files, CommandCategory.TEST)
    assert test_cmd == "pytest"

    _, lint_cmd = detector.resolve_command(files, CommandCategory.LINT)
    assert lint_cmd == "ruff check ."

    _, type_cmd = detector.resolve_command(files, CommandCategory.TYPECHECK)
    assert type_cmd == "ruff check ."


def test_javascript_detection_and_commands():
    detector = ProjectDetector()

    files = {
        "package.json": '{"name": "demo", "scripts": {"test": "node --test", "lint": "eslint ."}}',
        "index.js": "function hello() { return 'world'; }\nmodule.exports = { hello };",
        "test.js": "const test = require('node:test'); const assert = require('node:assert');\ntest('hello', () => { assert.strictEqual(1, 1); });",
    }

    runtime, adapter = detector.detect_runtime(files)
    assert runtime == RuntimeType.JAVASCRIPT

    _, test_cmd = detector.resolve_command(files, CommandCategory.TEST)
    assert test_cmd == "npm test"

    _, lint_cmd = detector.resolve_command(files, CommandCategory.LINT)
    assert lint_cmd == "npm run lint"

    _, type_cmd = detector.resolve_command(files, CommandCategory.TYPECHECK)
    assert type_cmd is None  # no typecheck script configured


def test_typescript_detection_and_precedence():
    detector = ProjectDetector()

    files = {
        "package.json": '{"name": "ts-demo", "scripts": {"test": "npm run build"}}',
        "tsconfig.json": '{"compilerOptions": {"strict": true, "noEmit": true}}',
        "index.ts": "const x: number = 42;\nexport default x;",
    }

    runtime, adapter = detector.detect_runtime(files)
    assert runtime == RuntimeType.TYPESCRIPT

    _, type_cmd = detector.resolve_command(files, CommandCategory.TYPECHECK)
    assert type_cmd == "tsc --noEmit"


def test_cpp_detection_and_commands():
    detector = ProjectDetector()

    files = {
        "CMakeLists.txt": "cmake_minimum_required(VERSION 3.10)\nproject(demo)\n",
        "main.cpp": "#include <iostream>\nint main() { return 0; }\n",
    }

    runtime, adapter = detector.detect_runtime(files)
    assert runtime == RuntimeType.CPP
    assert adapter is not None

    _, test_cmd = detector.resolve_command(files, CommandCategory.TEST)
    assert "cmake" in test_cmd and "ctest" in test_cmd

    _, type_cmd = detector.resolve_command(files, CommandCategory.TYPECHECK)
    assert "cmake" in type_cmd


def test_java_detection_and_commands():
    detector = ProjectDetector()

    files = {
        "pom.xml": "<project><modelVersion>4.0.0</modelVersion><groupId>com.prism</groupId><artifactId>demo</artifactId></project>",
        "src/main/java/App.java": "public class App { public static void main(String[] args) {} }",
    }

    runtime, adapter = detector.detect_runtime(files)
    assert runtime == RuntimeType.JAVA
    assert adapter is not None

    _, test_cmd = detector.resolve_command(files, CommandCategory.TEST)
    assert test_cmd == "mvn test -B"

    _, type_cmd = detector.resolve_command(files, CommandCategory.TYPECHECK)
    assert test_cmd == "mvn test -B"


def test_go_detection_and_commands():
    detector = ProjectDetector()

    files = {
        "go.mod": "module example.com/demo\n\ngo 1.22\n",
        "main.go": "package main\n\nfunc main() {}\n",
        "main_test.go": "package main\n\nimport \"testing\"\n\nfunc TestMain(t *testing.T) {}\n",
    }

    runtime, adapter = detector.detect_runtime(files)
    assert runtime == RuntimeType.GO
    assert adapter is not None

    _, test_cmd = detector.resolve_command(files, CommandCategory.TEST)
    assert test_cmd == "go test -v ./..."

    _, lint_cmd = detector.resolve_command(files, CommandCategory.LINT)
    assert lint_cmd == "go vet ./..."

    _, type_cmd = detector.resolve_command(files, CommandCategory.TYPECHECK)
    assert type_cmd == "go build ./..."


def test_unsupported_project():
    detector = ProjectDetector()

    files = {
        "README.md": "# Just documentation\n",
        "notes.txt": "Some notes here\n",
    }

    runtime, adapter = detector.detect_runtime(files)
    assert runtime == RuntimeType.UNSUPPORTED
    assert adapter is None

    _, cmd = detector.resolve_command(files, CommandCategory.TEST)
    assert cmd is None
