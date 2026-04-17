import { Module } from '@nestjs/common';
import { ExceptionsController } from './exceptions.controller';
import { ExceptionsService } from './exceptions.service';
import { DatabaseModule } from '@database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ExceptionsController],
  providers: [ExceptionsService],
  exports: [ExceptionsService],
})
export class ExceptionsModule {}
