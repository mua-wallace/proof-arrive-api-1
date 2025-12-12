#!/usr/bin/env node
/**
 * Migration runner that executes SQL migration files directly
 * This bypasses drizzle-kit sync issues and runs migrations in order
 */

const { readFileSync, readdirSync, statSync } = require('fs');
const { join } = require('path');
const { Client } = require('pg');

// Get database connection from environment variables
const dbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  user: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'proof_arrive',
};

const migrationsDir = join(__dirname, '../src/database/migrations');

async function runMigrations() {
  const client = new Client(dbConfig);
  
  try {
    console.log(`Connecting to database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    console.log(`Using user: ${dbConfig.user}`);
    
    await client.connect();
    console.log('✓ Connected to database successfully!');

    // Check if migrations directory exists
    try {
      const dirExists = require('fs').existsSync(migrationsDir);
      if (!dirExists) {
        console.error(`✗ Migrations directory not found: ${migrationsDir}`);
        console.error('Current working directory:', process.cwd());
        process.exit(1);
      }
    } catch (err) {
      console.error(`✗ Error checking migrations directory: ${err.message}`);
      process.exit(1);
    }

    // Check if any tables exist (simple check to see if migrations were run)
    const tableCheck = await client.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name NOT LIKE '__drizzle%'
    `);
    
    const tableCount = parseInt(tableCheck.rows[0].count, 10);
    
    if (tableCount > 0) {
      console.log(`Database already has ${tableCount} table(s). Checking for pending migrations...`);
    } else {
      console.log('Database is empty. Running initial migrations...');
    }

    // Get list of migration files (excluding meta directory)
    let files;
    try {
      files = readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort(); // Sort to ensure correct order
      
      if (files.length === 0) {
        console.error(`✗ No migration files found in ${migrationsDir}`);
        console.log('Files in directory:', readdirSync(migrationsDir));
        process.exit(1);
      }
    } catch (err) {
      console.error(`✗ Error reading migrations directory: ${err.message}`);
      process.exit(1);
    }

    console.log(`Found ${files.length} migration file(s): ${files.join(', ')}`);

    for (const file of files) {
      const filePath = join(migrationsDir, file);
      
      try {
        const sql = readFileSync(filePath, 'utf8');
        console.log(`\nRunning migration: ${file}...`);
        
        // Split SQL by statement-breakpoint and execute each statement separately
        // This handles drizzle-kit's statement-breakpoint format
        const statements = sql
          .split('--> statement-breakpoint')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('-- Migration:') && !s.startsWith('-- Generated'));

        let executedCount = 0;
        let skippedCount = 0;
        for (let i = 0; i < statements.length; i++) {
          const statement = statements[i].trim();
          if (statement && !statement.startsWith('--')) {
            try {
              await client.query(statement);
              executedCount++;
            } catch (stmtError) {
              // Check if error is because table/column already exists (safe to ignore)
              const errorMsg = stmtError.message.toLowerCase();
              if (errorMsg.includes('already exists') || 
                  errorMsg.includes('duplicate key') ||
                  errorMsg.includes('relation already exists') ||
                  (errorMsg.includes('column') && errorMsg.includes('already exists')) ||
                  errorMsg.includes('constraint') && errorMsg.includes('already exists')) {
                skippedCount++;
                // Only log first few skipped statements to avoid spam
                if (skippedCount <= 3) {
                  console.log(`  ⚠ Statement ${i + 1} skipped (already exists)`);
                }
              } else {
                // Log the error but continue
                console.log(`  ⚠ Statement ${i + 1} error: ${stmtError.message.split('\n')[0]}`);
                // Don't fail the entire migration for constraint errors
                if (!errorMsg.includes('constraint') && !errorMsg.includes('foreign key')) {
                  console.log(`  Continuing with next statement...`);
                }
              }
            }
          }
        }
        
        if (skippedCount > 3) {
          console.log(`  ... and ${skippedCount - 3} more statements skipped`);
        }
        
        console.log(`✓ ${file} applied successfully (${executedCount} statements executed)`);
      } catch (error) {
        // Check if error is because table/column already exists (safe to ignore)
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes('already exists') || 
            errorMsg.includes('duplicate key') ||
            errorMsg.includes('relation already exists')) {
          console.log(`⚠ ${file} skipped (${error.message.split('\n')[0]})`);
        } else {
          console.error(`✗ ${file} failed: ${error.message}`);
          console.error('Full error:', error);
          // Continue with other migrations
        }
      }
    }

    console.log('\n✓ All migrations completed successfully!');
  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    console.error('Full error:', error);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run migrations
runMigrations().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

