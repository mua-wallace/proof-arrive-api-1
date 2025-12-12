#!/bin/sh
# Script to sync database schema using drizzle-kit push
# This directly syncs the schema without using migration files

set -e

echo "Syncing database schema..."

# Check if database connection is available
if [ -z "$DATABASE_HOST" ] || [ -z "$DATABASE_NAME" ]; then
  echo "Warning: Database environment variables not set. Skipping schema sync."
  echo "Schema sync will need to be run manually or at container startup."
  exit 0
fi

echo "Connecting to database: $DATABASE_HOST:$DATABASE_PORT/$DATABASE_NAME"
echo "Database user: ${DATABASE_USERNAME:-postgres}"

# Check if drizzle config exists
if [ ! -f "src/database/drizzle.config.ts" ]; then
  echo "Error: Drizzle config not found at src/database/drizzle.config.ts"
  echo "Current directory: $(pwd)"
  exit 1
fi

# Use drizzle-kit push to sync schema directly
echo "Running drizzle-kit push to sync schema..."
if npx drizzle-kit push --config=src/database/drizzle.config.ts 2>&1; then
  echo "✓ Schema synced successfully!"
  exit 0
else
  echo "✗ Error: Schema sync failed. Check the error messages above."
  exit 1
fi

