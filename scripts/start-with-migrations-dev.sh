#!/bin/sh
# Development startup script that runs database migrations before starting the application in watch mode
# Similar to start-with-migrations.sh but for development

# Check if database connection is available
if [ -z "$DATABASE_HOST" ] || [ -z "$DATABASE_NAME" ]; then
  echo "⚠️  Database environment variables not set. Starting application without migrations..."
  exec npm run start:dev
fi

# Check if migration script exists
if [ ! -f "scripts/run-migrations.js" ]; then
  echo "❌ ERROR: Migration script not found at scripts/run-migrations.js"
  echo "⚠️  Starting application without migrations (this may cause errors)..."
  exec npm run start:dev
fi

# Check if migrations directory exists
if [ ! -d "src/database/migrations" ]; then
  echo "❌ ERROR: Migrations directory not found at src/database/migrations"
  echo "⚠️  Starting application without migrations (this may cause errors)..."
  exec npm run start:dev
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
echo "🚀 Starting application in development mode..."
exec npm run start:dev
