import { IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrivalStatus } from './arrival-status.enum';

export class UpdateProcessingStageDto {
  @ApiPropertyOptional({ 
    description: 'Status of the processing stage',
    enum: ArrivalStatus,
    example: ArrivalStatus.IN_PROCESSING
  })
  @IsOptional()
  @IsEnum(ArrivalStatus)
  status?: ArrivalStatus;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
