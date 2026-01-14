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
import { IncomingService } from './incoming.service';
import { CurrentUserCredentials } from '@modules/auth/decorators/current-user-credentials.decorator';
import { Credentials, PaginateResult } from '@common/interfaces';
import {
  CreateIncomingVehicleDto,
  FilterIncomingVehiclesDto,
  UpdateIncomingVehicleDto,
} from './dto';
import * as schema from '@modules/schemas';

type IncomingVehicle = typeof schema.incomingVehicles.$inferSelect;

@Controller('incoming')
@ApiTags('Incoming Vehicles')
@ApiBearerAuth()
export class IncomingController {
  constructor(private readonly incomingService: IncomingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create new incoming vehicle record',
    description: 'Creates a new incoming vehicle record when a vehicle exits from one center and is expected to arrive at another. The createdBy is automatically extracted from the authenticated user.',
  })
  @ApiResponse({ status: 201, description: 'Incoming vehicle created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request (e.g., incoming vehicle already exists for this exit)' })
  @ApiResponse({ status: 404, description: 'Exit, vehicle, or center not found' })
  async create(
    @Body() createDto: CreateIncomingVehicleDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<IncomingVehicle> {
    return this.incomingService.createIncomingVehicle(createDto, credentials.accid.toString(), credentials.accid);
  }

  @Get()
  @ApiOperation({
    summary: 'List incoming vehicles (with filters)',
    description: 'Retrieves a paginated list of incoming vehicles with optional filtering, searching, and sorting.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term' })
  @ApiQuery({ name: 'searchBy', required: false, type: String, description: 'Comma-separated fields to search in' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Comma-separated sort fields (format: field:direction)' })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (exit, vehicle, destinationCenter, sourceCenter)' })
  @ApiResponse({ status: 200, description: 'List of incoming vehicles retrieved successfully' })
  async findAll(
    @Query() filterDto: FilterIncomingVehiclesDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<PaginateResult<IncomingVehicle>> {
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
      accountId: credentials.accid, // Multi-tenant: filter by account ID
    };

    return this.incomingService.findAll(query, options);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get incoming vehicle details',
    description: 'Retrieves detailed information about a specific incoming vehicle by its ID.',
  })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (exit, vehicle, destinationCenter, sourceCenter)' })
  @ApiResponse({ status: 200, description: 'Incoming vehicle details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Incoming vehicle not found' })
  async findOneById(
    @Param('id') id: string,
    @Query('include') include?: string,
    @CurrentUserCredentials() credentials?: Credentials,
  ): Promise<IncomingVehicle> {
    const options = {
      include: include ? include.split(',') : undefined,
      accountId: credentials?.accid, // Multi-tenant: filter by account ID
    };
    return this.incomingService.findOneById(Number(id), options);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update incoming vehicle',
    description: 'Updates an existing incoming vehicle record. Can be used to update status, estimated/actual arrival times, and distance.',
  })
  @ApiResponse({ status: 200, description: 'Incoming vehicle updated successfully' })
  @ApiResponse({ status: 404, description: 'Incoming vehicle not found' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateIncomingVehicleDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<IncomingVehicle> {
    return this.incomingService.update(Number(id), updateDto, credentials.accid);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remove incoming vehicle',
    description: 'Removes an incoming vehicle from the database by its internal ID (serial integer).',
  })
  @ApiResponse({ status: 200, description: 'Incoming vehicle removed successfully' })
  @ApiResponse({ status: 404, description: 'Incoming vehicle not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<IncomingVehicle> {
    return this.incomingService.remove(Number(id), credentials.accid);
  }
}
