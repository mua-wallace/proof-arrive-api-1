import { Module, forwardRef } from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueProcessorService } from './queue-processor.service';
import { UsersModule } from '@modules/users/users.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { CentersModule } from '@modules/centers/centers.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => VehiclesModule),
    forwardRef(() => CentersModule),
  ],
  providers: [QueueService, QueueProcessorService],
  exports: [QueueService],
})
export class QueueModule {}

