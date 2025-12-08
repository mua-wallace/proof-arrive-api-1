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
      const { accid, subid } = job.data as { accid: number; subid: number };
      await this.usersSyncService.syncUser(accid, subid);
      this.logger.debug(`User sync job completed: accid=${accid}`);
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
      const { centerId, centerName } = job.data as { centerId: number; centerName?: string };
      await this.centersSyncService.syncCenter(centerId, centerName);
      this.logger.debug(`Center sync job completed: centerId=${centerId}`);
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

