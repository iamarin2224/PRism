# PRism — Agentic Pull Request Review System

PRism is an intelligent, multi-stage agentic code review system designed to analyze pull requests, detect bugs, security vulnerabilities, and code quality regressions, and produce structured, actionable developer feedback.

---

## Architecture Overview

```text
                         GitHub
                           │
                           │ Webhook POST /api/github/webhook (HMAC-SHA256 Signed)
                           ▼
                  ┌──────────────────┐
                  │     Next.js      │ (Port 5050 / Vercel)
                  │                  │
                  │ Frontend UI      │
                  │ API Routes       │
                  │ GitHub Webhook   │
                  └────────┬─────────┘
                           │
                           │ HTTP POST /api/github/pr-event (Server-to-Server)
                           ▼
                  ┌──────────────────┐
                  │  FastAPI Service │ (Port 8000 / Render)
                  │                  │
                  │ Pydantic v2      │
                  │ LLM Engine       │
                  │ OpenRouter       │
                  └──────────────────┘
```

- **Next.js (`http://localhost:5050`)**: Serves the developer UI and serverless Route Handlers (`/api/github/webhook`, `/api/ai-health`, `/api/ai/test`, `/api/ai/test-structured`).
- **FastAPI AI Service (`http://localhost:8000`)**: Autonomous Python AI engine managing OpenRouter LLM interactions and Pydantic schema validation.

---

## Services & Documentation

| Directory | Service | Stack | Documentation |
| :--- | :--- | :--- | :--- |
| **`PRism/`** (Root) | **Next.js Web App & API** | Next.js 15 (App Router), React 19, TypeScript | *This document* |
| [`ai/`](file:///Users/arindas/Coding/Projects/PRism/ai) | **AI Intelligence Engine** | Python 3.11+, FastAPI, Pydantic v2, OpenAI SDK | [AI Service README](file:///Users/arindas/Coding/Projects/PRism/ai/README.md) |

---

## Quickstart

Start both services concurrently with a single command:

```bash
./dev.sh
# or: npm run dev:all
```

- **Next.js App (UI & API):** [http://localhost:5050](http://localhost:5050)
- **FastAPI AI Service:** [http://localhost:8000](http://localhost:8000)

### Running Services Individually

```bash
# Terminal 1: FastAPI AI Service
npm run dev:ai

# Terminal 2: Next.js App
npm run dev
```

### Testing Webhooks Locally

With the services running, execute the webhook test suite:

```bash
npm run test:webhook
```
