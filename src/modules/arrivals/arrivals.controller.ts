import {
  Controller,
  Post,
  Get,
  Put,
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
import { ArrivalsService } from './arrivals.service';
import { CurrentUserCredentials } from '@modules/auth/decorators/current-user-credentials.decorator';
import { Credentials, PaginateResult } from '@common/interfaces';
import {
  CreateArrivalDto,
  FilterArrivalsDto,
  UpdateArrivalStatusDto,
  CreateProcessingStageDto,
  UpdateProcessingStageDto,
} from './dto';
import * as schema from '@modules/schemas';

type Arrival = typeof schema.arrivals.$inferSelect;
type ProcessingStage = typeof schema.processingStages.$inferSelect;

@Controller('arrivals')
@ApiTags('Arrivals')
@ApiBearerAuth()
export class ArrivalsController {
  constructor(private readonly arrivalsService: ArrivalsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create new arrival',
    description: 'Creates a new arrival record when a vehicle arrives at a center. The agent ID is automatically extracted from the authenticated user. Vehicle ID should be obtained from scanning the QR code and fetching vehicle details via /api/v1/vehicles/from-api?vehicle_id={qr_code_value}.',
  })
  @ApiResponse({ status: 201, description: 'Arrival created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Vehicle or center not found' })
  async create(
    @Body() createDto: CreateArrivalDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<Arrival> {
    return this.arrivalsService.createArrival(createDto, credentials.accid.toString());
  }

  @Get()
  @ApiOperation({
    summary: 'List arrivals (with filters)',
    description: 'Retrieves a paginated list of arrivals with optional filtering, searching, and sorting.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term' })
  @ApiQuery({ name: 'searchBy', required: false, type: String, description: 'Comma-separated fields to search in' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Comma-separated sort fields (format: field:direction)' })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (vehicle, center, agent, processingStages)' })
  @ApiResponse({ status: 200, description: 'List of arrivals retrieved successfully' })
  async findAll(
    @Query() filterDto: FilterArrivalsDto,
    @Query('include') include?: string,
  ): Promise<PaginateResult<Arrival>> {
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
      include: include ? include.split(',') : undefined,
    };

    return this.arrivalsService.findAll(query, options);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get arrival details',
    description: 'Retrieves detailed information about a specific arrival by its ID.',
  })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (vehicle, center, agent, processingStages)' })
  @ApiResponse({ status: 200, description: 'Arrival details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Arrival not found' })
  async findOneById(
    @Param('id') id: string,
    @Query('include') include?: string,
  ): Promise<Arrival> {
    const options = {
      include: include ? include.split(',') : undefined,
    };
    return this.arrivalsService.findOneById(Number(id), options);
  }

  @Put(':id/status')
  @ApiOperation({
    summary: 'Update arrival status',
    description: 'Updates the status of a specific arrival.',
  })
  @ApiResponse({ status: 200, description: 'Arrival status updated successfully' })
  @ApiResponse({ status: 404, description: 'Arrival not found' })
  async updateStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateArrivalStatusDto,
  ): Promise<Arrival> {
    return this.arrivalsService.updateStatus(Number(id), updateDto);
  }

  @Post(':id/process')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start processing stage',
    description: 'Creates a new processing stage for an arrival. This is used to track different stages of processing (e.g., unloading, inspection, etc.).',
  })
  @ApiResponse({ status: 201, description: 'Processing stage created successfully' })
  @ApiResponse({ status: 404, description: 'Arrival not found' })
  async createProcessingStage(
    @Param('id') id: string,
    @Body() createDto: CreateProcessingStageDto,
  ): Promise<ProcessingStage> {
    return this.arrivalsService.createProcessingStage(Number(id), createDto);
  }

  @Put(':id/process/:stageId')
  @ApiOperation({
    summary: 'Update processing stage',
    description: 'Updates a specific processing stage for an arrival. When status is set to "completed", the completedAt timestamp is automatically set.',
  })
  @ApiResponse({ status: 200, description: 'Processing stage updated successfully' })
  @ApiResponse({ status: 404, description: 'Arrival or processing stage not found' })
  async updateProcessingStage(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Body() updateDto: UpdateProcessingStageDto,
  ): Promise<ProcessingStage> {
    return this.arrivalsService.updateProcessingStage(Number(id), Number(stageId), updateDto);
  }
}
