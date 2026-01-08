import { Injectable, Logger } from '@nestjs/common';

/**
 * MigrationService is kept for backward compatibility
 * Migrations are now run via the Docker startup script (scripts/start-with-migrations.sh)
 * which executes scripts/run-migrations.js before the application starts.
 * This service can be used for manual migration triggers if needed in the future.
 */
@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  // Migrations are now run via Docker startup script before app initialization
  // This service is kept for potential future use (e.g., manual migration triggers via API)
}
