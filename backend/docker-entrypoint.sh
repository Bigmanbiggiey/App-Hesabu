#!/usr/bin/env bash
set -e

# Only the gunicorn (web) process runs migrations/collectstatic on startup —
# celery-worker/celery-beat share this image but would otherwise race
# migrations against each other and against the web container on every restart.
if [ "$1" = "gunicorn" ]; then
  python manage.py migrate --noinput
  python manage.py collectstatic --noinput
fi

exec "$@"
