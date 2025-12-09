import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
   * @param vehicleData - Full vehicle data from Malambi API
   */
  async syncVehicle(vehicleData: {
    id: number;
    plate: string;
    model?: string;
    brand?: string;
    year?: number;
    tag2?: string;
    groupId?: number;
  }): Promise<void> {
    try {
      const thirdPartyId = vehicleData.id;
      
      this.logger.debug(`Syncing vehicle: thirdPartyId=${thirdPartyId}, plate=${vehicleData.plate}`);

      // Check if vehicle already exists by thirdPartyId
      const existingVehicle = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(eq(schema.vehicles.thirdPartyId, thirdPartyId))
        .limit(1);

      if (existingVehicle.length > 0) {
        this.logger.debug(`Vehicle ${thirdPartyId} already exists, skipping sync`);
        return;
      }

      // Insert vehicle with data from Malambi API
      const vehicleRecord = {
        thirdPartyId,
        plate: vehicleData.plate || `PLATE_${thirdPartyId}`,
        model: vehicleData.model || null,
        brand: vehicleData.brand || null,
        year: vehicleData.year || null,
        tag2: vehicleData.tag2 || null,
        groupId: vehicleData.groupId || null,
        isActive: true,
        lastSyncedAt: new Date(),
      };

      await this.dbConnection.insert(schema.vehicles).values(vehicleRecord).execute();

      this.logger.log(`Vehicle ${thirdPartyId} (plate: ${vehicleData.plate}) synced successfully`);
    } catch (error) {
      this.logger.error(`Error syncing vehicle:`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Check if vehicle exists in database by thirdPartyId (vehicleId)
   */
  async vehicleExistsByVehicleId(vehicleId: number): Promise<boolean> {
    if (!vehicleId) {
      return false;
    }

    const vehicle = await this.dbConnection
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.thirdPartyId, vehicleId))
      .limit(1);

    return vehicle.length > 0;
  }

  /**
   * Check if vehicle exists in database
   */
  async vehicleExists(thirdPartyId: number): Promise<boolean> {
    return this.vehicleExistsByVehicleId(thirdPartyId);
  }

  /**
   * Fetch vehicle from Malambi API, check by vehicleId, and sync if missing
   * This method fetches vehicle data, checks if it exists in database,
   * and triggers a background job to save it if missing
   * @param vehicleId - The vehicle ID from Malambi API
   */
  async syncVehicleByVehicleId(
    token: string,
    accId: string,
    subId: string,
    vehicleId: string,
  ): Promise<{ found: boolean; synced: boolean; skipped: boolean; message: string }> {
    try {
      if (!vehicleId) {
        return {
          found: false,
          synced: false,
          skipped: false,
          message: 'Invalid vehicleId provided',
        };
      }

      const vehicleIdNum = Number(vehicleId);
      if (isNaN(vehicleIdNum)) {
        return {
          found: false,
          synced: false,
          skipped: false,
          message: 'Invalid vehicleId format',
        };
      }

      this.logger.debug(`Fetching vehicle from Malambi API with vehicleId=${vehicleId}`);

      // Check if vehicle already exists in database
      const exists = await this.vehicleExistsByVehicleId(vehicleIdNum);
      if (exists) {
        this.logger.debug(`Vehicle with vehicleId=${vehicleId} already exists in database, skipping sync`);
        return {
          found: true,
          synced: false,
          skipped: true,
          message: `Vehicle with vehicleId=${vehicleId} already exists in database`,
        };
      }

      // Fetch vehicle from API
      const vehicleData = await this.malambiApi.getVehicleDetail(token, accId, subId, vehicleId);

      // Vehicle found in API, trigger background job to save it
      this.logger.debug(`Vehicle with vehicleId=${vehicleId} (${vehicleData.plate}) found in API, triggering sync job`);
      await this.queueService.add('vehicle-sync', 'sync-vehicle', {
        vehicleData: {
          id: vehicleData.id,
          plate: vehicleData.plate,
          model: vehicleData.model,
          brand: vehicleData.brand,
          year: vehicleData.year,
          tag2: vehicleData.tag2,
          groupId: vehicleData.groupId,
        },
      });

      this.logger.log(`Vehicle sync job triggered for vehicleId=${vehicleId} (${vehicleData.plate})`);

      return {
        found: true,
        synced: true,
        skipped: false,
        message: `Vehicle with vehicleId=${vehicleId} (${vehicleData.plate}) sync job triggered`,
      };
    } catch (error) {
      this.logger.error(
        `Error syncing vehicle by vehicleId:`,
        error instanceof Error ? error.stack : error,
      );
      
      // Check if it's a NotFoundException
      if (error instanceof NotFoundException) {
        return {
          found: false,
          synced: false,
          skipped: false,
          message: `Vehicle with vehicleId=${vehicleId} not found in Malambi API`,
        };
      }
      
      throw error;
    }
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


