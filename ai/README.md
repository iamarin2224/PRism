# PRism — AI Engine & Code-Aware RAG (`ai/`)

The **AI Engine** is a high-performance Python service built with **FastAPI**, **Pydantic v2**, **pgvector**, **LangChain Splitters**, and **OpenRouter**. It serves as the primary intelligence layer for PRism, executing deep repository indexing, context-aware semantic retrieval, and structured automated code reviews.

---

## Architecture & Subsystems

```text
ai/app/
├── main.py                    # FastAPI server & lifespan database pool initialization
├── config.py                  # Typed environment settings (pydantic-settings)
├── models/                    # Pydantic v2 schemas for GitHub webhooks & reviews
│   ├── github.py              # PREventPayload, RepositoryInfo, PullRequestInfo
│   └── review.py              # Finding, ReviewResponse, ReviewRequest schemas
├── rag/                       # Code-Aware Retrieval-Augmented Generation Subsystem
│   ├── db.py                  # Async connection pool (asyncpg) & HNSW pgvector DDL
│   ├── models.py              # RAG schemas (CodeChunk, RetrievedChunk, QARequest, etc.)
│   ├── ingestion/             # Git snapshot fetcher & filtering (<1MB, <20k tokens)
│   ├── chunking/              # AST language splitters + JSON/CSS/YAML/SQL separators
│   ├── embeddings/            # AICredits batch embedding client (1536 dimensions)
│   ├── vectorstore/           # Strict repository-scoped pgvector cosine similarity search
│   ├── retrieval/             # Top-K retrieval coordinator
│   ├── indexing/              # Non-blocking async background full/incremental indexer
│   └── qa/                    # Context-grounded codebase Q&A service
└── services/                  # LLM integrations
    └── llm.py                 # OpenRouter client & structured JSON output parser
```

---

## Code-Aware RAG Pipeline

```text
[Repository / Git Tree]
          │
          ▼
   1. ingestion/          --> Excludes .git, node_modules, binaries (.png, .wasm), >1MB, >20k tokens
          │
          ▼
   2. chunking/           --> AST-aware splitting (Python, TS, Go, Rust, Java, etc.)
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

### Key RAG Features:
1. **Language-Aware Chunking**: Preserves logical AST boundaries (functions, classes, blocks) rather than slicing arbitrary text lines. Retains 1-indexed `start_line` and `end_line` metadata.
2. **Structural Separators for Config & Styles**: Custom delimiters for `.json`, `.css`, `.scss`, `.yaml`, `.sql`, and `.sh` to prevent broken key-value pairs or css blocks.
3. **Strict Repository Scoping**: All vector queries and deletions mandate `WHERE repo_name = $2`, preventing cross-repository context leakage.
4. **HNSW Vector Indexing**: Configured with `USING hnsw (embedding vector_cosine_ops)` to ensure sub-millisecond similarity lookups without sequential table scans.
5. **Non-Blocking Background Indexing**: Triggered via `asyncio.create_task` with mutex locking per repo. Status transitions (`NOT_INDEXED` ➔ `INDEXING` ➔ `INDEXED` / `STALE` / `FAILED`) are persisted to Neon PostgreSQL.

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
| `NEXTJS_URL` | `http://localhost:5050` | Allowed origin for Next.js frontend and webhook gateway. |
| `ALLOWED_ORIGINS` | `""` | Optional comma-separated list of additional allowed CORS origins. |

---

## API Reference

### Health & Direct LLM Endpoints
- `GET /`: Service health check (`{"message": "PRism AI service is running"}`).
- `POST /api/github/pr-event`: Receives normalized PR webhook payloads forwarded from Next.js.
- `POST /api/ai/test`: Raw prompt completion via OpenRouter.
- `POST /api/ai/test-structured`: Validates structured code review output according to `ReviewResponse` schema.

### Code-Aware RAG Endpoints
- `POST /api/rag/index`: Trigger non-blocking repository indexing (supports `force_full: true/false`).
- `GET /api/rag/status?repo_name=owner/repo`: Query repository indexing state, commit SHA, and chunk count.
- `POST /api/rag/push-event`: Marks repository index as `STALE` when new commits arrive.
- `POST /api/rag/retrieve`: Vector search returning top-K relevant code chunks scoped to a repository.
- `POST /api/rag/query`: Codebase Q&A combining vector retrieval with OpenRouter LLM generation and source citations.

---

## Local Development & Testing

```bash
# 1. Activate Python virtual environment
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start Uvicorn development server
uvicorn app.main:app --port 8000 --reload

# 4. Run RAG unit tests (chunking, token counting, structural separators, filtering)
python scripts/test_rag.py
```



