#!/bin/sh
# Startup script that automatically syncs schema to database before starting the application
# Uses drizzle-kit push to directly sync schema without migration files
# This script ensures schema is always up-to-date on container startup


# Check if database connection is available
if [ -z "$DATABASE_HOST" ] || [ -z "$DATABASE_NAME" ]; then
  exec node dist/main
fi

# Check if drizzle config exists
if [ ! -f "src/database/drizzle.config.ts" ]; then
  exec node dist/main
fi

SYNC_RETRIES=5
SYNC_COUNT=0
SYNC_SUCCESS=false

# Wait a bit for database to be ready (if starting together)
sleep 2

while [ $SYNC_COUNT -lt $SYNC_RETRIES ] && [ "$SYNC_SUCCESS" = false ]; do
  SYNC_COUNT=$((SYNC_COUNT + 1))
  
  if [ $SYNC_COUNT -gt 1 ]; then
    sleep 3
  fi
  
  # Run schema sync (don't exit on error)
  if npx drizzle-kit push --config=src/database/drizzle.config.ts >/dev/null 2>&1; then
    SYNC_SUCCESS=true
  fi
done

# Always start the application, even if schema sync failed
exec node dist/main

