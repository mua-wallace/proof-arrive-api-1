import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueService } from './queue.service';
import { UsersSyncService } from '@modules/users/users-sync.service';
import { VehiclesSyncService } from '@modules/vehicles/vehicles-sync.service';
import { CentersSyncService } from '@modules/centers/centers-sync.service';

@Injectable()
export class QueueProcessorService implements OnModuleInit {
  private readonly logger = new Logger(QueueProcessorService.name);
  private isProcessing = false;

  constructor(
    private readonly queueService: QueueService,
    private readonly usersSyncService: UsersSyncService,
    private readonly vehiclesSyncService: VehiclesSyncService,
    private readonly centersSyncService: CentersSyncService,
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
    this.logger.log('Queue processor started');

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
        };
      };
      
      if (!jobData.userData) {
        this.logger.error('Invalid user sync job data: missing userData');
        return;
      }

      await this.usersSyncService.syncUser(jobData.userData);
      this.logger.debug(`User sync job completed: accid=${jobData.userData.accid}`);
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
      const { thirdPartyId } = job.data as { thirdPartyId: number };
      await this.vehiclesSyncService.syncVehicle(thirdPartyId);
      this.logger.debug(`Vehicle sync job completed: thirdPartyId=${thirdPartyId}`);
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
        thirdPartyId?: number;
        siteid?: number;
      };
      
      if (jobData.centerData) {
        await this.centersSyncService.syncCenter(jobData.centerData);
        this.logger.debug(`Center sync job completed: thirdPartyId=${jobData.centerData.id}, siteid=${jobData.centerData.siteid}`);
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
    this.logger.log('Queue processor stopped');
  }
}


