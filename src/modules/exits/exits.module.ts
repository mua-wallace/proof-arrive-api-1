import { Module } from '@nestjs/common';
import { ExitsController } from './exits.controller';
import { ExitsService } from './exits.service';
import { DatabaseModule } from '@database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ExitsController],
  providers: [ExitsService],
  exports: [ExitsService],
})
export class ExitsModule {}

