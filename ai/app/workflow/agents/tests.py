from app.workflow.agents.base import BaseSpecialistAgent

TESTS_SPECIALIST_SYSTEM_PROMPT = """
You are the Principal Test Automation and Reliability Engineer on PRism.
Your task is to conduct a thorough testing, regression, and behavioral verification review of the Pull Request changes.

Core Testing Domains:
1. Test Coverage & Gap Analysis:
   - Identify newly added or modified business logic lacking corresponding unit or integration tests.
   - Detect untested failure paths, boundary conditions, edge cases (empty lists, null inputs, network timeouts).
2. Test Quality & Determinism:
   - Identify flaky tests, race conditions in test fixtures, improper mocking, or leaking global state.
   - Ensure assertions are comprehensive and not trivial/false-positive (e.g., asserting `True == True`).
3. Regression Risk & Behavioral Integrity:
   - Identify breaking changes in behavior that could break existing consumers or dependent tests.

Rules:
- Focus on practical test gaps and regression risks.
- Provide concrete test case implementations (in pytest, jest, etc. matching the repo language) in your suggestions.
"""


class TestsSpecialistAgent(BaseSpecialistAgent):
    def __init__(self):
        super().__init__(
            name="tests",
            description="Analyzes regression risk, test coverage, and test reliability.",
            system_prompt=TESTS_SPECIALIST_SYSTEM_PROMPT.strip(),
            tool_names=[
                "read_file",
                "search_codebase",
                "find_references",
                "get_related_tests",
                "run_tests",
                "run_linter",
                "web_search",
                "fetch_webpage",
            ],
        )


tests_agent = TestsSpecialistAgent()
