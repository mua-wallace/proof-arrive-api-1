#!/bin/sh
# Script to generate database migrations from schema changes
# This runs at build time

set -e

echo "Generating database migrations from schema changes..."

# Generate migrations using drizzle-kit
# This will create migration files in src/database/migrations/
npx drizzle-kit generate --config=src/database/drizzle.config.ts

echo "Migration generation completed!"

