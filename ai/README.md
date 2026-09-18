# PRism — AI Service (`ai/`)

The **AI Service** is a Python service built with **FastAPI**, **Pydantic v2**, and the **OpenAI Python SDK**. It serves as the core intelligence engine for PRism, responsible for ingesting validated PR webhook events forwarded from Next.js, communicating with LLM providers (via OpenRouter), formatting prompts, parsing code, and generating strictly validated, structured findings.

---

## Directory Structure

```text
ai/
├── app/
│   ├── __init__.py
│   ├── config.py              # Typed settings loader with pydantic-settings
│   ├── main.py                # FastAPI routes, middleware, and CORS configuration
│   ├── models/                # Pydantic v2 schemas
│   │   ├── __init__.py
│   │   ├── github.py          # PREventPayload, RepositoryInfo, PullRequestInfo
│   │   └── review.py          # Finding, ReviewResponse, ReviewRequest schemas
│   └── services/              # Business logic & LLM communication
│       ├── __init__.py
│       └── llm.py             # OpenRouter client & structured output parser
├── .env                       # Local environment variables (gitignored)
├── .env.example               # Safe environment variable template
├── .venv/                     # Python virtual environment
└── requirements.txt           # Python dependencies
```

---

## Configuration & Environment Variables

Environment variables are managed through `pydantic-settings` in [`app/config.py`](file:///Users/arindas/Coding/Projects/PRism/ai/app/config.py).

Copy `ai/.env.example` to `ai/.env`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
| :--- | :--- | :--- |
| `OPENROUTER_API_KEY` | *(Required)* | Your OpenRouter API key. |
| `OPENROUTER_MODEL` | `openrouter/free` | Target model ID (e.g., `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`). |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Base URL for the OpenAI-compatible API. |
| `NEXTJS_URL` | `http://localhost:5050` | Allowed origin for Next.js app requests. |
| `ALLOWED_ORIGINS` | `""` | Optional comma-separated list to override allowed origins. |

---

## Pydantic Schemas

### Code Review Models ([`app/models/review.py`](file:///Users/arindas/Coding/Projects/PRism/ai/app/models/review.py))
- **`ReviewRequest`**: Input payload for raw text prompts (`prompt: str`).
- **`LLMResponse`**: Output model for raw text completions (`response: str`).
- **`Finding`**: Individual code issue or observation:
  - `severity`: `"low" | "medium" | "high" | "critical"`
  - `category`: `"security" | "correctness" | "performance" | "error_handling" | "code_quality"`
  - `title`: Short summary string.
  - `description`: Detailed explanation.
  - `line`: Optional line number (`int | None`).
- **`ReviewResponse`**: Container for structured findings (`findings: list[Finding]`).
- **`StructuredTestRequest`**: Payload for structured analysis tests (`code: str | None`).

### GitHub Event Models ([`app/models/github.py`](file:///Users/arindas/Coding/Projects/PRism/ai/app/models/github.py))
- **`PREventPayload`**: Standardized PR webhook event payload forwarded from the Next.js backend:
  - `deliveryId`: Unique delivery GUID string.
  - `event`: Event type (`"pull_request"`).
  - `action`: Action type (`"opened" | "synchronize" | "reopened"`).
  - `repository`: `RepositoryInfo` (`name`, `fullName`, `owner`, `htmlUrl`).
  - `pullRequest`: `PullRequestInfo` (`number`, `title`, `sourceBranch`, `targetBranch`, `author`, `state`).
  - `sender`: Username string.
  - `installationId`: Optional GitHub App installation ID.

---

## API Endpoints

### 1. `GET /`
Root health check endpoint.
- **Response:** `{"message": "PRism AI service is running"}`

### 2. `POST /api/github/pr-event`
Receives and validates normalized PR events forwarded from Next.js route handlers.
- **Request Body:** `PREventPayload`
- **Response:**
  ```json
  {
    "status": "received",
    "message": "FastAPI received PR #42 (opened) for octocat/PRism",
    "action": "opened",
    "repo": "octocat/PRism",
    "prNumber": 42
  }
  ```

### 3. `POST /api/ai/test`
Generates a raw text response from the configured OpenRouter model.

### 4. `POST /api/ai/test-structured`
Analyzes a code snippet and returns validated structured findings conforming to the `ReviewResponse` schema.

---

## Running Locally

```bash
# Activate virtual environment
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start Uvicorn server with auto-reload
uvicorn app.main:app --port 8000 --reload
```
