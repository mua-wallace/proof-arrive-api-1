import { IsOptional, IsString, IsDecimal, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrivalStatus } from '@modules/arrivals/dto/arrival-status.enum';

export class UpdateIncomingVehicleDto {
  @ApiPropertyOptional({ 
    description: 'Status of the incoming vehicle', 
    enum: ArrivalStatus,
    example: ArrivalStatus.IN_TRANSIT 
  })
  @IsOptional()
  @IsEnum(ArrivalStatus)
  status?: ArrivalStatus;

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

