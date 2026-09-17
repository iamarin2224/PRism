# PRism — Agentic Pull Request Review System

PRism is an intelligent, multi-stage agentic code review system designed to analyze pull requests, detect bugs, security vulnerabilities, and code quality regressions, and produce structured, actionable developer feedback.

---

## Architecture Overview

```text
[ React Frontend ]          (Port 5173) — Interactive Developer UI & Dashboard
        │
        │ HTTP / JSON
        ▼
[ Node / Express Backend ]  (Port 8080) — API Gateway & Webhook Coordinator
        │
        │ HTTP / JSON
        ▼
[ FastAPI AI Service ]      (Port 8000) — LLM Integration & Schema Validation
        │
        │ OpenAI SDK
        ▼
[ OpenRouter Gateway ]      (openrouter.ai) — Multi-Model Provider
        │
        ▼
     [ LLM ]                (e.g., openrouter/free, Claude, GPT-4o)
```

---

## Services & Detailed Documentation

| Directory | Service | Stack | Documentation |
| :--- | :--- | :--- | :--- |
| [`ai/`](file:///Users/arindas/Coding/Projects/PRism/ai) | **AI Service** | Python, FastAPI, Pydantic v2, OpenAI SDK | [AI Service README](file:///Users/arindas/Coding/Projects/PRism/ai/README.md) |
| [`backend/`](file:///Users/arindas/Coding/Projects/PRism/backend) | **Backend Gateway** | Node.js, Express, dotenv, CORS | [Backend README](file:///Users/arindas/Coding/Projects/PRism/backend/README.md) |
| [`frontend/`](file:///Users/arindas/Coding/Projects/PRism/frontend) | **Frontend UI** | React 19, Vite | [Frontend README](file:///Users/arindas/Coding/Projects/PRism/frontend/README.md) |

---

## Quickstart

Start all three services concurrently with a single command:

```bash
./dev.sh
# or: npm run dev
```

- **Frontend:** [http://localhost:5173](http://localhost:5173)
- **Backend:** [http://localhost:8080](http://localhost:8080)
- **AI Service:** [http://localhost:8000](http://localhost:8000)

Press `Ctrl+C` to terminate all services cleanly. See individual service READMEs above for detailed configuration options.
