# PRism — Frontend (`frontend/`)

The **Frontend** is a single-page web application built with **React 19** and **Vite**. It provides a developer testing console for Phase 1 to interact with the LLM service and inspect structured findings before building the full review dashboard.

---

## Directory Structure

```text
frontend/
├── src/
│   ├── App.jsx        # Main application component & testing console
│   ├── App.css        # Component styles
│   ├── index.css      # Global styles & theme CSS variables
│   ├── main.jsx       # React entrypoint
│   └── assets/        # Static assets and icons
├── public/            # Static public assets
├── .env               # Local frontend environment variables (gitignored)
├── .env.example       # Frontend environment template
├── index.html         # HTML template
├── package.json       # Dependencies & npm scripts
└── vite.config.js     # Vite configuration
```

---

## Configuration & Environment Variables

Copy `frontend/.env.example` to `frontend/.env`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
| :--- | :--- | :--- |
| `VITE_API_URL` | `http://localhost:8080` | Base URL of the Node/Express backend gateway. |

---

## Features

- **Prompt Console**: Interactive textarea allowing custom prompts for LLM evaluation.
- **Text Testing**: Direct trigger for `POST /api/ai/test` to inspect raw model responses.
- **Structured Findings Review**: Triggers `POST /api/ai/test-structured` and renders structured issue cards complete with:
  - Severity Badges (`critical`, `high`, `medium`, `low`)
  - Category Labels (`security`, `correctness`, `performance`, `error_handling`, `code_quality`)
  - Code Line Numbers
  - Summary Title and Detailed Descriptions
- **Health Check**: One-click end-to-end connectivity check (`React -> Node -> FastAPI`).

---

## Running Locally

```bash
# Install dependencies
npm install

# Start Vite development server (with HMR)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```
