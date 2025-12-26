import { Controller, Post, Get, Query, Param, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CentersService } from './centers.service';
import { CentersSeederService } from './centers-seeder.service';
import { CurrentUserCredentials } from '@modules/auth/decorators/current-user-credentials.decorator';
import { Credentials, PaginateResult } from '@common/interfaces';
import { FilterCentersDto } from './dto';
import * as schema from '@modules/schemas';

type Center = typeof schema.centers.$inferSelect;

@Controller('centers')
@ApiTags('Centers')
@ApiBearerAuth()
export class CentersController {
  constructor(
    private readonly centersService: CentersService,
    private readonly centersSeederService: CentersSeederService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List all synced centers in the system with filtering and pagination',
    description: 'Retrieves a paginated list of centers that have been synced from the Malambi API. Supports filtering, searching, sorting, and optional relation loading.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term' })
  @ApiQuery({ name: 'searchBy', required: false, type: String, description: 'Comma-separated fields to search in' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Comma-separated sort fields (format: field:direction)' })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (geozone, arrivals, exits, incomingVehicles)' })
  async findAll(
    @Query() filterDto: FilterCentersDto,
  ): Promise<PaginateResult<Center>> {
    const query = {
      page: filterDto.page ?? 1,
      limit: filterDto.limit ?? 100,
      search: filterDto.search,
      searchBy: filterDto.searchBy ? filterDto.searchBy.split(',') : undefined,
      sortBy: filterDto.sortBy
        ? (filterDto.sortBy.split(',').map((s) => {
            const [field, direction] = s.split(':');
            return [field, (direction || 'ASC').toUpperCase()] as [string, 'ASC' | 'DESC'];
          }) as [string, 'ASC' | 'DESC'][])
        : undefined,
    };

    const options = {
      include: filterDto.include ? filterDto.include.split(',') : undefined,
    };

    return this.centersService.findAll(query, options);
  }

  @Get('from-api')
  @ApiOperation({
    summary: 'Get all centers from Malambi API',
    description: 'This endpoint fetches all centers from the Malambi API without saving them to the database.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum number of centers to fetch (default: 1000)' })
  @ApiQuery({ name: 'regionid', required: false, type: Number, description: 'Region ID filter (default: -1 for all regions)' })
  @ApiQuery({ name: 'filtertype', required: false, type: Number, description: 'Filter type (default: 1)' })
  async getAllCentersFromApi(
    @CurrentUserCredentials() credentials: Credentials,
    @Query('limit') limit?: number,
    @Query('regionid') regionid?: number,
    @Query('filtertype') filtertype?: number,
  ) {
    return this.centersService.getAllCentersFromApi(
      credentials.token,
      credentials.accid.toString(),
      credentials.subid.toString(),
      {
        limit: limit ? Number(limit) : undefined,
        regionid: regionid ? Number(regionid) : undefined,
        filtertype: filtertype ? Number(filtertype) : undefined,
      },
    );
  }

  @Get('default')
  @ApiOperation({
    summary: 'Get default testing centers',
    description: 'Retrieves the 3 default testing centers (Center 001, Center 002, Center 003) that users can choose from when their center cannot be located. These centers are automatically seeded on application startup.',
  })
  async getDefaultCenters(): Promise<Center[]> {
    return this.centersSeederService.getDefaultCenters();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get center details by ID',
    description: 'Provides access to view the details of a specific center by its internal ID (serial integer).',
  })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (geozone, arrivals, exits, incomingVehicles)' })
  async findOneById(
    @Param('id') id: string,
    @Query('include') include?: string,
  ): Promise<Center> {
    const options = {
      include: include ? include.split(',') : undefined,
    };
    return this.centersService.findOneById(Number(id), options);
  }

  @Post('sync')
  @ApiOperation({
    summary: 'Find and sync a center by geozone_id',
    description: 'This endpoint fetches centers from the Malambi API, finds the center with matching gzone_id, checks if it exists in the database, and triggers a background job to save it if missing.',
  })
  @ApiQuery({ name: 'geozone_id', required: true, type: Number, description: 'The geozone_id (gzone_id) to find and sync' })
  async syncCenter(
    @CurrentUserCredentials() credentials: Credentials,
    @Query('geozone_id') geozoneId: number,
  ) {
    if (!geozoneId) {
      throw new BadRequestException('geozone_id is required');
    }

    return this.centersService.syncCenterByGeozoneId(
      credentials.token,
      credentials.accid.toString(),
      credentials.subid.toString(),
      Number(geozoneId),
    );
  }
}

