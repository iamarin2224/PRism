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
echo -e "${CYAN}           Starting PRism Services (Next.js)        ${NC}"
echo -e "${CYAN}====================================================${NC}"

# Check for root .env file and copy from .env.example if missing
if [ ! -f ".env" ]; then
  echo -e "${YELLOW}[Setup] .env not found, copying from .env.example...${NC}"
  cp .env.example .env
fi

# Locate uvicorn binary for AI service
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

# 1. Start AI service (FastAPI) on port 8000
echo -e "${BLUE}[AI Service]${NC} Starting FastAPI on http://localhost:8000..."
(cd ai && "$UVICORN_CMD" app.main:app --port 8000 --reload 2>&1 | sed $'s/^/\x1b[34m[AI 8000]\x1b[0m /') &
PIDS+=($!)

# 2. Start Next.js (Frontend + API Routes) on port 5050
echo -e "${GREEN}[Next.js]${NC} Starting Next.js app on http://localhost:5050..."
(npm run dev 2>&1 | sed $'s/^/\x1b[32m[Next.js 5050]\x1b[0m /') &
PIDS+=($!)

echo -e "${CYAN}----------------------------------------------------${NC}"
echo -e "${GREEN}✓ All services launched!${NC}"
echo -e "  • Next.js App:  ${GREEN}http://localhost:5050${NC} (UI & API Routes)"
echo -e "  • AI Service:   ${BLUE}http://localhost:8000${NC} (FastAPI / OpenRouter)"
echo -e "${CYAN}Press Ctrl+C at any time to stop all services.${NC}"
echo -e "${CYAN}----------------------------------------------------${NC}"

# Wait for child processes
wait
