import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@modules/schemas';
import { eq, or } from 'drizzle-orm';
import { MalambiApiService } from '@integrations/malambi-api/malambi-api.service';
import { QueueService } from '@common/queue/queue.service';

@Injectable()
export class CentersSyncService {
  private readonly logger = new Logger(CentersSyncService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly dbConnection: PostgresJsDatabase<typeof schema>,
    private readonly malambiApi: MalambiApiService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Sync center from Malambi API to database
   * @param centerData - Full center data from Malambi API
   * @param accountId - Account ID for multi-tenancy
   */
  async syncCenter(centerData: {
    id: number;
    siteid: number;
    name: string;
    fullname?: string;
    geozone?: string;
    gzone_id?: number;
    manager?: string;
    groupid?: number;
    groupname?: string;
    sitetype?: number;
    distance?: number;
    time1?: string;
    time2?: string;
    saturday?: string;
    sunday?: string;
    breakstart?: string;
    breakstop?: string;
    timeoutin?: number;
    timeoutin_str?: string;
    timeoutin_muros?: number;
    timeoutin_muros_str?: string;
  }, accountId: number): Promise<void> {
    try {
      // Validate geozoneId from Malambi API
      // id column uses geozoneId value (not auto-generated)
      const geozoneId = centerData.gzone_id;
      if (!geozoneId || typeof geozoneId !== 'number' || geozoneId <= 0 || !Number.isInteger(geozoneId)) {
        throw new Error(`Invalid geozoneId (gzone_id) from Malambi API: "${centerData.gzone_id}" must be a positive integer for center id`);
      }
      
      const thirdPartyId = centerData.id;
      const siteid = centerData.siteid;
      
      // Check if center already exists by geozoneId, thirdPartyId, or siteid
      const conditions = [
        eq(schema.centers.geozoneId, geozoneId),
        eq(schema.centers.thirdPartyId, thirdPartyId),
        eq(schema.centers.siteid, siteid),
      ];

      const existingCenter = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(or(...conditions))
        .limit(1);

      if (existingCenter.length > 0) {
        return;
      }

      // Insert center with data from Malambi API
      // Note: id uses geozoneId value from Malambi API (not auto-generated)
      const centerRecord = {
        id: geozoneId, // Use geozoneId as id value (from Malambi API gzone_id)
        accountId: accountId, // Multi-tenant: account ID
        thirdPartyId,
        siteid,
        name: centerData.name || `Center_${geozoneId}`,
        fullname: centerData.fullname || null,
        geozone: centerData.geozone || null,
        geozoneId: geozoneId, // Use validated geozoneId (from Malambi API gzone_id)
        manager: centerData.manager || null,
        groupid: centerData.groupid || null,
        groupname: centerData.groupname || null,
        sitetype: centerData.sitetype ?? 0,
        distance: centerData.distance || null,
        time1: centerData.time1 || null,
        time2: centerData.time2 || null,
        saturday: centerData.saturday || null,
        sunday: centerData.sunday || null,
        breakstart: centerData.breakstart || null,
        breakstop: centerData.breakstop || null,
        timeoutin: centerData.timeoutin || null,
        timeoutin_str: centerData.timeoutin_str || null,
        timeoutin_muros: centerData.timeoutin_muros || null,
        timeoutin_muros_str: centerData.timeoutin_muros_str || null,
      };

      await this.dbConnection.insert(schema.centers).values(centerRecord).execute();
    } catch (error) {
      this.logger.error(`Error syncing center:`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Check if center exists in database by geozoneId (gzone_id)
   */
  async centerExistsByGeozoneId(geozoneId: number): Promise<boolean> {
    if (!geozoneId) {
      return false;
    }

    const center = await this.dbConnection
      .select()
      .from(schema.centers)
      .where(eq(schema.centers.geozoneId, geozoneId))
      .limit(1);

    return center.length > 0;
  }

  /**
   * Check if center exists in database by thirdPartyId or siteid
   */
  async centerExists(thirdPartyId?: number, siteid?: number): Promise<boolean> {
    if (!thirdPartyId && !siteid) {
      return false;
    }

    const conditions: ReturnType<typeof eq>[] = [];
    if (thirdPartyId) {
      conditions.push(eq(schema.centers.thirdPartyId, thirdPartyId));
    }
    if (siteid) {
      conditions.push(eq(schema.centers.siteid, siteid));
    }

    if (conditions.length === 0) {
      return false;
    }

    const center = await this.dbConnection
      .select()
      .from(schema.centers)
      .where(conditions.length === 1 ? conditions[0] : or(...conditions))
      .limit(1);

    return center.length > 0;
  }

  /**
   * Fetch centers from Malambi API, find center by geozone_id, and sync if missing
   * This method fetches all centers, finds the one with matching gzone_id,
   * checks if it exists in database, and triggers a background job to save it if missing
   * @param geozoneId - The geozone_id (gzone_id) to find and sync
   */
  async syncCenterByGeozoneId(
    token: string,
    accId: string,
    subId: string,
    geozoneId: number,
  ): Promise<{ found: boolean; synced: boolean; skipped: boolean; message: string; center?: any }> {
    try {
      if (!geozoneId || geozoneId === 0) {
        return {
          found: false,
          synced: false,
          skipped: false,
          message: 'Invalid geozone_id provided',
        };
      }

      // Check if center already exists in database and fetch it
      const existingCenter = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(eq(schema.centers.geozoneId, geozoneId))
        .limit(1);

      if (existingCenter.length > 0) {
        return {
          found: true,
          synced: false,
          skipped: true,
          message: `Center with gzone_id=${geozoneId} already exists in database`,
          center: existingCenter[0],
        };
      }

      // Fetch centers from API (using default options: limit=1000, regionid=-1, filtertype=1)
      const response = await this.malambiApi.getCenters(token, accId, subId, {
        limit: 1000,
        regionid: -1,
        filtertype: 1,
      });

      if (!response.success || !Array.isArray(response.rows)) {
        return {
          found: false,
          synced: false,
          skipped: false,
          message: 'Invalid response from Malambi API',
        };
      }

      // Find center with matching gzone_id in the rows array
      const centerData = response.rows.find((center) => center.gzone_id === geozoneId);

      if (!centerData) {
        return {
          found: false,
          synced: false,
          skipped: false,
          message: `Center with gzone_id=${geozoneId} not found in Malambi API`,
        };
      }

      // Center found in API, trigger background job to save it
      const accountIdNum = Number(accId);
      await this.queueService.add('center-sync', 'sync-center', {
        centerData: {
          id: centerData.id,
          siteid: centerData.siteid,
          name: centerData.name,
          fullname: centerData.fullname,
          geozone: centerData.geozone,
          gzone_id: centerData.gzone_id,
          manager: centerData.manager,
          groupid: centerData.groupid,
          groupname: centerData.groupname,
          sitetype: centerData.sitetype,
          distance: centerData.distance,
          time1: centerData.time1,
          time2: centerData.time2,
          saturday: centerData.saturday,
          sunday: centerData.sunday,
          breakstart: centerData.breakstart,
          breakstop: centerData.breakstop,
          timeoutin: centerData.timeoutin,
          timeoutin_str: centerData.timeoutin_str,
          timeoutin_muros: centerData.timeoutin_muros,
          timeoutin_muros_str: centerData.timeoutin_muros_str,
        },
        accountId: accountIdNum, // Multi-tenant: account ID
      });

      return {
        found: true,
        synced: true,
        skipped: false,
        message: `Center with gzone_id=${geozoneId} (${centerData.name}) sync job triggered`,
        center: centerData,
      };
    } catch (error) {
      this.logger.error(
        `Error syncing center by geozone_id:`,
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  /**
   * Ensure center is synced - check if exists, if not trigger background sync job
   * Call this method when a center is accessed/scanned
   */
  async ensureCenterSynced(thirdPartyId?: number, siteid?: number): Promise<void> {
    const exists = await this.centerExists(thirdPartyId, siteid);
    if (!exists) {
      await this.queueService.add('center-sync', 'sync-center', { thirdPartyId, siteid });
    }
  }

  /**
   * Bulk sync centers from API response
   * Processes all centers and triggers background sync jobs for centers that don't exist
   * @param centers - Array of centers from Malambi API
   * @param accountId - Account ID for multi-tenancy
   * @returns Summary of sync operation
   */
  async bulkSyncCenters(
    centers: any[],
    accountId: number,
  ): Promise<{
    totalCenters: number;
    synced: number;
    skipped: number;
    errors: number;
    message: string;
  }> {
    let synced = 0;
    let skipped = 0;
    let errors = 0;

    try {
      for (const center of centers) {
        try {
          // Check if center already exists (with accountId check)
          const exists = await this.centerExists(center.id, center.siteid);
          if (exists) {
            skipped++;
            continue;
          }

          // Trigger background sync job with center data
          await this.queueService.add('center-sync', 'sync-center', {
            centerData: {
              id: center.id,
              siteid: center.siteid,
              name: center.name,
              fullname: center.fullname,
              geozone: center.geozone,
              gzone_id: center.gzone_id,
              manager: center.manager,
              groupid: center.groupid,
              groupname: center.groupname,
              sitetype: center.sitetype,
              distance: center.distance,
              time1: center.time1,
              time2: center.time2,
              saturday: center.saturday,
              sunday: center.sunday,
              breakstart: center.breakstart,
              breakstop: center.breakstop,
              timeoutin: center.timeoutin,
              timeoutin_str: center.timeoutin_str,
              timeoutin_muros: center.timeoutin_muros,
              timeoutin_muros_str: center.timeoutin_muros_str,
            },
            accountId: accountId,
          });

          synced++;
        } catch (error) {
          this.logger.error(
            `Error syncing center ${center.id}:`,
            error instanceof Error ? error.stack : error,
          );
          errors++;
        }
      }

      return {
        totalCenters: centers.length,
        synced,
        skipped,
        errors,
        message: `Bulk sync completed: ${synced} synced, ${skipped} skipped, ${errors} errors`,
      };
    } catch (error) {
      this.logger.error(
        'Error in bulk sync centers:',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }
}


