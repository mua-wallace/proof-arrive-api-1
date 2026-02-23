import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class FilterVehiclesDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Page number',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 100,
    description: 'Number of items per page',
    default: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1000)
  limit?: number = 100;

  @ApiPropertyOptional({
    example: 'ABC123',
    description: 'Search term to filter vehicles',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'plate,model,brand',
    description: 'Comma-separated list of fields to search in. Available fields: plate, model, brand, tag2',
  })
  @IsOptional()
  @IsString()
  searchBy?: string;

  @ApiPropertyOptional({
    example: 'createdAt:DESC,plate:ASC',
    description: 'Comma-separated list of fields to sort by (format: field:direction). Available fields: id, accountId, createdAt, updatedAt, thirdPartyId, plate, model, brand, year, tag2, groupId, isActive, lastSyncedAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated relations to include (qrCodes, group, assignedCenter, currentCenter)',
  })
  @IsOptional()
  @IsString()
  include?: string;
}
