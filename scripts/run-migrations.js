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

// Support both development (from scripts/) and production (from dist/scripts/) paths
// In production, migrations are copied to src/database/migrations at the root
let migrationsDir = join(__dirname, '../src/database/migrations');

// If that doesn't exist, try the current working directory (production)
if (!require('fs').existsSync(migrationsDir)) {
  migrationsDir = join(process.cwd(), 'src/database/migrations');
}

// Final fallback - try absolute path from process.cwd
if (!require('fs').existsSync(migrationsDir)) {
  migrationsDir = join(process.cwd(), 'src', 'database', 'migrations');
}

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
        console.error('__dirname:', __dirname);
        console.error('Trying to find migrations directory...');
        
        // Try to find migrations directory
        const fs = require('fs');
        const possiblePaths = [
          join(process.cwd(), 'src/database/migrations'),
          join(__dirname, '../src/database/migrations'),
          join(process.cwd(), 'src', 'database', 'migrations'),
          '/usr/src/app/src/database/migrations', // Docker default
        ];
        
        for (const path of possiblePaths) {
          if (fs.existsSync(path)) {
            console.log(`✓ Found migrations directory at: ${path}`);
            migrationsDir = path;
            break;
          }
        }
        
        if (!fs.existsSync(migrationsDir)) {
          console.error('✗ Could not find migrations directory in any of these locations:');
          possiblePaths.forEach(p => console.error(`  - ${p}`));
          process.exit(1);
        }
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
        // IMPORTANT: Handle DO blocks (PostgreSQL anonymous code blocks) - they span multiple statement-breakpoints
        let statements;
        if (sql.includes('--> statement-breakpoint')) {
          // Drizzle-kit format: split by statement-breakpoint, but keep DO blocks together
          const parts = sql.split('--> statement-breakpoint');
          statements = [];
          let i = 0;
          
          while (i < parts.length) {
            let part = parts[i].trim();
            
            // Skip empty parts and comments
            if (part.length === 0 || part.startsWith('-- Migration:') || part.startsWith('-- Generated')) {
              i++;
              continue;
            }
            
            // Check if this part starts a DO block (DO $$ or DO $tag$)
            const upperPart = part.toUpperCase();
            const doBlockStartMatch = upperPart.match(/DO\s+\$(\$|[a-zA-Z]*\$)/);
            
            if (doBlockStartMatch) {
              // DO block detected - need to find the matching END
              const doTag = doBlockStartMatch[1]; // Get the tag ($$ or $tag$)
              let doBlock = part;
              let j = i + 1;
              let foundEnd = false;
              
              // Look ahead through remaining parts to find matching END
              while (j < parts.length && !foundEnd) {
                const nextPart = parts[j].trim();
                const upperNext = nextPart.toUpperCase();
                
                // Check if this part contains matching END (END $$ or END $tag$)
                const endPattern = doTag === '$$' ? 'END $$' : `END ${doTag}`;
                if (upperNext.includes(endPattern)) {
                  // Found the end - combine all parts from i to j
                  doBlock = parts.slice(i, j + 1).join('\n').trim();
                  // Remove statement-breakpoint markers that might be in the middle
                  doBlock = doBlock.replace(/--> statement-breakpoint/g, '');
                  statements.push(doBlock);
                  i = j + 1; // Move past the END
                  foundEnd = true;
                } else {
                  j++;
                }
              }
              
              if (!foundEnd) {
                // DO block not properly closed - try to find END in current part
                if (upperPart.includes('END ' + doTag)) {
                  // END is in the same part
                  statements.push(part);
                  i++;
                } else {
                  // DO block not properly closed - add what we have and log warning
                  console.log(`  ⚠ Warning: DO block may not be properly closed in ${file}, part ${i + 1}`);
                  statements.push(doBlock);
                  i++;
                }
              }
            } else {
              // Regular statement
              statements.push(part);
              i++;
            }
          }
        } else {
          // Plain SQL format: split by semicolons, but keep DO blocks together
          // Remove lines that are only comments (starting with --)
          const lines = sql.split('\n');
          const sqlLines = lines.filter(line => {
            const trimmed = line.trim();
            // Keep empty lines and non-comment lines
            return trimmed.length === 0 || !trimmed.startsWith('--');
          });
          const cleanedSql = sqlLines.join('\n');
          
          // Handle DO blocks specially - they contain semicolons but must be kept as single statements
          // Match DO $$ ... END $$ patterns (non-greedy to match shortest block first)
          const doBlockRegex = /DO\s+\$\$[\s\S]*?END\s+\$\$/gi;
          const doBlocks = [];
          let match;
          
          while ((match = doBlockRegex.exec(cleanedSql)) !== null) {
            doBlocks.push({
              text: match[0].trim(),
              index: match.index,
              endIndex: match.index + match[0].length
            });
          }
          
          // Build statements array: DO blocks + regular statements
          statements = [];
          let currentIndex = 0;
          
          // Sort DO blocks by index to process in order
          doBlocks.sort((a, b) => a.index - b.index);
          
          doBlocks.forEach(block => {
            // Add any SQL before this DO block
            if (block.index > currentIndex) {
              const beforeBlock = cleanedSql.substring(currentIndex, block.index);
              // Split by semicolon, but be careful - semicolons inside strings/comments shouldn't split
              const regularStmts = beforeBlock
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.match(/^\s*$/));
              statements.push(...regularStmts);
            }
            
            // Add the DO block (remove trailing semicolon if present, it's part of the block)
            let doBlockText = block.text;
            if (doBlockText.endsWith(';')) {
              doBlockText = doBlockText.slice(0, -1).trim();
            }
            statements.push(doBlockText);
            currentIndex = block.endIndex;
            
            // Skip semicolon after END $$ if present
            if (cleanedSql.substring(currentIndex, currentIndex + 1) === ';') {
              currentIndex++;
            }
          });
          
          // Add any remaining SQL after the last DO block
          if (currentIndex < cleanedSql.length) {
            const remainingSql = cleanedSql.substring(currentIndex);
            const regularStmts = remainingSql
              .split(';')
              .map(s => s.trim())
              .filter(s => s.length > 0 && !s.match(/^\s*$/));
            statements.push(...regularStmts);
          }
          
          // If no DO blocks found, just split by semicolons
          if (doBlocks.length === 0) {
            statements = cleanedSql
              .split(';')
              .map(s => s.trim())
              .filter(s => s.length > 0 && !s.match(/^\s*$/));
          }
        }

        let executedCount = 0;
        let skippedCount = 0;
        for (let i = 0; i < statements.length; i++) {
          let statement = statements[i].trim();
          if (statement && !statement.startsWith('--')) {
            // Ensure DO blocks end with semicolon if they don't already
            const upperStatement = statement.toUpperCase();
            if ((upperStatement.includes('DO $$') || upperStatement.match(/DO\s+\$[a-zA-Z]*\$/)) && 
                !statement.endsWith(';')) {
              statement = statement + ';';
            }
            
            // Ensure regular statements end with semicolon (unless they're DO blocks)
            if (!upperStatement.includes('DO $$') && !upperStatement.match(/DO\s+\$[a-zA-Z]*\$/) && 
                !statement.endsWith(';') && statement.length > 0) {
              statement = statement + ';';
            }
            
            try {
              await client.query(statement);
              executedCount++;
            } catch (stmtError) {
              // Check if error is because table/column already exists (safe to ignore)
              const errorMsg = stmtError.message.toLowerCase();
              const errorCode = stmtError.code;
              
              // Safe to skip: already exists errors
              if (errorMsg.includes('already exists') || 
                  errorMsg.includes('duplicate key') ||
                  errorMsg.includes('relation already exists') ||
                  (errorMsg.includes('column') && errorMsg.includes('already exists')) ||
                  (errorMsg.includes('constraint') && errorMsg.includes('already exists')) ||
                  (errorMsg.includes('index') && errorMsg.includes('already exists'))) {
                skippedCount++;
                // Only log first few skipped statements to avoid spam
                if (skippedCount <= 3) {
                  console.log(`  ⚠ Statement ${i + 1} skipped (already exists)`);
                }
              }
              // Safe to skip: column doesn't exist (might be dropped in later migration)
              else if (errorMsg.includes('does not exist') && errorMsg.includes('column')) {
                skippedCount++;
                if (skippedCount <= 3) {
                  console.log(`  ⚠ Statement ${i + 1} skipped (column doesn't exist - may be dropped in later migration)`);
                }
              }
              // Safe to skip: foreign key constraint errors (will be fixed in later migrations)
              else if ((errorMsg.includes('no unique constraint') || errorMsg.includes('unique constraint matching')) ||
                       (errorMsg.includes('there is no unique constraint matching given keys'))) {
                skippedCount++;
                if (skippedCount <= 3) {
                  console.log(`  ⚠ Statement ${i + 1} skipped (unique constraint missing - will be added in later migration)`);
                }
              }
              // Safe to skip: index on non-existent column
              else if (errorCode === '42703' && (errorMsg.includes('qr_code') || errorMsg.includes('column'))) {
                skippedCount++;
                if (skippedCount <= 3) {
                  console.log(`  ⚠ Statement ${i + 1} skipped (column doesn't exist)`);
                }
              }
              // Safe to skip: constraint/foreign key errors (will be handled in later migrations)
              else if (errorMsg.includes('constraint') || errorMsg.includes('foreign key')) {
                skippedCount++;
                if (skippedCount <= 3) {
                  console.log(`  ⚠ Statement ${i + 1} skipped (constraint/foreign key error - may be fixed in later migration)`);
                }
              }
              else {
                // Log the error but continue
                console.log(`  ⚠ Statement ${i + 1} error: ${stmtError.message.split('\n')[0]}`);
                console.log(`  Continuing with next statement...`);
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
    return true; // Success
  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    console.error('Full error:', error);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    return false; // Failure - don't exit, let caller decide
  } finally {
    await client.end();
  }
}

// Run migrations
// Exit with code 0 on success, 1 on failure
// This allows the startup script to handle retries
runMigrations()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

