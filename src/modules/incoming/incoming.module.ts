import { Module } from '@nestjs/common';
import { IncomingController } from './incoming.controller';
import { IncomingService } from './incoming.service';

@Module({
  controllers: [IncomingController],
  providers: [IncomingService],
  exports: [IncomingService],
})
export class IncomingModule {}

