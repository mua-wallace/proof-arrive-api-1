#!/bin/sh
# Script to run database migrations directly using SQL files
# This bypasses drizzle-kit sync issues and runs migrations in order

set -e

echo "Running database migrations directly from SQL files..."

# Check if database connection is available
if [ -z "$DATABASE_HOST" ] || [ -z "$DATABASE_NAME" ]; then
  echo "Warning: Database environment variables not set. Skipping migrations."
  exit 0
fi

# Check if psql is available (should be in postgres container or installed)
if ! command -v psql >/dev/null 2>&1; then
  echo "Error: psql not found. Cannot run migrations directly."
  echo "Falling back to drizzle-kit migrate..."
  npx drizzle-kit migrate --config=src/database/drizzle.config.ts || {
    echo "Warning: Migration failed. Check the error messages above."
    exit 1
  }
  exit 0
fi

# Build connection string
PGPASSWORD="${DATABASE_PASSWORD}" psql -h "${DATABASE_HOST}" -p "${DATABASE_PORT:-5432}" -U "${DATABASE_USERNAME:-postgres}" -d "${DATABASE_NAME}" <<EOF
-- Run migrations in order
\i src/database/migrations/0000_complete_thena.sql
\i src/database/migrations/0001_update_centers_schema.sql
\i src/database/migrations/0002_add_created_by_fields.sql
EOF

echo "Migrations completed successfully!"

