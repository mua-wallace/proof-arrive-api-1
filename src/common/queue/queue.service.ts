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
    // Jobs are processed by QueueProcessorService, not here
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


