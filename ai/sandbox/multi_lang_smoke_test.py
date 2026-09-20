#!/usr/bin/env python3
"""
Multi-Language PRism E2B Sandbox Smoke Test
Demonstrates the polyglot sandbox execution service across multiple languages and scenarios:
1. Python test run (passing pytest)
2. Python test run (failing pytest)
3. JavaScript test run (Node.js test execution)
4. TypeScript type-check run (demonstrating a type error caught by tsc)
5. Unsupported / unconfigured project operation (graceful reporting)
"""

import json
import os
import sys
from pathlib import Path

# Ensure ai directory is in sys.path
AI_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AI_DIR))

from dotenv import load_dotenv
load_dotenv(AI_DIR / ".env")
load_dotenv(AI_DIR.parent / ".env")

from app.sandbox.models import CommandCategory, FilePayload, SandboxRequest
from app.sandbox.service import SandboxExecutorService


def print_section(title: str):
    print("\n" + "=" * 80)
    print(f"  {title}")
    print("=" * 80)


def run_smoke_tests():
    executor = SandboxExecutorService()

    # Scenario 1: Passing Python Test Run
    print_section("Scenario 1: Passing Python Test (pytest)")
    req_py_pass = SandboxRequest(
        files=[
            FilePayload(
                path="calculator.py",
                content="def add(a: int, b: int) -> int:\n    return a + b\n",
            ),
            FilePayload(
                path="test_calculator.py",
                content="from calculator import add\n\ndef test_add():\n    assert add(2, 3) == 5\n",
            ),
            FilePayload(
                path="requirements.txt",
                content="pytest==8.3.5\n",
            ),
        ],
        operation=CommandCategory.TEST,
    )
    res_py_pass = executor.execute(req_py_pass)
    print(json.dumps(res_py_pass.model_dump(), indent=2))

    # Scenario 2: Failing Python Test Run
    print_section("Scenario 2: Failing Python Test (pytest)")
    req_py_fail = SandboxRequest(
        files=[
            FilePayload(
                path="calculator.py",
                content="def add(a: int, b: int) -> int:\n    return a + b + 10\n",
            ),
            FilePayload(
                path="test_calculator.py",
                content="from calculator import add\n\ndef test_add():\n    assert add(2, 3) == 5\n",
            ),
        ],
        operation=CommandCategory.TEST,
    )
    res_py_fail = executor.execute(req_py_fail)
    print(json.dumps(res_py_fail.model_dump(), indent=2))

    # Scenario 3: JavaScript Test Run (Node.js test runner)
    print_section("Scenario 3: JavaScript Test (npm test / Node test runner)")
    req_js_test = SandboxRequest(
        files=[
            FilePayload(
                path="package.json",
                content=json.dumps(
                    {
                        "name": "js-sample",
                        "version": "1.0.0",
                        "scripts": {"test": "node --test test.js"},
                    }
                ),
            ),
            FilePayload(
                path="math.js",
                content="function multiply(a, b) { return a * b; }\nmodule.exports = { multiply };\n",
            ),
            FilePayload(
                path="test.js",
                content=(
                    "const test = require('node:test');\n"
                    "const assert = require('node:assert');\n"
                    "const { multiply } = require('./math');\n\n"
                    "test('multiplies numbers correctly', () => {\n"
                    "  assert.strictEqual(multiply(3, 4), 12);\n"
                    "});\n"
                ),
            ),
        ],
        operation=CommandCategory.TEST,
    )
    res_js_test = executor.execute(req_js_test)
    print(json.dumps(res_js_test.model_dump(), indent=2))

    # Scenario 4: TypeScript Type-Check Run with Type Error (tsc --noEmit)
    print_section("Scenario 4: TypeScript Type-Check Failure (tsc --noEmit)")
    req_ts_typecheck = SandboxRequest(
        files=[
            FilePayload(
                path="tsconfig.json",
                content=json.dumps(
                    {
                        "compilerOptions": {
                            "target": "ES2022",
                            "module": "NodeNext",
                            "strict": True,
                            "noEmit": True,
                        }
                    }
                ),
            ),
            FilePayload(
                path="user.ts",
                content=(
                    "interface User {\n"
                    "  id: number;\n"
                    "  name: string;\n"
                    "}\n\n"
                    "// Intentional type error: string assigned to number\n"
                    'const invalidUser: User = { id: "not-a-number", name: "Alice" };\n'
                ),
            ),
        ],
        operation=CommandCategory.TYPECHECK,
    )
    res_ts_typecheck = executor.execute(req_ts_typecheck)
    print(json.dumps(res_ts_typecheck.model_dump(), indent=2))

    # Scenario 5: Unsupported Project or Unconfigured Operation
    print_section("Scenario 5: Unsupported Project / Unconfigured Operation")
    req_unsupported = SandboxRequest(
        files=[
            FilePayload(
                path="README.md",
                content="# Pure Markdown Repo\nNothing executable here.\n",
            ),
        ],
        operation=CommandCategory.TEST,
    )
    res_unsupported = executor.execute(req_unsupported)
    print(json.dumps(res_unsupported.model_dump(), indent=2))

    print_section("Summary")
    print(f"1. Py Pass Status:       {res_py_pass.status.value} (exit_code: {res_py_pass.exit_code})")
    print(f"2. Py Fail Status:       {res_py_fail.status.value} (exit_code: {res_py_fail.exit_code})")
    print(f"3. JS Test Status:       {res_js_test.status.value} (exit_code: {res_js_test.exit_code})")
    print(f"4. TS Typecheck Status:  {res_ts_typecheck.status.value} (exit_code: {res_ts_typecheck.exit_code})")
    print(f"5. Unsupported Status:   {res_unsupported.status.value} (msg: {res_unsupported.message})")


if __name__ == "__main__":
    run_smoke_tests()
