import json
import logging
from typing import Any, Dict, List, Optional
import yaml

logger = logging.getLogger("prism.workflow.memory.procedural")

BUILTIN_PROCEDURAL_RULES: List[Dict[str, Any]] = [
    # Security Domain
    {
        "id": "SEC-001",
        "domain": "security",
        "title": "Input Validation & Sanitization",
        "description": "All external user and webhook inputs must be strictly validated against schemas before processing.",
        "severity": "high",
        "source": "builtin",
    },
    {
        "id": "SEC-002",
        "domain": "security",
        "title": "Secrets & Credential Protection",
        "description": "Never commit, hardcode, or log plaintext secrets, tokens, API keys, or private certificates.",
        "severity": "critical",
        "source": "builtin",
    },
    {
        "id": "SEC-003",
        "domain": "security",
        "title": "Injection Prevention",
        "description": "Enforce parameterized queries for all database interactions (SQL/NoSQL) and avoid dynamic code execution (eval, exec).",
        "severity": "critical",
        "source": "builtin",
    },
    {
        "id": "SEC-004",
        "domain": "security",
        "title": "SSRF Guardrails",
        "description": "Outbound HTTP requests to external URLs must enforce DNS resolution validation and block private/internal IP ranges.",
        "severity": "high",
        "source": "builtin",
    },
    # Quality Domain
    {
        "id": "QUAL-001",
        "domain": "quality",
        "title": "Explicit Error & Exception Handling",
        "description": "Catch specific exception types, avoid bare except clauses, and log root-cause context without swallowing errors.",
        "severity": "medium",
        "source": "builtin",
    },
    {
        "id": "QUAL-002",
        "domain": "quality",
        "title": "Strict Type Safety & Schemas",
        "description": "Use explicit static typing and Pydantic models. Avoid untyped dicts or implicit any types in core interfaces.",
        "severity": "low",
        "source": "builtin",
    },
    {
        "id": "QUAL-003",
        "domain": "quality",
        "title": "Resource Lifecycle Safety",
        "description": "Ensure file handles, database connection pools, and network clients are cleanly closed via context managers or finally blocks.",
        "severity": "high",
        "source": "builtin",
    },
    # Tests Domain
    {
        "id": "TEST-001",
        "domain": "tests",
        "title": "Test Coverage for Modified Logic",
        "description": "All newly added or modified business logic and edge-cases must be accompanied by automated unit or integration tests.",
        "severity": "medium",
        "source": "builtin",
    },
    {
        "id": "TEST-002",
        "domain": "tests",
        "title": "Deterministic Test Design",
        "description": "Unit tests must not depend on network connectivity, live third-party services, or non-deterministic race conditions.",
        "severity": "medium",
        "source": "builtin",
    },
    # Documentation Domain
    {
        "id": "DOC-001",
        "domain": "docs",
        "title": "Public API & Function Documentation",
        "description": "All public classes, methods, and API route handlers must include clear docstrings describing parameters, return types, and errors.",
        "severity": "info",
        "source": "builtin",
    },
    {
        "id": "DOC-002",
        "domain": "docs",
        "title": "Breaking Change Communication",
        "description": "Any modification that breaks existing API contracts or environment configurations must be documented in release/README notes.",
        "severity": "medium",
        "source": "builtin",
    },
]

RULE_MANIFEST_NAMES = (
    ".prism/rules.yml",
    ".prism/rules.yaml",
    ".prism/rules.json",
    ".prism/rules.md",
    "PRISM_RULES.md",
)


def parse_custom_rules_content(filename: str, content: str) -> List[Dict[str, Any]]:
    """Parse custom repository rules from YAML, JSON, or Markdown text."""
    if not content or not content.strip():
        return []

    rules: List[Dict[str, Any]] = []

    if filename.endswith((".yml", ".yaml")):
        try:
            data = yaml.safe_load(content)
            if isinstance(data, list):
                for idx, item in enumerate(data):
                    if isinstance(item, dict):
                        rules.append({
                            "id": str(item.get("id", f"CUSTOM-{idx+1}")),
                            "domain": str(item.get("domain", "quality")).lower(),
                            "title": str(item.get("title", item.get("name", "Custom Rule"))),
                            "description": str(item.get("description", item.get("rule", ""))),
                            "severity": str(item.get("severity", "medium")).lower(),
                            "source": "repo",
                        })
            elif isinstance(data, dict) and "rules" in data:
                for idx, item in enumerate(data["rules"]):
                    if isinstance(item, dict):
                        rules.append({
                            "id": str(item.get("id", f"CUSTOM-{idx+1}")),
                            "domain": str(item.get("domain", "quality")).lower(),
                            "title": str(item.get("title", item.get("name", "Custom Rule"))),
                            "description": str(item.get("description", item.get("rule", ""))),
                            "severity": str(item.get("severity", "medium")).lower(),
                            "source": "repo",
                        })
        except Exception as e:
            logger.warning(f"Failed to parse YAML rules from {filename}: {e}")

    elif filename.endswith(".json"):
        try:
            data = json.loads(content)
            items = data if isinstance(data, list) else data.get("rules", [])
            for idx, item in enumerate(items):
                if isinstance(item, dict):
                    rules.append({
                        "id": str(item.get("id", f"CUSTOM-{idx+1}")),
                        "domain": str(item.get("domain", "quality")).lower(),
                        "title": str(item.get("title", item.get("name", "Custom Rule"))),
                        "description": str(item.get("description", item.get("rule", ""))),
                        "severity": str(item.get("severity", "medium")).lower(),
                        "source": "repo",
                    })
        except Exception as e:
            logger.warning(f"Failed to parse JSON rules from {filename}: {e}")

    elif filename.endswith(".md"):
        # Parse bullet points as rules
        lines = content.splitlines()
        idx = 1
        for line in lines:
            line_str = line.strip()
            if line_str.startswith(("- ", "* ", "1. ", "2. ", "3. ")):
                cleaned = line_str.lstrip("-*0123456789. ").strip()
                if len(cleaned) > 10:
                    rules.append({
                        "id": f"MD-RULE-{idx}",
                        "domain": "quality",
                        "title": cleaned[:60],
                        "description": cleaned,
                        "severity": "medium",
                        "source": "repo",
                    })
                    idx += 1

    return rules


def load_procedural_rules(
    repo_name: str, repo_files: Optional[Dict[str, str]] = None
) -> List[Dict[str, Any]]:
    """
    Loads procedural rules for review context:
    1. Looks for repository-specific custom rules in repo_files (.prism/rules.*).
    2. Combines them with built-in production standard rules.
    """
    combined_rules = list(BUILTIN_PROCEDURAL_RULES)

    if repo_files:
        for manifest_name in RULE_MANIFEST_NAMES:
            if manifest_name in repo_files:
                custom_rules = parse_custom_rules_content(manifest_name, repo_files[manifest_name])
                if custom_rules:
                    logger.info(f"Loaded {len(custom_rules)} custom procedural rules from {manifest_name} for {repo_name}")
                    combined_rules.extend(custom_rules)
                break

    return combined_rules
