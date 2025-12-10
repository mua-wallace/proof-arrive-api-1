import { IsNotEmpty, IsString, IsNumber, IsOptional, IsDecimal, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateArrivalDto {
  @ApiProperty({ description: 'Vehicle ID (internal database ID)' })
  @IsNotEmpty()
  @IsNumber()
  vehicleId: number;

  @ApiProperty({ description: 'Center ID (internal database ID)' })
  @IsNotEmpty()
  @IsNumber()
  centerId: number;

  @ApiPropertyOptional({ description: 'QR Code (unique identifier for the arrival)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  qrCode?: string;

  @ApiPropertyOptional({ description: 'Status of the arrival', default: 'arrived' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

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

