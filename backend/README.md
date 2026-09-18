# PRism — Backend Service (`backend/`)

The **Backend Service** is a **Node.js + Express** server. It acts as the API Gateway, managing client requests, verifying incoming GitHub webhooks via HMAC-SHA256, handling CORS, proxying requests to the AI service, and preparing for automated review orchestration.

---

## Directory Structure

```text
backend/
├── src/
│   ├── index.js           # Express server, CORS configuration, and route registrations
│   └── webhook.js         # GitHub HMAC signature verification & PR event parsing
├── scripts/
│   └── test-webhook.js    # Comprehensive local webhook test suite (9 test cases)
├── .env                   # Local environment variables (gitignored)
├── .env.example           # Environment template
└── package.json           # Dependencies & npm scripts
```

---

## Configuration & Environment Variables

Environment variables are loaded using `dotenv` in [`src/index.js`](file:///Users/arindas/Coding/Projects/PRism/backend/src/index.js).

Copy `backend/.env.example` to `backend/.env`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `8080` | Port on which the Express server listens. |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed origin for CORS from the React frontend. |
| `AI_SERVICE_URL` | `http://localhost:8000` | Base URL of the FastAPI AI Service. |
| `GITHUB_WEBHOOK_SECRET` | `development_webhook_secret` | HMAC secret for verifying `X-Hub-Signature-256`. |

---

## GitHub Webhook Security & Processing

### 1. Signature Verification (`X-Hub-Signature-256`)
- GitHub generates an HMAC-SHA256 signature formatted as `sha256=<hex_hash>`.
- The backend preserves the raw request buffer via `express.json({ verify: (req, res, buf) => { req.rawBody = buf; } })`.
- Node's `crypto.timingSafeEqual` performs a constant-time comparison to prevent timing attacks.
- Requests without a valid signature are rejected with **HTTP 401 Unauthorized** before any payload is trusted.

### 2. Event Filtering
- **Trigger Actions:** `opened`, `synchronize`, `reopened` on `X-GitHub-Event: pull_request`. These are normalized and forwarded to FastAPI (`POST /api/github/pr-event`).
- **Ignored Actions:** Non-review actions (e.g. `closed`, `labeled`, `edited`) return **HTTP 200** with `status: "ignored"`.
- **System Events:** `ping` events return **HTTP 200** with `status: "pong"`.

---

## API Endpoints

### 1. `POST /api/github/webhook`
Primary webhook ingestion endpoint for GitHub.
- **Headers:** `X-Hub-Signature-256`, `X-GitHub-Event`, `X-GitHub-Delivery`
- **Responses:**
  - `200 OK` — Valid event processed (`success`, `pong`, or `ignored`)
  - `400 Bad Request` — Missing `X-GitHub-Event` header
  - `401 Unauthorized` — Missing or invalid HMAC signature

### 2. `GET /`
Root health check endpoint.

### 3. `GET /api/ai-health`
Proxies a health check request to the FastAPI AI service root (`GET /`).

### 4. `POST /api/ai/test` & `POST /api/ai/test-structured`
Proxies developer LLM testing requests to FastAPI.

---

## Running & Testing

```bash
# Start development server
npm run dev

# Run the 9-case webhook test suite
npm run test:webhook
```
