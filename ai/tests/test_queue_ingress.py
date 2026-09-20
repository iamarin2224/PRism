import asyncio
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.models.github import PREventPayload, RepositoryInfo, PullRequestInfo
from app.queue.enqueue import (
    check_and_set_delivery_idempotency,
    enqueue_review_job,
)
from app.queue.worker import process_review_job

client = TestClient(app)


def test_idempotency_locking():
    # Mock Redis client to test atomic SETNX behavior
    storage = set()

    class MockRedis:
        async def set(self, key, value, nx=False, ex=None):
            if nx and key in storage:
                return None
            storage.add(key)
            return True

    with patch("app.queue.enqueue.get_redis_client", return_value=MockRedis()):
        # First delivery should succeed
        res1 = asyncio.run(check_and_set_delivery_idempotency("deliv-12345"))
        assert res1 is True

        # Second delivery with same ID should be blocked as duplicate
        res2 = asyncio.run(check_and_set_delivery_idempotency("deliv-12345"))
        assert res2 is False

        # Different delivery ID should succeed
        res3 = asyncio.run(check_and_set_delivery_idempotency("deliv-67890"))
        assert res3 is True


def test_enqueue_review_job():
    event = PREventPayload(
        action="opened",
        repository=RepositoryInfo(id=1, name="PRism", fullName="iamarin2224/PRism", owner="iamarin2224"),
        pullRequest=PullRequestInfo(id=10, number=42, title="Test PR", state="open", headSha="abc", baseSha="main"),
    )

    job_id = asyncio.run(enqueue_review_job(event, delivery_id="deliv-test-01"))
    assert job_id.startswith("review-")


def test_webhook_endpoint_fast_202_and_idempotency():
    payload = {
        "action": "opened",
        "repository": {
            "id": 1,
            "name": "PRism",
            "full_name": "iamarin2224/PRism",
            "owner": "iamarin2224",
        },
        "pull_request": {
            "id": 10,
            "number": 42,
            "title": "Add async review workflow",
            "state": "open",
            "head_sha": "abc12345",
            "base_sha": "main",
        },
    }

    # First request with delivery ID -> 202 Accepted
    with patch("app.main.check_and_set_delivery_idempotency", AsyncMock(return_value=True)), \
         patch("app.main.enqueue_review_job", AsyncMock(return_value="review-job-test-123")):

        response = client.post(
            "/api/github/pr-event",
            json=payload,
            headers={"X-GitHub-Delivery": "delivery-unique-001"},
        )
        assert response.status_code == 202
        data = response.json()
        assert data["status"] == "queued"
        assert data["job_id"] == "review-job-test-123"
        assert data["delivery_id"] == "delivery-unique-001"
        assert data["repo"] == "iamarin2224/PRism"
        assert data["prNumber"] == 42

    # Duplicate request with same delivery ID -> 200 OK + already_processed
    with patch("app.main.check_and_set_delivery_idempotency", AsyncMock(return_value=False)):
        dup_response = client.post(
            "/api/github/pr-event",
            json=payload,
            headers={"X-GitHub-Delivery": "delivery-unique-001"},
        )
        assert dup_response.status_code == 200
        dup_data = dup_response.json()
        assert dup_data["status"] == "already_processed"
        assert dup_data["delivery_id"] == "delivery-unique-001"


def test_arq_worker_process_review_job():
    payload = {
        "repository": {"full_name": "iamarin2224/PRism"},
        "pull_request": {"number": 42},
    }
    receipt = asyncio.run(process_review_job(ctx={}, payload=payload, delivery_id="deliv-worker-01"))
    assert receipt["status"] == "processed"
    assert receipt["repo"] == "iamarin2224/PRism"
    assert receipt["pr_number"] == 42
    assert receipt["delivery_id"] == "deliv-worker-01"
