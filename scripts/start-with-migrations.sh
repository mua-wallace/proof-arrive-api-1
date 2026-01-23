#!/bin/sh
# Startup script that automatically runs database migrations before starting the application
# Uses SQL migration files to ensure database schema is up-to-date on container startup

# Check if migrations were already run at build time
if [ -f "/tmp/.migrations-run-at-build" ]; then
  echo "✅ Migrations were already run at build time. Skipping runtime migrations."
  exec node dist/main
fi

# Check if database connection is available
if [ -z "$DATABASE_HOST" ] || [ -z "$DATABASE_NAME" ]; then
  echo "⚠️  Database environment variables not set. Skipping migrations and starting application..."
  echo "⚠️  WARNING: Migrations were not run at build time and cannot run at startup."
  exec node dist/main
fi

# Check if migration script exists
if [ ! -f "scripts/run-migrations.js" ]; then
  echo "❌ ERROR: Migration script not found at scripts/run-migrations.js"
  echo "Current directory: $(pwd)"
  echo "Files in scripts/: $(ls -la scripts/ 2>/dev/null || echo 'scripts directory not found')"
  echo "⚠️  Starting application without migrations (this may cause errors)..."
  exec node dist/main
fi

# Check if migrations directory exists
if [ ! -d "src/database/migrations" ]; then
  echo "❌ ERROR: Migrations directory not found at src/database/migrations"
  echo "Current directory: $(pwd)"
  echo "Looking for migrations in:"
  echo "  - $(pwd)/src/database/migrations"
  echo "  - /usr/src/app/src/database/migrations"
  echo "Files in src/database/: $(ls -la src/database/ 2>/dev/null || echo 'src/database directory not found')"
  echo "⚠️  Starting application without migrations (this may cause errors)..."
  exec node dist/main
fi

echo "✓ Migration script found: scripts/run-migrations.js"
echo "✓ Migrations directory found: src/database/migrations"
echo "  Migration files: $(ls src/database/migrations/*.sql 2>/dev/null | wc -l) SQL files"

MIGRATION_RETRIES=5
MIGRATION_COUNT=0
MIGRATION_SUCCESS=false

# Wait a bit for database to be ready (if starting together)
echo "⏳ Waiting for database to be ready..."
sleep 2

echo "🔄 Running database migrations..."

while [ $MIGRATION_COUNT -lt $MIGRATION_RETRIES ] && [ "$MIGRATION_SUCCESS" = false ]; do
  MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
  
  if [ $MIGRATION_COUNT -gt 1 ]; then
    echo "⏳ Retry attempt $MIGRATION_COUNT of $MIGRATION_RETRIES..."
    sleep 3
  fi
  
  # Run migrations using the migration script
  if node scripts/run-migrations.js; then
    MIGRATION_SUCCESS=true
    echo "✅ Migrations completed successfully!"
  else
    echo "⚠️  Migration attempt $MIGRATION_COUNT failed. Will retry..."
  fi
done

if [ "$MIGRATION_SUCCESS" = false ]; then
  echo "❌ ERROR: Migrations failed after $MIGRATION_RETRIES attempts!"
  echo "⚠️  The application will start, but database errors may occur."
  echo "⚠️  Please check the migration logs above and run migrations manually if needed."
  echo ""
  echo "To run migrations manually, use:"
  echo "  node scripts/run-migrations.js"
  echo ""
fi

# Always start the application, even if migrations failed
echo "🚀 Starting application..."
exec node dist/main

