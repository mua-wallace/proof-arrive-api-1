import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

/**
 * MigrationService automatically runs pending migrations on application startup
 * This ensures the database schema is always up-to-date before the app starts serving requests
 */
@Injectable()
export class MigrationService implements OnModuleInit {
  private readonly logger = new Logger(MigrationService.name);
  private readonly configService: ConfigService;

  constructor(configService: ConfigService) {
    this.configService = configService;
  }

  async onModuleInit() {
    // Check if migrations should run automatically
    const autoMigrate = process.env.AUTO_MIGRATE !== 'false'; // Default to true unless explicitly disabled
    
    if (!autoMigrate) {
      this.logger.log('Auto-migration is disabled (AUTO_MIGRATE=false). Skipping migrations.');
      return;
    }

    // Check if database connection is available
    const dbConfig = this.configService.get('database');
    if (!dbConfig?.host || !dbConfig?.name) {
      this.logger.warn('Database configuration not found. Skipping automatic migrations.');
      this.logger.warn('Migrations should be run manually or via Docker startup script.');
      return;
    }

    try {
      this.logger.log('Running database migrations automatically...');
      
      // First, ensure critical user columns exist (migration 0005) - run this FIRST
      // This is critical because user operations will fail without these columns
      await this.ensureUserMigration0005(dbConfig);
      
      // Find the migration script path
      const migrationScriptPath = this.findMigrationScript();
      
      if (!migrationScriptPath) {
        this.logger.warn('Migration script not found. Migrations may need to be run manually.');
        // Still try to ensure migration 0005 ran even if script not found
        await this.ensureUserMigration0005(dbConfig);
        return;
      }

      // Run migrations using the existing script
      const { stdout, stderr } = await execAsync(`node ${migrationScriptPath}`, {
        env: {
          ...process.env,
          DATABASE_HOST: dbConfig.host,
          DATABASE_PORT: String(dbConfig.port || 5432),
          DATABASE_USERNAME: dbConfig.username || 'postgres',
          DATABASE_PASSWORD: dbConfig.password || '',
          DATABASE_NAME: dbConfig.name,
        },
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
      });

      if (stdout) {
        this.logger.log(stdout);
      }
      if (stderr && !stderr.includes('NOTICE')) {
        // Ignore PostgreSQL NOTICE messages, but log other stderr
        this.logger.warn(stderr);
      }

      // Verify migration 0005 ran successfully after all migrations
      await this.ensureUserMigration0005(dbConfig);

      this.logger.log('✅ Database migrations completed successfully');
    } catch (error: any) {
      // Don't fail the application startup if migrations fail
      // But still try to ensure migration 0005 runs (it's critical)
      this.logger.error(`⚠️  Automatic migration failed: ${error.message}`);
      
      // Try to ensure migration 0005 runs even if main migration script failed
      try {
        const dbConfig = this.configService.get('database');
        if (dbConfig?.host && dbConfig?.name) {
          this.logger.log('Attempting to run critical migration 0005 as fallback...');
          await this.ensureUserMigration0005(dbConfig);
        }
      } catch (fallbackError: any) {
        this.logger.error(`Failed to run migration 0005 as fallback: ${fallbackError.message}`);
      }
      
      this.logger.warn('Application will continue to start. Please ensure migrations are run manually if needed.');
      
      // Log full error in debug mode
      if (error.stdout) {
        this.logger.debug(`Migration stdout: ${error.stdout}`);
      }
      if (error.stderr) {
        this.logger.debug(`Migration stderr: ${error.stderr}`);
      }
    }
  }

  /**
   * Ensure migration 0005_add_user_fields.sql has run (adds email, role, fullname columns)
   * This is critical for user operations to work correctly
   * Returns true if columns exist or migration was successful, false otherwise
   */
  private async ensureUserMigration0005(dbConfig: any): Promise<boolean> {
    try {
      const { Client } = require('pg');
      const client = new Client({
        host: dbConfig.host,
        port: dbConfig.port || 5432,
        user: dbConfig.username || 'postgres',
        password: dbConfig.password || '',
        database: dbConfig.name,
        connectionTimeoutMillis: 5000,
      });

      await client.connect();
      
      // Check if email/role/fullname columns exist
      const checkResult = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema='public' 
        AND table_name='users' 
        AND column_name IN ('email', 'role', 'fullname')
      `);
      
      const foundColumns = checkResult.rows.map((r: any) => r.column_name);
      const missing = ['email', 'role', 'fullname'].filter(c => !foundColumns.includes(c));
      
      if (missing.length > 0) {
        this.logger.warn(`Missing user columns detected: ${missing.join(', ')}. Running migration 0005_add_user_fields.sql...`);
        
        // Run migration 0005
        const { readFileSync, existsSync } = require('fs');
        const { join } = require('path');
        
        // Try alternative paths
        const possiblePaths = [
          join(process.cwd(), 'src/database/migrations/0005_add_user_fields.sql'),
          join(__dirname, '../../database/migrations/0005_add_user_fields.sql'),
          join(__dirname, '../../../src/database/migrations/0005_add_user_fields.sql'),
          '/usr/src/app/src/database/migrations/0005_add_user_fields.sql',
        ];
        
        let migrationContent: string | null = null;
        let migrationPath: string | null = null;
        for (const path of possiblePaths) {
          try {
            if (existsSync(path)) {
              migrationContent = readFileSync(path, 'utf8');
              migrationPath = path;
              this.logger.log(`Found migration file at: ${path}`);
              break;
            }
          } catch (e) {
            // Try next path
          }
        }
        
        if (!migrationContent) {
          this.logger.error('Migration 0005_add_user_fields.sql not found. Please run migrations manually.');
          await client.end();
          return false;
        }
        
        // Split by statement-breakpoint and execute, handling DO blocks properly
        // DO blocks span multiple statement-breakpoints and must be kept together
        let statements: string[] = [];
        
        if (migrationContent.includes('--> statement-breakpoint')) {
          // Handle DO blocks that span multiple statement-breakpoints
          const parts = migrationContent.split('--> statement-breakpoint');
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
                  this.logger.warn(`DO block may not be properly closed in migration 0005, part ${i + 1}`);
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
          const doBlockRegex = /DO\s+\$\$[\s\S]*?END\s+\$\$/gi;
          const doBlocks: Array<{ text: string; index: number; endIndex: number }> = [];
          let match;
          
          while ((match = doBlockRegex.exec(migrationContent)) !== null) {
            doBlocks.push({
              text: match[0].trim(),
              index: match.index,
              endIndex: match.index + match[0].length
            });
          }
          
          // Build statements array: DO blocks + regular statements
          let currentIndex = 0;
          doBlocks.sort((a, b) => a.index - b.index);
          
          doBlocks.forEach(block => {
            // Add any SQL before this DO block
            if (block.index > currentIndex) {
              const beforeBlock = migrationContent.substring(currentIndex, block.index);
              const regularStmts = beforeBlock
                .split(';')
                .map((s: string) => s.trim())
                .filter((s: string) => s.length > 0 && !s.match(/^\s*$/));
              statements.push(...regularStmts);
            }
            
            // Add the DO block
            let doBlockText = block.text;
            if (doBlockText.endsWith(';')) {
              doBlockText = doBlockText.slice(0, -1).trim();
            }
            statements.push(doBlockText);
            currentIndex = block.endIndex;
            
            // Skip semicolon after END $$ if present
            if (migrationContent.substring(currentIndex, currentIndex + 1) === ';') {
              currentIndex++;
            }
          });
          
          // Add any remaining SQL after the last DO block
          if (currentIndex < migrationContent.length) {
            const remainingSql = migrationContent.substring(currentIndex);
            const regularStmts = remainingSql
              .split(';')
              .map((s: string) => s.trim())
              .filter((s: string) => s.length > 0 && !s.match(/^\s*$/));
            statements.push(...regularStmts);
          }
          
          // If no DO blocks found, just split by semicolons
          if (doBlocks.length === 0) {
            statements = migrationContent
              .split(';')
              .map((s: string) => s.trim())
              .filter((s: string) => s.length > 0 && !s.match(/^\s*$/));
          }
        }
        
        // Filter out comments and empty statements
        statements = statements
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0 && !s.startsWith('-- Migration:') && !s.startsWith('-- Generated') && !s.startsWith('--'));
        
        this.logger.log(`Executing ${statements.length} statements from migration 0005...`);
        
        let successCount = 0;
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
              
              await client.query(execStatement);
              successCount++;
              this.logger.debug(`✓ Statement ${i + 1}/${statements.length} executed successfully`);
            } catch (err: any) {
              // Ignore 'already exists' errors - these are safe
              const errMsg = err.message.toLowerCase();
              if (errMsg.includes('already exists') || 
                  errMsg.includes('duplicate') ||
                  (errMsg.includes('does not exist') && errMsg.includes('column') && errMsg.includes('already'))) {
                // Safe to ignore - column/constraint already exists
                successCount++;
                this.logger.debug(`✓ Statement ${i + 1}/${statements.length} skipped (already exists)`);
              } else {
                this.logger.warn(`✗ Migration statement ${i + 1}/${statements.length} error: ${err.message.split('\n')[0]}`);
                this.logger.debug(`Failed statement: ${statement.substring(0, 100)}...`);
                // Continue with next statement
              }
            }
          }
        }
        
        // Verify columns were added
        const verifyResult = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema='public' 
          AND table_name='users' 
          AND column_name IN ('email', 'role', 'fullname')
        `);
        
        const verifiedColumns = verifyResult.rows.map((r: any) => r.column_name);
        const stillMissing = ['email', 'role', 'fullname'].filter(c => !verifiedColumns.includes(c));
        
        if (stillMissing.length === 0) {
          this.logger.log(`✅ Migration 0005_add_user_fields.sql completed successfully (${successCount}/${statements.length} statements executed)`);
          await client.end();
          return true;
        } else {
          this.logger.error(`Migration 0005 partially failed. Still missing columns: ${stillMissing.join(', ')}`);
          await client.end();
          return false;
        }
      } else {
        this.logger.debug('✓ User columns (email, role, fullname) already exist');
        await client.end();
        return true;
      }
    } catch (error: any) {
      this.logger.error(`Could not check/run migration 0005: ${error.message}`);
      // Don't throw - return false to indicate failure
      return false;
    }
  }

  private findMigrationScript(): string | null {
    const possiblePaths = [
      join(process.cwd(), 'scripts', 'run-migrations.js'),
      join(__dirname, '../../scripts/run-migrations.js'),
      join(__dirname, '../../../scripts/run-migrations.js'),
      '/usr/src/app/scripts/run-migrations.js', // Docker path
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        this.logger.debug(`Found migration script at: ${path}`);
        return path;
      }
    }

    return null;
  }
}
