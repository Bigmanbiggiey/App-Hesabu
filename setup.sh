#!/usr/bin/env bash
# ── Hesabu First-Time Setup ────────────────────────────────────────────────
# Run once from the project root to install all dependencies.
# Usage: bash setup.sh

set -e

echo "Setting up Hesabu..."

# 1. Docker services
docker compose up -d
echo "Docker services started."

# 2. Python virtual environment
cd backend
python -m venv .venv
source .venv/Scripts/activate 2>/dev/null || source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
echo "Python dependencies installed."

# 3. Django setup
python manage.py migrate
python manage.py collectstatic --noinput

echo ""
echo "Create a superuser? (y/n)"
read -r answer
if [[ "$answer" == "y" ]]; then
  python manage.py createsuperuser
fi

cd ..

# 4. Node dependencies
cd frontend
npm install
echo "Node dependencies installed."
cd ..

echo ""
echo "════════════════════════════════════════"
echo "  Setup complete!"
echo "  Run: bash start.sh"
echo "════════════════════════════════════════"
