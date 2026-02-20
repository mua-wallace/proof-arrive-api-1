import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@modules/schemas';
import { eq, and } from 'drizzle-orm';
import { MalambiApiService } from '@integrations/malambi-api/malambi-api.service';
import { QueueService } from '@common/queue/queue.service';
import { VehicleGroupDto } from './dto/vehicle-group.dto';

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
   * @param accountId - Account ID for multi-tenancy
   */
  async syncVehicle(vehicleData: {
    id: number;
    plate: string;
    model?: string;
    brand?: string;
    year?: number;
    tag2?: string;
    groupId?: number;
  }, accountId: number): Promise<void> {
    try {
      // Validate thirdPartyId from Malambi API
      // id column uses thirdPartyId value (not auto-generated)
      const thirdPartyId = vehicleData.id;
      if (!thirdPartyId || typeof thirdPartyId !== 'number' || thirdPartyId <= 0 || !Number.isInteger(thirdPartyId)) {
        throw new Error(`Invalid thirdPartyId from Malambi API: "${vehicleData.id}" must be a positive integer for vehicle id`);
      }
      
      // Check if vehicle already exists by thirdPartyId and accountId
      const existingVehicle = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.thirdPartyId, thirdPartyId),
            eq(schema.vehicles.accountId, accountId),
          ),
        )
        .limit(1);

      if (existingVehicle.length > 0) {
        return;
      }

      // Insert vehicle with data from Malambi API
      // Note: id uses thirdPartyId value from Malambi API (not auto-generated)
      // centerId is set to null initially - can be assigned manually later
      const vehicleRecord = {
        id: thirdPartyId, // Use thirdPartyId as id value (from Malambi API)
        accountId: accountId, // Multi-tenant: account ID
        thirdPartyId,
        plate: vehicleData.plate || `PLATE_${thirdPartyId}`,
        model: vehicleData.model || null,
        brand: vehicleData.brand || null,
        year: vehicleData.year || null,
        tag2: vehicleData.tag2 || null,
        groupId: vehicleData.groupId || null,
        centerId: null, // Initially null - can be assigned manually later
        isActive: true,
        lastSyncedAt: new Date(),
      };

      try {
        await this.dbConnection.insert(schema.vehicles).values(vehicleRecord).execute();
      } catch (insertError: any) {
        // Handle unique constraint violation (duplicate thirdPartyId for this account)
        const errorCode = insertError?.code;
        const errorMessage = insertError?.message || '';
        
        // PostgreSQL unique constraint violation code
        if (errorCode === '23505' || errorMessage.includes('unique constraint') || errorMessage.includes('duplicate key')) {
          // Vehicle already exists, skip silently (idempotent operation)
          this.logger.debug(`Vehicle with thirdPartyId=${thirdPartyId} already exists for accountId=${accountId}, skipping`);
          return;
        }
        
        // Re-throw other errors
        throw insertError;
      }
    } catch (error) {
      this.logger.error(`Error syncing vehicle:`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Check if vehicle exists in database by thirdPartyId (vehicleId) and accountId
   */
  async vehicleExistsByVehicleId(vehicleId: number, accountId: number): Promise<boolean> {
    if (!vehicleId) {
      return false;
    }

    const vehicle = await this.dbConnection
      .select()
      .from(schema.vehicles)
      .where(
        and(
          eq(schema.vehicles.thirdPartyId, vehicleId),
          eq(schema.vehicles.accountId, accountId),
        ),
      )
      .limit(1);

    return vehicle.length > 0;
  }

  /**
   * Check if vehicle exists in database
   */
  async vehicleExists(thirdPartyId: number, accountId: number): Promise<boolean> {
    return this.vehicleExistsByVehicleId(thirdPartyId, accountId);
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

      // Check if vehicle already exists in database
      const accountIdNum = Number(accId);
      const exists = await this.vehicleExistsByVehicleId(vehicleIdNum, accountIdNum);
      if (exists) {
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
        accountId: accountIdNum, // Multi-tenant: account ID
      });

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
  async ensureVehicleSynced(thirdPartyId: number, accountId: number): Promise<void> {
    const exists = await this.vehicleExists(thirdPartyId, accountId);
    if (!exists) {
      await this.queueService.add('vehicle-sync', 'sync-vehicle', { thirdPartyId, accountId });
    }
  }

  /**
   * Bulk sync vehicles from vehicle groups
   * Processes all vehicles from the groups and triggers background sync jobs for vehicles that don't exist
   * @param groups - Array of vehicle groups with vehicles
   * @param accountId - Account ID for multi-tenancy
   * @returns Summary of sync operation
   */
  async bulkSyncVehiclesFromGroups(
    groups: VehicleGroupDto[],
    accountId: number,
  ): Promise<{
    totalGroups: number;
    totalVehicles: number;
    synced: number;
    skipped: number;
    errors: number;
    message: string;
  }> {
    let totalVehicles = 0;
    let synced = 0;
    let skipped = 0;
    let errors = 0;

    try {
      for (const group of groups) {
        if (!group.vehicles || group.vehicles.length === 0) {
          continue;
        }

        totalVehicles += group.vehicles.length;

        // First, ensure the group exists
        let groupRecordId: number | null = null;
        if (group.groupId) {
          const [existingGroup] = await this.dbConnection
            .select()
            .from(schema.vehicleGroups)
            .where(
              and(
                eq(schema.vehicleGroups.groupId, group.groupId),
                eq(schema.vehicleGroups.accountId, accountId),
              ),
            )
            .limit(1);

          if (existingGroup) {
            groupRecordId = existingGroup.id;
          } else {
            // Create group if it doesn't exist (handle unique constraint violations)
            try {
              const [newGroup] = await this.dbConnection
                .insert(schema.vehicleGroups)
                .values({
                  accountId,
                  groupId: group.groupId,
                  groupName: group.groupName,
                })
                .returning({ id: schema.vehicleGroups.id });
              groupRecordId = newGroup.id;
            } catch (insertError: any) {
              // Handle unique constraint violation (duplicate groupId for this account)
              const errorCode = insertError?.code;
              const errorMessage = insertError?.message || '';
              
              // PostgreSQL unique constraint violation code
              if (errorCode === '23505' || errorMessage.includes('unique constraint') || errorMessage.includes('duplicate key')) {
                // Group already exists, fetch it
                this.logger.debug(`Group ${group.groupId} already exists for account ${accountId}, fetching...`);
                const [existingGroupAfterConflict] = await this.dbConnection
                  .select()
                  .from(schema.vehicleGroups)
                  .where(
                    and(
                      eq(schema.vehicleGroups.groupId, group.groupId),
                      eq(schema.vehicleGroups.accountId, accountId),
                    ),
                  )
                  .limit(1);
                if (existingGroupAfterConflict) {
                  groupRecordId = existingGroupAfterConflict.id;
                }
              } else {
                // Re-throw other errors
                throw insertError;
              }
            }
          }
        }

        for (const vehicle of group.vehicles) {
          try {
            // Check if vehicle already exists (with accountId check)
            const exists = await this.vehicleExistsByVehicleId(vehicle.id, accountId);
            if (exists) {
              skipped++;
              continue;
            }

            // Trigger background sync job with vehicle data and groupId
            await this.queueService.add('vehicle-sync', 'sync-vehicle', {
              vehicleData: {
                id: vehicle.id,
                plate: vehicle.plate,
                model: vehicle.model,
                brand: vehicle.brand,
                year: vehicle.year,
                tag2: vehicle.tag2,
                groupId: groupRecordId, // Use the group's database ID (not Malambi groupId)
              },
              accountId: accountId,
            });

            synced++;
          } catch (error) {
            this.logger.error(
              `Error syncing vehicle ${vehicle.id} from group ${group.groupId}:`,
              error instanceof Error ? error.stack : error,
            );
            errors++;
          }
        }
      }

      return {
        totalGroups: groups.length,
        totalVehicles,
        synced,
        skipped,
        errors,
        message: `Bulk sync completed: ${synced} synced, ${skipped} skipped, ${errors} errors`,
      };
    } catch (error) {
      this.logger.error(
        'Error in bulk sync vehicles from groups:',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }
}


