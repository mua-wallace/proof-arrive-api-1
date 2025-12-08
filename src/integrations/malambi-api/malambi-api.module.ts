import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MalambiApiService } from './malambi-api.service';

@Module({
  imports: [HttpModule],
  providers: [MalambiApiService],
  exports: [MalambiApiService],
})
export class MalambiApiModule {}

