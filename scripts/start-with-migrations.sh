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

# Try to run migrations using Node.js script (more reliable)
# Falls back to drizzle-kit if Node script fails
echo "Checking and running pending migrations..."

# First, try the Node.js migration runner (runs SQL files directly)
if node scripts/run-migrations.js 2>&1; then
  echo "Migrations applied successfully using Node.js runner!"
else
  echo "Node.js migration runner failed, trying drizzle-kit..."
  
  # Fallback to drizzle-kit migrate
  if npx drizzle-kit migrate --config=src/database/drizzle.config.ts 2>&1; then
    echo "Migrations applied successfully using drizzle-kit!"
  else
    echo "Warning: All migration methods failed. This might be normal if migrations were already applied."
    echo "Check the error messages above for details."
  fi
fi

# Start the application
echo "Starting application..."
exec node dist/main

