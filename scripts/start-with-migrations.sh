#!/bin/sh
# Startup script that runs migrations before starting the application
# This is useful if migrations weren't run at build time

set -e

echo "Starting application with migration check..."

# Check if database connection is available
if [ -z "$DATABASE_HOST" ] || [ -z "$DATABASE_NAME" ]; then
  echo "Warning: Database environment variables not set. Starting application without migrations."
  exec node dist/main
fi

# Try to run migrations (will skip if already applied)
echo "Checking and running pending migrations..."
npx drizzle-kit migrate --config=src/database/drizzle.config.ts || {
  echo "Warning: Migration check failed. Starting application anyway..."
}

# Start the application
echo "Starting application..."
exec node dist/main

