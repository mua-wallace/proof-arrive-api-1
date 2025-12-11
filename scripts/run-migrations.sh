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

# Run migrations using drizzle-kit
echo "Connecting to database: $DATABASE_HOST:$DATABASE_PORT/$DATABASE_NAME"
npx drizzle-kit migrate --config=src/database/drizzle.config.ts

echo "Migrations completed successfully!"

