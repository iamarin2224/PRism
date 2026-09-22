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


def test_workflow_engine_resume_persists_approved_findings():
    """Test that resuming with approved_findings persists them into checkpoint and completes via post_review_github."""
    checkpointer = MemorySaver()

    init_state = create_initial_review_state(
        review_run_id="run-hitl-resume-01",
        repo_name="iamarin2224/PRism",
        pr_number=104,
        commit_sha="sha104",
    )

    initial_findings = [
        Finding(
            severity="critical",
            category="security",
            title="Initial SQL Injection",
            description="SQL injection in search parameter",
            confidence=0.99,
        )
    ]

    async def mock_security_node(state):
        return {"specialist_results": [SpecialistOutput(specialist_name="security", findings=initial_findings)]}

    async def mock_empty_node(state):
        return {"specialist_results": []}

    with patch("app.workflow.graph.security_specialist_node", mock_security_node), \
         patch("app.workflow.graph.quality_specialist_node", mock_empty_node), \
         patch("app.workflow.graph.tests_specialist_node", mock_empty_node), \
         patch("app.workflow.graph.docs_specialist_node", mock_empty_node), \
         patch("app.workflow.nodes.critic.critic_verifier_service.verify_findings", AsyncMock(side_effect=lambda f, s: f)), \
         patch("app.workflow.events.spine.events_spine.emit_event", AsyncMock(return_value="evt-mock")):

        engine = LangGraphWorkflowEngine(checkpointer=checkpointer)
        paused_state = asyncio.run(engine.run(init_state))
        assert paused_state["status"] == "AWAITING_HUMAN_APPROVAL"

        # Developer edits/approves findings in UI
        approved_findings = [
            Finding(
                severity="high",
                category="security",
                title="Approved Sanitized SQL Finding",
                description="Developer confirmed risk and adjusted description",
                confidence=0.95,
            )
        ]

        resumed_state = asyncio.run(
            engine.resume("run-hitl-resume-01", human_input={"approved_findings": approved_findings})
        )

        assert resumed_state["status"] == "COMPLETED"
        assert resumed_state["routing_decision"] == "POST_GITHUB"
        assert len(resumed_state["verified_findings"]) == 1
        assert resumed_state["verified_findings"][0].title == "Approved Sanitized SQL Finding"
        assert resumed_state["verified_findings"][0].severity == "high"
        assert "review_summary_markdown" in resumed_state
        assert "Approved Sanitized SQL Finding" in resumed_state["review_summary_markdown"]

        # Checkpoint should also reflect the persisted approved finding and completed status
        final_saved = asyncio.run(engine.get_state("run-hitl-resume-01"))
        assert final_saved is not None
        assert final_saved["status"] == "COMPLETED"
        assert final_saved["verified_findings"][0].title == "Approved Sanitized SQL Finding"


def test_workflow_engine_resume_preserves_existing_findings_when_none_provided():
    """Test that resuming without approved_findings preserves existing verified findings."""
    checkpointer = MemorySaver()

    init_state = create_initial_review_state(
        review_run_id="run-hitl-resume-preserve",
        repo_name="iamarin2224/PRism",
        pr_number=105,
        commit_sha="sha105",
    )

    original_findings = [
        Finding(
            severity="critical",
            category="security",
            title="Original Critical Finding",
            description="Must be preserved upon resume",
            confidence=0.99,
        )
    ]

    async def mock_security_node(state):
        return {"specialist_results": [SpecialistOutput(specialist_name="security", findings=original_findings)]}

    async def mock_empty_node(state):
        return {"specialist_results": []}

    with patch("app.workflow.graph.security_specialist_node", mock_security_node), \
         patch("app.workflow.graph.quality_specialist_node", mock_empty_node), \
         patch("app.workflow.graph.tests_specialist_node", mock_empty_node), \
         patch("app.workflow.graph.docs_specialist_node", mock_empty_node), \
         patch("app.workflow.nodes.critic.critic_verifier_service.verify_findings", AsyncMock(side_effect=lambda f, s: f)), \
         patch("app.workflow.events.spine.events_spine.emit_event", AsyncMock(return_value="evt-mock")):

        engine = LangGraphWorkflowEngine(checkpointer=checkpointer)
        asyncio.run(engine.run(init_state))

        # Human approves without overriding findings (e.g. general approval click)
        resumed_state = asyncio.run(
            engine.resume("run-hitl-resume-preserve", human_input={"decision": "APPROVED"})
        )

        assert resumed_state["status"] == "COMPLETED"
        assert len(resumed_state["verified_findings"]) == 1
        assert resumed_state["verified_findings"][0].title == "Original Critical Finding"


def test_workflow_engine_resume_unknown_id_fails_clearly():
    """Test that resuming a non-existent review_run_id raises a clear ValueError."""
    checkpointer = MemorySaver()
    engine = LangGraphWorkflowEngine(checkpointer=checkpointer)

    import pytest
    with pytest.raises(ValueError, match="No checkpointed state found for review run 'run-non-existent'"):
        asyncio.run(engine.resume("run-non-existent", human_input={}))


def test_workflow_engine_resume_failed_posting_does_not_mark_completed():
    """Test that if the final post_review_github node fails, the run is not marked COMPLETED."""
    checkpointer = MemorySaver()

    init_state = create_initial_review_state(
        review_run_id="run-hitl-fail-post",
        repo_name="iamarin2224/PRism",
        pr_number=106,
        commit_sha="sha106",
    )

    finding = [
        Finding(
            severity="critical",
            category="security",
            title="Critical Bug",
            description="desc",
            confidence=0.99,
        )
    ]

    async def mock_security_node(state):
        return {"specialist_results": [SpecialistOutput(specialist_name="security", findings=finding)]}

    async def mock_empty_node(state):
        return {"specialist_results": []}

    with patch("app.workflow.graph.security_specialist_node", mock_security_node), \
         patch("app.workflow.graph.quality_specialist_node", mock_empty_node), \
         patch("app.workflow.graph.tests_specialist_node", mock_empty_node), \
         patch("app.workflow.graph.docs_specialist_node", mock_empty_node), \
         patch("app.workflow.nodes.critic.critic_verifier_service.verify_findings", AsyncMock(side_effect=lambda f, s: f)), \
         patch("app.workflow.events.spine.events_spine.emit_event", AsyncMock(return_value="evt-mock")):

        engine = LangGraphWorkflowEngine(checkpointer=checkpointer)
        asyncio.run(engine.run(init_state))

        import pytest
        # Mock post_review_github_node / poster raising an exception
        with patch("app.workflow.nodes.actions.github_review_poster.post_review", AsyncMock(side_effect=RuntimeError("GitHub API 500 Network Error"))):
            with pytest.raises(RuntimeError, match="GitHub API 500 Network Error"):
                asyncio.run(engine.resume("run-hitl-fail-post", human_input={}))

        saved_state = asyncio.run(engine.get_state("run-hitl-fail-post"))
        assert saved_state is not None
        assert saved_state["status"] != "COMPLETED"


def test_workflow_engine_resumption_continues_from_post_approval_node():
    """Test that resuming executes from resume_after_human_approval -> post_review_github and does not re-run specialists."""
    checkpointer = MemorySaver()

    init_state = create_initial_review_state(
        review_run_id="run-hitl-no-rerun",
        repo_name="iamarin2224/PRism",
        pr_number=107,
        commit_sha="sha107",
    )

    finding = [
        Finding(
            severity="critical",
            category="security",
            title="Critical Defect",
            description="desc",
            confidence=0.99,
        )
    ]

    security_call_count = 0

    async def mock_security_node(state):
        nonlocal security_call_count
        security_call_count += 1
        return {"specialist_results": [SpecialistOutput(specialist_name="security", findings=finding)]}

    async def mock_empty_node(state):
        return {"specialist_results": []}

    with patch("app.workflow.graph.security_specialist_node", mock_security_node), \
         patch("app.workflow.graph.quality_specialist_node", mock_empty_node), \
         patch("app.workflow.graph.tests_specialist_node", mock_empty_node), \
         patch("app.workflow.graph.docs_specialist_node", mock_empty_node), \
         patch("app.workflow.nodes.critic.critic_verifier_service.verify_findings", AsyncMock(side_effect=lambda f, s: f)), \
         patch("app.workflow.events.spine.events_spine.emit_event", AsyncMock(return_value="evt-mock")):

        engine = LangGraphWorkflowEngine(checkpointer=checkpointer)
        asyncio.run(engine.run(init_state))
        assert security_call_count == 1

        # Resume should not re-run security_specialist_node
        asyncio.run(engine.resume("run-hitl-no-rerun", human_input={}))
        assert security_call_count == 1  # Still 1, not incremented

