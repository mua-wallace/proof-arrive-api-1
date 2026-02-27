#!/bin/bash
# Script to run all migration SQL files in order using psql
#
# With Docker (postgres in container, script on host):
#   DATABASE_HOST=localhost sh scripts/run-all-migrations.sh
# Or use: sh scripts/run-all-migrations-docker.sh

set -e  # Exit on error

# Database connection parameters (from environment or defaults)
# When running on host against Docker postgres, use DATABASE_HOST=localhost
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_USER="${DATABASE_USERNAME:-postgres}"
DB_PASSWORD="${DATABASE_PASSWORD:-postgres}"
DB_NAME="${DATABASE_NAME:-proof_arrive}"

# Build connection string
DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Migration directory
MIGRATIONS_DIR="src/database/migrations"

echo "=========================================="
echo "Running all migrations from: $MIGRATIONS_DIR"
echo "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
echo "=========================================="
echo ""

# Get all SQL files sorted numerically
MIGRATION_FILES=$(ls -1 "$MIGRATIONS_DIR"/*.sql | sort -V)

# Counter for tracking
TOTAL=$(echo "$MIGRATION_FILES" | wc -l | tr -d ' ')
CURRENT=0

# Run each migration file
for migration_file in $MIGRATION_FILES; do
  CURRENT=$((CURRENT + 1))
  filename=$(basename "$migration_file")
  
  echo "[$CURRENT/$TOTAL] Running: $filename"
  
  # Run the migration
  if PGPASSWORD="$DB_PASSWORD" psql "$DB_URL" -f "$migration_file" -v ON_ERROR_STOP=1; then
    echo "  ✓ Success"
  else
    echo "  ✗ Failed!"
    echo "  Migration failed at: $filename"
    exit 1
  fi
  echo ""
done

echo "=========================================="
echo "All migrations completed successfully!"
echo "=========================================="
