#!/usr/bin/env bash
# Arranca FastAPI (puerto 8000) y Next.js (puerto 3000) en paralelo.
# Uso: ./start.sh
set -e
cd "$(dirname "$0")"

# Kill previos si estaban corriendo
pkill -f "server.py" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
sleep 1

echo "Arrancando FastAPI en puerto 8000..."
.venv/bin/python server.py &
FASTAPI_PID=$!

echo "Arrancando Next.js en puerto 3000..."
npm run dev &
NEXTJS_PID=$!

echo ""
echo "  FastAPI  → http://localhost:8000"
echo "  Frontend → http://localhost:3000"
echo ""
echo "PIDs: FastAPI=$FASTAPI_PID  Next.js=$NEXTJS_PID"
echo "Para detener: Ctrl+C  (o: kill $FASTAPI_PID $NEXTJS_PID)"

trap "kill $FASTAPI_PID $NEXTJS_PID 2>/dev/null; exit" INT TERM
wait
