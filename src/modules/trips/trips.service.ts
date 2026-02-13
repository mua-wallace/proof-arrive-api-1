import { Injectable, Inject, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PaginateQuery, PaginateResult, BaseEntity } from '@common/interfaces';
import { BaseService } from '@common/services/base.service';
import { eq, and, SQL, desc, asc, count, sql, inArray } from 'drizzle-orm';
import * as schema from '@modules/schemas';
import { CreateTripDto } from './dto/create-trip.dto';
import { CreateTripEventDto } from './dto/create-trip-event.dto';
import { FilterTripsDto } from './dto/filter-trips.dto';
import { TripStatus } from '@common/enums/trip-status.enum';
import { TripEventType } from '@common/enums/trip-event-type.enum';
import { VehicleStatus } from '@common/enums/vehicle-status.enum';

type Trip = typeof schema.trips.$inferSelect & BaseEntity;
type TripEvent = typeof schema.tripEvents.$inferSelect & BaseEntity;

@Injectable()
export class TripsService extends BaseService<Trip> {
  private readonly logger = new Logger(TripsService.name);
  private readonly dbConnection: any;

  constructor(
    @Inject(DATABASE_CONNECTION)
    db: any,
  ) {
    super(db, schema.trips as any);
    this.dbConnection = db;
  }

  /**
   * Create a new trip
   * Ensures vehicle doesn't have an active trip
   */
  async createTrip(data: CreateTripDto, accountId: number, agentId: number): Promise<Trip> {
    // Check if vehicle has an active trip
    const activeTrip = await this.dbConnection
      .select()
      .from(schema.trips)
      .where(
        and(
          eq(schema.trips.vehicleId, data.vehicleId),
          eq(schema.trips.status, TripStatus.ONGOING),
          eq(schema.trips.accountId, accountId)
        )
      )
      .limit(1);

    if (activeTrip.length > 0) {
      throw new BadRequestException(`Vehicle ${data.vehicleId} already has an active trip`);
    }

    // Create trip - only include destinationCenterId if provided
    const tripData: any = {
      vehicleId: data.vehicleId,
      originCenterId: data.originCenterId,
      purpose: data.purpose || 'DELIVERY',
      status: TripStatus.ONGOING,
    };

    // Only include destinationCenterId if it's provided (not undefined)
    if (data.destinationCenterId !== undefined && data.destinationCenterId !== null) {
      tripData.destinationCenterId = data.destinationCenterId;
    }

    const trip = await this.create(tripData, accountId);

    // Create initial ARRIVED event
    await this.createTripEvent(
      trip.id,
      {
        eventType: TripEventType.ARRIVED,
        centerId: data.originCenterId,
        metadata: {},
      },
      accountId,
      agentId
    );

    return trip;
  }

  /**
   * Create a trip event
   * Updates vehicle status and current center based on event type
   */
  async createTripEvent(
    tripId: number,
    data: CreateTripEventDto,
    accountId: number,
    agentId: number
  ): Promise<TripEvent> {
    // Verify trip exists and belongs to account
    const trip = await this.dbConnection
      .select()
      .from(schema.trips)
      .where(
        and(
          eq(schema.trips.id, tripId),
          eq(schema.trips.accountId, accountId)
        )
      )
      .limit(1);

    if (trip.length === 0) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const tripData = trip[0];

    // Create trip event
    const event = await this.dbConnection
      .insert(schema.tripEvents)
      .values({
        tripId,
        centerId: data.centerId,
        agentId,
        eventType: data.eventType,
        timestamp: new Date(),
        metadata: data.metadata || {},
        accountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Update vehicle status and current center based on event type
    await this.updateVehicleStatusFromEvent(tripData.vehicleId, data.eventType, data.centerId, accountId);

    // Update trip destination if READY_TO_EXIT event has destination in metadata
    if (data.eventType === TripEventType.READY_TO_EXIT && data.metadata?.destinationCenterId) {
      await this.dbConnection
        .update(schema.trips)
        .set({
          destinationCenterId: data.metadata.destinationCenterId,
          updatedAt: new Date(),
        })
        .where(eq(schema.trips.id, tripId));
    }

    // Complete trip if ARRIVED_DESTINATION event and purpose is DELIVERY
    if (data.eventType === TripEventType.ARRIVED_DESTINATION && tripData.purpose === 'DELIVERY') {
      await this.completeTrip(tripId, accountId);
    }

    return event[0];
  }

  /**
   * Update vehicle status based on trip event
   */
  private async updateVehicleStatusFromEvent(
    vehicleId: number,
    eventType: TripEventType,
    centerId: number,
    accountId: number
  ): Promise<void> {
    let newStatus: VehicleStatus;
    let newCurrentCenterId: number | null = null;

    switch (eventType) {
      case TripEventType.ARRIVED:
      case TripEventType.ARRIVED_DESTINATION:
        newStatus = VehicleStatus.WAITING_IN_QUEUE;
        newCurrentCenterId = centerId;
        break;
      case TripEventType.QUEUED:
        newStatus = VehicleStatus.WAITING_IN_QUEUE;
        newCurrentCenterId = centerId;
        break;
      case TripEventType.SERVICE_STARTED:
        // Determine if loading or unloading based on trip purpose or metadata
        // For now, default to LOADING - can be enhanced with metadata
        newStatus = VehicleStatus.LOADING;
        newCurrentCenterId = centerId;
        break;
      case TripEventType.LOADING_ENDED:
      case TripEventType.UNLOADING_ENDED:
        newStatus = VehicleStatus.AVAILABLE;
        newCurrentCenterId = centerId;
        break;
      case TripEventType.EXITED:
        newStatus = VehicleStatus.IN_TRANSIT;
        newCurrentCenterId = null;
        break;
      default:
        // Don't update status for other events
        return;
    }

    await this.dbConnection
      .update(schema.vehicles)
      .set({
        status: newStatus,
        currentCenterId: newCurrentCenterId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.vehicles.id, vehicleId),
          eq(schema.vehicles.accountId, accountId)
        )
      );
  }

  /**
   * Complete a trip
   */
  async completeTrip(tripId: number, accountId: number): Promise<Trip> {
    const trip = await this.dbConnection
      .select()
      .from(schema.trips)
      .where(
        and(
          eq(schema.trips.id, tripId),
          eq(schema.trips.accountId, accountId)
        )
      )
      .limit(1);

    if (trip.length === 0) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const updated = await this.dbConnection
      .update(schema.trips)
      .set({
        status: TripStatus.COMPLETED,
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.trips.id, tripId))
      .returning();

    // Update vehicle to AVAILABLE
    await this.dbConnection
      .update(schema.vehicles)
      .set({
        status: VehicleStatus.AVAILABLE,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.vehicles.id, trip[0].vehicleId),
          eq(schema.vehicles.accountId, accountId)
        )
      );

    return updated[0];
  }

  /**
   * Find trip by ID with optional relations
   */
  async findTripById(id: number, accountId: number, include?: string[]): Promise<Trip | null> {
    const trip = await this.dbConnection
      .select()
      .from(schema.trips)
      .where(
        and(
          eq(schema.trips.id, id),
          eq(schema.trips.accountId, accountId)
        )
      )
      .limit(1);

    if (trip.length === 0) {
      return null;
    }

    const tripData = trip[0];

    // Load relations if requested
    if (include && include.length > 0) {
      const relations: any = {};

      if (include.includes('vehicle')) {
        const vehicle = await this.dbConnection
          .select()
          .from(schema.vehicles)
          .where(eq(schema.vehicles.id, tripData.vehicleId))
          .limit(1);
        relations.vehicle = vehicle[0] || null;
      }

      if (include.includes('originCenter')) {
        const center = await this.dbConnection
          .select()
          .from(schema.centers)
          .where(eq(schema.centers.id, tripData.originCenterId))
          .limit(1);
        relations.originCenter = center[0] || null;
      }

      if (include.includes('destinationCenter') && tripData.destinationCenterId) {
        const center = await this.dbConnection
          .select()
          .from(schema.centers)
          .where(eq(schema.centers.id, tripData.destinationCenterId))
          .limit(1);
        relations.destinationCenter = center[0] || null;
      }

      if (include.includes('events')) {
        const events = await this.dbConnection
          .select()
          .from(schema.tripEvents)
          .where(eq(schema.tripEvents.tripId, id))
          .orderBy(asc(schema.tripEvents.timestamp));
        relations.events = events;
      }

      return { ...tripData, ...relations };
    }

    return tripData;
  }

  /**
   * Find all trips with filtering and pagination
   * Accepts PaginateQuery for base class compatibility, but also supports FilterTripsDto via options
   */
  async findAll(
    query: PaginateQuery = {},
    options?: { include?: string[]; accountId?: number; filterDto?: FilterTripsDto },
  ): Promise<PaginateResult<Trip>> {
    const filterDto = options?.filterDto || {};
    const page = query.page || filterDto.page || 1;
    const limit = query.limit || filterDto.limit || 10;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    if (options?.accountId !== undefined) {
      conditions.push(eq(schema.trips.accountId, options.accountId));
    }

    // Add filters from FilterTripsDto (passed via options)
    if (filterDto.vehicleId) {
      conditions.push(eq(schema.trips.vehicleId, Number(filterDto.vehicleId)));
    }
    if (filterDto.originCenterId) {
      conditions.push(eq(schema.trips.originCenterId, Number(filterDto.originCenterId)));
    }
    if (filterDto.destinationCenterId) {
      conditions.push(eq(schema.trips.destinationCenterId, Number(filterDto.destinationCenterId)));
    }
    if (filterDto.status) {
      conditions.push(eq(schema.trips.status, filterDto.status));
    }
    if (filterDto.purpose) {
      conditions.push(eq(schema.trips.purpose, filterDto.purpose));
    }

    // Search functionality
    const searchTerm = query.search || filterDto.search;
    if (searchTerm) {
      // Join with vehicles and centers for search
      const searchConditions: SQL[] = [];
      // This would require joins - simplified for now
      // Can be enhanced with proper joins
    }

    // Build order by - use PaginateQuery format or convert from FilterTripsDto
    let orderByClause: any = desc(schema.trips.startedAt);
    if (query.sortBy && query.sortBy.length > 0) {
      const sortFields = query.sortBy.map(([field, direction]) => {
        const column = (schema.trips as any)[field];
        if (column) {
          return direction === 'DESC' ? desc(column) : asc(column);
        }
        return null;
      }).filter(Boolean);
      if (sortFields.length > 0) {
        orderByClause = sortFields;
      }
    } else if (filterDto.sortBy) {
      const column = (schema.trips as any)[filterDto.sortBy];
      if (column) {
        orderByClause = filterDto.sortOrder === 'asc' ? asc(column) : desc(column);
      }
    }

    // Get total count
    const totalResult = await this.dbConnection
      .select({ count: count() })
      .from(schema.trips)
      .where(and(...conditions));

    const total = totalResult[0]?.count || 0;

    // Get paginated results
    const trips = await this.dbConnection
      .select()
      .from(schema.trips)
      .where(and(...conditions))
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    // Load relations if requested
    if (options?.include && options.include.length > 0) {
      for (const trip of trips) {
        if (options.include.includes('vehicle')) {
          const vehicle = await this.dbConnection
            .select()
            .from(schema.vehicles)
            .where(eq(schema.vehicles.id, trip.vehicleId))
            .limit(1);
          (trip as any).vehicle = vehicle[0] || null;
        }
        if (options.include.includes('originCenter')) {
          const center = await this.dbConnection
            .select()
            .from(schema.centers)
            .where(eq(schema.centers.id, trip.originCenterId))
            .limit(1);
          (trip as any).originCenter = center[0] || null;
        }
        if (options.include.includes('destinationCenter') && trip.destinationCenterId) {
          const center = await this.dbConnection
            .select()
            .from(schema.centers)
            .where(eq(schema.centers.id, trip.destinationCenterId))
            .limit(1);
          (trip as any).destinationCenter = center[0] || null;
        }
      }
    }

    // Build sortBy for meta (use PaginateQuery format)
    const sortByMeta: [string, 'ASC' | 'DESC'][] = query.sortBy || 
      (filterDto.sortBy ? [[filterDto.sortBy, (filterDto.sortOrder || 'desc').toUpperCase() as 'ASC' | 'DESC']] : [['startedAt', 'DESC']]);

    return {
      data: trips,
      meta: {
        itemsPerPage: limit,
        totalItems: total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        sortBy: sortByMeta,
        search: searchTerm,
        searchBy: searchTerm ? ['plate', 'name'] : undefined,
      },
      links: {
        current: `?page=${page}&limit=${limit}`,
      },
    };
  }

  /**
   * Find all trips with FilterTripsDto (convenience method)
   * Converts FilterTripsDto to PaginateQuery format and calls findAll
   */
  async findAllTrips(
    filterDto: FilterTripsDto = {},
    options?: { include?: string[]; accountId?: number },
  ): Promise<PaginateResult<Trip>> {
    // Convert FilterTripsDto to PaginateQuery format
    const paginateQuery: PaginateQuery = {
      page: filterDto.page,
      limit: filterDto.limit,
      search: filterDto.search,
      searchBy: filterDto.search ? ['plate', 'name'] : undefined,
      sortBy: filterDto.sortBy ? [[filterDto.sortBy, (filterDto.sortOrder || 'desc').toUpperCase() as 'ASC' | 'DESC']] : undefined,
    };

    return this.findAll(paginateQuery, { ...options, filterDto });
  }
}
