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
      
      // First, check if critical user columns exist (migration 0005)
      await this.ensureUserMigration0005(dbConfig);
      
      // Find the migration script path
      const migrationScriptPath = this.findMigrationScript();
      
      if (!migrationScriptPath) {
        this.logger.warn('Migration script not found. Migrations may need to be run manually.');
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

      this.logger.log('✅ Database migrations completed successfully');
    } catch (error: any) {
      // Don't fail the application startup if migrations fail
      // Log the error but continue - migrations might have been run manually or via Docker script
      this.logger.error(`⚠️  Automatic migration failed: ${error.message}`);
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
   */
  private async ensureUserMigration0005(dbConfig: any): Promise<void> {
    try {
      const { Client } = require('pg');
      const client = new Client({
        host: dbConfig.host,
        port: dbConfig.port || 5432,
        user: dbConfig.username || 'postgres',
        password: dbConfig.password || '',
        database: dbConfig.name,
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
        const { readFileSync } = require('fs');
        const { join } = require('path');
        const migrationPath = join(process.cwd(), 'src/database/migrations/0005_add_user_fields.sql');
        
        // Try alternative paths
        const possiblePaths = [
          migrationPath,
          join(__dirname, '../../database/migrations/0005_add_user_fields.sql'),
          join(__dirname, '../../../src/database/migrations/0005_add_user_fields.sql'),
          '/usr/src/app/src/database/migrations/0005_add_user_fields.sql',
        ];
        
        let migrationContent: string | null = null;
        for (const path of possiblePaths) {
          try {
            const { existsSync } = require('fs');
            if (existsSync(path)) {
              migrationContent = readFileSync(path, 'utf8');
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
          return;
        }
        
        // Split by statement-breakpoint and execute
        const statements = migrationContent.split('--> statement-breakpoint')
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0 && !s.startsWith('-- Migration:') && !s.startsWith('-- Generated'));
        
        for (const statement of statements) {
          if (statement && !statement.startsWith('--')) {
            try {
              await client.query(statement);
            } catch (err: any) {
              // Ignore 'already exists' errors
              const errMsg = err.message.toLowerCase();
              if (!errMsg.includes('already exists') && 
                  !errMsg.includes('duplicate') &&
                  !(errMsg.includes('does not exist') && errMsg.includes('column'))) {
                this.logger.warn(`Migration statement warning: ${err.message.split('\n')[0]}`);
              }
            }
          }
        }
        
        this.logger.log('✅ Migration 0005_add_user_fields.sql completed');
      } else {
        this.logger.debug('✓ User columns (email, role, fullname) already exist');
      }
      
      await client.end();
    } catch (error: any) {
      this.logger.warn(`Could not check/run migration 0005: ${error.message}`);
      // Don't throw - let the main migration script handle it
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
