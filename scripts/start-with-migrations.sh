#!/bin/sh
# Startup script that automatically runs database migrations before starting the application
# Uses SQL migration files to ensure database schema is up-to-date on container startup

# Check if database connection is available
if [ -z "$DATABASE_HOST" ] || [ -z "$DATABASE_NAME" ]; then
  echo "⚠️  Database environment variables not set. Skipping migrations and starting application..."
  exec node dist/main
fi

# Check if migration script exists
if [ ! -f "scripts/run-migrations.js" ]; then
  echo "⚠️  Migration script not found. Starting application without migrations..."
  exec node dist/main
fi

# Check if migrations directory exists
if [ ! -d "src/database/migrations" ]; then
  echo "⚠️  Migrations directory not found. Starting application without migrations..."
  exec node dist/main
fi

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
  echo "⚠️  Migrations failed after $MIGRATION_RETRIES attempts. Starting application anyway..."
  echo "⚠️  You may need to run migrations manually."
fi

# Always start the application, even if migrations failed
echo "🚀 Starting application..."
exec node dist/main

