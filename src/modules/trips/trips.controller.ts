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
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUserCredentials } from '@modules/auth/decorators/current-user-credentials.decorator';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { CreateTripEventDto } from './dto/create-trip-event.dto';
import { FilterTripsDto } from './dto/filter-trips.dto';
import { SetDestinationDto } from './dto/set-destination.dto';

@ApiTags('Trips')
@Controller('trips')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new trip' })
  @ApiResponse({ status: 201, description: 'Trip created successfully' })
  @ApiResponse({ status: 400, description: 'Vehicle already has an active trip' })
  async createTrip(
    @Body() createTripDto: CreateTripDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.tripsService.createTrip(
      createTripDto,
      credentials.accid,
      credentials.subid,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all trips with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'List of trips' })
  async findAll(
    @Query() filterDto: FilterTripsDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    const include = filterDto.include ? filterDto.include.split(',') : [];
    return this.tripsService.findAllTrips(filterDto, {
      accountId: credentials.accid,
      include,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a trip by ID' })
  @ApiResponse({ status: 200, description: 'Trip details' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  @ApiQuery({ name: 'include', required: false, description: 'Comma-separated relations to include (vehicle,originCenter,destinationCenter,events)' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('include') include?: string,
    @CurrentUserCredentials() credentials?: any,
  ) {
    const includeArray = include ? include.split(',') : [];
    const trip = await this.tripsService.findTripById(id, credentials.accid, includeArray);
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }
    return trip;
  }

  // ---- Trip-centric actions (update phase + create events). Use these from mobile. ----
  @Post(':id/start-loading')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start loading at origin' })
  @ApiResponse({ status: 200, description: 'Trip updated; phase AT_ORIGIN_LOADING' })
  @ApiResponse({ status: 400, description: 'Trip not in AT_ORIGIN_ARRIVED phase' })
  async startLoading(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.tripsService.startLoading(id, credentials.accid, credentials.subid);
  }

  @Post(':id/end-loading')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End loading at origin' })
  @ApiResponse({ status: 200, description: 'Trip updated; phase AT_ORIGIN_LOADING_ENDED' })
  @ApiResponse({ status: 400, description: 'Trip not in AT_ORIGIN_LOADING phase' })
  async endLoading(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.tripsService.endLoading(id, credentials.accid, credentials.subid);
  }

  @Post(':id/set-destination')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set destination center and mark ready to exit' })
  @ApiResponse({ status: 200, description: 'Trip updated; phase READY_TO_EXIT' })
  @ApiResponse({ status: 400, description: 'Trip not in AT_ORIGIN_LOADING_ENDED phase' })
  async setDestination(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetDestinationDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.tripsService.setDestination(id, dto, credentials.accid, credentials.subid);
  }

  @Post(':id/exit-origin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record vehicle exited origin' })
  @ApiResponse({ status: 200, description: 'Trip updated; phase IN_TRANSIT' })
  @ApiResponse({ status: 400, description: 'Trip not in READY_TO_EXIT phase' })
  async exitOrigin(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.tripsService.exitOrigin(id, credentials.accid, credentials.subid);
  }

  @Post(':id/arrive-destination')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record arrival at destination' })
  @ApiResponse({ status: 200, description: 'Trip updated; phase AT_DESTINATION_ARRIVED' })
  @ApiResponse({ status: 400, description: 'Trip not in IN_TRANSIT or no destination set' })
  async arriveDestination(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.tripsService.arriveDestination(id, credentials.accid, credentials.subid);
  }

  @Post(':id/start-unloading')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start unloading at destination' })
  @ApiResponse({ status: 200, description: 'Trip updated; phase AT_DESTINATION_UNLOADING' })
  @ApiResponse({ status: 400, description: 'Trip not in AT_DESTINATION_ARRIVED phase' })
  async startUnloading(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.tripsService.startUnloading(id, credentials.accid, credentials.subid);
  }

  @Post(':id/end-unloading')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End unloading at destination' })
  @ApiResponse({ status: 200, description: 'Trip updated; DELIVERY auto-completes, PICKUP -> AT_DESTINATION_UNLOADING_ENDED' })
  @ApiResponse({ status: 400, description: 'Trip not in AT_DESTINATION_UNLOADING phase' })
  async endUnloading(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.tripsService.endUnloading(id, credentials.accid, credentials.subid);
  }

  @Post(':id/events')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a trip event' })
  @ApiResponse({ status: 201, description: 'Trip event created successfully' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  async createTripEvent(
    @Param('id', ParseIntPipe) tripId: number,
    @Body() createEventDto: CreateTripEventDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.tripsService.createTripEvent(
      tripId,
      createEventDto,
      credentials.accid,
      credentials.subid,
    );
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a trip' })
  @ApiResponse({ status: 200, description: 'Trip completed successfully' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  async completeTrip(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.tripsService.completeTrip(id, credentials.accid);
  }
}
