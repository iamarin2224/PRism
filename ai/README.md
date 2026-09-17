# PRism — AI Service (`ai/`)

The **AI Service** is a Python service built with **FastAPI**, **Pydantic v2**, and the **OpenAI Python SDK**. It serves as the core intelligence engine for PRism, responsible for communicating with LLM providers (via OpenRouter), formatting prompts, parsing code, and generating strictly validated, structured findings.

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
| `FRONTEND_URL` | `http://localhost:5173` | Allowed origin for frontend requests. |
| `BACKEND_URL` | `http://localhost:8080` | Allowed origin for backend gateway requests. |
| `ALLOWED_ORIGINS` | `""` | Optional comma-separated list to override allowed origins. |

---

## Pydantic Schemas

Located in [`app/models/review.py`](file:///Users/arindas/Coding/Projects/PRism/ai/app/models/review.py):

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

---

## API Endpoints

### 1. `GET /`
Health check endpoint.
- **Response:** `{"message": "PRism AI service is running"}`

### 2. `POST /api/ai/test`
Generates a raw text response from the configured OpenRouter model.
- **Request:**
  ```json
  {
    "prompt": "Explain what SQL injection is."
  }
  ```
- **Response:**
  ```json
  {
    "response": "SQL injection is a security vulnerability..."
  }
  ```

### 3. `POST /api/ai/test-structured`
Analyzes a code snippet and returns validated structured findings adhering to the `ReviewResponse` schema.
- **Request:**
  ```json
  {
    "code": "def query(user_id): return f'SELECT * FROM users WHERE id = {user_id}'"
  }
  ```
- **Response:**
  ```json
  {
    "findings": [
      {
        "severity": "high",
        "category": "security",
        "title": "SQL Injection Vulnerability",
        "description": "Direct string interpolation in SQL queries allows untrusted input to manipulate the database query.",
        "line": 1
      }
    ]
  }
  ```

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
