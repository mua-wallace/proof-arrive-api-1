import { IsNotEmpty, IsEnum, IsOptional, IsNumber, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleStatus } from './vehicle-status.enum';

export class UpdateVehicleStatusDto {
  @ApiProperty({ 
    description: 'New status for the vehicle',
    enum: VehicleStatus,
    example: VehicleStatus.IN_PROCESSING
  })
  @IsNotEmpty()
  @IsEnum(VehicleStatus)
  status: VehicleStatus;

  @ApiPropertyOptional({ 
    description: 'Center ID (internal database ID) where the vehicle is located. Required for statuses that require a location (at_center, in_processing, in_garage). Optional/nullable for in_transit and available.',
    example: 1
  })
  @IsOptional()
  @IsNumber()
  centerId?: number;

  @ApiPropertyOptional({ 
    description: 'Optional notes about the status change',
    example: 'Vehicle moved to garage for maintenance'
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
