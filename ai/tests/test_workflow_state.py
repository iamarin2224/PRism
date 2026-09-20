import operator
from langgraph.graph import StateGraph, START, END
from app.models.review import Finding
from app.workflow.state import (
    ReviewState,
    SpecialistOutput,
    create_initial_review_state,
)


def test_finding_model_extensions_and_compatibility():
    # Legacy style with 'line'
    f1 = Finding(
        severity="high",
        category="security",
        title="SQL Injection Vulnerability",
        description="Unsanitized query concatenation",
        line=42,
    )
    assert f1.start_line == 42
    assert f1.end_line == 42
    assert f1.line == 42
    assert f1.confidence == 1.0
    assert f1.agreement_count == 1
    assert f1.is_verified is False

    # New style with start_line, end_line, and suggestion
    f2 = Finding(
        severity="critical",
        category="bug",
        title="Null Pointer Dereference",
        description="Object may be null before property access",
        file_path="src/auth/jwt.ts",
        start_line=15,
        end_line=20,
        suggestion="return user?.id ?? null;",
        confidence=0.95,
        specialist="security",
    )
    assert f2.file_path == "src/auth/jwt.ts"
    assert f2.start_line == 15
    assert f2.end_line == 20
    assert f2.line == 15
    assert f2.suggestion == "return user?.id ?? null;"
    assert f2.confidence == 0.95
    assert f2.specialist == "security"


def test_specialist_output_tokens_calculation():
    out = SpecialistOutput(
        specialist_name="security",
        findings=[],
        tokens_in=150,
        tokens_out=50,
    )
    assert out.tokens_used == 200
    assert out.execution_time_ms == 0.0
    assert out.error is None


def test_initial_review_state_creation():
    state = create_initial_review_state(
        review_run_id="run-1234",
        repo_name="iamarin2224/PRism",
        pr_number=42,
        commit_sha="abcdef123456",
        base_sha="main",
        pr_metadata={"title": "Fix auth flow"},
    )
    assert state["review_run_id"] == "run-1234"
    assert state["repo_name"] == "iamarin2224/PRism"
    assert state["pr_number"] == 42
    assert state["commit_sha"] == "abcdef123456"
    assert state["status"] == "QUEUED"
    assert len(state["specialist_results"]) == 0
    assert len(state["errors"]) == 0


def test_reducer_addition_simulation():
    # Simulate LangGraph fan-out reducer behavior
    out1 = SpecialistOutput(specialist_name="security", findings=[])
    out2 = SpecialistOutput(specialist_name="quality", findings=[])

    combined = operator.add([out1], [out2])
    assert len(combined) == 2
    assert combined[0].specialist_name == "security"
    assert combined[1].specialist_name == "quality"


def test_langgraph_stategraph_compiles_with_review_state():
    """Verify that LangGraph accepts ReviewState as a valid state schema."""
    builder = StateGraph(ReviewState)

    def dummy_node(state: ReviewState):
        return {"status": "IN_PROGRESS"}

    builder.add_node("start_node", dummy_node)
    builder.add_edge(START, "start_node")
    builder.add_edge("start_node", END)

    graph = builder.compile()
    assert graph is not None

    init_state = create_initial_review_state(
        review_run_id="test-run",
        repo_name="org/repo",
        pr_number=1,
        commit_sha="c1",
    )
    result = graph.invoke(init_state)
    assert result["status"] == "IN_PROGRESS"
    assert result["review_run_id"] == "test-run"
