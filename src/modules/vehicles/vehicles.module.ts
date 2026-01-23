import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { MalambiApiModule } from '@integrations/malambi-api/malambi-api.module';
import { QueueModule } from '@common/queue/queue.module';
import { UsersModule } from '@modules/users/users.module';
import { AuthModule } from '@modules/auth/auth.module';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { VehiclesSyncService } from './vehicles-sync.service';
import { QrCodeService } from './qr-code.service';
import { EncryptionService } from '@common/services/encryption.service';

@Module({
  imports: [DatabaseModule, MalambiApiModule, forwardRef(() => QueueModule), UsersModule, AuthModule],
  controllers: [VehiclesController],
  providers: [VehiclesService, VehiclesSyncService, QrCodeService, EncryptionService],
  exports: [VehiclesService, VehiclesSyncService, QrCodeService],
})
export class VehiclesModule {}

