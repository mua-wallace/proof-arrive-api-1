import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@modules/schemas';
import { eq, or, and } from 'drizzle-orm';

@Injectable()
export class CentersSeederService implements OnModuleInit {
  private readonly logger = new Logger(CentersSeederService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly dbConnection: PostgresJsDatabase<typeof schema>,
  ) {}

  async onModuleInit() {
    // Add a small delay to ensure database migrations have completed
    // This helps avoid race conditions when migrations run via startup scripts
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // Note: We no longer seed default centers on module init
    // Centers are now seeded per-account when users log in
    // This method is kept for backward compatibility but does nothing
  }

  /**
   * Seeds the database with 3 default centers for a specific accountId
   * These centers can be used when a user's center cannot be located
   * @param accountId - The account ID to seed centers for
   * @returns Promise that resolves when seeding is complete
   */
  async seedDefaultCentersForAccount(accountId: number): Promise<void> {
    const accountIdNum = Number(accountId);
    if (!accountIdNum || accountIdNum <= 0 || isNaN(accountIdNum)) {
      this.logger.warn(`⚠️  Invalid accountId (${accountId}), skipping center seeding`);
      return;
    }
    const accId = accountIdNum;

    try {
      // Verify database connection by checking if centers table is accessible
      // Use retry logic with exponential backoff to handle timing issues
      const maxRetries = 5;
      const initialDelay = 500; // Start with 500ms
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Try a simple query to check if table exists and is accessible
          await this.dbConnection
            .select()
            .from(schema.centers)
            .limit(1);
          
          // Success - table is ready
          break;
        } catch (dbError) {
          lastError = dbError instanceof Error ? dbError : new Error(String(dbError));
          
          // If this is the last attempt, log and return
          if (attempt === maxRetries - 1) {
            // Extract a cleaner error message
            const errorMessage = this.extractCleanErrorMessage(lastError);
            this.logger.warn(
              `⚠️  Database connection issue or centers table not ready after ${maxRetries} attempts for accountId ${accId}: ${errorMessage}. Skipping seeding.`,
            );
            return;
          }
          
          // Wait before retrying with exponential backoff
          const delay = initialDelay * Math.pow(2, attempt);
          this.logger.debug(
            `⏳ Centers table not ready (attempt ${attempt + 1}/${maxRetries}) for accountId ${accId}, retrying in ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      // Use account-scoped geozone_ids so they are globally unique (centers_geozone_id_unique constraint)
      const defaultCenterGeozoneIds = [
        accId * 1000 + 1,
        accId * 1000 + 2,
        accId * 1000 + 3,
      ];
      // Check once: if all 3 default centers already exist for this account, skip entirely (create just once)
      const existingCenters = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(
          and(
            eq(schema.centers.accountId, accId),
            or(
              eq(schema.centers.geozoneId, defaultCenterGeozoneIds[0]),
              eq(schema.centers.geozoneId, defaultCenterGeozoneIds[1]),
              eq(schema.centers.geozoneId, defaultCenterGeozoneIds[2]),
            ),
          ),
        );

      if (existingCenters.length >= 3) {
        this.logger.debug(`⏭️  Default centers already exist for accountId ${accId}, skipping seeding`);
        return;
      }

      const defaultCenters = [
        {
          thirdPartyId: accId * 1000 + 1,
          siteid: accId * 1000 + 2001,
          name: 'Center 001',
          fullname: 'Testing Center 001',
          geozone: 'TEST-ZONE-001',
          geozoneId: defaultCenterGeozoneIds[0],
          manager: 'Test Manager 001',
          groupid: 1,
          groupname: 'Test Group',
          sitetype: 0,
          distance: 0,
          time1: '06:00',
          time2: '22:00',
          saturday: '06:00',
          sunday: '06:00',
          breakstart: '12:00',
          breakstop: '13:00',
          timeoutin: 60,
          timeoutin_str: '01:00',
          timeoutin_muros: 30,
          timeoutin_muros_str: '00:30',
        },
        {
          thirdPartyId: accId * 1000 + 2,
          siteid: accId * 1000 + 2002,
          name: 'Center 002',
          fullname: 'Testing Center 002',
          geozone: 'TEST-ZONE-002',
          geozoneId: defaultCenterGeozoneIds[1],
          manager: 'Test Manager 002',
          groupid: 1,
          groupname: 'Test Group',
          sitetype: 0,
          distance: 0,
          time1: '06:00',
          time2: '22:00',
          saturday: '06:00',
          sunday: '06:00',
          breakstart: '12:00',
          breakstop: '13:00',
          timeoutin: 60,
          timeoutin_str: '01:00',
          timeoutin_muros: 30,
          timeoutin_muros_str: '00:30',
        },
        {
          thirdPartyId: accId * 1000 + 3,
          siteid: accId * 1000 + 2003,
          name: 'Center 003',
          fullname: 'Testing Center 003',
          geozone: 'TEST-ZONE-003',
          geozoneId: defaultCenterGeozoneIds[2],
          manager: 'Test Manager 003',
          groupid: 1,
          groupname: 'Test Group',
          sitetype: 0,
          distance: 0,
          time1: '06:00',
          time2: '22:00',
          saturday: '06:00',
          sunday: '06:00',
          breakstart: '12:00',
          breakstop: '13:00',
          timeoutin: 60,
          timeoutin_str: '01:00',
          timeoutin_muros: 30,
          timeoutin_muros_str: '00:30',
        },
      ];

      let seededCount = 0;
      for (const centerData of defaultCenters) {
        try {
          // Check if center already exists for this account by geozoneId (most reliable identifier)
          const existingCenter = await this.dbConnection
            .select()
            .from(schema.centers)
            .where(
              and(
                eq(schema.centers.accountId, accId),
                eq(schema.centers.geozoneId, centerData.geozoneId),
              ),
            )
            .limit(1);

          if (existingCenter.length === 0) {
            // Center doesn't exist for this account, insert it (create just once)
            // Note: id uses thirdPartyId value (not auto-generated)
            await this.dbConnection.insert(schema.centers).values({
              id: centerData.thirdPartyId, // Use thirdPartyId as id value
              ...centerData,
              accountId: accId,
            }).execute();
            seededCount += 1;
            this.logger.log(`✅ Seeded default center: ${centerData.name} (geozoneId: ${centerData.geozoneId}) for accountId ${accId}`);
          } else {
            this.logger.debug(`⏭️  Default center ${centerData.name} (geozoneId: ${centerData.geozoneId}) already exists for accountId ${accId}, skipping`);
          }
        } catch (centerError) {
          const errorMessage = centerError instanceof Error ? centerError.message : 'Unknown error';
          const errorStack = centerError instanceof Error ? centerError.stack : undefined;
          this.logger.error(
            `❌ Error seeding center ${centerData.name} (geozoneId: ${centerData.geozoneId}) for accountId ${accId}: ${errorMessage}`,
            errorStack,
          );
          // Log the actual error details
          if (centerError instanceof Error && 'cause' in centerError) {
            this.logger.error(`Error cause: ${JSON.stringify(centerError.cause)}`);
          }
          // Continue with next center instead of failing completely
        }
      }

      if (seededCount > 0) {
        this.logger.log(`✅ Default centers seeding completed for accountId ${accId} (${seededCount} created)`);
      }
    } catch (error) {
      this.logger.error(
        `❌ Error seeding default centers for accountId ${accId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw - allow app to continue even if seeding fails
    }
  }

  /**
   * Legacy method: Seeds the database with 3 default centers for accountId 0 (backward compatibility)
   * @deprecated Use seedDefaultCentersForAccount(accountId) instead
   */
  async seedDefaultCenters(): Promise<void> {
    // Delegate to the new account-aware method with accountId 0 for backward compatibility
    await this.seedDefaultCentersForAccount(0);
  }

  /**
   * Get the 3 default centers that users can choose from for a specific accountId
   * @param accountId - The account ID to get default centers for
   * @returns Promise that resolves to an array of default centers
   */
  async getDefaultCenters(accountId: number): Promise<typeof schema.centers.$inferSelect[]> {
    if (!accountId || accountId <= 0) {
      this.logger.warn(`⚠️  Invalid accountId (${accountId}), returning empty array`);
      return [];
    }

    try {
      // Must match account-scoped geozone_ids used in seedDefaultCentersForAccount
      const defaultCenterIds = [
        accountId * 1000 + 1,
        accountId * 1000 + 2,
        accountId * 1000 + 3,
      ];

      const centers = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(
          and(
            eq(schema.centers.accountId, accountId),
            or(
              eq(schema.centers.geozoneId, defaultCenterIds[0]),
              eq(schema.centers.geozoneId, defaultCenterIds[1]),
              eq(schema.centers.geozoneId, defaultCenterIds[2]),
            ),
          ),
        );

      return centers;
    } catch (error) {
      this.logger.error(
        `Failed to get default centers for accountId ${accountId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Extracts a clean, user-friendly error message from database errors
   * Removes verbose SQL queries and focuses on the actual issue
   */
  private extractCleanErrorMessage(error: Error): string {
    let message = error.message || 'Unknown error';
    
    // Remove verbose SQL query details from drizzle errors
    if (message.includes('Failed query:')) {
      // Extract just the error type, not the full query
      const match = message.match(/^([^:]+):/);
      if (match) {
        message = match[1];
      } else {
        // If it's a table doesn't exist error, make it clearer
        if (message.toLowerCase().includes('does not exist') || 
            message.toLowerCase().includes('relation') && message.toLowerCase().includes('not exist')) {
          message = 'Table "centers" does not exist (migrations may not have completed)';
        } else {
          message = 'Database query failed';
        }
      }
    }
    
    // Handle common PostgreSQL errors
    if (message.includes('relation') && message.includes('does not exist')) {
      return 'Table "centers" does not exist (migrations may not have completed)';
    }
    
    if (message.includes('connection') || message.includes('ECONNREFUSED')) {
      return 'Database connection refused (database may not be ready)';
    }
    
    if (message.includes('timeout')) {
      return 'Database connection timeout';
    }
    
    // Return a truncated message if it's too long
    if (message.length > 200) {
      return message.substring(0, 197) + '...';
    }
    
    return message;
  }
}

