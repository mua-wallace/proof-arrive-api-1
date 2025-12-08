import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { MalambiApiModule } from '@integrations/malambi-api/malambi-api.module';
import { CentersController } from './centers.controller';
import { CentersService } from './centers.service';
import { CentersSyncService } from './centers-sync.service';

@Module({
  imports: [DatabaseModule, MalambiApiModule],
  controllers: [CentersController],
  providers: [CentersService, CentersSyncService],
  exports: [CentersService, CentersSyncService],
})
export class CentersModule {}

