#!/bin/bash
# Run all migration SQL files using the postgres Docker container.
# Uses docker-compose-dev.yml (postgres service). Loads .env for credentials.
#
# Usage (from repo root):
#   sh scripts/run-all-migrations-docker.sh
#
# Requires: Docker Compose, postgres service running (e.g. docker compose -f docker-compose-dev.yml up -d postgres)

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/src/database/migrations"
COMPOSE_FILE="${1:-docker-compose-dev.yml}"

cd "$REPO_ROOT"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Error: $COMPOSE_FILE not found. Run this script from the repo root."
  exit 1
fi

echo "=========================================="
echo "Running all migrations via Docker"
echo "Compose file: $COMPOSE_FILE"
echo "Migrations:   $MIGRATIONS_DIR"
echo "=========================================="
echo ""

# Run psql inside the postgres container with migrations volume-mounted.
# Uses POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB from compose (from .env).
docker compose -f "$COMPOSE_FILE" run --rm \
  -v "$MIGRATIONS_DIR:/migrations:ro" \
  postgres \
  sh -c 'for f in $(ls -1 /migrations/*.sql | sort -V); do
    echo "Running: $(basename "$f")"
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$f" -v ON_ERROR_STOP=1 || exit 1
  done
  echo "All migrations completed successfully."'

echo ""
echo "=========================================="
echo "Done."
echo "=========================================="
