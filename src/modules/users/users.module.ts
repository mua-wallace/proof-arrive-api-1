import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { MalambiApiModule } from '@integrations/malambi-api/malambi-api.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersSyncService } from './users-sync.service';

@Module({
  imports: [DatabaseModule, MalambiApiModule],
  controllers: [UsersController],
  providers: [UsersService, UsersSyncService],
  exports: [UsersService, UsersSyncService],
})
export class UsersModule {}

