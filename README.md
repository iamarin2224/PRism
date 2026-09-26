# PRism — Agentic Code Intelligence Platform

PRism is an autonomous, multi-agent code intelligence and pull request review platform designed for modern engineering teams. Powered by **Next.js 15 App Router**, **FastAPI**, **LangGraph**, **Neon PostgreSQL (pgvector)**, **Redis + ARQ**, and **E2B Cloud Sandboxes**, PRism delivers deep repository-grounded pull request reviews, automated anti-hallucination verification, real-time streaming codebase Q&A, and full observability over every agent execution step.

---

## System Architecture

```text
                                         GitHub App
                                             │
                   ┌─────────────────────────┴─────────────────────────┐
                   │ Webhook Events (PRs, Pushes)                      │ OAuth 2.0 Auth Flow
                   ▼                                                   ▼
       ┌──────────────────────────────────────────────────────────────────────────┐
       │                       Next.js 15 Platform (Port 5050)                    │
       │                                                                          │
       │  • Developer Web Console (Overview, Repositories, Reviews, Code Q&A)     │
       │  • GitHub App Webhook Signature Verification (HMAC-SHA256)               │
       │  • Multi-User OAuth Session & Repository Scoping Management              │
       │  • TanStack Query Caching & Optimistic State Invalidation                │
       │  • SSE Streaming Proxy for Conversational AI                             │
       │  • Prisma ORM Data Gateway (Users, Repositories, Reviews, Threads)       │
       └────────────────────────────────────┬─────────────────────────────────────┘
                                            │
                                            │ Async HTTP Dispatch / Webhook Proxy
                                            ▼
       ┌──────────────────────────────────────────────────────────────────────────┐
       │                        FastAPI AI Engine (Port 8000)                     │
       │                                                                          │
       │  • Redis Idempotency Lock (SETNX 24h) & Immediate 202 Accepted Ingress   │
       │  • ARQ Asynchronous Background Job Workers                               │
       │  • LangGraph Multi-Agent Orchestration Graph                             │
       │  • 4 Specialist Agents (Security, Quality, Tests, Documentation)         │
       │  • PR Summary Agent (Intent Analysis & Changed Files Impact Matrix)      │
       │  • Deterministic Merge & Critic Anti-Hallucination Verifier              │
       │  • Code-Aware RAG Subsystem (AST Chunking + 1536d Cosine Embeddings)     │
       │  • 14 Specialized Agent Tools + Multi-Language E2B Cloud Sandbox         │
       │  • Append-Only Audit Spine & Real-Time Token / INR (₹) Cost Accounting   │
       └──────────────┬─────────────────────┬──────────────────────┬──────────────┘
                      │                     │                      │
                      ▼                     ▼                      ▼
           ┌─────────────────────┐┌──────────────────┐┌───────────────────────┐
           │   Tiered LLM Pool   ││ Neon PostgreSQL  ││   E2B Cloud Sandbox   │
           │  • DeepSeek V4.1    ││ • pgvector HNSW  ││ • Polyglot Runtime    │
           │  • Qwen3 Coder 30B  ││ • Audit Events   ││ • Isolated Test/Lint  │
           │  • OpenRouter Free  ││ • Vector Store   ││ • TS/Py/Go/Java/C++   │
           └─────────────────────┘└──────────────────┘└───────────────────────┘
```

---

## Core Capabilities & Subsystems

### 1. Multi-Agent Pull Request Review Pipeline

PRism executes an asynchronous, stateful, multi-agent review graph orchestrated via **LangGraph**:

```text
GitHub Webhook ──► [FastAPI 202 Ingress + Redis Lock] ──► [ARQ Background Worker]
                                                               │
                                                               ▼
                                                   [1. Build Context Node]
                                                   • Semantic Memory (pgvector Code RAG)
                                                   • Procedural Memory (.prism/rules.yml)
                                                   • Episodic Memory (Historical Feedback)
                                                               │
         ┌──────────────────────────────┬──────────────────────┼──────────────────────────────┐
         │                              │                      │                              │
         ▼                              ▼                      ▼                              ▼
 [Security Agent]               [Quality Agent]          [Tests Agent]                  [Docs Agent]
DeepSeek V4.1 Flash             Qwen3 Coder 30B         Qwen3 Coder 30B               OpenRouter Free
(OWASP, Auth, Secrets)       (Design, Anti-Patterns)  (Coverage, Regressions)        (Contracts, Docs)
         │                              │                      │                              │
         └──────────────────────────────┴──────────────────────┼──────────────────────────────┘
                                                               │ (Fan-In Join)
                                                               ▼
                                                [2. PR Summary & Merge Node]
                                                • Line overlap & path deduplication
                                                • Cross-specialist agreement scoring
                                                • Executive PR intent & impact analysis
                                                               │
                                                               ▼
                                                [3. Critic / Verifier Node]
                                                • DeepSeek V4.1 Flash anti-hallucination
                                                • Exact code snippet grounding check
                                                               │
                                                               ▼
                                                [4. Decision Gate]
                                               /                  \
                    (High Conf & No Critical) /                    \ (Low Conf OR Critical Finding)
                                             ▼                      ▼
                                     [Post to GitHub]     [Human Approval Queue]
                                     • Summary Comment              │
                                     • Line-level Diffs             ▼
                                     • Check Run Status   [Developer Dashboard]
```

- **Tri-Partite Context Grounding:** Before specialists inspect the diff, the context node compiles **Semantic Context** (related codebase symbols outside the diff), **Procedural Rules** (`.prism/rules.yml` and team standards), and **Episodic Memory** (past accepted/dismissed review decisions).
- **Domain Specialists:** Parallel inspection across Security (OWASP Top 10, injections, hardcoded secrets), Code Quality (architectural smells, dead code, performance bottlenecks), Test Coverage (regression risk, dynamic sandbox execution), and Documentation (API contracts, docstrings).
- **Summary & Synthesis Agent:** Synthesizes multi-agent findings into an executive PR summary, classifying intent, impact matrix, and code-specific verdict (`APPROVE`, `COMMENT`, `REQUEST_CHANGES`).
- **Critic Verification Node:** High-reasoning model cross-examines every merged finding against the raw source code chunk to eliminate hallucinations and calibrate confidence scores.
- **Human Gate & Resilient Posting:** High-confidence reviews auto-publish structured reports and line-level comments to GitHub; critical or low-confidence findings route to the Human Approval Queue.

---

### 2. Conversational Code Q&A & Semantic Vector Search

PRism provides an interactive developer chat workspace grounded in codebase embeddings:

- **Unified Repository Hub:** Index and query private tracked repositories as well as any public GitHub repository (e.g., `facebook/react`, `vercel/next.js`).
- **Shared Global Vector Indexing:** Global index sharing ensures public repositories indexed at a given commit hash are reused instantly across all PRism users.
- **Server-Sent Events (SSE) Streaming:** Low-latency token streaming with live typing cursors and structured event payloads.
- **Source Citation Inspector:** Expandable code snippet references showing target file paths, 1-based line ranges, and cosine similarity scores.
- **Persistent Conversation Threads:** Multi-thread chat history per repository with automatic naming, message counts, and thread management.

---

### 3. Developer Console & UI/UX

Built with a unified dark developer-tool design system:

- **Overview / Dashboard ([`/`](file:///Users/arindas/Coding/Projects/PRism/app/page.tsx)):** Engineering control center featuring real-time KPI metrics, Awaiting Human Approval alert banner, Recent Reviews feed, and Tracked Repositories quick rail.
- **Repository Management ([`/repositories`](file:///Users/arindas/Coding/Projects/PRism/app/repositories/page.tsx), [`/repositories/:id`](file:///Users/arindas/Coding/Projects/PRism/app/repositories/[id]/page.tsx)):** Segmented tabs for tracked and public repositories, sync status badges (`● Up to date`, `⚠ Needs sync`, `◐ Indexing`), commit SHA indicators, and 1-click re-indexing.
- **Review Explorer & Report View ([`/reviews`](file:///Users/arindas/Coding/Projects/PRism/app/reviews/page.tsx), [`/reviews/:id`](file:///Users/arindas/Coding/Projects/PRism/app/reviews/[id]/page.tsx)):** Verdict filter chips, 2x2 Multi-Agent Specialist Matrix, verified Finding Cards with suggested code fixes and 1-click copy, and an interactive Observability Timeline displaying per-step latencies, token consumption, and audit payloads.
- **Code Q&A Workspace ([`/qa`](file:///Users/arindas/Coding/Projects/PRism/app/qa/page.tsx)):** Split-pane codebase tree and conversation manager with streaming markdown chat and sample prompts.
- **Pixel-Perfect Geometry:** Normalized 64px header and sidebar brand alignment across all pages.

---

### 4. Code-Aware RAG Engine

- **AST-Aware Chunking:** Language-specific chunkers for Python, TypeScript, JavaScript, Go, Rust, Java, C++, and structural separators for JSON, YAML, SQL, and CSS.
- **pgvector Vector Store:** 1536-dimensional embeddings indexed using PostgreSQL HNSW cosine indexes (`vector_cosine_ops`) with strict repository isolation (`WHERE repo_name = $1`).
- **Incremental & Background Indexing:** Git snapshot ingestion filters binary/oversized assets (>1MB, >20k tokens) and synchronizes delta commits asynchronously via ARQ workers.

---

### 5. Multi-Language E2B Cloud Sandbox

PRism dynamically executes tests, linters, and type checkers inside isolated **E2B Cloud Sandboxes** (`prism-polyglot-reviewer`):

- **Polyglot Runtime Adapters:** Native support for **Python** (`pytest`, `ruff`), **TypeScript** (`tsc --noEmit`), **JavaScript** (`npm test`, `node --test`), **Go** (`go test`, `go vet`), **Java** (`mvn test`, `gradlew`), and **C/C++** (`ctest`, `clang-tidy`).
- **Security Boundaries:** Rejects path traversal (`..`), denies sensitive files (`.env`, `.git`), and enforces strict execution timeouts with guaranteed teardown in `finally` blocks.

---

### 6. Agent Tool Calling Layer (14 Registered Tools)

All tools adhere to strict Pydantic schemas, enforce SSRF protection, and export OpenAI-compatible function calling interfaces:

| Domain | Tool | Description |
| :--- | :--- | :--- |
| **GitHub PR** | `get_pr_metadata` | PR title, description, branches, commits, author |
| | `get_pr_diff` | Unified git patch across modified files |
| | `get_changed_files` | Changed files list with addition/deletion statistics |
| **Code & Repo** | `read_file` | Read source file with 1-based line slicing & path traversal guard |
| | `search_codebase` | Semantic & exact vector similarity search across repository |
| | `find_references` | Symbol definition, import, and cross-file usage discovery |
| | `get_related_tests` | Automatic discovery of test suites covering target modules |
| **Git History** | `get_git_history` | Branch commit logs, messages, and authors |
| | `get_file_history` | File commit modification timeline |
| | `get_blame` | Line-by-line blame, authors, commit SHAs, and timestamps |
| **Web & Docs** | `web_search` | External search for CVEs, libraries, and breaking changes |
| | `fetch_webpage` | SSRF-protected documentation and web page parser |
| **Sandbox Exec** | `run_tests` | Execute test suites in isolated cloud sandboxes |
| | `run_linter` | Execute static analysis and linting in cloud sandboxes |

---

## Repository Layout

```text
PRism/
├── app/                           # Next.js 15 App Router Frontend & API Routes
│   ├── api/                       # API Route Handlers
│   │   ├── auth/                  # GitHub OAuth authentication & session endpoints
│   │   ├── conversations/         # Code Q&A conversation threads & SSE message streaming
│   │   ├── github/                # Webhooks, connect URLs, setup, and review posting
│   │   ├── rag/                   # Vector indexing and RAG dispatch gateway
│   │   ├── repositories/          # Tracked, available, unified, and explore endpoints
│   │   └── reviews/               # Review listings, detail, approve, and event streams
│   ├── page.tsx                   # Overview / Dashboard view
│   ├── repositories/              # Repository hub & detail views
│   ├── reviews/                   # Review feed & detailed multi-agent report views
│   ├── qa/                        # Conversational Code Q&A workspace
│   ├── globals.css                # PRism design system tokens & primitives
│   └── layout.tsx                 # Root layout with QueryProvider & AuthContext
├── components/                    # Reusable React 19 UI Primitives
│   ├── AddRepositoryModal.tsx     # Modal for tracking account or public repositories
│   ├── AppShell.tsx               # Shell with authentication guard and sidebar
│   ├── ConnectGitHubBanner.tsx    # GitHub App connection alert banner
│   ├── FindingCard.tsx            # Severity finding card with 1-click fix copy
│   ├── Header.tsx                 # Constant 64px sticky navbar with breadcrumbs
│   ├── MarkdownMessage.tsx        # Syntax-highlighted markdown chat renderer
│   ├── Sidebar.tsx                # Constant 64px sidebar navigation with PRism branding
│   ├── StatusBadge.tsx            # Status, verdict, and severity micro-badges
│   └── Timeline.tsx               # Execution trace and latency/cost telemetry spine
├── lib/                           # Shared Client & Server Utilities
│   ├── ai/client.ts               # FastAPI AI service HTTP client
│   ├── auth/session.ts            # GitHub OAuth session and cookie verification
│   ├── github/app.ts              # GitHub App Octokit token and API wrappers
│   ├── hooks/                     # TanStack Query custom hooks (useQaChat, useRepositories, useReviews)
│   └── prisma.ts                  # Prisma Client singleton
├── prisma/                        # Database ORM Schemas & Migrations
│   └── schema.prisma              # Users, Repositories, Reviews, Conversations, Audit Events
├── public/                        # Static Assets
│   └── PRism.svg                  # Official PRism emblem logo
├── ai/                            # FastAPI AI Engine & Agent Subsystem
│   ├── app/
│   │   ├── main.py                # FastAPI entrypoint, DB lifespan pools, and ingress
│   │   ├── queue/                 # Redis SETNX idempotency & ARQ worker processes
│   │   ├── workflow/              # LangGraph multi-agent orchestration state machine
│   │   │   ├── agents/            # Security, Quality, Tests, Docs, and Summary agents
│   │   │   ├── nodes/             # Context building, merge, critic, gate, and posting nodes
│   │   │   ├── memory/            # Procedural (.prism/rules) & episodic feedback memory
│   │   │   └── events/            # Append-only audit spine & INR (₹) cost accounting
│   │   ├── rag/                   # AST chunking, embeddings, pgvector store, and QA
│   │   ├── tools/                 # 14 agent tools across PR, code, git, web, and sandbox
│   │   ├── sandbox/               # E2B cloud sandbox runtime adapters & detector
│   │   └── services/              # Tiered model router (DeepSeek, Qwen, OpenRouter)
│   ├── sandbox/                   # E2B container definition (e2b.Dockerfile) & smoke tests
│   └── tests/                     # Pytest automated test suite (54 test cases)
└── dev.sh                         # Unified development startup script
```

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript, TanStack Query v5, React Markdown, Remark GFM |
| **Backend / AI** | FastAPI, Python 3.11+, Pydantic v2, LangGraph, LangChain, ARQ, Asyncpg, OpenRouter, AICredits |
| **Data & Storage** | Neon PostgreSQL (pgvector extension, HNSW indexing), Redis 7+ (ARQ queue & idempotency), Prisma ORM v6 |
| **Execution Sandbox** | E2B Cloud Sandboxes (`prism-polyglot-reviewer`) |
| **LLM Models** | DeepSeek V4.1 Flash, Qwen3 Coder 30B Instruct, OpenRouter Free tiers |

---

## Getting Started

### Prerequisites

- **Node.js**: `v20.x` or higher
- **Python**: `3.11` or higher
- **Redis**: Local or cloud Redis instance (e.g. `redis://localhost:6379/0`)
- **PostgreSQL**: PostgreSQL 16+ with `vector` extension enabled (e.g. Neon Serverless Postgres)
- **API Keys**: OpenRouter or AICredits API key, GitHub App credentials, E2B API key (optional for sandboxes)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/iamarin2224/PRism.git
   cd PRism
   ```

2. **Configure environment variables:**
   ```bash
   # Root Next.js configuration
   cp .env.example .env

   # FastAPI AI Engine configuration
   cp ai/.env.example ai/.env
   ```

3. **Install dependencies:**
   ```bash
   # Install frontend & root packages
   npm install

   # Setup Python virtual environment & AI service packages
   cd ai
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   cd ..
   ```

4. **Initialize Database Schema:**
   ```bash
   npx prisma db push
   ```

---

## Running the Platform

### Single-Command Start (Recommended)

Start the Next.js frontend, FastAPI AI engine, and ARQ background worker concurrently:

```bash
chmod +x dev.sh
./dev.sh
```

- **Developer Dashboard:** [http://localhost:5050](http://localhost:5050)
- **FastAPI AI OpenAPI Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

### Individual Service Commands

```bash
# Terminal 1: FastAPI AI Engine & ARQ Worker
npm run dev:ai

# Terminal 2: Next.js Frontend & API Gateway
npm run dev
```

---

## Verification & Testing

```bash
# 1. Next.js Type Check & Production Build
npx tsc --noEmit
npm run build

# 2. Test GitHub Webhook HMAC Ingress
npm run test:webhook

# 3. Run FastAPI & LangGraph Automated Test Suite (54 Tests)
cd ai && ./.venv/bin/pytest tests/ -v

# 4. Run Live E2B Cloud Sandbox Smoke Test
cd ai && ./.venv/bin/python sandbox/multi_lang_smoke_test.py
```

---

## License

PRism is licensed under the [Apache-2.0 License](LICENSE).
