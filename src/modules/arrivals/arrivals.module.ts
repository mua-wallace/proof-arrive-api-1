import { Module } from '@nestjs/common';
import { ArrivalsController } from './arrivals.controller';
import { ArrivalsService } from './arrivals.service';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { CentersModule } from '@modules/centers/centers.module';

@Module({
  imports: [VehiclesModule, CentersModule],
  controllers: [ArrivalsController],
  providers: [ArrivalsService],
  exports: [ArrivalsService],
})
export class ArrivalsModule {}

