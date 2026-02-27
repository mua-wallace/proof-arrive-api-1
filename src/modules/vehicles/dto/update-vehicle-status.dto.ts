import { IsNotEmpty, IsEnum, IsOptional, IsNumber, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleStatus } from '@common/enums/vehicle-status.enum';

export class UpdateVehicleStatusDto {
  @ApiProperty({ 
    description: 'New status for the vehicle',
    enum: VehicleStatus,
    example: VehicleStatus.LOADING
  })
  @IsNotEmpty()
  @IsEnum(VehicleStatus)
  status: VehicleStatus;

  @ApiPropertyOptional({ 
    description: 'Center ID (internal database ID) where the vehicle is located. Required for WAITING_IN_QUEUE, LOADING, UNLOADING. Optional for IN_TRANSIT and AVAILABLE. For IN_GARAGE, center is ignored and set to null.',
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
