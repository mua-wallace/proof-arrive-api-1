import { IsOptional, IsEnum, IsString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { QueueType } from '@common/enums/queue-type.enum';

export class FilterQueuesDto {
  @ApiPropertyOptional({ description: 'Filter by queue type', enum: QueueType })
  @IsOptional()
  @IsEnum(QueueType)
  type?: QueueType;

  @ApiPropertyOptional({ description: 'Show only active queues', default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Get queue for specific date (YYYY-MM-DD). Default: today (positions reset daily)' })
  @IsOptional()
  @IsString()
  date?: string;
}
