#!/usr/bin/env python3
"""
E2B Sandbox Smoke Test for PRism
Loads environment variables, initializes a sandbox using E2B_TEMPLATE,
executes `print(2 + 2)`, prints structured JSON output, and cleanly closes the sandbox.
"""

import json
import os
import sys
from pathlib import Path

# Ensure ai directory is in sys.path
AI_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AI_DIR))

# Load .env using python-dotenv from project locations
from dotenv import load_dotenv

load_dotenv(AI_DIR / ".env")
load_dotenv(AI_DIR.parent / ".env")

E2B_API_KEY = os.getenv("E2B_API_KEY")
E2B_TEMPLATE = os.getenv("E2B_TEMPLATE")

if not E2B_API_KEY:
    print(
        json.dumps(
            {
                "error": "Missing required environment variable: E2B_API_KEY. Please ensure it is set in your .env file."
            },
            indent=2,
        )
    )
    sys.exit(1)

if not E2B_TEMPLATE:
    print(
        json.dumps(
            {
                "error": "Missing required environment variable: E2B_TEMPLATE. Please add E2B_TEMPLATE=<template-name-or-id> to your .env file."
            },
            indent=2,
        )
    )
    sys.exit(1)

try:
    from e2b import Sandbox
except ImportError:
    try:
        from e2b_code_interpreter import Sandbox
    except ImportError:
        print(
            json.dumps(
                {
                    "error": "e2b SDK is not installed. Run 'pip install -r requirements.txt' first."
                },
                indent=2,
            )
        )
        sys.exit(1)


def run_smoke_test():
    sandbox = None
    try:
        # Create sandbox instance using configured template via factory method
        if hasattr(Sandbox, "create"):
            sandbox = Sandbox.create(E2B_TEMPLATE, api_key=E2B_API_KEY)
        else:
            sandbox = Sandbox(template=E2B_TEMPLATE, api_key=E2B_API_KEY)
        sandbox_id = getattr(sandbox, "sandbox_id", getattr(sandbox, "id", "unknown"))

        # Execute code in the sandbox
        if hasattr(sandbox, "commands") and hasattr(sandbox.commands, "run"):
            proc = sandbox.commands.run('python3 -c "print(2 + 2)"')
            stdout_text = getattr(proc, "stdout", "").strip()
            stderr_text = getattr(proc, "stderr", "").strip()
            exit_code = getattr(proc, "exit_code", 0)
            error_details = getattr(proc, "error", None)
        elif hasattr(sandbox, "run_code"):
            execution = sandbox.run_code("print(2 + 2)")
            stdout_logs = [log for log in getattr(execution.logs, "stdout", [])]
            stderr_logs = [log for log in getattr(execution.logs, "stderr", [])]
            stdout_text = "\n".join(stdout_logs).strip()
            stderr_text = "\n".join(stderr_logs).strip()
            exit_code = 0 if not getattr(execution, "error", None) else 1
            error_details = str(execution.error) if getattr(execution, "error", None) else None
        else:
            raise RuntimeError("Sandbox instance does not support commands.run or run_code")

        result = {
            "success": True,
            "sandbox_id": sandbox_id,
            "template": E2B_TEMPLATE,
            "stdout": stdout_text,
            "stderr": stderr_text,
            "exit_code": exit_code,
        }
        if error_details:
            result["execution_error"] = error_details

        print(json.dumps(result, indent=2))

    except Exception as e:
        print(
            json.dumps(
                {
                    "success": False,
                    "template": E2B_TEMPLATE,
                    "error": f"Failed to execute sandbox smoke test: {str(e)}",
                },
                indent=2,
            )
        )
        sys.exit(1)
    finally:
        if sandbox is not None:
            try:
                sandbox.kill()
            except Exception:
                try:
                    sandbox.close()
                except Exception:
                    pass


if __name__ == "__main__":
    run_smoke_test()
