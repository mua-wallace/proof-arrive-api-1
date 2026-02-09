import { IsOptional, IsNumber, IsString, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrivalStatus } from '@modules/arrivals/dto';

export class FilterExitsDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 100, minimum: 1, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1000)
  limit?: number;

  @ApiPropertyOptional({ 
    description: 'Filter by status', 
    enum: ArrivalStatus,
    example: 'in_transit'
  })
  @IsOptional()
  @IsEnum(ArrivalStatus)
  status?: ArrivalStatus;

  @ApiPropertyOptional({ 
    description: 'Filter by destination center ID (internal database ID)', 
    type: Number
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destinationCenterId?: number;

  @ApiPropertyOptional({ description: 'Search term' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ 
    description: 'Comma-separated fields to search in. Available fields: exitType, destinationName, notes, status',
    example: 'exitType,destinationName,notes'
  })
  @IsOptional()
  @IsString()
  searchBy?: string;

  @ApiPropertyOptional({ 
    description: 'Comma-separated sort fields (format: field:direction). Available fields: id, accountId, createdAt, updatedAt, vehicleId, centerId, agentId, exitType, status, destinationCenterId, destinationName, exitedAt',
    example: 'exitedAt:DESC,status:ASC'
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Comma-separated relations to include (vehicle, center, agent, destinationCenter)' })
  @IsOptional()
  @IsString()
  include?: string;
}
