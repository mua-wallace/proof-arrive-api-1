import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@modules/schemas';
import { eq } from 'drizzle-orm';
import { MalambiApiService } from '@integrations/malambi-api/malambi-api.service';

@Injectable()
export class CentersSyncService {
  private readonly logger = new Logger(CentersSyncService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly dbConnection: PostgresJsDatabase<typeof schema>,
    private readonly malambiApi: MalambiApiService,
  ) {}

  /**
   * Sync center from Malambi API to database
   */
  async syncCenter(centerId: number, centerName?: string): Promise<void> {
    try {
      this.logger.debug(`Syncing center: centerId=${centerId}, name=${centerName || 'N/A'}`);

      // Check if center already exists by name or ID
      // Note: The schema uses serial ID, so we might need to track thirdPartyId separately
      // For now, we'll check by name
      if (centerName) {
        const existingCenter = await this.dbConnection
          .select()
          .from(schema.centers)
          .where(eq(schema.centers.name, centerName))
          .limit(1);

        if (existingCenter.length > 0) {
          this.logger.debug(`Center ${centerName} already exists, skipping sync`);
          return;
        }
      }

      // Fetch center data from Malambi API
      // Note: You'll need to implement getCenterInfo in MalambiApiService
      // For now, we'll create a basic center record
      const centerData = {
        name: centerName || `Center_${centerId}`,
        address: null,
        latitude: null,
        longitude: null,
        geozoneId: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.dbConnection.insert(schema.centers).values(centerData).execute();

      this.logger.log(`Center ${centerId} synced successfully`);
    } catch (error) {
      this.logger.error(`Error syncing center ${centerId}:`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Check if center exists in database
   */
  async centerExists(name: string): Promise<boolean> {
    const center = await this.dbConnection
      .select()
      .from(schema.centers)
      .where(eq(schema.centers.name, name))
      .limit(1);

    return center.length > 0;
  }
}

