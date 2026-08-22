#!/bin/bash
set -e

# Start API server in background
PORT=3001 pnpm --filter @workspace/api-server run dev &
API_PID=$!

# Trap to kill API server when this script exits
trap "kill $API_PID 2>/dev/null; exit" SIGTERM SIGINT EXIT

# Start frontend (this is what the workflow waits on for port 5000)
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/al-shaibia-admin run dev
