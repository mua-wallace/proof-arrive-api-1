import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueService } from './queue.service';
import { UsersSyncService } from '@modules/users/users-sync.service';
import { VehiclesSyncService } from '@modules/vehicles/vehicles-sync.service';
import { CentersSyncService } from '@modules/centers/centers-sync.service';
import { CentersSeederService } from '@modules/centers/centers-seeder.service';

@Injectable()
export class QueueProcessorService implements OnModuleInit {
  private readonly logger = new Logger(QueueProcessorService.name);
  private isProcessing = false;

  constructor(
    private readonly queueService: QueueService,
    private readonly usersSyncService: UsersSyncService,
    private readonly vehiclesSyncService: VehiclesSyncService,
    private readonly centersSyncService: CentersSyncService,
    private readonly centersSeederService: CentersSeederService,
  ) {}

  async onModuleInit() {
    // Wait a bit for migrations to complete before starting queue processing
    // This ensures migration 0005 (user fields) runs before user sync operations
    this.logger.log('Waiting for migrations to complete before starting queue processing...');
    
    // Give migrations time to run (MigrationService runs on module init)
    // Wait up to 30 seconds for migrations to complete
    let migrationsReady = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if user columns exist (migration 0005 indicator)
      try {
        const { Client } = require('pg');
        const client = new Client({
          host: process.env.DATABASE_HOST,
          port: parseInt(process.env.DATABASE_PORT || '5432'),
          user: process.env.DATABASE_USERNAME || 'postgres',
          password: process.env.DATABASE_PASSWORD,
          database: process.env.DATABASE_NAME,
        });
        
        await client.connect();
        const result = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema='public' 
          AND table_name='users' 
          AND column_name IN ('email', 'role', 'fullname')
        `);
        await client.end();
        
        const foundColumns = result.rows.map((r: any) => r.column_name);
        if (foundColumns.length === 3) {
          migrationsReady = true;
          this.logger.log('✓ Migrations ready - user columns exist');
          break;
        }
      } catch (err: any) {
        // Database might not be ready yet, continue waiting
        if (i === 0 || i % 5 === 0) {
          this.logger.debug(`Waiting for migrations... (attempt ${i + 1}/30)`);
        }
      }
    }
    
    if (!migrationsReady) {
      this.logger.warn('⚠️  Migrations may not have completed. Queue processing will start anyway.');
      this.logger.warn('⚠️  User operations may fail if migration 0005 hasn\'t run.');
    }
    
    // Start processing queue
    this.startProcessing();
  }

  /**
   * Start processing jobs from queues
   */
  private async startProcessing(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    // Process jobs continuously
    while (this.isProcessing) {
      await this.processJobs();
      // Wait a bit before checking again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  /**
   * Process jobs from all queues
   */
  private async processJobs(): Promise<void> {
    // Process user sync jobs
    await this.processUserSyncJobs();

    // Process vehicle sync jobs
    await this.processVehicleSyncJobs();

    // Process center sync jobs
    await this.processCenterSyncJobs();
  }

  /**
   * Process user sync jobs
   */
  private async processUserSyncJobs(): Promise<void> {
    const job = this.queueService.getNextJob('user-sync');
    if (!job) {
      return;
    }

    try {
      const jobData = job.data as { 
        userData: {
          accid: string;
          subid: string;
          token: string;
          session: string;
          username: string;
          company: string;
          k_u: string;
          pid: string;
          partner: string;
          k_k: string;
          expire: string;
          k_p: string;
          email?: string; // Optional email field
        };
      };
      
      if (!jobData.userData) {
        this.logger.error('Invalid user sync job data: missing userData');
        return;
      }

      // Check if this user (accid+subid) already exists before syncing
      const userExists = await this.usersSyncService.userExistsByAccidAndSubid(
        jobData.userData.accid,
        jobData.userData.subid,
      );

      // Sync user (this will only create if user doesn't exist)
      await this.usersSyncService.syncUser(jobData.userData);

      // If user was newly created, seed default centers for their accountId
      if (!userExists) {
        const accountId = Number(jobData.userData.accid);
        if (accountId > 0) {
          // Seed default centers for this account in the background (non-blocking)
          this.centersSeederService.seedDefaultCentersForAccount(accountId).catch((error) => {
            this.logger.error(
              `Error seeding default centers for accountId ${accountId} after user sync:`,
              error instanceof Error ? error.stack : error,
            );
          });
        }
      }
    } catch (error) {
      this.logger.error(`Error processing user sync job:`, error instanceof Error ? error.stack : error);
    }
  }

  /**
   * Process vehicle sync jobs
   */
  private async processVehicleSyncJobs(): Promise<void> {
    const job = this.queueService.getNextJob('vehicle-sync');
    if (!job) {
      return;
    }

    try {
      const jobData = job.data as {
        vehicleData?: {
          id: number;
          plate: string;
          model?: string;
          brand?: string;
          year?: number;
          tag2?: string;
          groupId?: number;
        };
        accountId?: number;
        thirdPartyId?: number;
      };
      
      if (jobData.vehicleData) {
        if (!jobData.accountId) {
          this.logger.error('Invalid vehicle sync job data: missing accountId');
          return;
        }
        await this.vehiclesSyncService.syncVehicle(jobData.vehicleData, jobData.accountId);
      } else if (jobData.thirdPartyId) {
        // Legacy support: if only thirdPartyId is provided, we would need to fetch vehicle data from Malambi API
        // For now, log an error as we need full vehicle data
        this.logger.error('Invalid vehicle sync job data: missing vehicleData. Full vehicle data is required.');
      } else {
        this.logger.error('Invalid vehicle sync job data: missing vehicleData or thirdPartyId');
      }
    } catch (error) {
      this.logger.error(`Error processing vehicle sync job:`, error instanceof Error ? error.stack : error);
    }
  }

  /**
   * Process center sync jobs
   */
  private async processCenterSyncJobs(): Promise<void> {
    const job = this.queueService.getNextJob('center-sync');
    if (!job) {
      return;
    }

    try {
      const jobData = job.data as {
        centerData?: {
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
        };
        accountId?: number;
        thirdPartyId?: number;
        siteid?: number;
      };
      
      if (jobData.centerData) {
        if (!jobData.accountId) {
          this.logger.error('Invalid center sync job data: missing accountId');
          return;
        }
        await this.centersSyncService.syncCenter(jobData.centerData, jobData.accountId);
      } else if (jobData.thirdPartyId || jobData.siteid) {
        // If only IDs are provided, we would need to fetch center data from Malambi API
        // For now, log an error as we need full center data
        this.logger.error('Invalid center sync job data: missing centerData. Full center data is required.');
      } else {
        this.logger.error('Invalid center sync job data: missing centerData or IDs');
      }
    } catch (error) {
      this.logger.error(`Error processing center sync job:`, error instanceof Error ? error.stack : error);
    }
  }

  /**
   * Stop processing
   */
  stopProcessing(): void {
    this.isProcessing = false;
  }
}


