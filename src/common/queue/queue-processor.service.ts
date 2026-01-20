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

  onModuleInit() {
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

      // Check if user already exists before syncing
      const userExists = await this.usersSyncService.userExists(jobData.userData.accid);
      
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


