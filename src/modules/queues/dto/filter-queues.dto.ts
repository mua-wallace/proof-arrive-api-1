import { IsOptional, IsEnum, IsString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { QueueType } from '@common/enums/queue-type.enum';

export class FilterQueuesDto {
  @ApiPropertyOptional({ description: 'Filter by queue type. Optional; if not specified, returns both LOADING and UNLOADING.', enum: QueueType })
  @IsOptional()
  @IsEnum(QueueType)
  type?: QueueType;

  @ApiPropertyOptional({ description: 'Filter by active queues. Optional; if not specified, returns both active and inactive.' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Get queue for specific date (YYYY-MM-DD). Default: today (positions reset daily)' })
  @IsOptional()
  @IsString()
  date?: string;
}
