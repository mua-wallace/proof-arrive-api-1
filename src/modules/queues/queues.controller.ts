import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUserCredentials } from '@modules/auth/decorators/current-user-credentials.decorator';
import { QueuesService } from './queues.service';
import { AddToQueueDto } from './dto/add-to-queue.dto';
import { StartNextServiceDto } from './dto/start-next-service.dto';
import { FilterQueuesDto } from './dto/filter-queues.dto';

@ApiTags('Queues')
@Controller('centers/:centerId/queue')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a vehicle to the queue at a center' })
  @ApiResponse({ status: 201, description: 'Vehicle added to queue successfully' })
  @ApiResponse({ status: 400, description: 'Vehicle already in queue' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  async addToQueue(
    @Param('centerId', ParseIntPipe) centerId: number,
    @Body() addToQueueDto: AddToQueueDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.queuesService.addToQueue(
      centerId,
      addToQueueDto,
      credentials.accid,
      credentials.subid,
    );
  }

  @Post('next')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start service for the next vehicle in queue' })
  @ApiResponse({ status: 200, description: 'Service started for next vehicle' })
  @ApiResponse({ status: 404, description: 'No vehicles in queue' })
  async startNextService(
    @Param('centerId', ParseIntPipe) centerId: number,
    @Body() startNextDto: StartNextServiceDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.queuesService.startNextService(
      centerId,
      startNextDto,
      credentials.accid,
      credentials.subid,
    );
  }

  @Get('vehicles')
  @ApiOperation({
    summary: 'Get all vehicles in the queue at a center',
    description: 'Returns center information and a list of all vehicles currently in the queue (by default today\'s active queue). Each item includes vehicle details, trip information, queue position, queue type (LOADING/UNLOADING), and waiting time. Supports same filters as GET /queue (type, isActive, date).'
  })
  @ApiResponse({ status: 200, description: 'Center info and list of vehicles in queue (each with vehicle, trip, position, type, waiting time)' })
  @ApiQuery({ name: 'type', required: false, enum: ['LOADING', 'UNLOADING'], description: 'Filter by queue type' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Show only active queues (default: true)' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Queue date (YYYY-MM-DD). Default: today' })
  async getVehiclesInQueue(
    @Param('centerId', ParseIntPipe) centerId: number,
    @Query() filterDto: FilterQueuesDto & { date?: string },
    @CurrentUserCredentials() credentials: any,
  ) {
    const filterOptions: any = {
      type: filterDto.type,
      isActive: filterDto.isActive !== undefined ? filterDto.isActive : true,
    };
    if (filterDto.date) filterOptions.date = new Date(filterDto.date);
    return this.queuesService.getVehiclesInQueue(centerId, credentials.accid, filterOptions);
  }

  @Get()
  @ApiOperation({ 
    summary: 'Get queue at a center',
    description: 'Returns queue list with position and type clearly visible. By default, returns today\'s queue (positions reset daily). Each entry shows queue position, queue type (LOADING/UNLOADING), vehicle info, and waiting time.'
  })
  @ApiResponse({ status: 200, description: 'Queue list retrieved successfully' })
  @ApiQuery({ name: 'type', required: false, enum: ['LOADING', 'UNLOADING'], description: 'Filter by queue type' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Show only active queues (default: true)' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Get queue for specific date (YYYY-MM-DD). Default: today' })
  async getQueue(
    @Param('centerId', ParseIntPipe) centerId: number,
    @Query() filterDto: FilterQueuesDto & { date?: string },
    @CurrentUserCredentials() credentials: any,
  ) {
    const filterOptions: any = {
      type: filterDto.type,
      isActive: filterDto.isActive !== undefined ? filterDto.isActive : true,
    };
    
    if (filterDto.date) {
      filterOptions.date = new Date(filterDto.date);
    }

    return this.queuesService.getQueue(
      centerId,
      credentials.accid,
      filterOptions,
    );
  }

  @Get('summary')
  @ApiOperation({ 
    summary: 'Get queue summary/statistics for a center',
    description: 'Returns queue summary showing position and type clearly. Shows total counts, active counts, and position list for both LOADING and UNLOADING queues. Positions reset daily.'
  })
  @ApiResponse({ status: 200, description: 'Queue summary retrieved successfully' })
  async getQueueSummary(
    @Param('centerId', ParseIntPipe) centerId: number,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.queuesService.getQueueSummary(
      centerId,
      credentials.accid,
    );
  }
}
