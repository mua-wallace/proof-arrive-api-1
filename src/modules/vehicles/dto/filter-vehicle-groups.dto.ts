import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class FilterVehicleGroupsDto {
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
    example: 'Motos',
    description: 'Search term to filter vehicle groups',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'groupName',
    description: 'Comma-separated list of fields to search in. Available fields: groupName, groupId',
  })
  @IsOptional()
  @IsString()
  searchBy?: string;

  @ApiPropertyOptional({
    example: 'groupName:ASC',
    description: 'Comma-separated list of fields to sort by (format: field:direction). Available fields: groupId, groupName, total',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    example: 'root',
    description: 'Tree node (default: root)',
  })
  @IsOptional()
  @IsString()
  node?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Bulk sync vehicles to local database (default: false). Accepts boolean or string values: true, "true", "1"',
  })
  @IsOptional()
  sync?: boolean | string;
}
