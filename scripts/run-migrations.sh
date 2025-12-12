#!/bin/sh
# Script to run database migrations
# This script can be used at build time or runtime

set -e

echo "Running database migrations..."

# Check if database connection is available
if [ -z "$DATABASE_HOST" ] || [ -z "$DATABASE_NAME" ]; then
  echo "Warning: Database environment variables not set. Skipping migrations."
  echo "Migrations will need to be run manually or at container startup."
  exit 0
fi

echo "Connecting to database: $DATABASE_HOST:$DATABASE_PORT/$DATABASE_NAME"
echo "Database user: ${DATABASE_USERNAME:-postgres}"

# Check if Node.js is available
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js not found. Cannot run migrations."
  exit 1
fi

# Check if migration script exists
if [ ! -f "scripts/run-migrations.js" ]; then
  echo "Error: Migration script not found at scripts/run-migrations.js"
  echo "Current directory: $(pwd)"
  echo "Files in scripts/: $(ls -la scripts/ 2>/dev/null || echo 'scripts directory not found')"
  exit 1
fi

# Try Node.js migration runner first (more reliable, runs SQL files directly)
echo "Running Node.js migration script..."
if node scripts/run-migrations.js; then
  echo "✓ Migrations completed successfully!"
  exit 0
fi

# If Node.js script failed, show error and try drizzle-kit as fallback
EXIT_CODE=$?
echo "Node.js migration runner exited with code: $EXIT_CODE"
echo "Trying drizzle-kit as fallback..."

# Fallback to drizzle-kit migrate
if npx drizzle-kit migrate --config=src/database/drizzle.config.ts 2>&1; then
  echo "✓ Migrations completed successfully with drizzle-kit!"
  exit 0
else
  echo "✗ Error: Both migration methods failed. Check the error messages above."
  exit 1
fi

