#!/usr/bin/env node
/**
 * Quick fix script to add account_id column to users table if missing
 * This fixes the login error: "Failed query: ... account_id ..."
 */

const { Client } = require('pg');

const dbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  user: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'proof_arrive',
};

async function fix() {
  const client = new Client(dbConfig);
  
  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('✓ Connected\n');
    
    // Check if column exists
    const check = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'users' 
      AND column_name = 'account_id'
    `);
    
    if (check.rows.length > 0) {
      console.log('✓ account_id column already exists');
      
      // Check for NULL values
      const nullCheck = await client.query(`
        SELECT COUNT(*) as count FROM "users" WHERE "account_id" IS NULL
      `);
      
      if (parseInt(nullCheck.rows[0].count) > 0) {
        console.log(`⚠️  Found ${nullCheck.rows[0].count} user(s) with NULL account_id`);
        console.log('Updating NULL values...');
        await client.query(`
          UPDATE "users" SET "account_id" = CAST("accid" AS integer) WHERE "account_id" IS NULL
        `);
        console.log('✓ Updated NULL values');
      }
      
      // Check if NOT NULL constraint exists
      const nullableCheck = await client.query(`
        SELECT is_nullable 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'account_id'
      `);
      
      if (nullableCheck.rows[0].is_nullable === 'YES') {
        console.log('Making column NOT NULL...');
        await client.query(`
          ALTER TABLE "users" ALTER COLUMN "account_id" SET NOT NULL
        `);
        console.log('✓ Column is now NOT NULL');
      }
      
      console.log('\n✅ account_id column is properly configured');
      return true;
    }
    
    console.log('✗ account_id column is MISSING');
    console.log('Adding column...\n');
    
    // Step 1: Add column as nullable
    await client.query(`
      ALTER TABLE "users" ADD COLUMN "account_id" integer
    `);
    console.log('✓ Column added (nullable)');
    
    // Step 2: Update existing rows
    const updateResult = await client.query(`
      UPDATE "users" SET "account_id" = CAST("accid" AS integer) WHERE "account_id" IS NULL
    `);
    console.log(`✓ Updated ${updateResult.rowCount} existing user(s)`);
    
    // Step 3: Make NOT NULL
    await client.query(`
      ALTER TABLE "users" ALTER COLUMN "account_id" SET NOT NULL
    `);
    console.log('✓ Column set to NOT NULL');
    
    // Step 4: Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_account" ON "users" ("account_id")
    `);
    console.log('✓ Index created: idx_users_account');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_account_accid" ON "users" ("account_id", "accid")
    `);
    console.log('✓ Composite index created: idx_users_account_accid');
    
    console.log('\n✅ SUCCESS! account_id column has been added to users table');
    console.log('   You can now try logging in again.');
    return true;
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.code) console.error('   Code:', error.code);
    if (error.detail) console.error('   Detail:', error.detail);
    if (error.hint) console.error('   Hint:', error.hint);
    return false;
  } finally {
    await client.end();
  }
}

fix()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
