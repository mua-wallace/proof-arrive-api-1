import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@modules/schemas';
import { eq } from 'drizzle-orm';
import { MalambiApiService } from '@integrations/malambi-api/malambi-api.service';
import { QueueService } from '@common/queue/queue.service';

@Injectable()
export class VehiclesSyncService {
  private readonly logger = new Logger(VehiclesSyncService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly dbConnection: PostgresJsDatabase<typeof schema>,
    private readonly malambiApi: MalambiApiService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Sync vehicle from Malambi API to database
   */
  async syncVehicle(thirdPartyId: number): Promise<void> {
    try {
      this.logger.debug(`Syncing vehicle: thirdPartyId=${thirdPartyId}`);

      // Check if vehicle already exists
      const existingVehicle = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(eq(schema.vehicles.thirdPartyId, thirdPartyId))
        .limit(1);

      if (existingVehicle.length > 0) {
        this.logger.debug(`Vehicle ${thirdPartyId} already exists, skipping sync`);
        return;
      }

      // Fetch vehicle data from Malambi API
      // Note: You'll need to implement getVehicleInfo in MalambiApiService
      // For now, we'll create a basic vehicle record
      const vehicleData = {
        thirdPartyId,
        plate: `PLATE_${thirdPartyId}`,
        model: null,
        brand: null,
        year: null,
        tag2: null,
        groupId: null,
        isActive: true,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.dbConnection.insert(schema.vehicles).values(vehicleData).execute();

      this.logger.log(`Vehicle ${thirdPartyId} synced successfully`);
    } catch (error) {
      this.logger.error(`Error syncing vehicle ${thirdPartyId}:`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Check if vehicle exists in database
   */
  async vehicleExists(thirdPartyId: number): Promise<boolean> {
    const vehicle = await this.dbConnection
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.thirdPartyId, thirdPartyId))
      .limit(1);

    return vehicle.length > 0;
  }

  /**
   * Ensure vehicle is synced - check if exists, if not trigger background sync job
   * Call this method when a vehicle is scanned/accessed
   */
  async ensureVehicleSynced(thirdPartyId: number): Promise<void> {
    const exists = await this.vehicleExists(thirdPartyId);
    if (!exists) {
      this.logger.debug(`Vehicle ${thirdPartyId} not found in database, triggering sync job`);
      await this.queueService.add('vehicle-sync', 'sync-vehicle', { thirdPartyId });
    }
  }
}


