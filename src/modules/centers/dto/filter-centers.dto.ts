import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class FilterCentersDto {
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
    example: 'CC Y3',
    description: 'Search term to filter centers',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'name,fullname,manager,geozone,groupname',
    description: 'Comma-separated list of fields to search in. Available fields: name, fullname, manager, geozone, groupname',
  })
  @IsOptional()
  @IsString()
  searchBy?: string;

  @ApiPropertyOptional({
    example: 'createdAt:DESC,name:ASC',
    description: 'Comma-separated list of fields to sort by (format: field:direction). Available fields: id, accountId, createdAt, updatedAt, thirdPartyId, siteid, name, fullname, geozone, geozoneId, manager, groupid, groupname, sitetype, distance',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated relations to include (geozone, vehicles, tripEvents, originTrips, destinationTrips)',
  })
  @IsOptional()
  @IsString()
  include?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Bulk sync centers to local database (default: false). Accepts boolean or string values: true, "true", "1"',
  })
  @IsOptional()
  sync?: boolean | string;
}
