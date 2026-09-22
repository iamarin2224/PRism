import logging
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.config import settings
from app.models.github import PREventPayload
from app.queue import (
    check_and_set_delivery_idempotency,
    close_redis,
    enqueue_review_job,
)
from app.models.review import (
    LLMResponse,
    ReviewRequest,
    ReviewResponse,
    StructuredTestRequest,
)
from app.rag import (
    IndexingPipeline,
    IndexingRequest,
    IndexingResponse,
    QARequest,
    QAResponse,
    RepoIndexState,
    RetrievalResult,
    close_db_pool,
    code_retriever,
    indexing_pipeline,
    init_db,
    qa_service,
)
from app.services.llm import SAMPLE_CODE_FOR_STRUCTURED_TEST, llm_service
from app.workflow.langgraph_engine import workflow_engine

logger = logging.getLogger("prism.ai")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes async database connections and vector schema on startup."""
    try:
        await init_db()
    except Exception as e:
        logger.error(f"Database initialization warning: {e}")
    yield
    await close_db_pool()
    await close_redis()


app = FastAPI(title="PRism AI Service", version="0.3.0", lifespan=lifespan)

# Local development CORS configuration (configurable via .env with localhost fallbacks)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    """Health check root endpoint."""
    return {"message": "PRism AI service is running"}

# ============================================================
# LLM & Structured Output Testing Endpoints
# ============================================================

@app.post("/api/ai/test", response_model=LLMResponse)
def test_llm(request: ReviewRequest):
    """Test basic text generation with the configured OpenRouter model."""
    try:
        raw_response = llm_service.generate_text(prompt=request.prompt)
        return LLMResponse(response=raw_response)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except RuntimeError as re:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(re),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {str(e)}",
        )


@app.post("/api/ai/test-structured", response_model=ReviewResponse)
def test_structured_output(request: StructuredTestRequest = StructuredTestRequest()):
    """Test structured output generation with Pydantic validation on sample code."""
    code_to_analyze = request.code if (request.code and request.code.strip()) else SAMPLE_CODE_FOR_STRUCTURED_TEST
    prompt = (
        "Analyze the following code snippet for security, correctness, performance, or quality issues. "
        "Return structured findings conforming to the provided schema:\n\n"
        f"```python\n{code_to_analyze}\n```"
    )

    try:
        structured_response = llm_service.generate_structured(
            prompt=prompt,
            response_format=ReviewResponse,
        )
        return structured_response
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve),
        )
    except RuntimeError as re:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(re),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {str(e)}",
        )

# ============================================================
# GitHub Webhook Forwarding Endpoint
# ============================================================

@app.post("/api/github/pr-event")
async def receive_github_pr_event(
    event: PREventPayload,
    response: Response,
    x_github_delivery: Optional[str] = Header(None, alias="X-GitHub-Delivery"),
):
    """
    Asynchronous GitHub Webhook Ingress:
    - Validates PREventPayload schema.
    - Atomically enforces idempotency on X-GitHub-Delivery via Redis.
    - Fast-dispatches background review task to Redis + ARQ queue.
    - Returns immediate HTTP 202 Accepted.
    """
    repo_name = event.repository.fullName if event.repository else "unknown"
    pr_num = event.pullRequest.number if event.pullRequest else "unknown"

    # 1. Enforce atomic idempotency on GitHub delivery ID
    if x_github_delivery:
        is_new_delivery = await check_and_set_delivery_idempotency(x_github_delivery)
        if not is_new_delivery:
            logger.info(f"Duplicate GitHub delivery '{x_github_delivery}' ignored.")
            return {
                "status": "already_processed",
                "delivery_id": x_github_delivery,
                "repo": repo_name,
                "prNumber": pr_num,
                "action": event.action,
            }

    # 2. Dispatch to background ARQ job queue
    job_id = await enqueue_review_job(event, x_github_delivery)

    # 3. Fast non-blocking HTTP 202 Accepted return
    response.status_code = status.HTTP_202_ACCEPTED
    return {
        "status": "queued",
        "job_id": job_id,
        "delivery_id": x_github_delivery,
        "repo": repo_name,
        "prNumber": pr_num,
        "action": event.action,
    }

# ============================================================
# Code-Aware RAG Endpoints
# ============================================================


class IndexWithFilesRequest(BaseModel):
    request: IndexingRequest
    files: Optional[List[dict]] = Field(default=None, description="Optional raw file payloads for local indexing/testing")


class PushEventPayload(BaseModel):
    repo_name: str
    new_head_sha: str
    ref: Optional[str] = None
    changed_files_map: Optional[dict] = None


class ResumeReviewRequest(BaseModel):
    approved_findings: Optional[List[dict]] = Field(default=None, description="List of approved findings")
    routing_decision: Optional[str] = Field(default="POST_GITHUB", description="Routing decision (POST_GITHUB or DISMISSED)")


@app.post("/api/reviews/{review_id}/resume")
async def resume_review(review_id: str, request: ResumeReviewRequest):
    """
    Resumes a paused review workflow run from its checkpoint after Human-In-The-Loop approval.
    Applies developer feedback and routes directly to post_review_github.
    """
    try:
        human_input = {
            "approved_findings": request.approved_findings,
            "routing_decision": request.routing_decision,
        }
        resumed_state = await workflow_engine.resume(
            review_run_id=review_id,
            human_input=human_input,
        )
        return {
            "status": "resumed",
            "review_run_id": review_id,
            "workflow_status": resumed_state.get("status"),
            "routing_decision": resumed_state.get("routing_decision"),
            "review_summary_markdown": resumed_state.get("review_summary_markdown"),
        }
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve),
        )
    except Exception as e:
        logger.error(f"Failed to resume review '{review_id}': {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to resume review workflow: {str(e)}",
        )


class RetrieveRequest(BaseModel):
    repo_name: str
    query: str
    top_k: int = 5
    file_path: Optional[str] = None


@app.post("/api/rag/index", response_model=IndexingResponse)
async def trigger_indexing(payload: IndexingRequest):
    """
    Manual Background Indexing:
    Explicitly triggers repository indexing in background. Non-blocking HTTP response.
    """
    try:
        response = await indexing_pipeline.schedule_indexing(
            request=payload,
            raw_files=payload.files,
        )
        return response
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to schedule indexing: {str(e)}",
        )



@app.get("/api/rag/repositories", response_model=List[RepoIndexState])
async def list_repositories():
    """Returns a list of all repositories and their indexing state."""
    try:
        return await indexing_pipeline.list_all_repos()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list repositories: {str(e)}",
        )


@app.delete("/api/rag/repository")
async def delete_repository(repo_name: str = Query(..., description="Repository full name (e.g. owner/repo)")):
    """Deletes a repository and all its chunks from the database."""
    try:
        await indexing_pipeline.remove_repository(repo_name)
        return {"status": "deleted", "repo_name": repo_name}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete repository: {str(e)}",
        )


@app.get("/api/rag/status", response_model=RepoIndexState)
async def get_index_status(repo_name: str = Query(..., description="Repository full name (e.g. owner/repo)")):
    """Returns the current indexing state (NOT_INDEXED, INDEXING, INDEXED, STALE, FAILED)."""
    try:
        return await indexing_pipeline.get_or_create_repo_record(repo_name)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get indexing status: {str(e)}",
        )


@app.post("/api/rag/push-event", response_model=RepoIndexState)
async def handle_push_event(payload: PushEventPayload):
    """
    GitHub Push Webhook Handler:
    Marks repository index STALE and automatically enqueues asynchronous incremental indexing via ARQ.
    """
    try:
        state = await indexing_pipeline.mark_push_event(
            repo_name=payload.repo_name,
            new_head_sha=payload.new_head_sha,
        )
        # Enqueue incremental indexing in background ARQ queue
        await indexing_pipeline.schedule_indexing(
            request=IndexingRequest(
                repo_name=payload.repo_name,
                commit_sha=payload.new_head_sha,
                force_full=False,
            ),
            changed_files_map=payload.changed_files_map,
        )
        return state
    except Exception as e:
        logger.error(f"Failed to process push event for {payload.repo_name}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process push event: {str(e)}",
        )


@app.post("/api/rag/retrieve", response_model=RetrievalResult)
async def retrieve_code_context(payload: RetrieveRequest):
    """
    Vector Store Retrieval:
    Retrieves top-K relevant chunks strictly scoped to the repository (WHERE repo_name = :repo_name).
    """
    try:
        return await code_retriever.retrieve(
            repo_name=payload.repo_name,
            query=payload.query,
            top_k=payload.top_k,
            file_path_filter=payload.file_path,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Retrieval failed: {str(e)}",
        )


@app.post("/api/rag/query", response_model=QAResponse)
async def ask_repository_question(payload: QARequest):
    """
    Repository Q&A:
    Reuses the RAG retrieval pipeline and OpenRouter LLM to answer questions with source citations.
    """
    try:
        return await qa_service.answer_question(payload)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Repository Q&A failed: {str(e)}",
        )

