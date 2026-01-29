#!/bin/sh
# Startup script that automatically runs database migrations before starting the application
# Uses SQL migration files to ensure database schema is up-to-date on container startup

echo "=== Container Startup ==="
echo "Current directory: $(pwd)"
echo "Working directory: $(pwd)"
echo ""

# Check if migrations were already run at build time
# Note: We still run migrations at startup to ensure they're up-to-date
# This is safer than skipping, especially if new migrations were added
if [ -f "/tmp/.migrations-run-at-build" ]; then
  echo "✅ Migrations were run at build time."
  echo "⚠️  However, we'll still check for pending migrations at startup to ensure schema is up-to-date."
  echo ""
fi

# Log environment variables (without exposing passwords)
echo "=== Database Configuration ==="
echo "DATABASE_HOST: ${DATABASE_HOST:-NOT SET}"
echo "DATABASE_PORT: ${DATABASE_PORT:-NOT SET}"
echo "DATABASE_USERNAME: ${DATABASE_USERNAME:-NOT SET}"
echo "DATABASE_PASSWORD: ${DATABASE_PASSWORD:+SET (hidden)}"
echo "DATABASE_NAME: ${DATABASE_NAME:-NOT SET}"
echo ""

# Check if database connection is available
if [ -z "$DATABASE_HOST" ] || [ -z "$DATABASE_NAME" ]; then
  echo "⚠️  Database environment variables not set. Skipping migrations and starting application..."
  echo "⚠️  WARNING: Migrations were not run at build time and cannot run at startup."
  echo "⚠️  Required: DATABASE_HOST and DATABASE_NAME"
  exec node dist/main
fi

# Check if migration script exists
echo "=== Checking Migration Files ==="
if [ ! -f "scripts/run-migrations.js" ]; then
  echo "❌ ERROR: Migration script not found at scripts/run-migrations.js"
  echo "Current directory: $(pwd)"
  echo "Files in scripts/: $(ls -la scripts/ 2>/dev/null || echo 'scripts directory not found')"
  echo "⚠️  Starting application without migrations (this may cause errors)..."
  exec node dist/main
fi
echo "✓ Migration script found: scripts/run-migrations.js"

# Check if migrations directory exists
MIGRATIONS_DIR="src/database/migrations"
if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "❌ ERROR: Migrations directory not found at $MIGRATIONS_DIR"
  echo "Current directory: $(pwd)"
  echo "Looking for migrations in:"
  echo "  - $(pwd)/$MIGRATIONS_DIR"
  echo "  - /usr/src/app/$MIGRATIONS_DIR"
  echo "Files in src/database/: $(ls -la src/database/ 2>/dev/null || echo 'src/database directory not found')"
  echo "Files in src/: $(ls -la src/ 2>/dev/null || echo 'src directory not found')"
  echo "⚠️  Starting application without migrations (this may cause errors)..."
  exec node dist/main
fi

MIGRATION_COUNT=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l || echo "0")
echo "✓ Migrations directory found: $MIGRATIONS_DIR"
echo "  Migration files: $MIGRATION_COUNT SQL files"

if [ "$MIGRATION_COUNT" -eq "0" ]; then
  echo "⚠️  WARNING: No SQL migration files found in $MIGRATIONS_DIR"
  echo "  Listing directory contents:"
  ls -la "$MIGRATIONS_DIR" 2>/dev/null || echo "  Directory listing failed"
fi
echo ""

MIGRATION_RETRIES=10
MIGRATION_COUNT=0
MIGRATION_SUCCESS=false

# Wait for database to be ready (with exponential backoff)
echo "⏳ Waiting for database to be ready..."
DB_READY=false
DB_WAIT_COUNT=0
DB_MAX_WAIT=30

while [ "$DB_READY" = false ] && [ $DB_WAIT_COUNT -lt $DB_MAX_WAIT ]; do
  # Try to connect to database using pg_isready or simple connection test
  if command -v pg_isready >/dev/null 2>&1; then
    if pg_isready -h "$DATABASE_HOST" -p "${DATABASE_PORT:-5432}" -U "${DATABASE_USERNAME:-postgres}" >/dev/null 2>&1; then
      DB_READY=true
      echo "✓ Database is ready!"
    else
      DB_WAIT_COUNT=$((DB_WAIT_COUNT + 1))
      if [ $DB_WAIT_COUNT -lt $DB_MAX_WAIT ]; then
        sleep 1
      fi
    fi
  else
    # Fallback: try a simple connection test using node
    if node -e "
      const { Client } = require('pg');
      const client = new Client({
        host: process.env.DATABASE_HOST,
        port: parseInt(process.env.DATABASE_PORT || '5432'),
        user: process.env.DATABASE_USERNAME || 'postgres',
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        connectionTimeoutMillis: 2000
      });
      client.connect()
        .then(() => { client.end(); process.exit(0); })
        .catch(() => process.exit(1));
    " 2>/dev/null; then
      DB_READY=true
      echo "✓ Database is ready!"
    else
      DB_WAIT_COUNT=$((DB_WAIT_COUNT + 1))
      if [ $DB_WAIT_COUNT -lt $DB_MAX_WAIT ]; then
        sleep 1
      fi
    fi
  fi
done

if [ "$DB_READY" = false ]; then
  echo "⚠️  WARNING: Could not verify database readiness after ${DB_MAX_WAIT}s"
  echo "⚠️  Will attempt migrations anyway..."
fi

echo "🔄 Running database migrations..."

while [ $MIGRATION_COUNT -lt $MIGRATION_RETRIES ] && [ "$MIGRATION_SUCCESS" = false ]; do
  MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
  
  if [ $MIGRATION_COUNT -gt 1 ]; then
    echo "⏳ Retry attempt $MIGRATION_COUNT of $MIGRATION_RETRIES..."
    sleep 3
  fi
  
  # Run migrations using the migration script
  echo "Running: node scripts/run-migrations.js"
  if node scripts/run-migrations.js 2>&1; then
    MIGRATION_SUCCESS=true
    echo "✅ Migrations completed successfully!"
    break
  else
    MIGRATION_EXIT_CODE=$?
    echo "⚠️  Migration attempt $MIGRATION_COUNT failed with exit code: $MIGRATION_EXIT_CODE"
    if [ $MIGRATION_COUNT -lt $MIGRATION_RETRIES ]; then
      echo "⚠️  Will retry in 3 seconds..."
    fi
  fi
done

if [ "$MIGRATION_SUCCESS" = false ]; then
  echo ""
  echo "❌ ERROR: Migrations failed after $MIGRATION_RETRIES attempts!"
  echo "⚠️  The application will start, but database errors may occur."
  echo "⚠️  Please check the migration logs above and run migrations manually if needed."
  echo ""
  echo "To run migrations manually, use:"
  echo "  node scripts/run-migrations.js"
  echo ""
  echo "Or connect to the container and run:"
  echo "  docker exec -it <container-name> node scripts/run-migrations.js"
  echo ""
else
  # Verify critical migrations completed successfully
  echo ""
  echo "=== Verifying Critical Migrations ==="
  VERIFICATION_FAILED=false
  
  # Check if account_id column exists in users table
  if node -e "
    const { Client } = require('pg');
    const client = new Client({
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      user: process.env.DATABASE_USERNAME || 'postgres',
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
    });
    client.connect()
      .then(() => client.query(\"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='account_id'\"))
      .then(result => {
        if (result.rows.length === 0) {
          console.log('⚠️  WARNING: account_id column missing in users table');
          process.exit(1);
        } else {
          console.log('✓ account_id column exists in users table');
        }
        return client.query(\"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='vehicles' AND column_name='account_id'\");
      })
      .then(result => {
        if (result.rows.length === 0) {
          console.log('⚠️  WARNING: account_id column missing in vehicles table');
          process.exit(1);
        } else {
          console.log('✓ account_id column exists in vehicles table');
        }
        return client.query(\"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='vehicles' AND column_name='qr_code'\");
      })
      .then(result => {
        if (result.rows.length === 0) {
          console.log('⚠️  WARNING: qr_code column missing in vehicles table');
          process.exit(1);
        } else {
          console.log('✓ qr_code column exists in vehicles table');
        }
        return client.query(\"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name IN ('email', 'role')\");
      })
      .then(result => {
        if (result.rows.length < 2) {
          console.log('⚠️  WARNING: email or role columns missing in users table');
          process.exit(1);
        } else {
          console.log('✓ email and role columns exist in users table');
        }
        client.end();
        process.exit(0);
      })
      .catch(err => {
        console.error('✗ Verification failed:', err.message);
        client.end();
        process.exit(1);
      });
  " 2>&1; then
    echo "✅ All critical migrations verified successfully!"
  else
    VERIFICATION_EXIT_CODE=$?
    echo ""
    echo "⚠️  WARNING: Migration verification failed (exit code: $VERIFICATION_EXIT_CODE)"
    echo "⚠️  Some columns may be missing. The application may encounter errors."
    echo "⚠️  Please check the migration logs above and ensure all migrations completed."
    VERIFICATION_FAILED=true
  fi
fi

# Always start the application, even if migrations failed
# This allows the app to start and show proper error messages
echo ""
if [ "$MIGRATION_SUCCESS" = false ] || [ "$VERIFICATION_FAILED" = true ]; then
  echo "⚠️  Starting application with migration warnings..."
else
  echo "🚀 Starting application..."
fi
exec node dist/main

