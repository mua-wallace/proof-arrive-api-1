import { Module } from '@nestjs/common';
import { QueuesController } from './queues.controller';
import { VehicleQueueController } from './vehicle-queue.controller';
import { QueuesService } from './queues.service';
import { DatabaseModule } from '@database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [QueuesController, VehicleQueueController],
  providers: [QueuesService],
  exports: [QueuesService],
})
export class QueuesModule {}
