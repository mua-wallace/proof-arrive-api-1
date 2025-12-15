#!/bin/sh
# Startup script that automatically syncs schema to database before starting the application
# Uses drizzle-kit push to directly sync schema without migration files
# This script ensures schema is always up-to-date on container startup

echo "=========================================="
echo "🚀 Starting application with automatic schema sync..."
echo "=========================================="

# Check if database connection is available
if [ -z "$DATABASE_HOST" ] || [ -z "$DATABASE_NAME" ]; then
  echo "⚠ Warning: Database environment variables not set."
  echo "   DATABASE_HOST: ${DATABASE_HOST:-not set}"
  echo "   DATABASE_NAME: ${DATABASE_NAME:-not set}"
  echo "   Starting application without schema sync."
  echo "=========================================="
  exec node dist/main
fi

# Check if drizzle config exists
if [ ! -f "src/database/drizzle.config.ts" ]; then
  echo "⚠ Warning: Drizzle config not found at src/database/drizzle.config.ts"
  echo "   Schema sync will be skipped. Starting application anyway..."
  echo "=========================================="
  exec node dist/main
fi

# Sync schema using drizzle-kit push with retries
echo "📊 Syncing database schema..."
echo "   Database: ${DATABASE_HOST}:${DATABASE_PORT:-5432}/${DATABASE_NAME}"
echo "=========================================="

SYNC_RETRIES=5
SYNC_COUNT=0
SYNC_SUCCESS=false

# Wait a bit for database to be ready (if starting together)
sleep 2

while [ $SYNC_COUNT -lt $SYNC_RETRIES ] && [ "$SYNC_SUCCESS" = false ]; do
  SYNC_COUNT=$((SYNC_COUNT + 1))
  
  if [ $SYNC_COUNT -gt 1 ]; then
    echo "   Retry attempt $SYNC_COUNT/$SYNC_RETRIES..."
    sleep 3
  fi
  
  # Run schema sync (don't exit on error)
  if npx drizzle-kit push --config=src/database/drizzle.config.ts 2>&1; then
    echo "✓ Schema synced successfully!"
    SYNC_SUCCESS=true
  else
    SYNC_EXIT_CODE=$?
    if [ $SYNC_COUNT -lt $SYNC_RETRIES ]; then
      echo "⚠ Schema sync attempt $SYNC_COUNT failed (exit code: $SYNC_EXIT_CODE)"
      echo "   This might be normal if database is not ready yet. Retrying..."
    else
      echo "⚠ Schema sync failed after $SYNC_RETRIES attempts (exit code: $SYNC_EXIT_CODE)"
      echo "   This might be normal if:"
      echo "   - Schema is already up-to-date"
      echo "   - Database connection issues (will retry on next startup)"
      echo "   - Database is still initializing"
      echo "   Starting application anyway..."
    fi
  fi
done

# Always start the application, even if schema sync failed
echo "=========================================="
echo "🚀 Starting NestJS application..."
echo "=========================================="
exec node dist/main

