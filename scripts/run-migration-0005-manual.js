#!/usr/bin/env node
/**
 * Manual script to run migration 0005_add_user_fields.sql
 * This adds email, role, and fullname columns to the users table
 * 
 * Usage:
 *   node scripts/run-migration-0005-manual.js
 * 
 * Or with Docker:
 *   docker-compose exec proof-arrive-api node scripts/run-migration-0005-manual.js
 */

const { Client } = require('pg');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

// Get database connection from environment variables
const dbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  user: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'proof_arrive',
};

async function runMigration0005() {
  const client = new Client(dbConfig);
  
  try {
    console.log('=== Running Migration 0005: Add User Fields ===');
    console.log(`Connecting to database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    console.log(`Using user: ${dbConfig.user}`);
    console.log('');
    
    await client.connect();
    console.log('✓ Connected to database successfully!');
    console.log('');
    
    // Check if columns already exist
    console.log('Checking if columns already exist...');
    const checkResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema='public' 
      AND table_name='users' 
      AND column_name IN ('email', 'role', 'fullname')
    `);
    
    const foundColumns = checkResult.rows.map(r => r.column_name);
    const missing = ['email', 'role', 'fullname'].filter(c => !foundColumns.includes(c));
    
    if (missing.length === 0) {
      console.log('✓ All columns (email, role, fullname) already exist!');
      console.log('Migration 0005 has already been applied.');
      await client.end();
      process.exit(0);
    }
    
    console.log(`Missing columns: ${missing.join(', ')}`);
    console.log('Running migration to add missing columns...');
    console.log('');
    
    // Find migration file
    const possiblePaths = [
      join(process.cwd(), 'src/database/migrations/0005_add_user_fields.sql'),
      join(__dirname, '../src/database/migrations/0005_add_user_fields.sql'),
      '/usr/src/app/src/database/migrations/0005_add_user_fields.sql',
    ];
    
    let migrationPath = null;
    let migrationContent = null;
    
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        migrationPath = path;
        migrationContent = readFileSync(path, 'utf8');
        console.log(`✓ Found migration file at: ${path}`);
        break;
      }
    }
    
    if (!migrationContent) {
      console.error('✗ ERROR: Migration file 0005_add_user_fields.sql not found!');
      console.error('Tried paths:');
      possiblePaths.forEach(p => console.error(`  - ${p}`));
      await client.end();
      process.exit(1);
    }
    
    console.log('');
    console.log('Parsing migration file...');
    
    // Handle DO blocks properly - they span multiple statement-breakpoints
    let statements = [];
    
    if (migrationContent.includes('--> statement-breakpoint')) {
      const parts = migrationContent.split('--> statement-breakpoint');
      let i = 0;
      
      while (i < parts.length) {
        let part = parts[i].trim();
        
        // Skip empty parts
        if (part.length === 0) {
          i++;
          continue;
        }
        
        // Remove comment-only lines but keep SQL lines (even if they have comments)
        const lines = part.split('\n');
        const sqlLines = lines.filter(line => {
          const trimmed = line.trim();
          // Remove lines that are ONLY comments (starting with -- and nothing else)
          // But keep SQL lines that might have comments
          if (trimmed.length === 0) return false;
          // Keep lines that have SQL keywords or are not pure comments
          const upperTrimmed = trimmed.toUpperCase();
          const isPureComment = trimmed.match(/^\s*--/);
          const hasSqlKeywords = upperTrimmed.match(/\b(ALTER|CREATE|UPDATE|INSERT|SELECT|DO|BEGIN|END|IF|THEN|ELSE)\b/);
          
          // Keep if it has SQL keywords OR if it's not a pure comment line
          return hasSqlKeywords || !isPureComment;
        });
        
        part = sqlLines.join('\n').trim();
        
        // Remove leading comment lines but keep the SQL
        const finalLines = part.split('\n');
        let sqlStartIndex = 0;
        for (let idx = 0; idx < finalLines.length; idx++) {
          const trimmed = finalLines[idx].trim();
          // Find first line that is NOT a comment (starts with --)
          // Skip header comments (Migration:/Generated) and regular comments
          if (trimmed.length > 0 && !trimmed.match(/^\s*--/)) {
            sqlStartIndex = idx;
            break;
          }
        }
        part = finalLines.slice(sqlStartIndex).join('\n').trim();
        
        // Skip if this part only contains header comments (no SQL)
        if (part.length === 0 || !part.toUpperCase().match(/\b(ALTER|CREATE|UPDATE|INSERT|SELECT|DO|BEGIN|END|IF|THEN|ELSE)\b/)) {
          console.log(`⚠ Skipping part ${i + 1} (no SQL found): ${part.substring(0, 60)}...`);
          i++;
          continue;
        }
        
        // Check if this part starts a DO block
        const upperPart = part.toUpperCase();
        const doBlockStartMatch = upperPart.match(/DO\s+\$(\$|[a-zA-Z]*\$)/);
        
        if (doBlockStartMatch) {
          // DO block detected - find matching END
          const doTag = doBlockStartMatch[1];
          let doBlock = part;
          let j = i + 1;
          let foundEnd = false;
          
          while (j < parts.length && !foundEnd) {
            let nextPart = parts[j].trim();
            // Clean up next part
            const nextLines = nextPart.split('\n');
            const nextSqlLines = nextLines.filter(line => {
              const trimmed = line.trim();
              if (trimmed.length === 0) return false;
              const upperTrimmed = trimmed.toUpperCase();
              const isPureComment = trimmed.match(/^\s*--/);
              const hasSqlKeywords = upperTrimmed.match(/\b(ALTER|CREATE|UPDATE|INSERT|SELECT|DO|BEGIN|END|IF|THEN|ELSE)\b/);
              return hasSqlKeywords || !isPureComment;
            });
            nextPart = nextSqlLines.join('\n').trim();
            
            // Remove leading comments
            const nextFinalLines = nextPart.split('\n');
            let nextSqlStartIndex = 0;
            for (let idx = 0; idx < nextFinalLines.length; idx++) {
              const trimmed = nextFinalLines[idx].trim();
              if (trimmed.length > 0 && !trimmed.match(/^\s*--/)) {
                nextSqlStartIndex = idx;
                break;
              }
            }
            nextPart = nextFinalLines.slice(nextSqlStartIndex).join('\n').trim();
            
            const upperNext = nextPart.toUpperCase();
            const endPattern = doTag === '$$' ? 'END $$' : `END ${doTag}`;
            
            if (upperNext.includes(endPattern)) {
              // Found the end - combine all parts from i to j
              const combinedParts = [];
              for (let k = i; k <= j; k++) {
                let p = parts[k].trim();
                const pLines = p.split('\n');
                const pSqlLines = pLines.filter(line => {
                  const trimmed = line.trim();
                  if (trimmed.length === 0) return false;
                  const upperTrimmed = trimmed.toUpperCase();
                  const isPureComment = trimmed.match(/^\s*--/);
                  const hasSqlKeywords = upperTrimmed.match(/\b(ALTER|CREATE|UPDATE|INSERT|SELECT|DO|BEGIN|END|IF|THEN|ELSE)\b/);
                  return hasSqlKeywords || !isPureComment;
                });
                p = pSqlLines.join('\n').trim();
                
                // Remove leading comments
                const pFinalLines = p.split('\n');
                let pSqlStartIndex = 0;
                for (let idx = 0; idx < pFinalLines.length; idx++) {
                  const trimmed = pFinalLines[idx].trim();
                  if (trimmed.length > 0 && !trimmed.match(/^\s*--/)) {
                    pSqlStartIndex = idx;
                    break;
                  }
                }
                p = pFinalLines.slice(pSqlStartIndex).join('\n').trim();
                
                if (p.length > 0) {
                  combinedParts.push(p);
                }
              }
              
              doBlock = combinedParts.join('\n').trim();
              doBlock = doBlock.replace(/--> statement-breakpoint/g, '');
              if (doBlock.length > 0) {
                statements.push(doBlock);
              }
              i = j + 1;
              foundEnd = true;
            } else {
              j++;
            }
          }
          
          if (!foundEnd) {
            if (upperPart.includes('END ' + doTag)) {
              statements.push(part);
              i++;
            } else {
              console.warn(`⚠ Warning: DO block may not be properly closed, part ${i + 1}`);
              if (doBlock.length > 0) {
                statements.push(doBlock);
              }
              i++;
            }
          }
        } else {
          // Regular statement - keep it if it has SQL
          if (part.length > 0 && upperPart.match(/\b(ALTER|CREATE|UPDATE|INSERT|SELECT|DO|BEGIN|END)\b/)) {
            statements.push(part);
            console.log(`  ✓ Added statement from part ${i + 1}: ${part.split('\n')[0].substring(0, 60)}...`);
          } else {
            console.log(`  ⚠ Skipped part ${i + 1} (no SQL keywords): ${part.substring(0, 60)}...`);
          }
          i++;
        }
      }
    } else {
      // Plain SQL format - split by semicolons but keep DO blocks together
      const doBlockRegex = /DO\s+\$\$[\s\S]*?END\s+\$\$/gi;
      const doBlocks = [];
      let match;
      
      while ((match = doBlockRegex.exec(migrationContent)) !== null) {
        doBlocks.push({
          text: match[0].trim(),
          index: match.index,
          endIndex: match.index + match[0].length
        });
      }
      
      let currentIndex = 0;
      doBlocks.sort((a, b) => a.index - b.index);
      
      doBlocks.forEach(block => {
        if (block.index > currentIndex) {
          const beforeBlock = migrationContent.substring(currentIndex, block.index);
          const regularStmts = beforeBlock
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.match(/^\s*$/) && !s.match(/^\s*--\s*$/));
          statements.push(...regularStmts);
        }
        
        let doBlockText = block.text;
        if (doBlockText.endsWith(';')) {
          doBlockText = doBlockText.slice(0, -1).trim();
        }
        statements.push(doBlockText);
        currentIndex = block.endIndex;
        
        if (migrationContent.substring(currentIndex, currentIndex + 1) === ';') {
          currentIndex++;
        }
      });
      
      if (currentIndex < migrationContent.length) {
        const remainingSql = migrationContent.substring(currentIndex);
        const regularStmts = remainingSql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.match(/^\s*$/) && !s.match(/^\s*--\s*$/));
        statements.push(...regularStmts);
      }
      
      if (doBlocks.length === 0) {
        statements = migrationContent
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.match(/^\s*$/) && !s.match(/^\s*--\s*$/));
      }
    }
    
    // Final filter: remove empty statements, but keep SQL statements
    statements = statements
      .map(s => s.trim())
      .filter(s => {
        // Keep if it has SQL keywords
        const upper = s.toUpperCase();
        const hasKeywords = s.length > 0 && upper.match(/\b(ALTER|CREATE|UPDATE|INSERT|SELECT|DO|BEGIN|END|IF|THEN|ELSE)\b/);
        if (!hasKeywords && s.length > 0) {
          // Debug: log what we're filtering out
          console.log(`⚠ Filtering out non-SQL statement: ${s.substring(0, 80)}...`);
        }
        return hasKeywords;
      });
    
    console.log(`Found ${statements.length} statements to execute`);
    if (statements.length > 0) {
      console.log('Statements preview:');
      statements.forEach((stmt, idx) => {
        const preview = stmt.split('\n')[0].substring(0, 60);
        console.log(`  [${idx + 1}] ${preview}...`);
      });
    }
    console.log('');
    
    // Execute statements
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement && !statement.startsWith('--')) {
        try {
          // Ensure statement ends with semicolon (unless it's a DO block)
          let execStatement = statement;
          const upperStatement = statement.toUpperCase();
          if (!upperStatement.includes('DO $$') && !execStatement.endsWith(';')) {
            execStatement = execStatement + ';';
          }
          
          console.log(`[${i + 1}/${statements.length}] Executing statement...`);
          await client.query(execStatement);
          successCount++;
          console.log(`  ✓ Statement ${i + 1} executed successfully`);
        } catch (err) {
          const errMsg = err.message.toLowerCase();
          
          // Ignore 'already exists' errors - these are safe
          if (errMsg.includes('already exists') || 
              errMsg.includes('duplicate') ||
              (errMsg.includes('does not exist') && errMsg.includes('column') && errMsg.includes('already'))) {
            successCount++;
            console.log(`  ⚠ Statement ${i + 1} skipped (already exists): ${err.message.split('\n')[0]}`);
          } else {
            errorCount++;
            console.log(`  ✗ Statement ${i + 1} error: ${err.message.split('\n')[0]}`);
            console.log(`    Statement preview: ${statement.substring(0, 100)}...`);
          }
        }
      }
    }
    
    console.log('');
    console.log(`=== Execution Summary ===`);
    console.log(`Total statements: ${statements.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('');
    
    // Verify columns were added
    console.log('=== Verifying Columns ===');
    const verifyResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema='public' 
      AND table_name='users' 
      AND column_name IN ('email', 'role', 'fullname')
    `);
    
    const verifiedColumns = verifyResult.rows.map(r => r.column_name);
    const expectedColumns = ['email', 'role', 'fullname'];
    const stillMissing = expectedColumns.filter(c => !verifiedColumns.includes(c));
    
    if (stillMissing.length === 0) {
      console.log('✅ SUCCESS: All columns exist!');
      console.log('  - email');
      console.log('  - role');
      console.log('  - fullname');
      console.log('');
      console.log('Migration 0005_add_user_fields.sql completed successfully!');
      await client.end();
      process.exit(0);
    } else {
      console.log('❌ ERROR: Some columns are still missing:');
      stillMissing.forEach(col => console.log(`  - ${col}`));
      console.log('');
      console.log('Migration may have partially failed. Please check the errors above.');
      await client.end();
      process.exit(1);
    }
    
  } catch (error) {
    console.error('');
    console.error('✗ ERROR:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    await client.end();
    process.exit(1);
  }
}

// Run the migration
runMigration0005().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
