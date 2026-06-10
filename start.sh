#!/usr/bin/env bash
# ── Hesabu Dev Startup Script ──────────────────────────────────────────────
# Run from the project root. Requires Python venv and Node already set up.
# Usage: bash start.sh

set -e

echo "Starting Hesabu development environment..."

# 1. Start PostgreSQL + Redis via Docker Compose
docker compose up -d
echo "Waiting for DB to be ready..."
sleep 3

# 2. Django — run in background
cd backend
source .venv/Scripts/activate 2>/dev/null || source .venv/bin/activate
python manage.py migrate --run-syncdb
python manage.py runserver 0.0.0.0:8001 &
DJANGO_PID=$!
echo "Django running (PID $DJANGO_PID)"

# 3. Celery worker — run in background
celery -A hesabu worker -l info &
CELERY_PID=$!
echo "Celery worker running (PID $CELERY_PID)"

cd ..

# 4. React frontend
cd frontend
npm run dev &
VITE_PID=$!
echo "Vite dev server running (PID $VITE_PID)"
cd ..

echo ""
echo "════════════════════════════════════════"
echo "  Hesabu is running!"
echo "  Frontend: http://localhost:5175"
echo "  Backend:  http://localhost:8001"
echo "  Admin:    http://localhost:8001/admin"
echo "════════════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop all services."

trap "kill $DJANGO_PID $CELERY_PID $VITE_PID 2>/dev/null; docker compose stop" EXIT
wait
