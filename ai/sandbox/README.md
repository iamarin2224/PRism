# E2B Sandbox Setup for PRism

This directory contains the custom Dockerfile, templates, and scripts for PRism's polyglot E2B sandboxed execution environment.

## Overview
- **E2B Template:** A custom, reproducible, cloud-sandboxed Linux container image used to safely run dynamic code reviews, tests, linters, and type-checkers without risking host security.
- **Polyglot Runtimes Supported:**
  - **Python:** `pytest`, `ruff`
  - **JavaScript:** Node.js, `npm`, Node built-in test runner (`node --test`), `package.json` allowlisted scripts
  - **TypeScript:** Node.js, `npm`, TypeScript compiler (`tsc --noEmit`), `package.json` allowlisted scripts
  - **C / C++:** `g++`, `clang-tidy`, `cmake`, `ctest`, `make`
  - **Java:** OpenJDK, `javac`, `mvn` (Maven), `gradle`
  - **Go:** `go test`, `go vet`, `go build`

## Template Build Instructions

1. Ensure Docker Desktop is running and the E2B CLI is installed and authenticated (`e2b auth login`).
2. Build the polyglot template from the `ai/` directory:
   ```bash
   e2b template create prism-polyglot-reviewer -d sandbox/e2b.Dockerfile -c "/bin/bash" --ready-cmd "echo ready"
   ```
3. Set the template name or ID in your `.env` file:
   ```env
   E2B_TEMPLATE=prism-polyglot-reviewer
   ```
   *(Or by ID: `ieuhnqanogqqrpfv534z`)*
4. **Security Notice:** Never commit the real `.env` file or expose your `E2B_API_KEY`.

## Architecture

The sandbox executor service (`app/sandbox/`) provides a clean, modular architecture:
- **`models.py`:** Pydantic schemas for `SandboxRequest`, `SandboxResult`, `CommandCategory` (`test`, `lint`, `typecheck`), and `RuntimeType`.
- **`validator.py`:** Strict path security preventing path traversal (`..`), blocking sensitive files (`.env`, `.git`, `.ssh`), and enforcing size/count limits.
- **`runtimes/`:** Extensible runtime adapters for Python, JavaScript, and TypeScript.
- **`detector.py`:** Priority-based project detector resolving runtime types and allowlisted commands.
- **`service.py`:** `SandboxExecutorService` managing sandbox lifecycle, workspace file writing, timeout management, error handling, and guaranteed termination in `finally`.

## Running Tests

### 1. Unit Tests (Detector, Allowlist, Path Validator)
```bash
.venv/bin/pytest tests/test_sandbox_detector.py -v
```

### 2. Multi-Language E2B Smoke Test
Exercises passing/failing Python tests, JavaScript tests, TypeScript compile/type errors, and unsupported project detection against the live E2B cloud sandbox:
```bash
.venv/bin/python sandbox/multi_lang_smoke_test.py
```

### 3. Basic Smoke Test
```bash
.venv/bin/python sandbox/smoke_test.py
```
