#!/bin/bash
# Run all migration SQL files using a temporary postgres client container.
# Works with production setup where database is external (not in docker-compose).
#
# Usage (on server):
#   sh scripts/run-all-migrations-production.sh
#
# Or with custom compose file:
#   sh scripts/run-all-migrations-production.sh docker-compose.yml
#
# Requires:
#   - Docker installed
#   - Environment variables set (DATABASE_HOST, DATABASE_PORT, etc.)
#   - Or .env file with database credentials

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/src/database/migrations"
COMPOSE_FILE="${1:-docker-compose.yml}"

cd "$REPO_ROOT"

# Load environment variables from .env if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Database connection parameters (from environment or defaults)
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_USER="${DATABASE_USERNAME:-postgres}"
DB_PASSWORD="${DATABASE_PASSWORD:-postgres}"
DB_NAME="${DATABASE_NAME:-proof_arrive}"

echo "=========================================="
echo "Running all migrations via Docker (Production)"
echo "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
echo "Migrations: $MIGRATIONS_DIR"
echo "=========================================="
echo ""

# Use postgres:alpine image as a client to connect to external database
# Mount migrations directory and run each SQL file
docker run --rm \
  -v "$MIGRATIONS_DIR:/migrations:ro" \
  -e PGPASSWORD="$DB_PASSWORD" \
  postgres:16-alpine \
  sh -c "
    for f in \$(ls -1 /migrations/*.sql | sort -V); do
      echo \"Running: \$(basename \"\$f\")\"
      psql -h \"$DB_HOST\" -p \"$DB_PORT\" -U \"$DB_USER\" -d \"$DB_NAME\" -f \"\$f\" -v ON_ERROR_STOP=1 || exit 1
    done
    echo \"All migrations completed successfully.\"
  "

echo ""
echo "=========================================="
echo "Done."
echo "=========================================="
