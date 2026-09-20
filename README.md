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
                     │  • AST-Based Chunking │
                     │  • 14 Agent Tools     │
                     │  • E2B Cloud Sandbox  │
                     │  • LLM Structured Out │
                     └───────────┬───────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
┌─────────────────┐    ┌───────────────────┐   ┌───────────────────┐
│ OpenRouter LLMs │    │  Neon PostgreSQL  │   │  E2B Cloud        │
│ (Reasoning)     │    │  (pgvector + HNSW)│   │  Polyglot Sandbox │
└─────────────────┘    └───────────────────┘   └───────────────────┘
```

- **Next.js (`http://localhost:5050`)**: Web dashboard and webhook dispatcher. Handles HMAC-SHA256 signature verification, GitHub App event parsing (`pull_request`, `push`), and local test benches.
- **FastAPI AI Engine (`http://localhost:8000`)**: Python engine handling prompt synthesis, language-aware AST code chunking, vector embeddings, pgvector retrieval, agent tool execution, sandboxed code execution, and LLM structured outputs.
- **Neon PostgreSQL**: Serverless database storing repository indexing states and 1536-dimensional code vector embeddings with HNSW cosine indexes.
- **E2B Cloud Sandbox**: Secure, isolated cloud containers used by AI agents to dynamically execute tests, linters, and type-checkers without host security risks.

---

## Agent Tool Calling Layer

PRism equips review agents with 14 purpose-built tools across 5 key investigation domains:

- **GitHub PR Tools:** Fetch pull request metadata, unified diffs, and changed file summaries.
- **Repository & Code Tools:** Read repository source files with line-range slicing, semantic and exact text search, symbol reference lookup, and related test discovery.
- **Git History Tools:** Inspect commit histories, file modification timelines, and line-by-line git blame.
- **Web & Documentation Tools:** Query external documentation, breaking changes, and security advisories via SSRF-protected search and web fetching.
- **Dynamic Sandbox Tools:** Execute repository test suites (`run_tests`) and linters (`run_linter`) in isolated cloud sandboxes.

All tools adhere to strict Pydantic schemas, comprehensive security guardrails (SSRF protection, path traversal blocks), and export standardized OpenAI-compatible function-calling specifications.

---

## Multi-Language E2B Cloud Sandbox

To verify code changes dynamically without running untrusted code on the host, PRism integrates an extensible **E2B Cloud Sandbox** (`prism-polyglot-reviewer`):

- **Polyglot Runtimes:** Out-of-the-box support for **Python** (`pytest`, `ruff`), **JavaScript** (Node.js, `npm`, `node --test`), **TypeScript** (`tsc --noEmit`), **C / C++** (`g++`, `clang-tidy`, `cmake`), **Java** (OpenJDK, `javac`, `mvn`, `gradle`), and **Go** (`go test`, `go vet`, `go build`).
- **Controlled Allowlisted Operations:** Restricts execution strictly to `test`, `lint`, and `typecheck` operations based on automatic project detection—never accepts arbitrary shell commands from callers.
- **Strict Isolation & Path Validation:** Enforces workspace boundaries, blocks sensitive files (`.env`, `.git`), and guarantees fresh sandbox creation with automated cleanup in `finally` blocks.

---

## Repository Structure

| Directory | Service / Purpose | Stack | Documentation |
| :--- | :--- | :--- | :--- |
| **`PRism/`** (Root) | **Next.js Web Application & Webhook Gateway** | Next.js 15, React 19, TypeScript, Prisma v6 | *This document* |
| [`ai/`](file:///Users/arindas/Coding/Projects/PRism/ai) | **FastAPI AI Engine, RAG, Tools & Sandbox** | Python 3.11+, FastAPI, Pydantic v2, pgvector, E2B, LangChain | [AI Service README](file:///Users/arindas/Coding/Projects/PRism/ai/README.md) |
| [`ai/sandbox/`](file:///Users/arindas/Coding/Projects/PRism/ai/sandbox) | **E2B Dockerfile & Sandbox Setup** | E2B CLI, Docker, Multi-language toolchains | [Sandbox README](file:///Users/arindas/Coding/Projects/PRism/ai/sandbox/README.md) |
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

# 2. Run Full AI Service Test Suite (RAG, Tools, Sandbox Detector & Service)
cd ai && ./.venv/bin/pytest tests/ -v

# 3. Run Live Multi-Language E2B Sandbox Smoke Test
cd ai && ./.venv/bin/python sandbox/multi_lang_smoke_test.py
```
