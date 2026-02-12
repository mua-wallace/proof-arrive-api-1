#!/bin/bash
# Script to generate and apply migrations
# This handles the interactive prompts from drizzle-kit

echo "Generating migration..."
echo "Note: Relations (relations.ts) don't require database migrations"
echo "They are TypeScript definitions for Drizzle's relational query API"
echo ""
echo "If drizzle-kit asks about columns, select the appropriate option:"
echo "- For existing columns: select 'create column' if it's new, or 'rename' if it was renamed"
echo "- For refresh_tokens: select 'No, add the constraint without truncating'"
echo ""
echo "Running drizzle-kit generate..."
npx drizzle-kit generate --config=src/database/drizzle.config.ts

echo ""
echo "If migration was generated successfully, you can apply it with:"
echo "npx drizzle-kit migrate --config=src/database/drizzle.config.ts"
