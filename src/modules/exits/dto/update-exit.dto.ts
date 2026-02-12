import { IsOptional, IsString, IsNumber, IsDecimal, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrivalStatus } from '@modules/arrivals/dto/arrival-status.enum';

export class UpdateExitDto {
  @ApiPropertyOptional({ description: 'Exit type' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  exitType?: string;

  @ApiPropertyOptional({ 
    description: 'Status of the exit', 
    enum: ArrivalStatus,
    example: ArrivalStatus.IN_TRANSIT 
  })
  @IsOptional()
  @IsEnum(ArrivalStatus)
  status?: ArrivalStatus;

  @ApiPropertyOptional({ description: 'Destination center ID' })
  @IsOptional()
  @IsNumber()
  destinationCenterId?: number;

  @ApiPropertyOptional({ description: 'Destination name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  destinationName?: string;

  @ApiPropertyOptional({ description: 'Latitude coordinate' })
  @IsOptional()
  @IsDecimal()
  latitude?: string;

  @ApiPropertyOptional({ description: 'Longitude coordinate' })
  @IsOptional()
  @IsDecimal()
  longitude?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

