# PRism — AI Engine & Code-Aware RAG (`ai/`)

The **AI Engine** is a high-performance Python service built with **FastAPI**, **Pydantic v2**, **pgvector**, **LangChain Splitters**, **E2B Sandboxes**, and **OpenRouter**. It serves as the primary intelligence layer for PRism, executing deep repository indexing, context-aware semantic retrieval, tool calling, cloud sandboxed execution, and structured automated code reviews.

---

## Architecture & Subsystems

```text
ai/
├── app/
│   ├── main.py                # FastAPI server & lifespan database pool initialization
│   ├── config.py              # Typed environment settings (pydantic-settings)
│   ├── models/                # Pydantic v2 schemas for GitHub webhooks & reviews
│   │   ├── github.py          # PREventPayload, RepositoryInfo, PullRequestInfo
│   │   └── review.py          # Finding, ReviewResponse, ReviewRequest schemas
│   ├── rag/                   # Code-Aware Retrieval-Augmented Generation Subsystem
│   │   ├── db.py              # Async connection pool (asyncpg) & HNSW pgvector DDL
│   │   ├── models.py          # RAG schemas (CodeChunk, RetrievedChunk, QARequest, etc.)
│   │   ├── ingestion/         # Git snapshot fetcher & filtering (<1MB, <20k tokens)
│   │   ├── chunking/          # AST language splitters + JSON/CSS/YAML/SQL separators
│   │   ├── embeddings/        # AICredits batch embedding client (1536 dimensions)
│   │   ├── vectorstore/       # Strict repository-scoped pgvector cosine similarity search
│   │   ├── retrieval/         # Top-K retrieval coordinator
│   │   ├── indexing/          # Non-blocking async background full/incremental indexer
│   │   └── qa/                # Context-grounded codebase Q&A service
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
│   └── services/              # LLM integrations
│       └── llm.py             # OpenRouter client & structured JSON output parser
├── sandbox/                   # E2B Container Definition & Smoke Tests
│   ├── e2b.Dockerfile         # Multi-language custom sandbox image
│   ├── multi_lang_smoke_test.py # Live multi-language cloud verification script
│   └── smoke_test.py          # Baseline E2B connectivity test
└── tests/                     # Automated Test Suite (Pytest)
    ├── test_rag.py            # Chunking, AST splitting & filtering tests
    ├── test_tools.py          # Tool execution, schemas & SSRF protection tests
    ├── test_sandbox_detector.py # Path security & language detection unit tests
    └── test_sandbox_tools.py  # Sandbox tool delegation & passthrough tests
```

---

## Agent Tool Calling Layer

The PRism tool layer provides review agents with structured, guardrailed access to repository data, git history, web documentation, and dynamic testing tools. All tools inherit from [`BaseTool`](file:///Users/arindas/Coding/Projects/PRism/ai/app/tools/base.py), enforce Pydantic input validation, and export OpenAI-compatible function-calling specifications via [`ToolRegistry`](file:///Users/arindas/Coding/Projects/PRism/ai/app/tools/registry.py).

### Registered Tools (14 Tools across 5 Domains)

| Domain | Tool Name | Description | Key Guardrails |
| :--- | :--- | :--- | :--- |
| **GitHub PR** | `get_pr_metadata` | Fetches PR title, description, branches, commits, and author. | Requires valid repository context. |
| | `get_pr_diff` | Retrieves unified git patches for all modified PR files. | Scoped to active PR review context. |
| | `get_changed_files` | Returns concise list of changed files with addition/deletion counts. | Scoped to active PR review context. |
| **Code & Repo** | `read_file` | Reads source code at exact commit ref with 1-based line slicing. | Prevents path traversal (`..`), 500KB cap. |
| | `search_codebase` | Performs semantic or exact text search across repository embeddings. | Strict repository scoping (`WHERE repo_name = $2`). |
| | `find_references` | Locates symbol definitions, imports, and usages across the repo. | Language-aware symbol extraction. |
| | `get_related_tests` | Discovers test files and test suites covering target modules. | Test naming patterns + symbol referencing. |
| **Git History** | `get_git_history` | Inspects recent commits, messages, authors, and SHAs on branches. | GitHub API rate-limit resilience. |
| | `get_file_history` | Retrieves commit timeline and changes for a specific file. | Path normalization and branch ref validation. |
| | `get_blame` | Line-by-line blame showing commit SHA, author, and date. | 1-based line range validation. |
| **Web & Docs** | `web_search` | Queries external documentation, breaking changes, and CVEs. | Sanitized search queries via DuckDuckGo. |
| | `fetch_webpage` | Fetches and parses external documentation to clean markdown. | **SSRF Protection**: Blocks private, internal, loopback, link-local, and cloud metadata IPs. |
| **Sandbox Exec** | `run_tests` | Executes repository test suites in an isolated E2B cloud sandbox. | Predefined allowlisted test command, no raw shell access. |
| | `run_linter` | Executes repository code linters and static checks in E2B. | Predefined allowlisted lint command, no raw shell access. |

### Tool Security & Guardrails
1. **SSRF Protection (`app/tools/web/fetch.py`):** Resolves target hostnames via DNS and blocks private/loopback IP ranges (RFC 1918 `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`), link-local IPs (`169.254.0.0/16`), cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`), and non-HTTP schemes (`file://`, `ftp://`).
2. **Context Integrity (`app/tools/context.py`):** Tools require a validated `ToolContext` instance carrying the active repository, commit SHA, and PR number.

---

## Multi-Language E2B Sandbox Executor

PRism uses a custom cloud sandbox environment powered by **E2B** (`prism-polyglot-reviewer`) to execute dynamic tests, linters, and type-checkers on untrusted code safely.

### Sandbox Architecture & Security Lifecycle

```text
1. Agent Request (Files + Operation: TEST / LINT / TYPECHECK)
       │
       ▼
2. Path & Payload Validator (app/sandbox/validator.py)
   • Rejects path traversal ('..'), absolute paths, null bytes
   • Blocks sensitive files (.env, .git, .ssh, .aws)
   • Enforces file count (≤500) and payload size limits (≤2MB/file, ≤10MB total)
       │
       ▼
3. Runtime Detector & Command Resolver (app/sandbox/detector.py)
   • Priority-based detection across registered adapters
   • Resolves ONLY allowlisted commands — never accepts arbitrary shell strings
   • Early exit for unsupported runtimes without starting sandboxes (saves cost)
       │
       ▼
4. Fresh Sandbox Provisioning (app/sandbox/service.py)
   • Spawns fresh E2B container instance (prism-polyglot-reviewer)
   • Populates workspace files at /home/user/workspace
       │
       ▼
5. Controlled Execution & Telemetry
   • Runs allowlisted command with strict execution timeout
   • Captures stdout, stderr, exit code, and duration_ms
       │
       ▼
6. Guaranteed Teardown
   • Unconditionally kills/closes the sandbox in finally: block
```

### Supported Polyglot Runtimes & Operations

| Runtime | Priority | Detection Rules | `TEST` Command | `LINT` Command | `TYPECHECK` Command |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **TypeScript** | 10 | `tsconfig.json`, `*.ts`, `*.tsx` | `npm test` | `npm run lint` | `tsc --noEmit` |
| **JavaScript** | 5 | `package.json`, `*.js`, `*.mjs`, `*.cjs` | `npm test` / `node --test` | `npm run lint` | `npm run typecheck` |
| **Go** | 4 | `go.mod`, `go.sum`, `*.go` | `go test -v ./...` | `go vet ./...` | `go build ./...` |
| **Java** | 3 | `pom.xml`, `build.gradle`, `*.java` | `mvn test -B` / `./gradlew test` | `mvn checkstyle:check` / `javac -Xlint` | `mvn test-compile -B` / `javac` |
| **C / C++** | 3 | `CMakeLists.txt`, `Makefile`, `*.cpp`, `*.c` | `ctest` / `make test` / `g++ *.cpp` | `clang-tidy <files>` | `g++ -fsyntax-only` |
| **Python** | 1 | `pyproject.toml`, `requirements.txt`, `*.py` | `pytest` | `ruff check .` | `ruff check .` |

### Extensibility Model
To add a new language runtime (e.g. Rust, Ruby, PHP):
1. Subclass [`BaseRuntimeAdapter`](file:///Users/arindas/Coding/Projects/PRism/ai/app/sandbox/runtimes/base.py) in `app/sandbox/runtimes/`.
2. Implement `detect()` and `get_command(category, files)` with safe allowlisted commands.
3. Register the adapter in [`ProjectDetector`](file:///Users/arindas/Coding/Projects/PRism/ai/app/sandbox/detector.py).

---

## Code-Aware RAG Pipeline

```text
[Repository / Git Tree]
          │
          ▼
   1. ingestion/          --> Excludes .git, node_modules, binaries (.png, .wasm), >1MB, >20k tokens
          │
          ▼
   2. chunking/           --> AST-aware splitting (Python, TS, Go, Rust, Java, C++, etc.)
          │                   + structural JSON, CSS, SCSS, YAML, SQL, Shell separators
          ▼
   3. embeddings/         --> Batched vector generation via AICredits (openai/text-embedding-3-small)
          │
          ▼
   4. vectorstore/        --> Neon PostgreSQL pgvector with HNSW index (vector_cosine_ops)
          │                   Strict WHERE repo_name = :repo_name scoping on all queries
          ▼
   5. qa/ & retrieval/    --> Injects top-K semantic context into OpenRouter LLM prompts
```

---

## Configuration & Environment Variables

Environment variables are validated via `pydantic-settings` in [`app/config.py`](file:///Users/arindas/Coding/Projects/PRism/ai/app/config.py).

Copy `ai/.env.example` to `ai/.env`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
| :--- | :--- | :--- |
| `OPENROUTER_API_KEY` | *(Required)* | Your OpenRouter API key. |
| `OPENROUTER_MODEL` | `openrouter/free` | Target model ID (e.g., `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`). |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Base URL for OpenRouter API completions. |
| `AICREDITS_API_KEY` | *(Required for RAG)* | Your AICredits API key. |
| `AICREDITS_BASE_URL` | `https://api.aicredits.in/v1` | Base URL for AICredits embeddings API. |
| `EMBEDDING_MODEL` | `openai/text-embedding-3-small` | 1536-dimensional embedding model identifier. |
| `DATABASE_URL` | *(Required for RAG)* | Neon PostgreSQL connection string with pgvector enabled. |
| `E2B_API_KEY` | *(Required for Sandbox)* | Your E2B API key from [e2b.dev](https://e2b.dev). |
| `E2B_TEMPLATE` | `prism-polyglot-reviewer` | Custom E2B sandbox template name or template ID. |
| `NEXTJS_URL` | `http://localhost:5050` | Allowed origin for Next.js frontend and webhook gateway. |
| `ALLOWED_ORIGINS` | `""` | Optional comma-separated list of additional allowed CORS origins. |

---

## Testing & Verification

```bash
# 1. Activate Python virtual environment
source .venv/bin/activate

# 2. Run the entire automated test suite (RAG, Tool Layer, Sandbox Detector, Sandbox Tools)
pytest tests/ -v

# 3. Run the live multi-language E2B cloud smoke test
python sandbox/multi_lang_smoke_test.py

# 4. Run the baseline E2B connectivity smoke test
python sandbox/smoke_test.py
```
