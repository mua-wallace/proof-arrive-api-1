#!/bin/sh
# Startup script that syncs schema to database before starting the application
# Uses drizzle-kit push to directly sync schema without migration files

set -e

echo "Starting application with schema sync check..."

# Check if database connection is available
if [ -z "$DATABASE_HOST" ] || [ -z "$DATABASE_NAME" ]; then
  echo "Warning: Database environment variables not set. Starting application without schema sync."
  exec node dist/main
fi

# Try to sync schema using drizzle-kit push
echo "Syncing database schema..."
if npx drizzle-kit push --config=src/database/drizzle.config.ts 2>&1; then
  echo "✓ Schema synced successfully!"
else
  echo "⚠ Schema sync failed or had warnings. Check the messages above."
  echo "Starting application anyway..."
fi

# Start the application
echo "Starting application..."
exec node dist/main

