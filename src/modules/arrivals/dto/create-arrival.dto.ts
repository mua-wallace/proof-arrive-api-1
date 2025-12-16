import { IsNotEmpty, IsString, IsNumber, IsOptional, IsDecimal, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrivalStatus } from './arrival-status.enum';

export class CreateArrivalDto {
  @ApiProperty({ 
    description: 'Vehicle thirdPartyId (from Malambi API, not internal database ID)',
    example: 17589
  })
  @IsNotEmpty()
  @IsNumber()
  vehicleId: number;

  @ApiProperty({ 
    description: 'Center geozoneId (from Malambi API, not internal database ID)',
    example: 4114
  })
  @IsNotEmpty()
  @IsNumber()
  centerId: number;

  @ApiPropertyOptional({ 
    description: 'Status of the arrival', 
    enum: ArrivalStatus,
    default: ArrivalStatus.ARRIVED,
    example: ArrivalStatus.ARRIVED 
  })
  @IsOptional()
  @IsEnum(ArrivalStatus)
  status?: ArrivalStatus;

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

