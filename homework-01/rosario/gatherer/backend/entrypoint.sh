#!/bin/sh
set -e

# Run migrations on startup (CLAUDE.md §11). Retry briefly so we tolerate the DB
# coming up a moment after this container starts.
attempt=0
until alembic upgrade head; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 10 ]; then
        echo "alembic upgrade failed after $attempt attempts" >&2
        exit 1
    fi
    echo "DB not ready (attempt $attempt); retrying in 3s..."
    sleep 3
done

# Single worker: the in-process APScheduler must run in exactly one process,
# otherwise every scheduled job fires once per worker.
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
