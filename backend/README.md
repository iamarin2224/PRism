# PRism — Backend Service (`backend/`)

The **Backend Service** is a **Node.js + Express** server. It acts as the API Gateway, managing client requests, handling CORS, proxying requests to the AI service, and preparing for future GitHub App webhook events and database persistence.

---

## Directory Structure

```text
backend/
├── src/
│   └── index.js       # Express server, CORS configuration, and proxy routes
├── .env               # Local environment variables (gitignored)
├── .env.example       # Environment template
└── package.json       # Dependencies & npm scripts
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

---

## API Endpoints

### 1. `GET /`
Root health check endpoint.
- **Response:** `{"message": "PRism backend is running"}`

### 2. `GET /api/ai-health`
Proxies a health check request to the FastAPI AI service root (`GET /`).
- **Response:** `{"message": "PRism AI service is running"}`

### 3. `POST /api/ai/test`
Forwards raw text prompt requests to FastAPI (`POST /api/ai/test`).
- **Request Body:** `{"prompt": "string"}`
- **Response:** `{"response": "string"}`

### 4. `POST /api/ai/test-structured`
Forwards structured code review test requests to FastAPI (`POST /api/ai/test-structured`).
- **Request Body:** `{"code": "string"}` (optional)
- **Response:** `{"findings": [...]}`

---

## Running Locally

```bash
# Install dependencies
npm install

# Start development server with auto-reload (nodemon)
npm run dev

# Or start in production mode
npm start
```
