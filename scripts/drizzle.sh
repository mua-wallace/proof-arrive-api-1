#!/bin/sh
# Helper script to run drizzle-kit commands with the correct config path
# Usage: sh scripts/drizzle.sh [push|generate|migrate|studio]

set -e

CONFIG_PATH="src/database/drizzle.config.ts"

# Check if drizzle config exists
if [ ! -f "$CONFIG_PATH" ]; then
  echo "Error: Drizzle config not found at $CONFIG_PATH"
  echo "Current directory: $(pwd)"
  exit 1
fi

# Get the command (default to push)
COMMAND="${1:-push}"

case "$COMMAND" in
  push)
    echo "Running drizzle-kit push..."
    npx drizzle-kit push --config="$CONFIG_PATH"
    ;;
  generate)
    echo "Running drizzle-kit generate..."
    npx drizzle-kit generate --config="$CONFIG_PATH"
    ;;
  migrate)
    echo "Running drizzle-kit migrate..."
    npx drizzle-kit migrate --config="$CONFIG_PATH"
    ;;
  studio)
    echo "Running drizzle-kit studio..."
    npx drizzle-kit studio --config="$CONFIG_PATH"
    ;;
  *)
    echo "Usage: sh scripts/drizzle.sh [push|generate|migrate|studio]"
    echo "  push     - Push schema to database (default)"
    echo "  generate - Generate migration files"
    echo "  migrate  - Run migrations"
    echo "  studio   - Open Drizzle Studio"
    exit 1
    ;;
esac

