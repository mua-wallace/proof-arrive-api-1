import { Module } from '@nestjs/common';
import { IncomingController } from './incoming.controller';
import { IncomingService } from './incoming.service';
import { DatabaseModule } from '@database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [IncomingController],
  providers: [IncomingService],
  exports: [IncomingService],
})
export class IncomingModule {}

