import { IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FilterArrivalsDto {
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

  @ApiPropertyOptional({ description: 'Search term' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ 
    description: 'Comma-separated fields to search in. Available fields: notes, status',
    example: 'notes,status'
  })
  @IsOptional()
  @IsString()
  searchBy?: string;

  @ApiPropertyOptional({ 
    description: 'Comma-separated sort fields (format: field:direction). Available fields: id, accountId, createdAt, updatedAt, vehicleId, centerId, agentId, status, arrivedAt',
    example: 'arrivedAt:DESC,status:ASC'
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Comma-separated relations to include (vehicle, center, agent, processingStages)' })
  @IsOptional()
  @IsString()
  include?: string;
}
