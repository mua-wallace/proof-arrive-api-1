import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { MalambiApiModule } from '@integrations/malambi-api/malambi-api.module';
import { GeozonesController } from './geozones.controller';
import { GeozonesService } from './geozones.service';
import { GeozonesSyncService } from './geozones-sync.service';

@Module({
  imports: [DatabaseModule, MalambiApiModule],
  controllers: [GeozonesController],
  providers: [GeozonesService, GeozonesSyncService],
  exports: [GeozonesService, GeozonesSyncService],
})
export class GeozonesModule {}
