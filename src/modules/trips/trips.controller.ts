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
