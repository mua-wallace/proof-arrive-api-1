import { Injectable, Logger } from '@nestjs/common';

export interface QueueJob<T = any> {
  id: string;
  type: string;
  data: T;
  priority?: number;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues: Map<string, QueueJob[]> = new Map();
  private processing = false;

  /**
   * Add a job to the queue
   */
  async add<T>(queueName: string, jobType: string, data: T, priority = 0): Promise<void> {
    const job: QueueJob<T> = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: jobType,
      data,
      priority,
    };

    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, []);
    }

    const queue = this.queues.get(queueName)!;
    queue.push(job);
    
    // Sort by priority (higher priority first)
    queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    this.logger.debug(`Job added to queue ${queueName}: ${jobType} (${job.id})`);

    // Start processing if not already processing
    if (!this.processing) {
      this.processQueues();
    }
  }

  /**
   * Process all queues
   */
  private async processQueues(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.hasJobs()) {
      for (const [queueName, jobs] of this.queues.entries()) {
        if (jobs.length > 0) {
          const job = jobs.shift()!;
          try {
            this.logger.debug(`Processing job from ${queueName}: ${job.type} (${job.id})`);
            // Jobs will be processed by their respective processors
            // This is just a simple queue - actual processing happens in sync services
          } catch (error) {
            this.logger.error(`Error processing job ${job.id}:`, error);
          }
        }
      }

      // Small delay to prevent CPU spinning
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.processing = false;
  }

  /**
   * Check if there are any jobs in any queue
   */
  private hasJobs(): boolean {
    for (const jobs of this.queues.values()) {
      if (jobs.length > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get next job from a specific queue
   */
  getNextJob(queueName: string): QueueJob | null {
    const queue = this.queues.get(queueName);
    if (!queue || queue.length === 0) {
      return null;
    }
    return queue.shift() || null;
  }

  /**
   * Get queue size
   */
  getQueueSize(queueName: string): number {
    const queue = this.queues.get(queueName);
    return queue ? queue.length : 0;
  }
}


