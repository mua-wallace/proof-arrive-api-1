#!/usr/bin/env node
/**
 * Test database connection and show diagnostic information
 */

const { Client } = require('pg');

const dbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  user: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'proof_arrive',
  connectionTimeoutMillis: 5000,
};

async function testConnection() {
  console.log('=== Database Connection Test ===\n');
  console.log('Configuration:');
  console.log(`  Host: ${dbConfig.host}`);
  console.log(`  Port: ${dbConfig.port}`);
  console.log(`  User: ${dbConfig.user}`);
  console.log(`  Database: ${dbConfig.database}`);
  console.log(`  Password: ${dbConfig.password ? 'SET' : 'NOT SET'}\n`);

  const client = new Client(dbConfig);
  
  try {
    console.log('Attempting to connect...');
    await client.connect();
    console.log('✅ Connection successful!\n');
    
    // Test query
    const result = await client.query('SELECT version(), current_database(), current_user');
    console.log('Database Info:');
    console.log(`  Version: ${result.rows[0].version.split(',')[0]}`);
    console.log(`  Database: ${result.rows[0].current_database}`);
    console.log(`  User: ${result.rows[0].current_user}\n`);
    
    // Check if users table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      )
    `);
    
    if (tableCheck.rows[0].exists) {
      console.log('✅ users table exists');
      
      // Check account_id column
      const columnCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'account_id'
      `);
      
      if (columnCheck.rows.length > 0) {
        console.log('✅ account_id column exists');
      } else {
        console.log('⚠️  account_id column MISSING');
      }
    } else {
      console.log('⚠️  users table does NOT exist');
    }
    
    return true;
  } catch (error) {
    console.error('\n❌ Connection failed!');
    console.error(`  Error: ${error.message}`);
    if (error.code) console.error(`  Code: ${error.code}`);
    if (error.detail) console.error(`  Detail: ${error.detail}`);
    if (error.hint) console.error(`  Hint: ${error.hint}`);
    
    // Common error codes
    if (error.code === 'ECONNREFUSED') {
      console.error('\n  💡 This usually means:');
      console.error('     - Database server is not running');
      console.error('     - Wrong host/port');
      console.error('     - Firewall blocking connection');
    } else if (error.code === '28P01') {
      console.error('\n  💡 This usually means:');
      console.error('     - Wrong username or password');
    } else if (error.code === '3D000') {
      console.error('\n  💡 This usually means:');
      console.error('     - Database does not exist');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('\n  💡 This usually means:');
      console.error('     - Network timeout');
      console.error('     - Database server is unreachable');
    }
    
    return false;
  } finally {
    await client.end();
  }
}

testConnection()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
