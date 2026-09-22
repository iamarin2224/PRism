import asyncio
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.queue.enqueue import (
    check_and_acquire_indexing_lock,
    enqueue_indexing_job,
    release_indexing_lock,
)
from app.queue.worker import process_indexing_job

client = TestClient(app)


def test_indexing_concurrency_locking():
    """Verify atomic Redis locking prevents concurrent indexing jobs on the same repo."""
    storage = set()

    class MockRedis:
        async def set(self, key, value, nx=False, ex=None):
            if nx and key in storage:
                return None
            storage.add(key)
            return True

        async def delete(self, key):
            storage.discard(key)
            return 1

    with patch("app.queue.enqueue.get_redis_client", return_value=MockRedis()):
        # First lock acquisition should succeed
        locked1 = asyncio.run(check_and_acquire_indexing_lock("owner/repo-a"))
        assert locked1 is True

        # Second concurrent attempt should be blocked
        locked2 = asyncio.run(check_and_acquire_indexing_lock("owner/repo-a"))
        assert locked2 is False

        # Lock on different repo should succeed
        locked3 = asyncio.run(check_and_acquire_indexing_lock("owner/repo-b"))
        assert locked3 is True

        # Release repo-a lock
        asyncio.run(release_indexing_lock("owner/repo-a"))

        # Now repo-a lock should be acquirable again
        locked4 = asyncio.run(check_and_acquire_indexing_lock("owner/repo-a"))
        assert locked4 is True


def test_enqueue_indexing_job():
    """Verify enqueue_indexing_job generates an index job ID and enqueues to ARQ."""
    job_id = asyncio.run(
        enqueue_indexing_job(
            repo_name="iamarin2224/PRism",
            commit_sha="commit-sha-12345",
            force_full=True,
            github_token="ghp_test_token",
        )
    )
    assert job_id.startswith("index-")


def test_process_indexing_job_worker_execution():
    """Verify ARQ process_indexing_job handler runs pipeline and releases lock."""
    payload = {
        "repo_name": "iamarin2224/PRism",
        "commit_sha": "sha-test-999",
        "force_full": False,
        "changed_files_map": {"modified": ["app/main.py"], "added": [], "deleted": []},
    }

    with patch("app.queue.worker.check_and_acquire_indexing_lock", AsyncMock(return_value=True)), \
         patch("app.queue.worker.indexing_pipeline.execute_indexing", AsyncMock()) as mock_exec, \
         patch("app.queue.worker.release_indexing_lock", AsyncMock()) as mock_release:

        result = asyncio.run(process_indexing_job(ctx={}, payload=payload))

        assert result["status"] == "completed"
        assert result["repo_name"] == "iamarin2224/PRism"
        assert result["commit_sha"] == "sha-test-999"
        mock_exec.assert_awaited_once_with(
            repo_name="iamarin2224/PRism",
            target_commit="sha-test-999",
            force_full=False,
            github_token=None,
            raw_files=None,
            changed_files_map={"modified": ["app/main.py"], "added": [], "deleted": []},
            installation_id=None,
        )
        mock_release.assert_awaited_once_with("iamarin2224/PRism")


def test_push_event_endpoint_marks_stale_and_enqueues_indexing():
    """Verify POST /api/rag/push-event marks STALE and schedules ARQ incremental indexing."""
    from app.rag.models import IndexStatus, RepoIndexState

    mock_state = RepoIndexState(
        repo_name="iamarin2224/PRism",
        status=IndexStatus.STALE,
        indexed_commit="old-commit-sha",
        current_commit="new-head-sha",
        last_indexed_at="2026-09-20T00:00:00",
        error_message=None,
        total_chunks=15,
    )

    with patch("app.main.indexing_pipeline.mark_push_event", AsyncMock(return_value=mock_state)), \
         patch("app.main.indexing_pipeline.schedule_indexing", AsyncMock()) as mock_sched:

        response = client.post(
            "/api/rag/push-event",
            json={
                "repo_name": "iamarin2224/PRism",
                "new_head_sha": "new-head-sha",
                "ref": "refs/heads/main",
                "changed_files_map": {
                    "modified": ["src/index.ts"],
                    "added": ["src/new.ts"],
                    "deleted": [],
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["repo_name"] == "iamarin2224/PRism"
        assert data["status"] == "STALE"
        assert data["current_commit"] == "new-head-sha"
        mock_sched.assert_awaited_once()


def test_resume_review_endpoint_success():
    """Verify POST /api/reviews/{review_id}/resume triggers LangGraph resumption and returns state."""
    mock_resumed_state = {
        "review_run_id": "run-test-uuid-1234",
        "status": "COMPLETED",
        "routing_decision": "POST_GITHUB",
        "review_summary_markdown": "### PRism Review\nApproved findings posted.",
        "verified_findings": [],
    }

    with patch("app.main.workflow_engine.resume", AsyncMock(return_value=mock_resumed_state)) as mock_resume:
        response = client.post(
            "/api/reviews/run-test-uuid-1234/resume",
            json={
                "approved_findings": [{"title": "Security flaw fixed"}],
                "routing_decision": "POST_GITHUB",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "resumed"
        assert data["review_run_id"] == "run-test-uuid-1234"
        assert data["workflow_status"] == "COMPLETED"
        assert data["routing_decision"] == "POST_GITHUB"
        assert "Approved findings posted" in data["review_summary_markdown"]
        mock_resume.assert_awaited_once_with(
            review_run_id="run-test-uuid-1234",
            human_input={
                "approved_findings": [{"title": "Security flaw fixed"}],
                "routing_decision": "POST_GITHUB",
            },
        )


def test_resume_review_endpoint_not_found():
    """Verify POST /api/reviews/{review_id}/resume returns 404 when review run is not found."""
    with patch("app.main.workflow_engine.resume", AsyncMock(side_effect=ValueError("No checkpointed state found for review run 'run-nonexistent'"))):
        response = client.post(
            "/api/reviews/run-nonexistent/resume",
            json={"routing_decision": "POST_GITHUB"},
        )
        assert response.status_code == 404
        assert "No checkpointed state found" in response.json()["detail"]
