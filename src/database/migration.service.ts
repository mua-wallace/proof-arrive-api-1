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
