# PRism — Agentic Pull Request Review System

PRism is an intelligent, multi-stage agentic code review platform designed to analyze pull requests, detect bugs, security vulnerabilities, and code quality regressions, and produce structured, actionable developer feedback grounded in full repository context.

---

## Architecture Overview

```text
                               GitHub
                                 │
                                 │ Webhooks (HMAC-SHA256 Signed)
                                 ▼
                     ┌───────────────────────┐
                     │   Next.js Platform    │ (Port 5050)
                     │                       │
                     │  • Web Dashboard (UI) │
                     │  • GitHub Webhook Hub │
                     │  • API Gateway        │
                     │  • Prisma DB Client   │
                     └───────────┬───────────┘
                                 │
                                 │ Async HTTP Proxy / Event Dispatch
                                 ▼
                     ┌───────────────────────┐
                     │   FastAPI AI Engine   │ (Port 8000)
                     │                       │
                     │  • Code-Aware RAG     │
                     │  • AST-Based Splitting│
                     │  • Vector Store (pgv) │
                     │  • LLM Structured Out │
                     └───────────┬───────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   ▼                           ▼
        ┌─────────────────────┐     ┌─────────────────────┐
        │  OpenRouter / LLMs  │     │ Neon PostgreSQL DB  │
        │  (Reasoning Engine) │     │ (pgvector + HNSW)   │
        └─────────────────────┘     └─────────────────────┘
```

- **Next.js (`http://localhost:5050`)**: Web dashboard and webhook dispatcher. Handles HMAC-SHA256 signature verification, GitHub App event parsing (`pull_request`, `push`), and local test benches.
- **FastAPI AI Engine (`http://localhost:8000`)**: Python engine handling prompt synthesis, language-aware AST code chunking, AICredits vector embeddings, pgvector retrieval, and LLM code review structured outputs.
- **Neon PostgreSQL**: Serverless database storing repository indexing states and 1536-dimensional code vector embeddings with HNSW cosine indexes.

---

## Repository Structure

| Directory | Service / Purpose | Stack | Documentation |
| :--- | :--- | :--- | :--- |
| **`PRism/`** (Root) | **Next.js Web Application & Webhook Gateway** | Next.js 15, React 19, TypeScript, Prisma v6 | *This document* |
| [`ai/`](file:///Users/arindas/Coding/Projects/PRism/ai) | **FastAPI AI Engine & Code-Aware RAG** | Python 3.11+, FastAPI, Pydantic v2, pgvector, LangChain | [AI Service README](file:///Users/arindas/Coding/Projects/PRism/ai/README.md) |
| [`prisma/`](file:///Users/arindas/Coding/Projects/PRism/prisma) | **Database Schemas & Migrations** | Prisma Schema, PostgreSQL with `vector` extension | [`schema.prisma`](file:///Users/arindas/Coding/Projects/PRism/prisma/schema.prisma) |

---

## Quickstart

Start both services concurrently with a single command:

```bash
./dev.sh
# or: npm run dev:all
```

- **Next.js Dashboard:** [http://localhost:5050](http://localhost:5050)
- **FastAPI AI Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

### Running Services Individually

```bash
# Terminal 1: FastAPI AI Engine
npm run dev:ai

# Terminal 2: Next.js Frontend & API
npm run dev
```

---

## Testing & Verification

```bash
# 1. Test GitHub Webhook HMAC Verification & Event Forwarding
npm run test:webhook

# 2. Test RAG Ingestion, Language Chunking & Token Filtering (inside ai/)
cd ai && ./.venv/bin/python scripts/test_rag.py
```
