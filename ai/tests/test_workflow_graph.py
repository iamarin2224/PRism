import asyncio
from unittest.mock import AsyncMock, patch
from langgraph.checkpoint.memory import MemorySaver

from app.models.review import Finding
from app.workflow.graph import create_review_graph
from app.workflow.langgraph_engine import LangGraphWorkflowEngine
from app.workflow.state import SpecialistOutput, create_initial_review_state


def test_graph_compilation_and_topology():
    checkpointer = MemorySaver()
    graph = create_review_graph(checkpointer=checkpointer)
    assert graph is not None
    # Verify graph contains expected nodes
    expected_nodes = {
        "build_context",
        "security_specialist",
        "quality_specialist",
        "tests_specialist",
        "docs_specialist",
        "aggregate_and_deduplicate",
        "critic_verifier",
        "post_review_github",
        "human_approval_queue",
    }
    for node in expected_nodes:
        assert node in graph.nodes


def test_workflow_engine_high_confidence_auto_post():
    """Test full workflow where findings have high confidence and no critical severity -> routes to post_review_github."""
    checkpointer = MemorySaver()

    init_state = create_initial_review_state(
        review_run_id="run-auto-post-01",
        repo_name="iamarin2224/PRism",
        pr_number=101,
        commit_sha="abc12345",
    )

    clean_findings = [
        Finding(
            severity="medium",
            category="code_quality",
            title="Unused variable",
            description="Variable x is assigned but never used",
            confidence=0.95,
        )
    ]

    async def mock_security_node(state):
        return {"specialist_results": [SpecialistOutput(specialist_name="security", findings=clean_findings)]}

    async def mock_empty_node(state):
        return {"specialist_results": []}

    with patch("app.workflow.graph.security_specialist_node", mock_security_node), \
         patch("app.workflow.graph.quality_specialist_node", mock_empty_node), \
         patch("app.workflow.graph.tests_specialist_node", mock_empty_node), \
         patch("app.workflow.graph.docs_specialist_node", mock_empty_node), \
         patch("app.workflow.nodes.critic.critic_verifier_service.verify_findings", AsyncMock(side_effect=lambda f, s: f)), \
         patch("app.workflow.events.spine.events_spine.emit_event", AsyncMock(return_value="evt-mock")):

        patched_engine = LangGraphWorkflowEngine(checkpointer=checkpointer)
        result = asyncio.run(patched_engine.run(init_state))

        assert result["status"] == "COMPLETED"
        assert result["routing_decision"] == "POST_GITHUB"
        assert len(result["verified_findings"]) == 1
        assert result["verified_findings"][0].title == "Unused variable"

        saved_state = asyncio.run(patched_engine.get_state("run-auto-post-01"))
        assert saved_state is not None
        assert saved_state["status"] == "COMPLETED"


def test_workflow_engine_critical_finding_routes_to_human_approval():
    """Test that a CRITICAL severity finding causes the gate to route to the Human Approval Queue."""
    checkpointer = MemorySaver()

    init_state = create_initial_review_state(
        review_run_id="run-hitl-01",
        repo_name="iamarin2224/PRism",
        pr_number=102,
        commit_sha="def67890",
    )

    critical_findings = [
        Finding(
            severity="critical",
            category="security",
            title="Remote Code Execution vulnerability",
            description="Arbitrary eval() of user input",
            confidence=0.99,
        )
    ]

    async def mock_security_node(state):
        return {"specialist_results": [SpecialistOutput(specialist_name="security", findings=critical_findings)]}

    async def mock_empty_node(state):
        return {"specialist_results": []}

    with patch("app.workflow.graph.security_specialist_node", mock_security_node), \
         patch("app.workflow.graph.quality_specialist_node", mock_empty_node), \
         patch("app.workflow.graph.tests_specialist_node", mock_empty_node), \
         patch("app.workflow.graph.docs_specialist_node", mock_empty_node), \
         patch("app.workflow.nodes.critic.critic_verifier_service.verify_findings", AsyncMock(side_effect=lambda f, s: f)), \
         patch("app.workflow.events.spine.events_spine.emit_event", AsyncMock(return_value="evt-mock")):

        patched_engine = LangGraphWorkflowEngine(checkpointer=checkpointer)
        result = asyncio.run(patched_engine.run(init_state))

        assert result["status"] == "AWAITING_HUMAN_APPROVAL"
        assert result["routing_decision"] == "REQUIRE_HUMAN_APPROVAL"
        assert len(result["verified_findings"]) == 1

        saved_state = asyncio.run(patched_engine.get_state("run-hitl-01"))
        assert saved_state is not None
        assert saved_state["status"] == "AWAITING_HUMAN_APPROVAL"


def test_workflow_engine_low_confidence_routes_to_human_approval():
    """Test that low-confidence findings (< 0.85) route to human approval queue."""
    checkpointer = MemorySaver()

    init_state = create_initial_review_state(
        review_run_id="run-hitl-low-conf",
        repo_name="iamarin2224/PRism",
        pr_number=103,
        commit_sha="789abc",
    )

    low_conf_findings = [
        Finding(
            severity="low",
            category="code_quality",
            title="Possible dead code",
            description="Function may not be invoked",
            confidence=0.60,
        )
    ]

    async def mock_quality_node(state):
        return {"specialist_results": [SpecialistOutput(specialist_name="quality", findings=low_conf_findings)]}

    async def mock_empty_node(state):
        return {"specialist_results": []}

    with patch("app.workflow.graph.quality_specialist_node", mock_quality_node), \
         patch("app.workflow.graph.security_specialist_node", mock_empty_node), \
         patch("app.workflow.graph.tests_specialist_node", mock_empty_node), \
         patch("app.workflow.graph.docs_specialist_node", mock_empty_node), \
         patch("app.workflow.nodes.critic.critic_verifier_service.verify_findings", AsyncMock(side_effect=lambda f, s: f)), \
         patch("app.workflow.events.spine.events_spine.emit_event", AsyncMock(return_value="evt-mock")):

        engine = LangGraphWorkflowEngine(checkpointer=checkpointer)
        result = asyncio.run(engine.run(init_state))

        assert result["status"] == "AWAITING_HUMAN_APPROVAL"
        assert result["routing_decision"] == "REQUIRE_HUMAN_APPROVAL"
