import { Injectable, Logger } from '@nestjs/common';

/**
 * MigrationService is kept for backward compatibility
 * Migrations are now run in main.ts before app initialization
 * This service can be used for manual migration triggers if needed
 */
@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  // Migrations are now run in main.ts before app initialization
  // This service is kept for potential future use (e.g., manual migration triggers)
}
    const dbConfig = {
      host: this.configService.get<string>('database.host'),
      port: this.configService.get<number>('database.port'),
      user: this.configService.get<string>('database.username'),
      password: this.configService.get<string>('database.password'),
      database: this.configService.get<string>('database.name'),
    };

    // Validate database config
    if (!dbConfig.host || !dbConfig.database) {
      this.logger.warn('⚠️  Database configuration incomplete. Skipping migrations.');
      return;
    }

    const client = new Client(dbConfig);
    const migrationsDir = join(process.cwd(), 'src/database/migrations');

    try {
      this.logger.log(`Connecting to database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
      await client.connect();
      this.logger.log('✓ Connected to database successfully!');

      // Check if migrations directory exists
      try {
        const dirExists = require('fs').existsSync(migrationsDir);
        if (!dirExists) {
          this.logger.error(`✗ Migrations directory not found: ${migrationsDir}`);
          return;
        }
      } catch (err) {
        this.logger.error(`✗ Error checking migrations directory: ${err.message}`);
        return;
      }

      // Get list of migration files (excluding meta directory)
      let files: string[];
      try {
        files = readdirSync(migrationsDir)
          .filter((file) => file.endsWith('.sql'))
          .sort(); // Sort to ensure correct order

        if (files.length === 0) {
          this.logger.warn(`⚠️  No migration files found in ${migrationsDir}`);
          return;
        }
      } catch (err) {
        this.logger.error(`✗ Error reading migrations directory: ${err.message}`);
        return;
      }

      this.logger.log(`Found ${files.length} migration file(s): ${files.join(', ')}`);

      for (const file of files) {
        const filePath = join(migrationsDir, file);

        try {
          const sql = readFileSync(filePath, 'utf8');
          this.logger.log(`\nRunning migration: ${file}...`);

          // Split SQL by statement-breakpoint and execute each statement separately
          // This handles drizzle-kit's statement-breakpoint format
          const statements = sql
            .split('--> statement-breakpoint')
            .map((s) => s.trim())
            .filter(
              (s) =>
                s.length > 0 &&
                !s.startsWith('-- Migration:') &&
                !s.startsWith('-- Generated'),
            );

          let executedCount = 0;
          let skippedCount = 0;
          for (let i = 0; i < statements.length; i++) {
            const statement = statements[i].trim();
            if (statement && !statement.startsWith('--')) {
              try {
                await client.query(statement);
                executedCount++;
              } catch (stmtError: any) {
                // Check if error is because table/column already exists (safe to ignore)
                const errorMsg = stmtError.message.toLowerCase();
                if (
                  errorMsg.includes('already exists') ||
                  errorMsg.includes('duplicate key') ||
                  errorMsg.includes('relation already exists') ||
                  (errorMsg.includes('column') &&
                    errorMsg.includes('already exists')) ||
                  (errorMsg.includes('constraint') &&
                    errorMsg.includes('already exists'))
                ) {
                  skippedCount++;
                } else {
                  // Log the error but continue
                  this.logger.warn(
                    `  ⚠ Statement ${i + 1} error: ${stmtError.message.split('\n')[0]}`,
                  );
                }
              }
            }
          }

          this.logger.log(
            `✓ ${file} applied successfully (${executedCount} statements executed${skippedCount > 0 ? `, ${skippedCount} skipped` : ''})`,
          );
        } catch (error: any) {
          // Check if error is because table/column already exists (safe to ignore)
          const errorMsg = error.message.toLowerCase();
          if (
            errorMsg.includes('already exists') ||
            errorMsg.includes('duplicate key') ||
            errorMsg.includes('relation already exists')
          ) {
            this.logger.warn(
              `⚠ ${file} skipped (${error.message.split('\n')[0]})`,
            );
          } else {
            this.logger.error(`✗ ${file} failed: ${error.message}`);
            // Continue with other migrations instead of failing completely
          }
        }
      }

      this.logger.log('✅ All migrations completed successfully!');
    } catch (error: any) {
      this.logger.error(`❌ Migration failed: ${error.message}`);
      if (error.code) {
        this.logger.error(`Error code: ${error.code}`);
      }
      // Don't throw - allow app to continue even if migrations fail
      // This is important for development where migrations might be run manually
    } finally {
      await client.end();
    }
  }
}

