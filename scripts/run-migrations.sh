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

# Try Node.js migration runner first (more reliable, runs SQL files directly)
if node scripts/run-migrations.js; then
  echo "Migrations completed successfully!"
  exit 0
fi

# Fallback to drizzle-kit migrate
echo "Node.js migration runner failed, trying drizzle-kit..."
if npx drizzle-kit migrate --config=src/database/drizzle.config.ts; then
  echo "Migrations completed successfully!"
else
  echo "Error: Migration failed. Check the error messages above."
  exit 1
fi

