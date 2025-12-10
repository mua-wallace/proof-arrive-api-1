import { IsNotEmpty, IsString, IsNumber, IsOptional, IsDecimal, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExitDto {
  @ApiProperty({ description: 'Vehicle ID (internal database ID)' })
  @IsNotEmpty()
  @IsNumber()
  vehicleId: number;

  @ApiProperty({ description: 'Center ID (internal database ID) - source center' })
  @IsNotEmpty()
  @IsNumber()
  centerId: number;

  @ApiProperty({ description: 'Type of exit (e.g., delivery, transfer, etc.)' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  exitType: string;

  @ApiPropertyOptional({ description: 'Destination center ID (if known)' })
  @IsOptional()
  @IsNumber()
  destinationCenterId?: number;

  @ApiPropertyOptional({ description: 'Destination name (if center ID not available)' })
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

