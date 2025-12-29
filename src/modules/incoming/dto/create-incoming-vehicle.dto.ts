import { IsNotEmpty, IsNumber, IsOptional, IsString, IsDecimal, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrivalStatus } from '@modules/arrivals/dto/arrival-status.enum';

export class CreateIncomingVehicleDto {
  @ApiProperty({ description: 'Exit ID (internal database ID) - the exit that triggered this incoming vehicle' })
  @IsNotEmpty()
  @IsNumber()
  exitId: number;

  @ApiProperty({ description: 'Vehicle ID (internal database ID)' })
  @IsNotEmpty()
  @IsNumber()
  vehicleId: number;

  @ApiProperty({ description: 'Destination center ID (internal database ID)' })
  @IsNotEmpty()
  @IsNumber()
  destinationCenterId: number;

  @ApiProperty({ description: 'Source center ID (internal database ID)' })
  @IsNotEmpty()
  @IsNumber()
  sourceCenterId: number;

  @ApiPropertyOptional({ 
    description: 'Status of the incoming vehicle', 
    enum: ArrivalStatus,
    default: ArrivalStatus.IN_TRANSIT,
    example: ArrivalStatus.IN_TRANSIT 
  })
  @IsOptional()
  @IsEnum(ArrivalStatus)
  status?: ArrivalStatus;

  @ApiPropertyOptional({ description: 'Estimated arrival timestamp' })
  @IsOptional()
  estimatedArrival?: Date;

  @ApiPropertyOptional({ description: 'Distance in kilometers' })
  @IsOptional()
  @IsDecimal()
  distanceKm?: string;
}

