import { Injectable, Inject, NotFoundException, Logger, BadRequestException, forwardRef } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PaginateQuery, PaginateResult, BaseEntity } from '@common/interfaces';
import { BaseService } from '@common/services/base.service';
import { eq, and, SQL, desc, asc, count, sql, inArray } from 'drizzle-orm';
import * as schema from '@modules/schemas';
import { CreateTripDto } from './dto/create-trip.dto';
import { CreateTripEventDto } from './dto/create-trip-event.dto';
import { FilterTripsDto } from './dto/filter-trips.dto';
import { SetDestinationDto } from './dto/set-destination.dto';
import { TripStatus } from '@common/enums/trip-status.enum';
import { TripPhase } from '@common/enums/trip-phase.enum';
import { TripEventType } from '@common/enums/trip-event-type.enum';
import { TripPurpose } from '@common/enums/trip-purpose.enum';
import { QueueType } from '@common/enums/queue-type.enum';
import { VehicleStatus } from '@common/enums/vehicle-status.enum';
import { QueuesService } from '@modules/queues/queues.service';

type Trip = typeof schema.trips.$inferSelect & BaseEntity;
type TripEvent = typeof schema.tripEvents.$inferSelect & BaseEntity;

@Injectable()
export class TripsService extends BaseService<Trip> {
  private readonly logger = new Logger(TripsService.name);
  private readonly dbConnection: any;

  constructor(
    @Inject(DATABASE_CONNECTION)
    db: any,
    @Inject(forwardRef(() => QueuesService))
    private readonly queuesService: QueuesService,
  ) {
    super(db, schema.trips as any);
    this.dbConnection = db;
  }

  /**
   * Create a new trip
   * Ensures vehicle doesn't have an active trip
   */
  async createTrip(data: CreateTripDto, accountId: number, agentId: number): Promise<Trip> {
    // Log the payload for debugging
    console.log('📦 Create Trip Payload:', JSON.stringify({ data, accountId, agentId }, null, 2));
    
    try {
      // Validate that vehicle exists and belongs to account
      // Try both id and thirdPartyId since vehicles.id = vehicles.thirdPartyId
      let [vehicle] = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.id, data.vehicleId),
            eq(schema.vehicles.accountId, accountId)
          )
        )
        .limit(1);

      // If not found by id, try thirdPartyId (should be same, but just in case)
      if (!vehicle) {
        [vehicle] = await this.dbConnection
          .select()
          .from(schema.vehicles)
          .where(
            and(
              eq(schema.vehicles.thirdPartyId, data.vehicleId),
              eq(schema.vehicles.accountId, accountId)
            )
          )
          .limit(1);
      }

      if (!vehicle) {
        throw new NotFoundException(
          `Vehicle ${data.vehicleId} not found for this account. ` +
          `Please ensure the vehicle is synced from the Malambi API first using POST /api/v1/vehicles/sync?vehicle_id=${data.vehicleId}`
        );
      }

      // Validate that origin center exists and belongs to account
      // Try both id (thirdPartyId) and geozoneId since API might send either
      let [originCenter] = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(
          and(
            eq(schema.centers.id, data.originCenterId),
            eq(schema.centers.accountId, accountId)
          )
        )
        .limit(1);

      // If not found by id, try geozoneId (like arrivals/exits do)
      if (!originCenter) {
        [originCenter] = await this.dbConnection
          .select()
          .from(schema.centers)
          .where(
            and(
              eq(schema.centers.geozoneId, data.originCenterId),
              eq(schema.centers.accountId, accountId)
            )
          )
          .limit(1);
      }

      if (!originCenter) {
        throw new NotFoundException(`Origin center ${data.originCenterId} not found for this account (tried both id and geozoneId)`);
      }

      // Validate destination center if provided
      let destinationCenter: any = null;
      if (data.destinationCenterId !== undefined && data.destinationCenterId !== null) {
        // Try both id (thirdPartyId) and geozoneId
        [destinationCenter] = await this.dbConnection
          .select()
          .from(schema.centers)
          .where(
            and(
              eq(schema.centers.id, data.destinationCenterId),
              eq(schema.centers.accountId, accountId)
            )
          )
          .limit(1);

        if (!destinationCenter) {
          [destinationCenter] = await this.dbConnection
            .select()
            .from(schema.centers)
            .where(
              and(
                eq(schema.centers.geozoneId, data.destinationCenterId),
                eq(schema.centers.accountId, accountId)
              )
            )
            .limit(1);
        }

        if (!destinationCenter) {
          throw new NotFoundException(`Destination center ${data.destinationCenterId} not found for this account (tried both id and geozoneId)`);
        }
      }

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

      // Create trip - use center.id (which equals thirdPartyId) since trips.originCenterId references centers.id
      // vehicleId should already be the internal id (which equals thirdPartyId) since vehicles.id = vehicles.thirdPartyId
      const tripData: any = {
        vehicleId: vehicle.id,
        originCenterId: originCenter.id,
        purpose: data.purpose || 'DELIVERY',
        status: TripStatus.ONGOING,
        phase: TripPhase.AT_ORIGIN_ARRIVED,
      };

      // Only include destinationCenterId if it's provided (not undefined)
      // Use center.id (which equals geozoneId) to match schema FK
      if (destinationCenter) {
        tripData.destinationCenterId = destinationCenter.id;
      }

      // Log the trip data that will be inserted
      console.log('💾 Trip Data to Insert:', JSON.stringify({ tripData, accountId }, null, 2));
      console.log('🔍 Vehicle found:', { id: vehicle.id, thirdPartyId: vehicle.thirdPartyId });
      console.log('🔍 Origin Center found:', { id: originCenter.id, thirdPartyId: originCenter.thirdPartyId, geozoneId: originCenter.geozoneId });
      if (destinationCenter) {
        console.log('🔍 Destination Center found:', { id: destinationCenter.id, thirdPartyId: destinationCenter.thirdPartyId, geozoneId: destinationCenter.geozoneId });
      }

      let trip: Trip;
      try {
        trip = await this.create(tripData, accountId);
      } catch (error: any) {
        // Log the actual database error for debugging
        this.logger.error(
          `Failed to create trip in database: ${error?.message || 'Unknown error'}`,
          error?.stack
        );
        this.logger.error(`Trip data: ${JSON.stringify(tripData)}, accountId: ${accountId}`);
        
        // Check for common database errors
        const errorMessage = error?.message || String(error);
        if (errorMessage.includes('foreign key') || errorMessage.includes('violates foreign key')) {
          throw new BadRequestException(
            `Invalid vehicle or center ID. Please verify that vehicle ${data.vehicleId} and center ${data.originCenterId} exist and belong to this account.`
          );
        }
        if (errorMessage.includes('not null') || errorMessage.includes('NULL')) {
          throw new BadRequestException(
            `Missing required field: ${errorMessage}`
          );
        }
        
        // Re-throw with more context
        throw new BadRequestException(
          `Failed to create trip: ${errorMessage}`
        );
      }

      // Create initial ARRIVED event
      // Note: trip_events.centerId references centers.id (which equals thirdPartyId), not geozoneId
      await this.createTripEvent(
        trip.id,
        {
          eventType: TripEventType.ARRIVED,
          centerId: originCenter.id, // Use center.id (which equals geozoneId) to match schema FK
          metadata: {},
        },
        accountId,
        agentId
      );

      // Automatically add vehicle to queue at origin
      // At origin (first center) the vehicle is always loading: DELIVERY = load goods to deliver, PICKUP = pick up (load) goods
      // So both use LOADING queue at origin. UNLOADING is used at destination when the vehicle arrives there.
      // Run asynchronously in background so it doesn't block trip creation response
      const queueType = QueueType.LOADING;
      
      this.logger.log(
        `🚀 Automatically adding vehicle ${vehicle.id} to ${queueType} queue for trip ${trip.id} ` +
        `(purpose: ${trip.purpose || TripPurpose.DELIVERY}) at center ${originCenter.id}`
      );
      
      this.addVehicleToQueueAutomatically(
        originCenter.id, // Use center.id (which equals thirdPartyId)
        vehicle.id, // Use vehicle.id (which equals thirdPartyId)
        trip.id,
        queueType,
        accountId,
        agentId
      ).catch((error) => {
        // Log error but don't fail trip creation
        this.logger.error(
          `❌ Failed to automatically add vehicle ${vehicle.id} to ${queueType} queue for trip ${trip.id}: ${error?.message || 'Unknown error'}`,
          error?.stack
        );
      });

      return trip;
    } catch (error: any) {
      // Re-throw known exceptions
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      // Log and wrap unexpected errors
      this.logger.error(
        `Unexpected error creating trip: ${error?.message || 'Unknown error'}`,
        error?.stack
      );
      throw new BadRequestException(
        `Failed to create trip: ${error?.message || 'Unknown error'}`
      );
    }
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

    // Look up center by id (geozoneId) or geozoneId since API might send either
    // trip_events.centerId references centers.id (which equals geozoneId)
    let [center] = await this.dbConnection
      .select()
      .from(schema.centers)
      .where(
        and(
          eq(schema.centers.id, data.centerId),
          eq(schema.centers.accountId, accountId)
        )
      )
      .limit(1);

    // If not found by id, try geozoneId
    if (!center) {
      [center] = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(
          and(
            eq(schema.centers.geozoneId, data.centerId),
            eq(schema.centers.accountId, accountId)
          )
        )
        .limit(1);
    }

    if (!center) {
      throw new NotFoundException(`Center ${data.centerId} not found for this account (tried both id and geozoneId)`);
    }

    // Use center.id (which equals thirdPartyId) for the foreign key
    const actualCenterId = center.id;

    // Create trip event
    const event = await this.dbConnection
      .insert(schema.tripEvents)
      .values({
        tripId,
        centerId: actualCenterId, // Use center.id (which equals geozoneId) to match schema FK
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
    await this.updateVehicleStatusFromEvent(tripData.vehicleId, data.eventType, actualCenterId, accountId);

    // Update trip destination if READY_TO_EXIT event has destination in metadata
    if (data.eventType === TripEventType.READY_TO_EXIT && data.metadata?.destinationCenterId) {
      // Validate destination center - try both id (thirdPartyId) and geozoneId
      let [destinationCenter] = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(
          and(
            eq(schema.centers.id, data.metadata.destinationCenterId),
            eq(schema.centers.accountId, accountId)
          )
        )
        .limit(1);

      // If not found by id, try geozoneId
      if (!destinationCenter) {
        [destinationCenter] = await this.dbConnection
          .select()
          .from(schema.centers)
          .where(
            and(
              eq(schema.centers.geozoneId, data.metadata.destinationCenterId),
              eq(schema.centers.accountId, accountId)
            )
          )
          .limit(1);
      }

      if (destinationCenter) {
        // Use center.id (which equals geozoneId) for trips.destinationCenterId FK
        await this.dbConnection
          .update(schema.trips)
          .set({
            destinationCenterId: destinationCenter.id,
            updatedAt: new Date(),
          })
          .where(eq(schema.trips.id, tripId));
      } else {
        this.logger.warn(
          `Destination center ${data.metadata.destinationCenterId} not found for trip ${tripId}, skipping destination update`
        );
      }
    }

    // Trip completion for DELIVERY happens on UNLOADING_ENDED (handled in endUnloading action)

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
        // centerId is already validated and converted to centers.id in createTripEvent
        newCurrentCenterId = centerId;
        break;
      case TripEventType.QUEUED:
        newStatus = VehicleStatus.WAITING_IN_QUEUE;
        // centerId is already validated and converted to centers.id in createTripEvent
        newCurrentCenterId = centerId;
        break;
      case TripEventType.SERVICE_STARTED:
        // Determine if loading or unloading based on trip purpose or metadata
        // For now, default to LOADING - can be enhanced with metadata
        newStatus = VehicleStatus.LOADING;
        // centerId is already validated and converted to centers.id in createTripEvent
        newCurrentCenterId = centerId;
        break;
      case TripEventType.LOADING_ENDED:
      case TripEventType.UNLOADING_ENDED:
        newStatus = VehicleStatus.AVAILABLE;
        // centerId is already validated and converted to centers.id in createTripEvent
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
   * Complete a trip (e.g. PICKUP after end-unloading).
   * Allowed only when phase is AT_DESTINATION_UNLOADING_ENDED or already COMPLETED (no-op).
   * Call POST /trips/:id/end-unloading first when phase is AT_DESTINATION_UNLOADING.
   */
  async completeTrip(tripId: number, accountId: number): Promise<Trip> {
    const trip = await this.getTripOrThrow(tripId, accountId);
    const phase = (trip as any).phase as TripPhase;
    if (phase === TripPhase.COMPLETED) {
      return trip;
    }
    if (phase !== TripPhase.AT_DESTINATION_UNLOADING_ENDED) {
      throw new BadRequestException(
        `Trip can only be completed when phase is AT_DESTINATION_UNLOADING_ENDED (call POST /trips/:id/end-unloading first). Current phase: ${phase}`
      );
    }

    const updated = await this.dbConnection
      .update(schema.trips)
      .set({
        status: TripStatus.COMPLETED,
        phase: TripPhase.COMPLETED,
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
          eq(schema.vehicles.id, trip.vehicleId),
          eq(schema.vehicles.accountId, accountId)
        )
      );

    return updated[0];
  }

  /**
   * Get trip by ID or throw
   */
  private async getTripOrThrow(tripId: number, accountId: number): Promise<Trip> {
    const [trip] = await this.dbConnection
      .select()
      .from(schema.trips)
      .where(
        and(
          eq(schema.trips.id, tripId),
          eq(schema.trips.accountId, accountId)
        )
      )
      .limit(1);
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }
    return trip as Trip;
  }

  /**
   * Ensure trip is in one of the allowed phases; throw otherwise
   */
  private ensurePhase(trip: Trip, allowedPhases: TripPhase[]): void {
    const current = (trip as any).phase as TripPhase;
    if (!allowedPhases.includes(current)) {
      throw new BadRequestException(
        `Trip is in phase ${current}. Allowed for this action: ${allowedPhases.join(', ')}`
      );
    }
  }

  /**
   * Update trip phase
   */
  private async updateTripPhase(tripId: number, phase: TripPhase): Promise<void> {
    await this.dbConnection
      .update(schema.trips)
      .set({ phase, updatedAt: new Date() })
      .where(eq(schema.trips.id, tripId));
  }

  /**
   * Trip-centric action: Start loading at origin.
   * Valid phase: AT_ORIGIN_ARRIVED. Updates phase to AT_ORIGIN_LOADING, starts queue service, creates SERVICE_STARTED event.
   */
  async startLoading(tripId: number, accountId: number, agentId: number): Promise<Trip> {
    const trip = await this.getTripOrThrow(tripId, accountId);
    this.ensurePhase(trip, [TripPhase.AT_ORIGIN_ARRIVED]);
    await this.queuesService.startServiceByVehicleId(
      trip.vehicleId,
      { queueType: QueueType.LOADING },
      accountId,
      agentId
    );
    await this.updateTripPhase(tripId, TripPhase.AT_ORIGIN_LOADING);
    return (await this.getTripOrThrow(tripId, accountId)) as Trip;
  }

  /**
   * Trip-centric action: End loading at origin.
   * Valid phase: AT_ORIGIN_LOADING. Creates LOADING_ENDED event, updates phase to AT_ORIGIN_LOADING_ENDED.
   */
  async endLoading(tripId: number, accountId: number, agentId: number): Promise<Trip> {
    const trip = await this.getTripOrThrow(tripId, accountId);
    this.ensurePhase(trip, [TripPhase.AT_ORIGIN_LOADING]);
    await this.createTripEvent(
      tripId,
      {
        eventType: TripEventType.LOADING_ENDED,
        centerId: trip.originCenterId,
        metadata: {},
      },
      accountId,
      agentId
    );
    await this.updateTripPhase(tripId, TripPhase.AT_ORIGIN_LOADING_ENDED);
    return (await this.getTripOrThrow(tripId, accountId)) as Trip;
  }

  /**
   * Trip-centric action: Set destination and mark ready to exit.
   * Valid phase: AT_ORIGIN_LOADING_ENDED. Creates READY_TO_EXIT event with destinationCenterId, updates trip.destinationCenterId and phase to READY_TO_EXIT.
   */
  async setDestination(
    tripId: number,
    dto: SetDestinationDto,
    accountId: number,
    agentId: number
  ): Promise<Trip> {
    const trip = await this.getTripOrThrow(tripId, accountId);
    this.ensurePhase(trip, [TripPhase.AT_ORIGIN_LOADING_ENDED]);
    await this.createTripEvent(
      tripId,
      {
        eventType: TripEventType.READY_TO_EXIT,
        centerId: trip.originCenterId,
        metadata: { destinationCenterId: dto.destinationCenterId },
      },
      accountId,
      agentId
    );
    await this.updateTripPhase(tripId, TripPhase.READY_TO_EXIT);
    return (await this.getTripOrThrow(tripId, accountId)) as Trip;
  }

  /**
   * Trip-centric action: Vehicle exited origin.
   * Valid phase: READY_TO_EXIT. Creates EXITED event, updates phase to IN_TRANSIT.
   */
  async exitOrigin(tripId: number, accountId: number, agentId: number): Promise<Trip> {
    const trip = await this.getTripOrThrow(tripId, accountId);
    this.ensurePhase(trip, [TripPhase.READY_TO_EXIT]);
    await this.createTripEvent(
      tripId,
      { eventType: TripEventType.EXITED, centerId: trip.originCenterId, metadata: {} },
      accountId,
      agentId
    );
    await this.updateTripPhase(tripId, TripPhase.IN_TRANSIT);
    return (await this.getTripOrThrow(tripId, accountId)) as Trip;
  }

  /**
   * Trip-centric action: Record arrival at destination.
   * Valid phase: IN_TRANSIT. Creates ARRIVED_DESTINATION event, adds vehicle to UNLOADING queue, updates phase to AT_DESTINATION_ARRIVED.
   */
  async arriveDestination(tripId: number, accountId: number, agentId: number): Promise<Trip> {
    const trip = await this.getTripOrThrow(tripId, accountId);
    this.ensurePhase(trip, [TripPhase.IN_TRANSIT]);
    if (!trip.destinationCenterId) {
      throw new BadRequestException('Trip has no destination center set. Set destination before exiting origin.');
    }
    await this.createTripEvent(
      tripId,
      {
        eventType: TripEventType.ARRIVED_DESTINATION,
        centerId: trip.destinationCenterId,
        metadata: {},
      },
      accountId,
      agentId
    );
    await this.addVehicleToQueueAutomatically(
      trip.destinationCenterId,
      trip.vehicleId,
      tripId,
      QueueType.UNLOADING,
      accountId,
      agentId
    ).catch((err) => {
      this.logger.warn(`Queue add after arrival failed (trip ${tripId}): ${err?.message}`);
    });
    await this.updateTripPhase(tripId, TripPhase.AT_DESTINATION_ARRIVED);
    return (await this.getTripOrThrow(tripId, accountId)) as Trip;
  }

  /**
   * Trip-centric action: Start unloading at destination.
   * Valid phase: AT_DESTINATION_ARRIVED. Starts queue service, updates phase to AT_DESTINATION_UNLOADING.
   */
  async startUnloading(tripId: number, accountId: number, agentId: number): Promise<Trip> {
    const trip = await this.getTripOrThrow(tripId, accountId);
    this.ensurePhase(trip, [TripPhase.AT_DESTINATION_ARRIVED]);
    await this.queuesService.startServiceByVehicleId(
      trip.vehicleId,
      { queueType: QueueType.UNLOADING },
      accountId,
      agentId
    );
    await this.updateTripPhase(tripId, TripPhase.AT_DESTINATION_UNLOADING);
    return (await this.getTripOrThrow(tripId, accountId)) as Trip;
  }

  /**
   * Trip-centric action: End unloading at destination.
   * Valid phase: AT_DESTINATION_UNLOADING. Creates UNLOADING_ENDED event. DELIVERY: auto-completes trip. PICKUP: phase -> AT_DESTINATION_UNLOADING_ENDED.
   */
  async endUnloading(tripId: number, accountId: number, agentId: number): Promise<Trip> {
    if (agentId == null || Number(agentId) <= 0) {
      throw new BadRequestException('Agent ID is required for end-unloading (record who ended unloading).');
    }
    const trip = await this.getTripOrThrow(tripId, accountId);
    this.ensurePhase(trip, [TripPhase.AT_DESTINATION_UNLOADING]);
    if (!trip.destinationCenterId) {
      throw new BadRequestException('Trip has no destination center set; cannot record UNLOADING_ENDED.');
    }
    await this.createTripEvent(
      tripId,
      {
        eventType: TripEventType.UNLOADING_ENDED,
        centerId: trip.destinationCenterId,
        metadata: {},
      },
      accountId,
      agentId
    );
    // Update phase first so completeTrip (for DELIVERY) sees AT_DESTINATION_UNLOADING_ENDED
    await this.updateTripPhase(tripId, TripPhase.AT_DESTINATION_UNLOADING_ENDED);
    if (trip.purpose === TripPurpose.DELIVERY) {
      await this.completeTrip(tripId, accountId);
      return (await this.getTripOrThrow(tripId, accountId)) as Trip;
    }
    return (await this.getTripOrThrow(tripId, accountId)) as Trip;
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
    if (filterDto.phase) {
      conditions.push(eq(schema.trips.phase, filterDto.phase));
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
        if (options.include.includes('events')) {
          const events = await this.dbConnection
            .select()
            .from(schema.tripEvents)
            .where(eq(schema.tripEvents.tripId, trip.id))
            .orderBy(asc(schema.tripEvents.timestamp));
          (trip as any).events = events;
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

  /**
   * Automatically add vehicle to queue after trip creation
   * Runs asynchronously in background - errors are logged but don't fail trip creation
   * @private
   */
  private async addVehicleToQueueAutomatically(
    centerId: number,
    vehicleId: number,
    tripId: number,
    queueType: QueueType,
    accountId: number,
    agentId: number
  ): Promise<void> {
    try {
      this.logger.log(
        `Automatically adding vehicle ${vehicleId} to ${queueType} queue for trip ${tripId} at center ${centerId}`
      );

      await this.queuesService.addToQueue(
        centerId,
        {
          vehicleId,
          tripId,
          queueType,
        },
        accountId,
        agentId
      );

      this.logger.log(
        `Successfully added vehicle ${vehicleId} to ${queueType} queue for trip ${tripId}`
      );
    } catch (error: any) {
      // If vehicle is already in queue, that's okay - just log it
      if (error instanceof BadRequestException && error.message?.includes('already in')) {
        this.logger.warn(
          `Vehicle ${vehicleId} already in ${queueType} queue for trip ${tripId}, skipping automatic queue addition`
        );
        return;
      }

      // For other errors, re-throw so it gets caught and logged by the caller
      throw error;
    }
  }
}
