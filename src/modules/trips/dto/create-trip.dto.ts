import { IsNotEmpty, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripPurpose } from '@common/enums/trip-purpose.enum';

export class CreateTripDto {
  @ApiProperty({ 
    description: 'Vehicle ID',
    example: 17589
  })
  @IsNotEmpty()
  @IsNumber()
  vehicleId: number;

  @ApiProperty({ 
    description: 'Origin center ID',
    example: 4114
  })
  @IsNotEmpty()
  @IsNumber()
  originCenterId: number;

  @ApiPropertyOptional({ 
    description: 'Destination center ID (can be set later when ready to exit)',
    example: 4115
  })
  @IsOptional()
  @IsNumber()
  destinationCenterId?: number;

  @ApiPropertyOptional({ 
    description: 'Purpose of the trip', 
    enum: TripPurpose,
    default: TripPurpose.DELIVERY,
    example: TripPurpose.DELIVERY 
  })
  @IsOptional()
  @IsEnum(TripPurpose)
  purpose?: TripPurpose;
}
