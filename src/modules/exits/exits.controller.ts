import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiBearerAuth,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { ExitsService } from './exits.service';
import { CurrentUserCredentials } from '@modules/auth/decorators/current-user-credentials.decorator';
import { Credentials, PaginateResult } from '@common/interfaces';
import {
  CreateExitDto,
  FilterExitsDto,
  UpdateExitDto,
} from './dto';
import * as schema from '@modules/schemas';

type Exit = typeof schema.exits.$inferSelect;

@Controller('exits')
@ApiTags('Exits')
@ApiBearerAuth()
export class ExitsController {
  constructor(private readonly exitsService: ExitsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create new exit',
    description: 'Creates a new exit record when a vehicle exits from a center. The agent ID and createdBy are automatically extracted from the authenticated user.',
  })
  @ApiResponse({ status: 201, description: 'Exit created successfully' })
  @ApiResponse({ status: 404, description: 'Vehicle or center not found' })
  async create(
    @Body() createDto: CreateExitDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<Exit> {
    return this.exitsService.createExit(createDto, credentials.accid.toString());
  }

  @Get()
  @ApiOperation({
    summary: 'List exits (with filters)',
    description: 'Retrieves a paginated list of exits with optional filtering, searching, and sorting. Can filter by status (e.g., "in_transit") and destinationId (geozoneId, e.g., 3003).',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 100)' })
  @ApiQuery({ name: 'status', required: false, enum: ['arrival', 'arrived', 'in_processing', 'completed', 'cancelled', 'in_transit', 'exited'], description: 'Filter by status' })
  @ApiQuery({ name: 'destinationId', required: false, type: Number, description: 'Filter by destination center geozoneId (third-party ID)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term' })
  @ApiQuery({ name: 'searchBy', required: false, type: String, description: 'Comma-separated fields to search in' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Comma-separated sort fields (format: field:direction)' })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (vehicle, center, agent, destinationCenter, incomingVehicle)' })
  @ApiResponse({ status: 200, description: 'List of exits retrieved successfully' })
  async findAll(
    @Query() filterDto: FilterExitsDto,
  ): Promise<PaginateResult<Exit>> {
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
      status: filterDto.status,
      destinationId: filterDto.destinationId,
    };

    return this.exitsService.findAll(query, options);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get exit details',
    description: 'Retrieves detailed information about a specific exit by its ID.',
  })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (vehicle, center, agent, destinationCenter, incomingVehicle)' })
  @ApiResponse({ status: 200, description: 'Exit details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Exit not found' })
  async findOneById(
    @Param('id') id: string,
    @Query('include') include?: string,
  ): Promise<Exit> {
    const options = {
      include: include ? include.split(',') : undefined,
    };
    return this.exitsService.findOneById(Number(id), options);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update exit',
    description: 'Updates an existing exit record.',
  })
  @ApiResponse({ status: 200, description: 'Exit updated successfully' })
  @ApiResponse({ status: 404, description: 'Exit not found' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateExitDto,
  ): Promise<Exit> {
    return this.exitsService.update(Number(id), updateDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remove exit',
    description: 'Removes an exit from the database by its internal ID (serial integer).',
  })
  @ApiResponse({ status: 200, description: 'Exit removed successfully' })
  @ApiResponse({ status: 404, description: 'Exit not found' })
  async remove(@Param('id') id: string): Promise<Exit> {
    return this.exitsService.remove(Number(id));
  }
}
