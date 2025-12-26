import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@modules/schemas';
import { eq, or } from 'drizzle-orm';

@Injectable()
export class CentersSeederService implements OnModuleInit {
  private readonly logger = new Logger(CentersSeederService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly dbConnection: PostgresJsDatabase<typeof schema>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultCenters();
  }

  /**
   * Seeds the database with 3 default centers for testing purposes
   * These centers can be used when a user's center cannot be located
   */
  async seedDefaultCenters(): Promise<void> {
    try {
      const defaultCenters = [
        {
          thirdPartyId: 1001,
          siteid: 2001,
          name: 'Center 001',
          fullname: 'Testing Center 001',
          geozone: 'TEST-ZONE-001',
          geozoneId: 3001,
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
          thirdPartyId: 1002,
          siteid: 2002,
          name: 'Center 002',
          fullname: 'Testing Center 002',
          geozone: 'TEST-ZONE-002',
          geozoneId: 3002,
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
          thirdPartyId: 1003,
          siteid: 2003,
          name: 'Center 003',
          fullname: 'Testing Center 003',
          geozone: 'TEST-ZONE-003',
          geozoneId: 3003,
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

      for (const centerData of defaultCenters) {
        // Check if center already exists by thirdPartyId, siteid, or geozoneId
        const existingCenter = await this.dbConnection
          .select()
          .from(schema.centers)
          .where(
            or(
              eq(schema.centers.thirdPartyId, centerData.thirdPartyId),
              eq(schema.centers.siteid, centerData.siteid),
              eq(schema.centers.geozoneId, centerData.geozoneId),
            ),
          )
          .limit(1);

        if (existingCenter.length === 0) {
          // Center doesn't exist, insert it
          await this.dbConnection.insert(schema.centers).values(centerData).execute();
          this.logger.log(`✅ Seeded default center: ${centerData.name} (ID: ${centerData.thirdPartyId})`);
        } else {
          this.logger.debug(`⏭️  Default center ${centerData.name} already exists, skipping`);
        }
      }

      this.logger.log('✅ Default centers seeding completed');
    } catch (error) {
      this.logger.error(
        `❌ Error seeding default centers: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw - allow app to continue even if seeding fails
    }
  }

  /**
   * Get the 3 default centers that users can choose from
   */
  async getDefaultCenters(): Promise<typeof schema.centers.$inferSelect[]> {
    try {
      const defaultCenterIds = [3001, 3002, 3003]; // geozoneIds of default centers

      const centers = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(
          or(
            eq(schema.centers.geozoneId, defaultCenterIds[0]),
            eq(schema.centers.geozoneId, defaultCenterIds[1]),
            eq(schema.centers.geozoneId, defaultCenterIds[2]),
          ),
        );

      return centers;
    } catch (error) {
      this.logger.error(
        `Failed to get default centers: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}

