#!/usr/bin/env node
/**
 * Script to check if account_id column exists in users table and add it if missing
 * This fixes the issue where migrations showed "0 statements executed" but column is missing
 */

const { Client } = require('pg');

const dbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  user: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'proof_arrive',
};

async function checkAndFix() {
  const client = new Client(dbConfig);
  
  try {
    console.log(`Connecting to database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    await client.connect();
    console.log('✓ Connected to database successfully!');
    
    // Check if account_id column exists in users table
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'users' 
      AND column_name = 'account_id'
    `);
    
    if (columnCheck.rows.length === 0) {
      console.log('✗ account_id column is MISSING in users table');
      console.log('🔄 Adding account_id column...');
      
      // Add column as nullable first
      await client.query(`
        ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_id" integer
      `);
      console.log('✓ Column added (nullable)');
      
      // Update existing rows: set account_id = CAST(accid AS integer)
      const updateResult = await client.query(`
        UPDATE "users" SET "account_id" = CAST("accid" AS integer) WHERE "account_id" IS NULL
      `);
      console.log(`✓ Updated ${updateResult.rowCount} existing user(s)`);
      
      // Make column NOT NULL
      await client.query(`
        ALTER TABLE "users" ALTER COLUMN "account_id" SET NOT NULL
      `);
      console.log('✓ Column set to NOT NULL');
      
      // Create index if it doesn't exist
      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_users_account" ON "users" USING btree ("account_id")
      `);
      console.log('✓ Index created');
      
      // Create composite index if it doesn't exist
      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_users_account_accid" ON "users" USING btree ("account_id", "accid")
      `);
      console.log('✓ Composite index created');
      
      console.log('\n✅ account_id column successfully added to users table!');
    } else {
      console.log('✓ account_id column EXISTS in users table');
      
      // Check if there are any NULL values
      const nullCheck = await client.query(`
        SELECT COUNT(*) as count FROM "users" WHERE "account_id" IS NULL
      `);
      
      if (parseInt(nullCheck.rows[0].count) > 0) {
        console.log(`⚠️  Found ${nullCheck.rows[0].count} user(s) with NULL account_id`);
        console.log('🔄 Updating NULL values...');
        
        const updateResult = await client.query(`
          UPDATE "users" SET "account_id" = CAST("accid" AS integer) WHERE "account_id" IS NULL
        `);
        console.log(`✓ Updated ${updateResult.rowCount} user(s)`);
      }
      
      // Verify column is NOT NULL
      const notNullCheck = await client.query(`
        SELECT is_nullable 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'account_id'
      `);
      
      if (notNullCheck.rows[0].is_nullable === 'YES') {
        console.log('⚠️  Column is nullable, making it NOT NULL...');
        await client.query(`
          ALTER TABLE "users" ALTER COLUMN "account_id" SET NOT NULL
        `);
        console.log('✓ Column set to NOT NULL');
      }
    }
    
    // Check other tables that should have account_id
    const tablesToCheck = ['arrivals', 'centers', 'exits', 'vehicles', 'incoming_vehicles', 'processing_stages'];
    console.log('\n=== Checking other tables ===');
    
    for (const table of tablesToCheck) {
      const check = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1 
        AND column_name = 'account_id'
      `, [table]);
      
      if (check.rows.length === 0) {
        console.log(`⚠️  ${table}: account_id column MISSING`);
      } else {
        console.log(`✓ ${table}: account_id column exists`);
      }
    }
    
    console.log('\n✅ Check complete!');
    return true;
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error('Full error:', error);
    return false;
  } finally {
    await client.end();
  }
}

checkAndFix()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
