#!/bin/sh
# Script to manually run migration 0005_add_user_fields.sql
# This adds email, role, and fullname columns to the users table

echo "=== Running Migration 0005: Add User Fields ==="
echo ""

# Check if database connection is available
if [ -z "$DATABASE_HOST" ] || [ -z "$DATABASE_NAME" ]; then
  echo "❌ ERROR: Database environment variables not set."
  echo "Required: DATABASE_HOST and DATABASE_NAME"
  exit 1
fi

node -e "
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

(async () => {
  try {
    await client.connect();
    console.log('✓ Connected to database');
    
    const migrationPath = join('src/database/migrations', '0005_add_user_fields.sql');
    const sql = readFileSync(migrationPath, 'utf8');
    console.log('Reading migration file: 0005_add_user_fields.sql');
    
    // Split by statement-breakpoint and execute
    const statements = sql.split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('-- Migration:') && !s.startsWith('-- Generated'));
    
    console.log(\`Found \${statements.length} statements to execute\`);
    console.log('');
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement && !statement.startsWith('--')) {
        try {
          console.log(\`Executing statement \${i + 1}/\${statements.length}...\`);
          await client.query(statement);
          console.log(\`  ✓ Statement \${i + 1} executed successfully\`);
        } catch (err) {
          const errMsg = err.message.toLowerCase();
          // Ignore 'already exists' errors - these are safe
          if (errMsg.includes('already exists') || 
              errMsg.includes('duplicate') ||
              (errMsg.includes('does not exist') && errMsg.includes('column') && errMsg.includes('already'))) {
            console.log(\`  ⚠ Statement \${i + 1} skipped (already applied): \${err.message.split('\\n')[0]}\`);
          } else {
            console.log(\`  ✗ Statement \${i + 1} error: \${err.message.split('\\n')[0]}\`);
            throw err;
          }
        }
      }
    }
    
    console.log('');
    console.log('✓ Migration 0005_add_user_fields.sql completed successfully!');
    
    // Verify columns were added
    console.log('');
    console.log('=== Verifying Columns ===");
    const checkResult = await client.query(\`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema='public' 
      AND table_name='users' 
      AND column_name IN ('email', 'role', 'fullname')
    \`);
    
    const foundColumns = checkResult.rows.map(r => r.column_name);
    const expectedColumns = ['email', 'role', 'fullname'];
    const missing = expectedColumns.filter(c => !foundColumns.includes(c));
    
    if (missing.length === 0) {
      console.log('✅ All columns exist: email, role, fullname');
    } else {
      console.log('⚠️  Missing columns: ' + missing.join(', '));
    }
    
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('✗ Error running migration:', err.message);
    console.error(err.stack);
    await client.end();
    process.exit(1);
  }
})();
"

echo ""
echo "=== Done ==="
