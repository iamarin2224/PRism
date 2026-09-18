# PRism — Agentic Pull Request Review System

PRism is an intelligent, multi-stage agentic code review system designed to analyze pull requests, detect bugs, security vulnerabilities, and code quality regressions, and produce structured, actionable developer feedback.

---

## Architecture Overview (Phase 2: GitHub Webhook Infrastructure)

```text
[ GitHub PR Event ]           (e.g., opened, synchronize, reopened)
        │
        │ Webhook POST /api/github/webhook (HMAC-SHA256 Signed)
        ▼
[ Node / Express Backend ]    (Port 8080) — Webhook Verification & Event Parser
        │
        │ HTTP / JSON POST /api/github/pr-event (Internal)
        ▼
[ FastAPI AI Service ]        (Port 8000) — Event Ingestion & Schema Validation
        │
        ▼
[ Review Pipeline ]           (Phase 3+: RAG, Tools & LLM Code Review)
```

> [!NOTE]
> The GitHub webhook receiving and signature verification infrastructure is fully implemented and verified locally. The public webhook tunnel (e.g. ngrok / smee) and GitHub App configuration will be linked in subsequent steps.

---

## Services & Detailed Documentation

| Directory | Service | Stack | Documentation |
| :--- | :--- | :--- | :--- |
| [`ai/`](file:///Users/arindas/Coding/Projects/PRism/ai) | **AI Service** | Python, FastAPI, Pydantic v2, OpenAI SDK | [AI Service README](file:///Users/arindas/Coding/Projects/PRism/ai/README.md) |
| [`backend/`](file:///Users/arindas/Coding/Projects/PRism/backend) | **Backend Gateway** | Node.js, Express, Crypto HMAC, CORS | [Backend README](file:///Users/arindas/Coding/Projects/PRism/backend/README.md) |
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

### Testing Webhooks Locally

With the services running, execute the webhook test suite:

```bash
npm run test:webhook
```
