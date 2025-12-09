import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { MalambiApiModule } from '@integrations/malambi-api/malambi-api.module';
import { QueueModule } from '@common/queue/queue.module';
import { CentersController } from './centers.controller';
import { CentersService } from './centers.service';
import { CentersSyncService } from './centers-sync.service';

@Module({
  imports: [DatabaseModule, MalambiApiModule, forwardRef(() => QueueModule)],
  controllers: [CentersController],
  providers: [CentersService, CentersSyncService],
  exports: [CentersService, CentersSyncService],
})
export class CentersModule {}

