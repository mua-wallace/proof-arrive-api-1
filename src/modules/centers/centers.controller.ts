import { Controller, Post, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CentersService } from './centers.service';
import { CurrentUserCredentials } from '@modules/auth/decorators/current-user-credentials.decorator';
import { Credentials } from '@common/interfaces';

@Controller('centers')
@ApiTags('Centers')
@ApiBearerAuth()
export class CentersController {
  constructor(private readonly centersService: CentersService) {}

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
}

