import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProcessingStageDto {
  @ApiProperty({ description: 'Type of processing stage' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  stageType: string;

  @ApiPropertyOptional({ description: 'Status of the processing stage', default: 'pending' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

