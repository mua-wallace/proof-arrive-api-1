import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { DatabaseModule } from '@database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
