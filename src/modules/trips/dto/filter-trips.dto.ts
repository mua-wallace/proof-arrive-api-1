import { IsOptional, IsNumber, IsEnum, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TripStatus } from '@common/enums/trip-status.enum';
import { TripPurpose } from '@common/enums/trip-purpose.enum';
import { TripPhase } from '@common/enums/trip-phase.enum';

export class FilterTripsDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by vehicle ID' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  vehicleId?: number;

  @ApiPropertyOptional({ description: 'Filter by origin center ID' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  originCenterId?: number;

  @ApiPropertyOptional({ description: 'Filter by destination center ID' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destinationCenterId?: number;

  @ApiPropertyOptional({
    description: 'Filter by center ID (OR: trips where this center is origin OR destination)',
    example: 4115,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  centerId?: number;

  @ApiPropertyOptional({ description: 'Filter by trip status', enum: TripStatus })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @ApiPropertyOptional({ description: 'Filter by trip purpose', enum: TripPurpose })
  @IsOptional()
  @IsEnum(TripPurpose)
  purpose?: TripPurpose;

  @ApiPropertyOptional({ description: 'Filter by trip phase (lifecycle state)', enum: TripPhase })
  @IsOptional()
  @IsEnum(TripPhase)
  phase?: TripPhase;

  @ApiPropertyOptional({ description: 'Search term (searches in vehicle plate, center names)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Sort field', example: 'startedAt' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({
    description: 'Filter by trip creation date (YYYY-MM-DD). Defaults to today when not provided.',
    example: '2025-02-25',
  })
  @IsOptional()
  @IsString()
  createdAt?: string;

  @ApiPropertyOptional({ description: 'Include related entities (comma-separated: vehicle,originCenter,destinationCenter,events)' })
  @IsOptional()
  @IsString()
  include?: string;
}
