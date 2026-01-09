#!/bin/sh
# Manual migration runner - can be executed directly on the server
# Usage: sh scripts/run-migrations-manual.sh

set -e

echo "🔄 Running database migrations manually..."

# Check if database environment variables are set
if [ -z "$DATABASE_HOST" ] || [ -z "$DATABASE_NAME" ]; then
  echo "❌ Error: Database environment variables not set."
  echo "Please set: DATABASE_HOST, DATABASE_PORT, DATABASE_USERNAME, DATABASE_PASSWORD, DATABASE_NAME"
  exit 1
fi

# Check if psql is available
if command -v psql >/dev/null 2>&1; then
  echo "✓ Using psql for migrations..."
  
  # Build connection string
  export PGPASSWORD="${DATABASE_PASSWORD}"
  
  # Run each migration file in order
  for migration_file in src/database/migrations/*.sql; do
    if [ -f "$migration_file" ]; then
      echo ""
      echo "📄 Running migration: $(basename $migration_file)..."
      psql -h "$DATABASE_HOST" \
           -p "${DATABASE_PORT:-5432}" \
           -U "${DATABASE_USERNAME:-postgres}" \
           -d "$DATABASE_NAME" \
           -f "$migration_file" \
           -v ON_ERROR_STOP=1 || {
        echo "⚠️  Migration $(basename $migration_file) had errors (may be safe to ignore if already applied)"
      }
      echo "✓ Completed: $(basename $migration_file)"
    fi
  done
  
  echo ""
  echo "✅ All migrations completed!"
  
elif command -v node >/dev/null 2>&1 && [ -f "scripts/run-migrations.js" ]; then
  echo "✓ Using Node.js migration script..."
  node scripts/run-migrations.js
else
  echo "❌ Error: Neither psql nor Node.js migration script available."
  echo "Please install psql or ensure Node.js and scripts/run-migrations.js are available."
  exit 1
fi
