# PRism — AI Engine & Code-Aware RAG (`ai/`)

The **AI Engine** is a high-performance Python service built with **FastAPI**, **LangGraph**, **ARQ + Redis**, **Pydantic v2**, **pgvector**, **LangChain Splitters**, **E2B Sandboxes**, and **OpenRouter / AICredits**. It serves as the primary intelligence layer for PRism, executing deep repository indexing, context-aware semantic retrieval, streaming codebase Q&A, tool calling, cloud sandboxed execution, and structured automated multi-agent code reviews.

---

## Architecture & Subsystems

```text
ai/
├── app/
│   ├── main.py                # FastAPI server, lifespan DB pools, /api/github/pr-event & /api/rag/qa/stream
│   ├── config.py              # Typed environment settings (pydantic-settings)
│   ├── models/                # Pydantic v2 schemas for GitHub webhooks & reviews
│   │   ├── github.py          # PREventPayload, RepositoryInfo, PullRequestInfo
│   │   └── review.py          # Finding, ReviewResponse, ReviewRequest schemas
│   ├── queue/                 # Asynchronous Redis Ingress & Worker Layer
│   │   ├── redis.py           # Redis connection pool & atomic idempotency helper (SETNX)
│   │   ├── enqueue.py         # Non-blocking job dispatcher for ARQ review & indexing queues
│   │   └── worker.py          # ARQ worker process executing review workflows & async indexing
│   ├── workflow/              # Multi-Agent Review Orchestration Engine (LangGraph)
│   │   ├── state.py           # Typed immutable ReviewState & SpecialistOutput schemas
│   │   ├── graph.py           # StateGraph definition: fan-out, summary synthesis, critic, decision gates
│   │   ├── checkpointer.py    # Redis/PostgreSQL state checkpointer for HITL pauses
│   │   ├── workflow_engine.py # WorkflowEngine abstract protocol
│   │   ├── langgraph_engine.py# Production LangGraph implementation with checkpointing
│   │   ├── resilience.py      # Circuit breakers, exponential backoffs, and token fallbacks
│   │   ├── agents/            # Domain Specialist & Synthesis Agents
│   │   │   ├── base.py        # BaseSpecialistAgent (budgeting, tools, fallback handling)
│   │   │   ├── security.py    # Security specialist (DeepSeek V4.1 Flash)
│   │   │   ├── quality.py     # Quality specialist (Qwen3 Coder 30B)
│   │   │   ├── tests.py       # Tests specialist (Qwen3 Coder 30B + E2B sandbox)
│   │   │   ├── docs.py        # Docs specialist (OpenRouter Free)
│   │   │   └── summary.py     # PR Summary Agent (Intent analysis & impact matrix synthesis)
│   │   ├── memory/            # Tri-Partite Context Memory System
│   │   │   ├── procedural.py  # Repository rules loader (.prism/rules.yml & built-in standards)
│   │   │   └── episodic.py    # Historical accepted/dismissed feedback search (pgvector)
│   │   ├── nodes/             # LangGraph State Machine Nodes
│   │   │   ├── build_context.py # Aggregates semantic, procedural & episodic context
│   │   │   ├── specialists.py # Parallel execution wrappers for 4 specialists
│   │   │   ├── merge.py       # Deterministic deduplication & agreement scoring
│   │   │   ├── critic.py      # Anti-hallucination verification against retrieved code
│   │   │   ├── gate.py        # Confidence & severity routing gate
│   │   │   └── post.py        # Structured markdown review & resilient GitHub comment posting
│   │   └── events/            # Append-Only Telemetry & Cost Accounting
│   │       ├── spine.py       # EventsSpine: persists audit spans into PostgreSQL
│   │       └── cost.py        # Exact token-to-INR (₹) pricing calculator per model tier
│   ├── rag/                   # Code-Aware Retrieval-Augmented Generation Subsystem
│   │   ├── db.py              # Async connection pool (asyncpg) & HNSW pgvector DDL
│   │   ├── models.py          # RAG schemas (CodeChunk, RetrievedChunk, QARequest, QASource, etc.)
│   │   ├── ingestion/         # Git snapshot fetcher & filtering (<1MB, <20k tokens)
│   │   ├── chunking/          # AST language splitters + JSON/CSS/YAML/SQL separators
│   │   ├── embeddings/        # Batched vector generation client (1536 dimensions) with backoff
│   │   ├── vectorstore/       # Strict repository-scoped pgvector cosine similarity search
│   │   ├── retrieval/         # Top-K retrieval coordinator
│   │   ├── indexing/          # Non-blocking async background full/incremental indexer
│   │   └── qa/                # Context-grounded codebase Q&A & real-time SSE streaming service
│   ├── tools/                 # Agent Tool Calling Layer (14 Registered Tools)
│   │   ├── base.py            # BaseTool ABC & standardized ToolResult schema
│   │   ├── context.py         # ToolContext (repository, commit SHA, PR number, tokens)
│   │   ├── registry.py        # Central ToolRegistry & OpenAI schema generator
│   │   ├── github/            # PR metadata, diffs, changed files tools
│   │   ├── code/              # read_file, search_codebase, find_references, get_related_tests
│   │   ├── history/           # get_git_history, get_file_history, get_blame
│   │   ├── web/               # web_search, fetch_webpage (with SSRF protection)
│   │   └── tests/             # run_tests, run_linter (agent-facing sandbox wrappers)
│   ├── sandbox/               # Multi-Language E2B Sandbox Execution Service
│   │   ├── models.py          # SandboxRequest, SandboxResult, FilePayload / SandboxFile
│   │   ├── validator.py       # Strict path traversal & payload size validator
│   │   ├── detector.py        # Priority-based project detector & command resolver
│   │   ├── service.py         # SandboxExecutorService (lifecycle, execution & cleanup)
│   │   └── runtimes/          # Extensible language adapters (Python, JS, TS, C++, Java, Go)
│   └── services/              # LLM & Model Router Integrations
│       ├── llm.py             # OpenRouter client & structured JSON output parser
│       └── model_router.py    # Tiered client router & dynamic credit fallback resolver
├── sandbox/                   # E2B Container Definition & Smoke Tests
│   ├── e2b.Dockerfile         # Multi-language custom sandbox image
│   ├── multi_lang_smoke_test.py # Live multi-language cloud verification script
│   └── smoke_test.py          # Baseline E2B connectivity test
└── tests/                     # Automated Test Suite (Pytest: 55+ Tests)
    ├── test_events_spine.py   # Cost accounting (INR ₹) & audit event emission tests
    ├── test_memory_and_context.py # Procedural rules & episodic feedback tests
    ├── test_merge_and_critic.py   # Deduplication & critic verifier tests
    ├── test_multi_user_and_async_indexing.py # Multi-user scoped indexing & async queue tests
    ├── test_queue_ingress.py  # Redis idempotency, fast 202 & ARQ worker tests
    ├── test_rag.py            # Chunking, AST splitting & filtering tests
    ├── test_resilience_fallback.py # Credit exhaustion & dynamic model fallback tests
    ├── test_sandbox_detector.py # Path security & language detection unit tests
    ├── test_sandbox_tools.py  # Sandbox tool delegation & passthrough tests
    ├── test_specialists.py    # Multi-turn specialist agent execution tests
    ├── test_tools.py          # Tool execution, schemas & SSRF protection tests
    ├── test_workflow_engine.py# Full mock-to-end review workflow tests
    ├── test_workflow_graph.py # LangGraph routing & topology compilation tests
    └── test_workflow_state.py # ReviewState reducer & data model tests
```

---

## Multi-Agent Review Orchestration

The core review engine executes an asynchronous, stateful, multi-agent graph with end-to-end operational resilience:

```mermaid
flowchart TD
    subgraph Ingress ["1. Ingress & Queue"]
        A[GitHub Webhook Event] -->|HMAC-SHA256 Auth| B[FastAPI /api/github/pr-event]
        B -->|Atomic SETNX Check| C[(Redis Lock 24h TTL)]
        B -->|Fast 202 Accepted| D[(Redis + ARQ Queue)]
    end

    subgraph Worker ["2. Background Worker & StateGraph"]
        D -->|Dequeue Payload| E[ARQ Worker]
        E -->|Invoke| F[WorkflowEngine]
        F --> G[LangGraph StateGraph]
        G <-->|Checkpoints & Pauses| H[(RedisSaver Checkpointer)]
    end

    subgraph ContextGrounding ["3. Context Construction"]
        G --> NodeContext[Build PR Context Node]
        NodeContext -->|Semantic Search| RAG[(Code-Aware RAG - pgvector)]
        NodeContext -->|Procedural Standards| Rules[Procedural: .prism/rules.yml]
        NodeContext -->|Episodic Memory| Epi[(Episodic: Human Feedback DB)]
    end

    subgraph FanOut ["4. Parallel Specialist Fan-Out"]
        NodeContext --> Fork{Fan-Out}
        Fork -->|DeepSeek V4.1 Flash| Sec[Security Specialist]
        Fork -->|Qwen3 Coder 30B| Qual[Quality Specialist]
        Fork -->|Qwen3 Coder 30B| Test[Tests Specialist]
        Fork -->|OpenRouter Free| Docs[Docs Specialist]

        Sec -.->|Tools & Sandbox| Tools[(14 Agent Tools + E2B)]
        Qual -.->|Tools & Sandbox| Tools
        Test -.->|Tools & Sandbox| Tools
        Docs -.->|Tools & Sandbox| Tools
    end

    subgraph AggregationCritic ["5. Aggregation & Synthesis"]
        Sec --> Join{Fan-In Join}
        Qual --> Join
        Test --> Join
        Docs --> Join

        Join --> NodeMerge[Deterministic Merge Node\nLine overlap deduplication & agreement]
        NodeMerge --> NodeSummary[PR Summary Agent\nIntent Analysis & Impact Matrix]
        NodeSummary --> NodeCritic[Critic / Verifier Node\nDeepSeek V4.1 Flash Grounding Check]
    end

    subgraph DecisionGate ["6. Decision Gate & Actions"]
        NodeCritic --> Gate{Confidence & Severity Gate}
        Gate -->|Confidence >= 0.85 & No Critical| NodePost[Post Review to GitHub]
        Gate -->|Confidence < 0.85 OR Critical Finding| NodeHITL[Human Approval Queue]
        NodeHITL <-->|Developer Approval / Edit| HITLAction[Dashboard Action]
        HITLAction -->|Resume| F
    end

    subgraph Telemetry ["7. Append-Only Events Spine"]
        G -.->|Async Stream| Spine[(PostgreSQL audit_events)]
        Spine --> Accounting[Token & INR ₹ Cost Accounting]
    end
```

### 1. Ingress, Idempotency & Queue (`app/queue/`)
- **Zero-Blocking Ingress:** Webhook deliveries are authenticated with HMAC-SHA256 and enqueued to ARQ within `<50ms`, returning an immediate HTTP `202 Accepted`.
- **Atomic Idempotency:** Redis `SETNX` on `idempotency:github:{delivery_id}` with a 24-hour TTL guarantees no duplicate reviews are triggered on webhook retries.
- **Worker Execution:** Background ARQ workers pick up review jobs and repository indexing tasks asynchronously without blocking API request threads.

### 2. Tri-Partite Memory & Context Building (`app/workflow/memory/` & `nodes/build_context.py`)
Before any specialist executes, the context node gathers:
- **Semantic Memory:** Queries Code-Aware RAG for repository symbols and dependencies outside the immediate PR diff.
- **Procedural Memory:** Loads custom team rules from `.prism/rules.yml` or `.prism/rules.md`, with automatic fallbacks to built-in clean code, security (OWASP), and testing standards.
- **Episodic Memory:** Retrieves historically accepted or dismissed findings for the repository to prevent repeating false positives.

### 3. Tiered Model Routing & Parallel Specialists (`app/workflow/agents/` & `services/model_router.py`)
Agents run concurrently with tiered models and automatic fallback to free tiers on credit exhaustion:

| Specialist / Agent | Default Model Tier | Primary Focus | Tools Used |
| :--- | :--- | :--- | :--- |
| **Security Agent** | `deepseek/deepseek-v4.1-flash` | OWASP Top 10, auth flaws, injection, secret leaks | `read_file`, `search_codebase`, `fetch_webpage` |
| **Quality Agent** | `qwen/qwen3-coder-30b-a3b-instruct` | Code architecture, anti-patterns, performance, dead code | `read_file`, `find_references`, `get_blame` |
| **Tests Agent** | `qwen/qwen3-coder-30b-a3b-instruct` | Regression risks, test coverage, sandbox verification | `read_file`, `get_related_tests`, `run_tests`, `run_linter` |
| **Docs Agent** | `openrouter/free` | API contracts, docstrings, breaking changes | `read_file`, `get_pr_diff`, `web_search` |
| **PR Summary Agent** | `qwen/qwen3-coder-30b-a3b-instruct` | Intent analysis, impact matrix, verdict synthesis | Synthesizes specialist outputs |
| **Critic / Verifier** | `deepseek/deepseek-v4.1-flash` | Grounding check against raw source, anti-hallucination | `read_file`, `search_codebase` |

### 4. PR Summary Synthesis & Resilient Publishing (`app/workflow/agents/summary.py` & `nodes/post.py`)
- **Summary Synthesis:** Synthesizes findings into high-level executive summaries, breaking down change categories (`Feature`, `Fix`, `Refactor`, `Chore`), risk factors, and calibrated verdicts (`APPROVE`, `COMMENT`, `REQUEST_CHANGES`).
- **Resilient Multi-Target Posting:** Formats GitHub-flavored markdown with collapsible detail sections, posts root review comments, and falls back to individual PR inline comments when line-level references match the diff.

---

## Real-Time Streaming Code Q&A (`app/rag/qa/`)

PRism provides an SSE streaming conversational endpoint (`POST /api/rag/qa/stream`) that queries repository vector embeddings:

```text
Client Request (query, repo_name, commit_sha, max_chunks)
                     │
                     ▼
       1. Top-K Vector Retrieval (pgvector)
          • Cosine similarity search (1 - (embedding <=> query_vec))
          • Filtered strictly by target repository
                     │
                     ▼
       2. SSE Event Stream: 'sources'
          • Emits JSON array of retrieved chunks:
            [{ file_path, start_line, end_line, similarity_score, content }]
                     │
                     ▼
       3. LLM Generation Stream: 'delta'
          • Streams token deltas in real-time as they generate from OpenRouter
                     │
                     ▼
       4. Final Event: 'complete'
          • Closes stream and emits full usage statistics
```

---

## Asynchronous Repository Indexing Queue (`app/queue/worker.py`)

- **Async ARQ Task (`arq_index_repository`):** Handles deep Git snapshot downloads, AST splitting, and embedding generation in background workers.
- **Status State Machine:** Tracks progress across `NOT_INDEXED` ➔ `INDEXING` ➔ `INDEXED` (or `FAILED`) with database persistence.
- **Global Shared Indexing:** If a public repository at the current commit SHA is already indexed in the vector store, PRism reuses the existing index instantly.

---

## Agent Tool Calling Layer (14 Tools)

| Domain | Tool Name | Description | Key Guardrails |
| :--- | :--- | :--- | :--- |
| **GitHub PR** | `get_pr_metadata` | Fetches PR title, description, branches, commits, author. | Valid repository context required. |
| | `get_pr_diff` | Retrieves unified git patches for all modified PR files. | Scoped to active PR review. |
| | `get_changed_files` | Returns concise list of changed files with addition/deletion stats. | Scoped to active PR review. |
| **Code & Repo** | `read_file` | Reads source code at exact commit ref with 1-based line slicing. | Path traversal guard (`..`), 500KB cap. |
| | `search_codebase` | Performs semantic or exact text search across repository embeddings. | Strict repository scoping (`WHERE repo_name = $2`). |
| | `find_references` | Locates symbol definitions, imports, and usages across the repo. | Language-aware symbol extraction. |
| | `get_related_tests` | Discovers test files and test suites covering target modules. | Test naming patterns + symbol referencing. |
| **Git History** | `get_git_history` | Inspects recent commits, messages, authors, and SHAs on branches. | GitHub API rate-limit resilience. |
| | `get_file_history` | Retrieves commit timeline and changes for a specific file. | Path normalization and branch ref validation. |
| | `get_blame` | Line-by-line blame showing commit SHA, author, and date. | 1-based line range validation. |
| **Web & Docs** | `web_search` | Queries external documentation, breaking changes, and CVEs. | Sanitized search queries via DuckDuckGo. |
| | `fetch_webpage` | Fetches and parses external documentation to clean markdown. | **SSRF Protection**: Blocks private, loopback, and cloud metadata IPs. |
| **Sandbox Exec** | `run_tests` | Executes repository test suites in an isolated E2B cloud sandbox. | Predefined allowlisted test command. |
| | `run_linter` | Executes repository code linters and static checks in E2B. | Predefined allowlisted lint command. |

---

## Polyglot E2B Cloud Sandbox (`app/sandbox/`)

- **Extensible Adapters:** Supports TypeScript (`npm test`, `tsc --noEmit`), JavaScript (`npm test`, `node --test`), Python (`pytest`, `ruff`), Go (`go test`, `go vet`), Java (`mvn test`, `gradlew test`), and C/C++ (`ctest`, `clang-tidy`).
- **Security Isolation:** Rejects absolute paths and sensitive filenames (`.env`, `.git`), enforcing sandbox disposal in `finally` blocks.

---

## Configuration & Environment Variables

Copy `ai/.env.example` to `ai/.env`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
| :--- | :--- | :--- |
| `OPENROUTER_API_KEY` | *(Required)* | Your OpenRouter API key. |
| `OPENROUTER_MODEL` | `openrouter/free` | Target fallback model ID. |
| `AICREDITS_API_KEY` | *(Required for RAG/High Models)* | Your AICredits API key. |
| `AICREDITS_HIGH_MODEL` | `deepseek/deepseek-v4.1-flash` | High-reasoning model for Security & Critic. |
| `AICREDITS_MID_MODEL` | `qwen/qwen3-coder-30b-a3b-instruct` | Mid-tier model for Quality, Tests, and Summary agents. |
| `EMBEDDING_MODEL` | `openai/text-embedding-3-small` | 1536-dimensional embedding model identifier. |
| `DATABASE_URL` | *(Required for RAG/Audit)* | PostgreSQL connection string with pgvector enabled. |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis instance for ARQ queue and review checkpoints. |
| `E2B_API_KEY` | *(Optional for Sandbox)* | Your E2B API key from [e2b.dev](https://e2b.dev). |
| `NEXTJS_URL` | `http://localhost:5050` | Allowed origin for Next.js frontend and webhook gateway. |

---

## Automated Test Suite

```bash
# 1. Activate Python virtual environment
source .venv/bin/activate

# 2. Run full automated test suite (55+ Tests)
pytest tests/ -v

# 3. Run individual subsystem test suites
pytest tests/test_workflow_engine.py -v               # End-to-end review graph
pytest tests/test_multi_user_and_async_indexing.py -v # Scoped indexing & queue tests
pytest tests/test_merge_and_critic.py -v              # Merge & Critic verification
pytest tests/test_queue_ingress.py -v                 # Redis idempotency & ARQ worker
pytest tests/test_events_spine.py -v                  # INR cost accounting & audit spine

# 4. Run live multi-language E2B cloud smoke test
python sandbox/multi_lang_smoke_test.py
```
