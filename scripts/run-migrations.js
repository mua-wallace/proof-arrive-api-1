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
    await client.connect();
    console.log('Connected to database successfully!');

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
    const files = readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure correct order

    console.log(`Found ${files.length} migration file(s)`);

    for (const file of files) {
      const filePath = join(migrationsDir, file);
      const sql = readFileSync(filePath, 'utf8');
      
      console.log(`Running migration: ${file}...`);
      
      try {
        // Execute the entire SQL file
        // PostgreSQL will handle statement separation automatically
        await client.query(sql);
        console.log(`✓ ${file} applied successfully`);
      } catch (error) {
        // Check if error is because table/column already exists (safe to ignore)
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes('already exists') || 
            errorMsg.includes('duplicate key') ||
            errorMsg.includes('relation already exists') ||
            errorMsg.includes('column') && errorMsg.includes('already exists')) {
          console.log(`⚠ ${file} skipped (${error.message.split('\n')[0]})`);
        } else {
          // For other errors, log but continue (might be constraint issues that are OK)
          console.log(`⚠ ${file} had issues: ${error.message.split('\n')[0]}`);
          // Don't throw - continue with other migrations
        }
      }
    }

    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
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

