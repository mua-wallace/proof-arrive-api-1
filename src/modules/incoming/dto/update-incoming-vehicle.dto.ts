import { IsOptional, IsString, IsDecimal, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateIncomingVehicleDto {
  @ApiPropertyOptional({ description: 'Status of the incoming vehicle' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  @ApiPropertyOptional({ description: 'Estimated arrival timestamp' })
  @IsOptional()
  estimatedArrival?: Date;

  @ApiPropertyOptional({ description: 'Actual arrival timestamp' })
  @IsOptional()
  actualArrival?: Date;

  @ApiPropertyOptional({ description: 'Distance in kilometers' })
  @IsOptional()
  @IsDecimal()
  distanceKm?: string;
}

