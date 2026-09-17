#!/usr/bin/env bash

# Resolve project root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}           Starting PRism Services (Phase 0)        ${NC}"
echo -e "${CYAN}====================================================${NC}"

# Check for .env files and copy if missing
if [ ! -f "backend/.env" ]; then
  echo -e "${YELLOW}[Setup] backend/.env not found, copying from .env.example...${NC}"
  cp backend/.env.example backend/.env
fi

if [ ! -f "frontend/.env" ]; then
  echo -e "${YELLOW}[Setup] frontend/.env not found, copying from .env.example...${NC}"
  cp frontend/.env.example frontend/.env
fi

# Locate uvicorn binary
if [ -f "ai/.venv/bin/uvicorn" ]; then
  UVICORN_CMD="$ROOT_DIR/ai/.venv/bin/uvicorn"
elif [ -f "ai/venv/bin/uvicorn" ]; then
  UVICORN_CMD="$ROOT_DIR/ai/venv/bin/uvicorn"
elif command -v uvicorn &> /dev/null; then
  UVICORN_CMD="uvicorn"
else
  echo -e "${RED}[Error] uvicorn not found. Please setup python virtual environment in ai/.venv${NC}"
  exit 1
fi

PIDS=()

cleanup() {
  echo -e "\n${YELLOW}Shutting down all PRism services...${NC}"
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
    fi
  done
  wait 2>/dev/null
  echo -e "${GREEN}All services stopped cleanly.${NC}"
  exit 0
}

# Trap termination signals
trap cleanup SIGINT SIGTERM EXIT

# 1. Start AI service (FastAPI)
echo -e "${BLUE}[AI Service]${NC} Starting FastAPI on http://localhost:8000..."
(cd ai && "$UVICORN_CMD" app.main:app --port 8000 --reload 2>&1 | sed $'s/^/\x1b[34m[AI 8000]\x1b[0m /') &
PIDS+=($!)

# 2. Start Backend (Node/Express)
echo -e "${GREEN}[Backend]${NC} Starting Express backend on http://localhost:8080..."
(cd backend && npm run dev 2>&1 | sed $'s/^/\x1b[32m[Backend 8080]\x1b[0m /') &
PIDS+=($!)

# 3. Start Frontend (React/Vite)
echo -e "${MAGENTA}[Frontend]${NC} Starting Vite frontend on http://localhost:5173..."
(cd frontend && npm run dev 2>&1 | sed $'s/^/\x1b[35m[Frontend 5173]\x1b[0m /') &
PIDS+=($!)

echo -e "${CYAN}----------------------------------------------------${NC}"
echo -e "${GREEN}✓ All services launched!${NC}"
echo -e "  • Frontend:    ${MAGENTA}http://localhost:5173${NC}"
echo -e "  • Backend:     ${GREEN}http://localhost:8080${NC}"
echo -e "  • AI Service:  ${BLUE}http://localhost:8000${NC}"
echo -e "${CYAN}Press Ctrl+C at any time to stop all services.${NC}"
echo -e "${CYAN}----------------------------------------------------${NC}"

# Wait for child processes
wait
