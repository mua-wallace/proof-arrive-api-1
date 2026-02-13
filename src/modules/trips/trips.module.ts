import { Module, forwardRef } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { DatabaseModule } from '@database/database.module';
import { QueuesModule } from '@modules/queues/queues.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => QueuesModule), // Forward ref to avoid circular dependency
  ],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
