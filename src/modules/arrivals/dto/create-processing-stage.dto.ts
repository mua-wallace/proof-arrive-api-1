import { IsNotEmpty, IsString, IsOptional, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrivalStatus } from './arrival-status.enum';

export class CreateProcessingStageDto {
  @ApiProperty({ description: 'Type of processing stage' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  stageType: string;

  @ApiPropertyOptional({ description: 'Status of the processing stage', default: 'arrival' })
  @IsOptional()
  @IsEnum(ArrivalStatus)
  status?: ArrivalStatus;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

