#!/usr/bin/env node
/**
 * Script to check the users table schema and diagnose issues
 */

const { Client } = require('pg');

const dbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  user: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'proof_arrive',
};

async function checkSchema() {
  const client = new Client(dbConfig);
  
  try {
    console.log(`Connecting to database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    await client.connect();
    console.log('✓ Connected to database successfully!\n');
    
    // Check if users table exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      )
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('❌ ERROR: users table does not exist!');
      return false;
    }
    
    console.log('✓ users table exists\n');
    
    // Get all columns in users table
    const columns = await client.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    console.log('=== Users Table Columns ===');
    console.log(`Total columns: ${columns.rows.length}\n`);
    
    let hasAccountId = false;
    let hasAccid = false;
    
    columns.rows.forEach(col => {
      const marker = col.column_name === 'account_id' ? ' ⭐' : 
                    col.column_name === 'accid' ? ' ⭐' : '';
      console.log(`  ${col.column_name.padEnd(25)} ${col.data_type.padEnd(20)} nullable: ${col.is_nullable}${marker}`);
      
      if (col.column_name === 'account_id') hasAccountId = true;
      if (col.column_name === 'accid') hasAccid = true;
    });
    
    console.log('');
    
    // Check for account_id specifically
    if (!hasAccountId) {
      console.log('❌ CRITICAL: account_id column is MISSING!');
      console.log('   This is required for the login query to work.');
      console.log('   Run: node scripts/check-and-fix-account-id.js\n');
    } else {
      console.log('✓ account_id column exists');
      
      // Check if it's nullable
      const accountIdCol = columns.rows.find(c => c.column_name === 'account_id');
      if (accountIdCol.is_nullable === 'YES') {
        console.log('⚠️  WARNING: account_id is nullable (should be NOT NULL)');
      } else {
        console.log('✓ account_id is NOT NULL');
      }
      
      // Check for NULL values
      const nullCheck = await client.query(`
        SELECT COUNT(*) as count FROM "users" WHERE "account_id" IS NULL
      `);
      
      if (parseInt(nullCheck.rows[0].count) > 0) {
        console.log(`⚠️  WARNING: ${nullCheck.rows[0].count} user(s) have NULL account_id`);
      } else {
        console.log('✓ No NULL values in account_id');
      }
    }
    
    if (!hasAccid) {
      console.log('❌ CRITICAL: accid column is MISSING!');
    } else {
      console.log('✓ accid column exists');
    }
    
    // Check indexes
    console.log('\n=== Indexes on users table ===');
    const indexes = await client.query(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE tablename = 'users' 
      AND schemaname = 'public'
      ORDER BY indexname
    `);
    
    if (indexes.rows.length === 0) {
      console.log('  No indexes found');
    } else {
      indexes.rows.forEach(idx => {
        console.log(`  ${idx.indexname}`);
        if (idx.indexname.includes('account')) {
          console.log(`    ${idx.indexdef}`);
        }
      });
    }
    
    // Try the actual query that's failing
    console.log('\n=== Testing the failing query ===');
    try {
      const testQuery = await client.query(`
        SELECT "id", "account_id", "accid", "username"
        FROM "users" 
        WHERE "users"."accid" = $1::text 
        AND "users"."account_id" = $2 
        LIMIT $3
      `, ['267', 267, 1]);
      
      console.log(`✓ Query executed successfully`);
      console.log(`  Rows returned: ${testQuery.rows.length}`);
      if (testQuery.rows.length > 0) {
        console.log(`  Sample row:`, testQuery.rows[0]);
      }
    } catch (queryError) {
      console.log('❌ Query failed!');
      console.log(`  Error: ${queryError.message}`);
      console.log(`  Code: ${queryError.code}`);
      if (queryError.detail) console.log(`  Detail: ${queryError.detail}`);
      if (queryError.hint) console.log(`  Hint: ${queryError.hint}`);
    }
    
    // Check user count
    const userCount = await client.query(`SELECT COUNT(*) as count FROM "users"`);
    console.log(`\n=== Statistics ===`);
    console.log(`  Total users: ${userCount.rows[0].count}`);
    
    return true;
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    if (error.code) console.error('  Code:', error.code);
    if (error.detail) console.error('  Detail:', error.detail);
    console.error('Full error:', error);
    return false;
  } finally {
    await client.end();
  }
}

checkSchema()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
