#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

SERVER_PORT=3002
CLIENT_PORT=5174
PIDS=()

cleanup() {
  echo -e "\n${YELLOW}Stopping services...${NC}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  echo -e "${GREEN}All services stopped.${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

echo -e "${CYAN}=== OneRich Startup ===${NC}"

# Kill process on a port
kill_port() {
  local port=$1 name=$2
  local pids
  pids=$(lsof -i :"$port" -t 2>/dev/null) || true
  if [ -n "$pids" ]; then
    echo -e "${YELLOW}[$name] Port $port in use, killing...${NC}"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
    pids=$(lsof -i :"$port" -t 2>/dev/null) || true
    if [ -n "$pids" ]; then
      echo -e "${RED}[$name] Failed to free port $port${NC}"
      exit 1
    fi
  fi
  echo -e "${GREEN}[$name] Port $port available${NC}"
}

# Build server
echo -e "${CYAN}[Server] Building...${NC}"
cd "$SCRIPT_DIR/server" && npm run build
cd "$SCRIPT_DIR"

# Free ports
kill_port $SERVER_PORT "Server"
kill_port $CLIENT_PORT "Client"

# Start server
echo -e "${CYAN}[Server] Starting...${NC}"
node "$SCRIPT_DIR/server/dist/index.js" &
PIDS+=($!)

# Wait for server
echo -e "${CYAN}[Server] Waiting...${NC}"
for i in $(seq 1 30); do
  if curl -sf http://localhost:$SERVER_PORT/api/xv/dates > /dev/null 2>&1; then
    echo -e "${GREEN}[Server] Ready at http://localhost:$SERVER_PORT${NC}"
    break
  fi
  sleep 1
done

# Start client
echo -e "${CYAN}[Client] Starting...${NC}"
cd "$SCRIPT_DIR/client" && npx vite &
PIDS+=($!)
cd "$SCRIPT_DIR"

# Wait for client
echo -e "${CYAN}[Client] Waiting...${NC}"
for i in $(seq 1 30); do
  if curl -sf http://localhost:$CLIENT_PORT > /dev/null 2>&1; then
    echo -e "${GREEN}[Client] Ready at http://localhost:$CLIENT_PORT${NC}"
    break
  fi
  sleep 1
done

echo ""
echo -e "${GREEN}=== All services running ===${NC}"
echo -e "  Client: http://localhost:${CLIENT_PORT}"
echo -e "  Server: http://localhost:${SERVER_PORT}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"

wait
