#!/bin/sh
# Test script to verify migration setup

echo "=== Migration Setup Test ==="
echo ""

echo "1. Checking environment variables..."
echo "   DATABASE_HOST: ${DATABASE_HOST:-NOT SET}"
echo "   DATABASE_PORT: ${DATABASE_PORT:-NOT SET}"
echo "   DATABASE_USERNAME: ${DATABASE_USERNAME:-NOT SET}"
echo "   DATABASE_PASSWORD: ${DATABASE_PASSWORD:+SET (hidden)}"
echo "   DATABASE_NAME: ${DATABASE_NAME:-NOT SET}"
echo ""

echo "2. Checking migration files..."
if [ -d "src/database/migrations" ]; then
  echo "   ✓ Migrations directory exists"
  MIGRATION_FILES=$(find src/database/migrations -name "*.sql" 2>/dev/null | wc -l)
  echo "   Found $MIGRATION_FILES SQL file(s)"
  if [ "$MIGRATION_FILES" -gt 0 ]; then
    echo "   Migration files:"
    find src/database/migrations -name "*.sql" 2>/dev/null | while read file; do
      echo "     - $file"
    done
  fi
else
  echo "   ✗ Migrations directory not found!"
fi
echo ""

echo "3. Checking Node.js migration script..."
if [ -f "scripts/run-migrations.js" ]; then
  echo "   ✓ Migration script exists"
  if command -v node >/dev/null 2>&1; then
    echo "   ✓ Node.js is available"
    node --version
  else
    echo "   ✗ Node.js not found!"
  fi
else
  echo "   ✗ Migration script not found!"
fi
echo ""

echo "4. Checking drizzle config..."
if [ -f "src/database/drizzle.config.ts" ]; then
  echo "   ✓ Drizzle config exists"
else
  echo "   ✗ Drizzle config not found!"
fi
echo ""

echo "5. Current working directory:"
pwd
echo ""

echo "6. Files in scripts directory:"
ls -la scripts/ 2>/dev/null || echo "   scripts directory not found"
echo ""

echo "=== Test Complete ==="

