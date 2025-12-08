import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { MalambiApiModule } from '@integrations/malambi-api/malambi-api.module';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehiclesSyncService } from './vehicles-sync.service';

@Module({
  imports: [DatabaseModule, MalambiApiModule],
  controllers: [VehiclesController],
  providers: [VehiclesService, VehiclesSyncService],
  exports: [VehiclesService, VehiclesSyncService],
})
export class VehiclesModule {}

