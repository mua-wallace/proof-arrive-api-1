import { IsOptional, IsNumber, IsEnum, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ExceptionType } from '@common/enums/exception-type.enum';
import { ExceptionStatus } from '@common/enums/exception-status.enum';

/**
 * DTO for filtering and paginating exception lists.
 * Used on the Incidents & Exceptions Log page and the dashboard Active Exceptions table.
 */
export class FilterExceptionsDto {
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

  @ApiPropertyOptional({
    description: 'Filter by exception type',
    enum: ExceptionType,
  })
  @IsOptional()
  @IsEnum(ExceptionType)
  type?: ExceptionType;

  @ApiPropertyOptional({
    description: 'Filter by exception status',
    enum: ExceptionStatus,
  })
  @IsOptional()
  @IsEnum(ExceptionStatus)
  status?: ExceptionStatus;

  @ApiPropertyOptional({ description: 'Filter by trip ID' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tripId?: number;

  @ApiPropertyOptional({ description: 'Filter by vehicle ID' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  vehicleId?: number;

  @ApiPropertyOptional({ description: 'Search in location, description, vehicle plate' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Sort field', example: 'reportedAt' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
