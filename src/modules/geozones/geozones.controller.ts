import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GeozonesService } from './geozones.service';
import { GeozonesSyncService } from './geozones-sync.service';
import { CurrentUserCredentials } from '@modules/auth/decorators/current-user-credentials.decorator';
import { Credentials, PaginateQuery, PaginateResult } from '@common/interfaces';
import { FilterGeozonesDto } from './dto';
import * as schema from '@modules/schemas';

type Geozone = typeof schema.geozones.$inferSelect;

@Controller('geozones')
@ApiTags('Geozones')
@ApiBearerAuth()
export class GeozonesController {
  constructor(
    private readonly geozonesService: GeozonesService,
    private readonly geozonesSyncService: GeozonesSyncService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List all synced geozones from local DB',
    description:
      'Returns a paginated list of geozones already synced to the local database for the logged-in account.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'searchBy', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  async findAll(
    @Query() filterDto: FilterGeozonesDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<PaginateResult<Geozone>> {
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }

    const query: PaginateQuery = {
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

    return this.geozonesService.findAll(query, { accountId: accountIdNum });
  }

  @Get('from-api')
  @ApiOperation({
    summary: 'Get geozones from Malambi API',
    description:
      'Fetches geozones directly from Malambi API. Pass sync=true to also upsert them into the local database.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Upstream API limit (default 1000)' })
  @ApiQuery({ name: 'query', required: false, type: String, description: 'Upstream API query filter (default %)' })
  @ApiQuery({ name: 'sync', required: false, description: 'Bulk sync geozones to local DB' })
  @ApiResponse({ status: 200, description: 'Geozones from Malambi API (with optional syncResult)' })
  async getAllFromApi(
    @CurrentUserCredentials() credentials: Credentials,
    @Query('limit') limit?: number,
    @Query('query') query?: string,
    @Query('sync') sync?: boolean | string,
  ) {
    const apiLimit = limit ? Number(limit) : 1000;
    const apiQuery = query ?? '%';

    const response = await this.geozonesService.listFromApi(
      credentials.token,
      credentials.accid.toString(),
      credentials.subid.toString(),
      { limit: apiLimit, query: apiQuery },
    );

    const shouldSync = sync === true || sync === 'true' || sync === '1';
    if (shouldSync) {
      const accountIdNum = Number(credentials.accid);
      if (isNaN(accountIdNum) || accountIdNum <= 0) {
        throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
      }
      const syncResult = await this.geozonesSyncService.bulkSyncGeozones(
        response.rows,
        accountIdNum,
      );
      return { geozones: response, syncResult };
    }

    return response;
  }

  @Post('sync')
  @ApiOperation({
    summary: 'Sync all geozones from Malambi API to local DB',
    description:
      'Fetches all geozones from Malambi API and upserts them into the local database for the logged-in account.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Upstream API limit (default 1000)' })
  @ApiQuery({ name: 'query', required: false, type: String, description: 'Upstream API query filter (default %)' })
  async sync(
    @CurrentUserCredentials() credentials: Credentials,
    @Query('limit') limit?: number,
    @Query('query') query?: string,
  ) {
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }

    return this.geozonesService.syncAllFromApi(
      credentials.token,
      credentials.accid.toString(),
      credentials.subid.toString(),
      accountIdNum,
      { limit: limit ? Number(limit) : undefined, query: query ?? undefined },
    );
  }
}
