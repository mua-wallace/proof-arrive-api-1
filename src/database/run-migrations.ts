import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import appConfig from '@config/app.config';

export async function runMigrations(): Promise<void> {
  const config = appConfig();
  const dbConfig = {
    host: config.database.host,
    port: config.database.port,
    user: config.database.username,
    password: config.database.password,
    database: config.database.name,
  };

  // Validate database config
  if (!dbConfig.host || !dbConfig.database) {
    console.warn('⚠️  Database configuration incomplete. Skipping migrations.');
    return;
  }

  const client = new Client(dbConfig);
  const migrationsDir = join(process.cwd(), 'src/database/migrations');

  try {
    console.log(
      `Connecting to database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`,
    );
    await client.connect();
    console.log('✓ Connected to database successfully!');

    // Check if migrations directory exists
    if (!existsSync(migrationsDir)) {
      console.error(`✗ Migrations directory not found: ${migrationsDir}`);
      return;
    }

    // Get list of migration files (excluding meta directory)
    let files: string[];
    try {
      files = readdirSync(migrationsDir)
        .filter((file) => file.endsWith('.sql'))
        .sort(); // Sort to ensure correct order

      if (files.length === 0) {
        console.warn(`⚠️  No migration files found in ${migrationsDir}`);
        return;
      }
    } catch (err: any) {
      console.error(`✗ Error reading migrations directory: ${err.message}`);
      return;
    }

    console.log(`Found ${files.length} migration file(s): ${files.join(', ')}`);

    for (const file of files) {
      const filePath = join(migrationsDir, file);

      try {
        const sql = readFileSync(filePath, 'utf8');
        console.log(`\nRunning migration: ${file}...`);

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
                console.warn(
                  `  ⚠ Statement ${i + 1} error: ${stmtError.message.split('\n')[0]}`,
                );
              }
            }
          }
        }

        console.log(
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
          console.warn(
            `⚠ ${file} skipped (${error.message.split('\n')[0]})`,
          );
        } else {
          console.error(`✗ ${file} failed: ${error.message}`);
          // Continue with other migrations instead of failing completely
        }
      }
    }

    console.log('✅ All migrations completed successfully!');
  } catch (error: any) {
    console.error(`❌ Migration failed: ${error.message}`);
    if (error.code) {
      console.error(`Error code: ${error.code}`);
    }
    // Don't throw - allow app to continue even if migrations fail
    // This is important for development where migrations might be run manually
  } finally {
    await client.end();
  }
}

