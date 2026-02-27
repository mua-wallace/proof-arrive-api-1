#!/bin/sh
# Script to ensure all user-related migrations are run
# This script checks and runs migrations in the correct order

set -e

echo "=== Ensuring User Migrations Are Applied ==="
echo ""

# Check if database connection is available
if [ -z "$DATABASE_HOST" ] || [ -z "$DATABASE_NAME" ]; then
  echo "❌ ERROR: Database environment variables not set."
  echo "Required: DATABASE_HOST and DATABASE_NAME"
  exit 1
fi

# User-related migrations in order
USER_MIGRATIONS="
0005_add_user_fields.sql
0011_add_unique_constraint_users_accid_subid.sql
0015_use_subid_as_user_id.sql
"

MIGRATIONS_DIR="src/database/migrations"

echo "Checking for user-related migrations..."
for migration in $USER_MIGRATIONS; do
  migration_path="$MIGRATIONS_DIR/$migration"
  if [ -f "$migration_path" ]; then
    echo "✓ Found: $migration"
  else
    echo "⚠️  Missing: $migration"
  fi
done

echo ""
echo "Running all migrations (they will skip if already applied)..."
node scripts/run-migrations.js

echo ""
echo "=== Verifying User Table Schema ==="

# Verify critical columns exist
node -e "
const { Client } = require('pg');
const client = new Client({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
});

(async () => {
  try {
    await client.connect();
    console.log('✓ Connected to database');
    
    // Check if id column is integer (after migration 0015)
    const idCheck = await client.query(\`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_schema='public' 
      AND table_name='users' 
      AND column_name='id'
    \`);
    
    if (idCheck.rows.length === 0) {
      console.log('❌ ERROR: users.id column does not exist');
      process.exit(1);
    }
    
    const idType = idCheck.rows[0].data_type;
    if (idType === 'integer') {
      console.log('✓ users.id is integer (migration 0015 applied)');
    } else {
      console.log('⚠️  WARNING: users.id is ' + idType + ' (expected integer)');
      console.log('   Migration 0015 may not have been applied');
    }
    
    // Check for email/role columns (migration 0005)
    const emailRoleCheck = await client.query(\`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema='public' 
      AND table_name='users' 
      AND column_name IN ('email', 'role', 'fullname')
    \`);
    
    const foundColumns = emailRoleCheck.rows.map(r => r.column_name);
    if (foundColumns.includes('email') && foundColumns.includes('role') && foundColumns.includes('fullname')) {
      console.log('✓ email, role, and fullname columns exist (migration 0005 applied)');
    } else {
      const missing = ['email', 'role', 'fullname'].filter(c => !foundColumns.includes(c));
      console.log('⚠️  WARNING: Missing columns: ' + missing.join(', '));
      console.log('   Migration 0005 may not have been applied');
    }
    
    // Check for unique constraint on (accid, subid) (migration 0011)
    const constraintCheck = await client.query(\`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_schema='public' 
      AND table_name='users' 
      AND constraint_type='UNIQUE'
      AND constraint_name LIKE '%accid%subid%'
    \`);
    
    if (constraintCheck.rows.length > 0) {
      console.log('✓ Unique constraint on (accid, subid) exists (migration 0011 applied)');
    } else {
      console.log('⚠️  WARNING: Unique constraint on (accid, subid) not found');
      console.log('   Migration 0011 may not have been applied');
    }
    
    await client.end();
    console.log('');
    console.log('✅ User migrations verification complete');
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    await client.end();
    process.exit(1);
  }
})();
"

echo ""
echo "=== Done ==="
