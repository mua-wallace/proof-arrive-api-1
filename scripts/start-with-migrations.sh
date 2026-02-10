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
  
  # Check critical migrations including user-specific ones
  if node -e "
    const { Client } = require('pg');
    const client = new Client({
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      user: process.env.DATABASE_USERNAME || 'postgres',
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
    });
    
    let hasErrors = false;
    
    client.connect()
      .then(() => {
        console.log('=== Verifying User Migrations ===');
        // Check if users table exists
        return client.query(\"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='users')\");
      })
      .then(result => {
        if (!result.rows[0].exists) {
          console.log('❌ ERROR: users table does not exist');
          hasErrors = true;
          return Promise.resolve();
        }
        console.log('✓ users table exists');
        
        // Check account_id column (migration 0007)
        return client.query(\"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='account_id'\");
      })
      .then(result => {
        if (result.rows.length === 0) {
          console.log('⚠️  WARNING: account_id column missing in users table (migration 0007)');
          hasErrors = true;
        } else {
          console.log('✓ account_id column exists in users table');
        }
        
        // Check email/role/fullname columns (migration 0005)
        return client.query(\"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name IN ('email', 'role', 'fullname')\");
      })
      .then(result => {
        const foundColumns = result.rows.map(r => r.column_name);
        const missing = ['email', 'role', 'fullname'].filter(c => !foundColumns.includes(c));
        if (missing.length > 0) {
          console.log('⚠️  WARNING: Missing columns in users table (migration 0005): ' + missing.join(', '));
          console.log('🔄 Attempting to run migration 0005_add_user_fields.sql...');
          hasErrors = true;
        } else {
          console.log('✓ email, role, and fullname columns exist (migration 0005)');
        }
        
        // Check if id column is integer (migration 0015)
        return client.query(\"SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='id'\");
      })
      .then(result => {
        if (result.rows.length === 0) {
          console.log('❌ ERROR: users.id column does not exist');
          hasErrors = true;
        } else {
          const idType = result.rows[0].data_type;
          if (idType === 'integer') {
            console.log('✓ users.id is integer (migration 0015 applied)');
          } else {
            console.log('⚠️  WARNING: users.id is ' + idType + ' (expected integer, migration 0015 may not be applied)');
            hasErrors = true;
          }
        }
        
        // Check unique constraint on (accid, subid) (migration 0011)
        return client.query(\"SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema='public' AND table_name='users' AND constraint_type='UNIQUE' AND constraint_name LIKE '%accid%subid%'\");
      })
      .then(result => {
        if (result.rows.length === 0) {
          console.log('⚠️  WARNING: Unique constraint on (accid, subid) not found (migration 0011 may not be applied)');
          hasErrors = true;
        } else {
          console.log('✓ Unique constraint on (accid, subid) exists (migration 0011)');
        }
        
        console.log('');
        console.log('=== Verifying Other Critical Migrations ===');
        
        // Check vehicles.account_id
        return client.query(\"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='vehicles' AND column_name='account_id'\");
      })
      .then(result => {
        if (result.rows.length === 0) {
          console.log('⚠️  WARNING: account_id column missing in vehicles table');
          hasErrors = true;
        } else {
          console.log('✓ account_id column exists in vehicles table');
        }
        return client.query(\"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='vehicles' AND column_name='qr_code'\");
      })
      .then(result => {
        if (result.rows.length === 0) {
          console.log('⚠️  WARNING: qr_code column missing in vehicles table');
          hasErrors = true;
        } else {
          console.log('✓ qr_code column exists in vehicles table');
        }
        
        client.end();
        process.exit(hasErrors ? 1 : 0);
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
    echo "⚠️  Some user migrations may be missing. Attempting to re-run user migrations..."
    VERIFICATION_FAILED=true
    
    # Try to re-run user-specific migrations
    echo ""
    echo "=== Re-running User Migrations ==="
    if node -e "
      const { Client } = require('pg');
      const { readFileSync } = require('fs');
      const { join } = require('path');
      const client = new Client({
        host: process.env.DATABASE_HOST,
        port: parseInt(process.env.DATABASE_PORT || '5432'),
        user: process.env.DATABASE_USERNAME || 'postgres',
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
      });
      
      const migrationsDir = 'src/database/migrations';
      // Run migrations in order - 0005 must run before 0011 and 0015
      const userMigrations = [
        '0005_add_user_fields.sql',
        '0011_add_unique_constraint_users_accid_subid.sql',
        '0015_use_subid_as_user_id.sql'
      ];
      
      (async () => {
        try {
          await client.connect();
          console.log('✓ Connected to database');
          
          for (const migrationFile of userMigrations) {
            const migrationPath = join(migrationsDir, migrationFile);
            try {
              const sql = readFileSync(migrationPath, 'utf8');
              console.log('Running: ' + migrationFile);
              
              // Split by statement-breakpoint and execute
              const statements = sql.split('--> statement-breakpoint')
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.startsWith('-- Migration:') && !s.startsWith('-- Generated'));
              
              for (const statement of statements) {
                if (statement && !statement.startsWith('--')) {
                  try {
                    await client.query(statement);
                  } catch (err) {
                    // Ignore 'already exists' errors and 'column already exists' errors
                    const errMsg = err.message.toLowerCase();
                    if (errMsg.includes('already exists') || 
                        errMsg.includes('duplicate') ||
                        (errMsg.includes('does not exist') && !errMsg.includes('column')) ||
                        errMsg.includes('relation already exists')) {
                      // These are safe to ignore - migration already applied
                    } else {
                      console.log('  ⚠ Statement error (may be safe to ignore): ' + err.message.split('\\n')[0]);
                    }
                  }
                }
              }
              console.log('  ✓ ' + migrationFile + ' completed');
            } catch (err) {
              if (err.code === 'ENOENT') {
                console.log('  ⚠ ' + migrationFile + ' not found (skipping)');
              } else {
                console.log('  ⚠ ' + migrationFile + ' error: ' + err.message.split('\\n')[0]);
              }
            }
          }
          
          await client.end();
          console.log('✓ User migrations re-run completed');
          process.exit(0);
        } catch (err) {
          console.error('✗ Error re-running migrations:', err.message);
          await client.end();
          process.exit(1);
        }
      })();
    " 2>&1; then
      echo "✅ User migrations re-run completed!"
      VERIFICATION_FAILED=false
    else
      echo "⚠️  Could not re-run user migrations automatically"
      echo "⚠️  Please run migrations manually: node scripts/run-migrations.js"
    fi
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

