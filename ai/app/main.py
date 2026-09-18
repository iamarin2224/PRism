from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models.review import (
    ReviewRequest,
    LLMResponse,
    ReviewResponse,
    StructuredTestRequest,
)
from app.models.github import PREventPayload
from app.services.llm import llm_service, SAMPLE_CODE_FOR_STRUCTURED_TEST

app = FastAPI(title="PRism AI Service", version="0.1.0")

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
    """Health check root endpoint (Phase 0)."""
    return {"message": "PRism AI service is running"}


@app.post("/api/github/pr-event")
def receive_github_pr_event(event: PREventPayload):
    """
    Receive and validate pull request webhook event forwarded from the Node backend gateway.
    (Phase 2 boundary endpoint: actual automated review pipeline will be triggered here in later phases).
    """
    repo_name = event.repository.fullName if event.repository else "unknown"
    pr_num = event.pullRequest.number if event.pullRequest else "unknown"

    return {
        "status": "received",
        "message": f"FastAPI received PR #{pr_num} ({event.action}) for {repo_name}",
        "action": event.action,
        "repo": repo_name,
        "prNumber": pr_num,
    }


@app.post("/api/ai/test", response_model=LLMResponse)
def test_llm(request: ReviewRequest):
    """
    Test basic text generation with the configured OpenRouter model.
    """
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
    """
    Test structured output generation with Pydantic validation on sample code.
    """
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
