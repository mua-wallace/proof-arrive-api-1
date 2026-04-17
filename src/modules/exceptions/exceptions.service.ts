import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { eq, and, SQL, desc, asc, count, sql, inArray, gte, lt, or } from 'drizzle-orm';
import * as schema from '@modules/schemas';
import { ExceptionType } from '@common/enums/exception-type.enum';
import { ExceptionStatus } from '@common/enums/exception-status.enum';
import { TripPhase } from '@common/enums/trip-phase.enum';
import { TripStatus } from '@common/enums/trip-status.enum';
import { TripEventType } from '@common/enums/trip-event-type.enum';
import { VehicleStatus } from '@common/enums/vehicle-status.enum';
import {
  ReportExceptionDto,
  DispatchTechnicianDto,
  MarkRepairedDto,
  DispatchRescueVehicleDto,
  ConfirmTransferDto,
  ReturnToOriginDto,
  LogCallAttemptDto,
  EscalateExceptionDto,
  AddExceptionNoteDto,
  FilterExceptionsDto,
} from './dto';

type TripException = typeof schema.tripExceptions.$inferSelect;
type ExceptionEvent = typeof schema.exceptionEvents.$inferSelect;

@Injectable()
export class ExceptionsService {
  private readonly logger = new Logger(ExceptionsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: any,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // REPORT EXCEPTION
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Report a new exception on an in-transit trip (breakdown, accident, overdue, police stop, other).
   * Validates the trip is IN_TRANSIT, creates the exception record, updates trip phase,
   * and appends both an exception event and a trip event.
   */
  async reportException(
    tripId: number,
    dto: ReportExceptionDto,
    accountId: number,
    agentId: number,
  ): Promise<TripException> {
    const trip = await this.getTripOrThrow(tripId, accountId);

    // Allow reporting from IN_TRANSIT or OVERDUE phase
    const allowedPhases = [TripPhase.IN_TRANSIT, TripPhase.OVERDUE];
    if (!allowedPhases.includes(trip.phase as TripPhase)) {
      throw new BadRequestException(
        `Exceptions can only be reported on IN_TRANSIT or OVERDUE trips. Current phase: ${trip.phase}`,
      );
    }

    // Generate incident reference for accidents
    let incidentReference: string | null = null;
    if (dto.type === ExceptionType.ACCIDENT) {
      incidentReference = await this.generateIncidentReference(accountId);
    }

    // Determine new trip phase based on exception type
    const phaseMap: Record<string, TripPhase> = {
      [ExceptionType.BREAKDOWN]: TripPhase.BREAKDOWN,
      [ExceptionType.ACCIDENT]: TripPhase.ACCIDENT,
      [ExceptionType.OVERDUE]: TripPhase.OVERDUE,
      [ExceptionType.POLICE_STOP]: TripPhase.IN_TRANSIT, // Police stop doesn't change phase
      [ExceptionType.OTHER]: TripPhase.IN_TRANSIT, // Other doesn't change phase
    };

    const newPhase = phaseMap[dto.type] || TripPhase.IN_TRANSIT;

    // Create exception record
    const [exception] = await this.db
      .insert(schema.tripExceptions)
      .values({
        tripId,
        vehicleId: trip.vehicleId,
        type: dto.type,
        status: ExceptionStatus.ACTIVE,
        incidentReference,
        location: dto.location,
        description: dto.description,
        reportedById: agentId,
        reportedAt: new Date(),
        severity: dto.severity || null,
        hasInjuries: dto.hasInjuries ?? null,
        isCargoDamaged: dto.isCargoDamaged ?? null,
        cargoDamageDescription: dto.cargoDamageDescription || null,
        isVehicleDriveable: dto.isVehicleDriveable ?? null,
        policeReportReference: dto.policeReportReference || null,
        expectedArrivalAt: trip.estimatedArrivalAt || null,
        accountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Create exception event
    await this.createExceptionEvent(exception.id, 'EXCEPTION_REPORTED', agentId, accountId, {
      type: dto.type,
      location: dto.location,
      description: dto.description,
      severity: dto.severity,
      incidentReference,
    });

    // Update trip phase
    if (newPhase !== trip.phase) {
      await this.db
        .update(schema.trips)
        .set({ phase: newPhase, updatedAt: new Date() })
        .where(eq(schema.trips.id, tripId));
    }

    // Create trip event for the timeline
    await this.db.insert(schema.tripEvents).values({
      tripId,
      centerId: trip.originCenterId, // Use origin as center reference
      agentId,
      eventType: TripEventType.EXCEPTION_REPORTED,
      timestamp: new Date(),
      metadata: {
        exceptionId: exception.id,
        exceptionType: dto.type,
        location: dto.location,
        incidentReference,
      },
      accountId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return exception;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // BREAKDOWN ACTIONS
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Dispatch a technician to the breakdown/accident site.
   */
  async dispatchTechnician(
    exceptionId: number,
    dto: DispatchTechnicianDto,
    accountId: number,
    agentId: number,
  ): Promise<TripException> {
    const exception = await this.getExceptionOrThrow(exceptionId, accountId);
    this.ensureExceptionActive(exception);

    await this.db
      .update(schema.tripExceptions)
      .set({
        status: ExceptionStatus.IN_PROGRESS,
        technicianName: dto.technicianName,
        technicianPhone: dto.technicianPhone,
        estimatedRepairTime: dto.estimatedArrivalTime || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.tripExceptions.id, exceptionId));

    // Update trip phase to AWAITING_REPAIR
    await this.db
      .update(schema.trips)
      .set({ phase: TripPhase.AWAITING_REPAIR, updatedAt: new Date() })
      .where(eq(schema.trips.id, exception.tripId));

    await this.createExceptionEvent(exceptionId, 'TECHNICIAN_DISPATCHED', agentId, accountId, {
      technicianName: dto.technicianName,
      technicianPhone: dto.technicianPhone,
      estimatedArrivalTime: dto.estimatedArrivalTime,
      notes: dto.notes,
    });

    return this.getExceptionOrThrow(exceptionId, accountId);
  }

  /**
   * Mark a breakdown/accident as repaired. Trip resumes IN_TRANSIT.
   */
  async markRepaired(
    exceptionId: number,
    dto: MarkRepairedDto,
    accountId: number,
    agentId: number,
  ): Promise<TripException> {
    const exception = await this.getExceptionOrThrow(exceptionId, accountId);

    if (![ExceptionStatus.ACTIVE, ExceptionStatus.IN_PROGRESS].includes(exception.status as ExceptionStatus)) {
      throw new BadRequestException(`Exception is not active or in progress. Current status: ${exception.status}`);
    }

    await this.db
      .update(schema.tripExceptions)
      .set({
        status: ExceptionStatus.RESOLVED_RESUMED,
        resolvedById: agentId,
        resolvedAt: new Date(),
        repairedBy: dto.repairedBy,
        repairDescription: dto.repairDescription,
        resolutionNotes: dto.repairReference || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.tripExceptions.id, exceptionId));

    // Resume trip: phase back to IN_TRANSIT
    await this.db
      .update(schema.trips)
      .set({ phase: TripPhase.IN_TRANSIT, updatedAt: new Date() })
      .where(eq(schema.trips.id, exception.tripId));

    // Vehicle back to IN_TRANSIT
    await this.db
      .update(schema.vehicles)
      .set({ status: VehicleStatus.IN_TRANSIT, currentCenterId: null, updatedAt: new Date() })
      .where(and(eq(schema.vehicles.id, exception.vehicleId), eq(schema.vehicles.accountId, accountId)));

    await this.createExceptionEvent(exceptionId, 'REPAIR_COMPLETE', agentId, accountId, {
      repairedBy: dto.repairedBy,
      repairDescription: dto.repairDescription,
      repairReference: dto.repairReference,
    });

    // Trip event: TRIP_RESUMED
    const trip = await this.getTripOrThrow(exception.tripId, accountId);
    await this.db.insert(schema.tripEvents).values({
      tripId: exception.tripId,
      centerId: trip.originCenterId,
      agentId,
      eventType: TripEventType.TRIP_RESUMED,
      timestamp: new Date(),
      metadata: { exceptionId, repairedBy: dto.repairedBy },
      accountId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.getExceptionOrThrow(exceptionId, accountId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // TRANSFER FLOW
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Dispatch a rescue vehicle for goods transfer.
   */
  async dispatchRescueVehicle(
    exceptionId: number,
    dto: DispatchRescueVehicleDto,
    accountId: number,
    agentId: number,
  ): Promise<TripException> {
    const exception = await this.getExceptionOrThrow(exceptionId, accountId);
    this.ensureExceptionActive(exception);

    // Validate rescue vehicle exists, belongs to account, and is AVAILABLE
    const [rescueVehicle] = await this.db
      .select()
      .from(schema.vehicles)
      .where(and(eq(schema.vehicles.id, dto.rescueVehicleId), eq(schema.vehicles.accountId, accountId)))
      .limit(1);

    if (!rescueVehicle) {
      throw new NotFoundException(`Rescue vehicle ${dto.rescueVehicleId} not found`);
    }
    if (rescueVehicle.status !== VehicleStatus.AVAILABLE) {
      throw new BadRequestException(`Rescue vehicle ${rescueVehicle.plate} is not available (status: ${rescueVehicle.status})`);
    }

    await this.db
      .update(schema.tripExceptions)
      .set({
        status: ExceptionStatus.IN_PROGRESS,
        rescueVehicleId: dto.rescueVehicleId,
        transferLocation: dto.transferLocation,
        updatedAt: new Date(),
      })
      .where(eq(schema.tripExceptions.id, exceptionId));

    // Update trip phase
    await this.db
      .update(schema.trips)
      .set({ phase: TripPhase.TRANSFER_IN_PROGRESS, updatedAt: new Date() })
      .where(eq(schema.trips.id, exception.tripId));

    await this.createExceptionEvent(exceptionId, 'RESCUE_VEHICLE_DISPATCHED', agentId, accountId, {
      rescueVehicleId: dto.rescueVehicleId,
      rescueVehiclePlate: rescueVehicle.plate,
      transferLocation: dto.transferLocation,
      estimatedArrival: dto.estimatedArrival,
      notes: dto.notes,
    });

    return this.getExceptionOrThrow(exceptionId, accountId);
  }

  /**
   * Confirm goods transfer at the breakdown/accident site.
   * Seals the original trip, creates a rescue trip, links them.
   */
  async confirmTransfer(
    exceptionId: number,
    dto: ConfirmTransferDto,
    accountId: number,
    agentId: number,
  ): Promise<{ exception: TripException; rescueTrip: any }> {
    const exception = await this.getExceptionOrThrow(exceptionId, accountId);

    if (exception.status !== ExceptionStatus.IN_PROGRESS) {
      throw new BadRequestException(`Transfer can only be confirmed when exception is IN_PROGRESS`);
    }
    if (!exception.rescueVehicleId) {
      throw new BadRequestException('No rescue vehicle has been dispatched for this exception');
    }

    const trip = await this.getTripOrThrow(exception.tripId, accountId);

    // Create rescue trip
    const [rescueTrip] = await this.db
      .insert(schema.trips)
      .values({
        vehicleId: exception.rescueVehicleId,
        originCenterId: trip.originCenterId,
        destinationCenterId: trip.destinationCenterId,
        purpose: trip.purpose,
        status: TripStatus.ONGOING,
        phase: TripPhase.IN_TRANSIT,
        startedAt: new Date(),
        isRescueTrip: true,
        originalTripId: trip.id,
        accountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Seal original trip
    await this.db
      .update(schema.trips)
      .set({
        status: TripStatus.COMPLETED,
        phase: TripPhase.CLOSED_TRANSFERRED,
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.trips.id, trip.id));

    // Update exception
    await this.db
      .update(schema.tripExceptions)
      .set({
        status: ExceptionStatus.CLOSED_TRANSFERRED,
        rescueTripId: rescueTrip.id,
        cargoCountTransferred: dto.cargoCountTransferred,
        cargoCondition: dto.cargoCondition,
        resolvedById: agentId,
        resolvedAt: new Date(),
        resolutionNotes: dto.notes || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.tripExceptions.id, exceptionId));

    // Update original vehicle to AVAILABLE (broken-down vehicle)
    await this.db
      .update(schema.vehicles)
      .set({ status: VehicleStatus.AVAILABLE, updatedAt: new Date() })
      .where(and(eq(schema.vehicles.id, trip.vehicleId), eq(schema.vehicles.accountId, accountId)));

    // Update rescue vehicle to IN_TRANSIT
    await this.db
      .update(schema.vehicles)
      .set({ status: VehicleStatus.IN_TRANSIT, currentCenterId: null, updatedAt: new Date() })
      .where(and(eq(schema.vehicles.id, exception.rescueVehicleId), eq(schema.vehicles.accountId, accountId)));

    // Exception events
    await this.createExceptionEvent(exceptionId, 'TRANSFER_CONFIRMED', agentId, accountId, {
      cargoCountTransferred: dto.cargoCountTransferred,
      cargoCondition: dto.cargoCondition,
      notes: dto.notes,
    });
    await this.createExceptionEvent(exceptionId, 'ORIGINAL_TRIP_CLOSED', agentId, accountId, {
      originalTripId: trip.id,
    });
    await this.createExceptionEvent(exceptionId, 'RESCUE_TRIP_CREATED', agentId, accountId, {
      rescueTripId: rescueTrip.id,
      rescueVehicleId: exception.rescueVehicleId,
    });

    // Trip events on original trip
    await this.db.insert(schema.tripEvents).values({
      tripId: trip.id,
      centerId: trip.originCenterId,
      agentId,
      eventType: TripEventType.TRIP_CLOSED_EXCEPTION,
      timestamp: new Date(),
      metadata: { exceptionId, rescueTripId: rescueTrip.id, reason: 'TRANSFER' },
      accountId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { exception: await this.getExceptionOrThrow(exceptionId, accountId), rescueTrip };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RETURN TO ORIGIN
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Return goods to origin. Closes the trip as CLOSED_RETURNED.
   */
  async returnToOrigin(
    exceptionId: number,
    dto: ReturnToOriginDto,
    accountId: number,
    agentId: number,
  ): Promise<TripException> {
    const exception = await this.getExceptionOrThrow(exceptionId, accountId);
    this.ensureExceptionActive(exception);

    const trip = await this.getTripOrThrow(exception.tripId, accountId);

    // Close exception
    await this.db
      .update(schema.tripExceptions)
      .set({
        status: ExceptionStatus.CLOSED_RETURNED,
        resolvedById: agentId,
        resolvedAt: new Date(),
        resolutionNotes: dto.reason,
        updatedAt: new Date(),
      })
      .where(eq(schema.tripExceptions.id, exceptionId));

    // Close trip
    await this.db
      .update(schema.trips)
      .set({
        status: TripStatus.COMPLETED,
        phase: TripPhase.CLOSED_RETURNED,
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.trips.id, trip.id));

    await this.createExceptionEvent(exceptionId, 'RETURN_INITIATED', agentId, accountId, {
      reason: dto.reason,
      originCenterId: trip.originCenterId,
    });

    await this.db.insert(schema.tripEvents).values({
      tripId: trip.id,
      centerId: trip.originCenterId,
      agentId,
      eventType: TripEventType.TRIP_CLOSED_EXCEPTION,
      timestamp: new Date(),
      metadata: { exceptionId, reason: 'RETURNED_TO_ORIGIN' },
      accountId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.getExceptionOrThrow(exceptionId, accountId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // OVERDUE ACTIONS
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Log a driver contact attempt on an overdue exception.
   */
  async logCallAttempt(
    exceptionId: number,
    dto: LogCallAttemptDto,
    accountId: number,
    agentId: number,
  ): Promise<TripException> {
    const exception = await this.getExceptionOrThrow(exceptionId, accountId);
    this.ensureExceptionActive(exception);

    // Increment contact attempts
    await this.db
      .update(schema.tripExceptions)
      .set({
        contactAttempts: (exception.contactAttempts || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.tripExceptions.id, exceptionId));

    await this.createExceptionEvent(exceptionId, 'CALL_ATTEMPTED', agentId, accountId, {
      outcome: dto.outcome,
      notes: dto.notes,
      attemptNumber: (exception.contactAttempts || 0) + 1,
    });

    return this.getExceptionOrThrow(exceptionId, accountId);
  }

  /**
   * Escalate an overdue trip to no-show status.
   */
  async escalate(
    exceptionId: number,
    dto: EscalateExceptionDto,
    accountId: number,
    agentId: number,
  ): Promise<TripException> {
    const exception = await this.getExceptionOrThrow(exceptionId, accountId);
    this.ensureExceptionActive(exception);

    await this.db
      .update(schema.tripExceptions)
      .set({
        status: ExceptionStatus.ESCALATED,
        escalationReason: dto.reason,
        escalationActions: dto.actionsTaken || [],
        contactAttempts: dto.contactAttemptsMade,
        policeReportReference: dto.policeReportReference || exception.policeReportReference,
        resolvedById: agentId,
        resolvedAt: new Date(),
        resolutionNotes: dto.notes,
        updatedAt: new Date(),
      })
      .where(eq(schema.tripExceptions.id, exceptionId));

    // Update trip phase
    await this.db
      .update(schema.trips)
      .set({
        phase: TripPhase.NO_SHOW_ESCALATED,
        status: TripStatus.COMPLETED,
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.trips.id, exception.tripId));

    await this.createExceptionEvent(exceptionId, 'ESCALATED', agentId, accountId, {
      reason: dto.reason,
      contactAttemptsMade: dto.contactAttemptsMade,
      actionsTaken: dto.actionsTaken,
      policeReportReference: dto.policeReportReference,
      notes: dto.notes,
    });

    await this.db.insert(schema.tripEvents).values({
      tripId: exception.tripId,
      centerId: (await this.getTripOrThrow(exception.tripId, accountId)).originCenterId,
      agentId,
      eventType: TripEventType.TRIP_CLOSED_EXCEPTION,
      timestamp: new Date(),
      metadata: { exceptionId, reason: 'NO_SHOW_ESCALATED' },
      accountId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.getExceptionOrThrow(exceptionId, accountId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // NOTES
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Add a free-text note to the exception timeline (no status change).
   */
  async addNote(
    exceptionId: number,
    dto: AddExceptionNoteDto,
    accountId: number,
    agentId: number,
  ): Promise<ExceptionEvent> {
    await this.getExceptionOrThrow(exceptionId, accountId);
    return this.createExceptionEvent(exceptionId, 'NOTE_ADDED', agentId, accountId, {
      note: dto.note,
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // QUERIES
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Get a single exception by ID with optional vehicle, trip, events, and photos.
   */
  async findExceptionById(
    id: number,
    accountId: number,
    includeRelations = true,
  ): Promise<any> {
    const [exception] = await this.db
      .select()
      .from(schema.tripExceptions)
      .where(and(eq(schema.tripExceptions.id, id), eq(schema.tripExceptions.accountId, accountId)))
      .limit(1);

    if (!exception) return null;

    if (!includeRelations) return exception;

    // Load related data
    const [vehicle] = await this.db.select().from(schema.vehicles).where(eq(schema.vehicles.id, exception.vehicleId)).limit(1);
    const [trip] = await this.db.select().from(schema.trips).where(eq(schema.trips.id, exception.tripId)).limit(1);
    const [reporter] = await this.db.select().from(schema.users).where(eq(schema.users.id, exception.reportedById)).limit(1);
    const events = await this.db
      .select()
      .from(schema.exceptionEvents)
      .where(eq(schema.exceptionEvents.exceptionId, id))
      .orderBy(asc(schema.exceptionEvents.timestamp));
    const photos = await this.db
      .select()
      .from(schema.exceptionPhotos)
      .where(eq(schema.exceptionPhotos.exceptionId, id));

    // Load origin and destination center names
    let originCenter = null;
    let destinationCenter = null;
    if (trip) {
      [originCenter] = await this.db.select().from(schema.centers).where(eq(schema.centers.id, trip.originCenterId)).limit(1);
      if (trip.destinationCenterId) {
        [destinationCenter] = await this.db.select().from(schema.centers).where(eq(schema.centers.id, trip.destinationCenterId)).limit(1);
      }
    }

    return {
      ...exception,
      vehicle: vehicle || null,
      trip: trip ? { ...trip, originCenter, destinationCenter } : null,
      reportedBy: reporter || null,
      events,
      photos,
    };
  }

  /**
   * List exceptions with filtering and pagination.
   * Powers the Incidents & Exceptions Log page.
   */
  async findAllExceptions(
    filterDto: FilterExceptionsDto,
    accountId: number,
  ): Promise<any> {
    const page = filterDto.page || 1;
    const limit = filterDto.limit || 20;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [eq(schema.tripExceptions.accountId, accountId)];

    if (filterDto.type) conditions.push(eq(schema.tripExceptions.type, filterDto.type));
    if (filterDto.status) conditions.push(eq(schema.tripExceptions.status, filterDto.status));
    if (filterDto.tripId) conditions.push(eq(schema.tripExceptions.tripId, filterDto.tripId));
    if (filterDto.vehicleId) conditions.push(eq(schema.tripExceptions.vehicleId, filterDto.vehicleId));

    if (filterDto.search) {
      conditions.push(
        or(
          sql`${schema.tripExceptions.location}::text ILIKE ${'%' + filterDto.search + '%'}`,
          sql`${schema.tripExceptions.description}::text ILIKE ${'%' + filterDto.search + '%'}`,
        ) as SQL,
      );
    }

    const orderBy = filterDto.sortOrder === 'asc'
      ? asc(schema.tripExceptions.reportedAt)
      : desc(schema.tripExceptions.reportedAt);

    const totalResult = await this.db
      .select({ count: count() })
      .from(schema.tripExceptions)
      .where(and(...conditions));
    const total = Number(totalResult[0]?.count || 0);

    const exceptions = await this.db
      .select()
      .from(schema.tripExceptions)
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Load vehicle plates for the list
    for (const ex of exceptions) {
      const [vehicle] = await this.db.select().from(schema.vehicles).where(eq(schema.vehicles.id, ex.vehicleId)).limit(1);
      (ex as any).vehicle = vehicle ? { id: vehicle.id, plate: vehicle.plate } : null;

      const [trip] = await this.db.select().from(schema.trips).where(eq(schema.trips.id, ex.tripId)).limit(1);
      if (trip) {
        const [origin] = await this.db.select().from(schema.centers).where(eq(schema.centers.id, trip.originCenterId)).limit(1);
        const dest = trip.destinationCenterId
          ? (await this.db.select().from(schema.centers).where(eq(schema.centers.id, trip.destinationCenterId)).limit(1))[0]
          : null;
        (ex as any).route = {
          origin: origin ? { id: origin.id, name: origin.name } : null,
          destination: dest ? { id: dest.id, name: dest.name } : null,
        };
      }

      const [reporter] = await this.db.select().from(schema.users).where(eq(schema.users.id, ex.reportedById)).limit(1);
      (ex as any).reportedBy = reporter ? { id: reporter.id, username: reporter.username } : null;
    }

    return {
      data: exceptions,
      meta: {
        itemsPerPage: limit,
        totalItems: total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get active exceptions for the dashboard alert banner and Active Exceptions table.
   * Returns exceptions that are ACTIVE or IN_PROGRESS.
   */
  async getActiveExceptions(accountId: number): Promise<any[]> {
    const activeStatuses = [ExceptionStatus.ACTIVE, ExceptionStatus.IN_PROGRESS];

    const exceptions = await this.db
      .select()
      .from(schema.tripExceptions)
      .where(
        and(
          eq(schema.tripExceptions.accountId, accountId),
          inArray(schema.tripExceptions.status, activeStatuses),
        ),
      )
      .orderBy(desc(schema.tripExceptions.reportedAt));

    // Enrich with vehicle plate and route
    for (const ex of exceptions) {
      const [vehicle] = await this.db.select().from(schema.vehicles).where(eq(schema.vehicles.id, ex.vehicleId)).limit(1);
      (ex as any).vehicle = vehicle ? { id: vehicle.id, plate: vehicle.plate } : null;

      const [trip] = await this.db.select().from(schema.trips).where(eq(schema.trips.id, ex.tripId)).limit(1);
      if (trip) {
        const [origin] = await this.db.select().from(schema.centers).where(eq(schema.centers.id, trip.originCenterId)).limit(1);
        const dest = trip.destinationCenterId
          ? (await this.db.select().from(schema.centers).where(eq(schema.centers.id, trip.destinationCenterId)).limit(1))[0]
          : null;
        (ex as any).route = {
          origin: origin ? { id: origin.id, name: origin.name } : null,
          destination: dest ? { id: dest.id, name: dest.name } : null,
        };
      }

      const [reporter] = await this.db.select().from(schema.users).where(eq(schema.users.id, ex.reportedById)).limit(1);
      (ex as any).reportedBy = reporter ? { id: reporter.id, username: reporter.username } : null;
    }

    return exceptions;
  }

  /**
   * Dashboard KPI counts for the Incidents page summary cards.
   */
  async getExceptionSummary(accountId: number): Promise<{
    activeBreakdowns: number;
    activeAccidents: number;
    activeTransfers: number;
    resolvedToday: number;
    activeOverdue: number;
    totalActive: number;
  }> {
    const activeStatuses = [ExceptionStatus.ACTIVE, ExceptionStatus.IN_PROGRESS];
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(todayStart);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const [breakdowns, accidents, transfers, overdue, resolvedToday, totalActive] = await Promise.all([
      this.db.select({ count: count() }).from(schema.tripExceptions).where(and(
        eq(schema.tripExceptions.accountId, accountId),
        eq(schema.tripExceptions.type, ExceptionType.BREAKDOWN),
        inArray(schema.tripExceptions.status, activeStatuses),
      )),
      this.db.select({ count: count() }).from(schema.tripExceptions).where(and(
        eq(schema.tripExceptions.accountId, accountId),
        eq(schema.tripExceptions.type, ExceptionType.ACCIDENT),
        inArray(schema.tripExceptions.status, activeStatuses),
      )),
      this.db.select({ count: count() }).from(schema.tripExceptions).where(and(
        eq(schema.tripExceptions.accountId, accountId),
        inArray(schema.tripExceptions.status, activeStatuses),
        sql`${schema.tripExceptions.rescueVehicleId} IS NOT NULL`,
      )),
      this.db.select({ count: count() }).from(schema.tripExceptions).where(and(
        eq(schema.tripExceptions.accountId, accountId),
        eq(schema.tripExceptions.type, ExceptionType.OVERDUE),
        inArray(schema.tripExceptions.status, activeStatuses),
      )),
      this.db.select({ count: count() }).from(schema.tripExceptions).where(and(
        eq(schema.tripExceptions.accountId, accountId),
        inArray(schema.tripExceptions.status, [
          ExceptionStatus.RESOLVED_RESUMED,
          ExceptionStatus.CLOSED_TRANSFERRED,
          ExceptionStatus.CLOSED_RETURNED,
          ExceptionStatus.CANCELLED,
        ]),
        gte(schema.tripExceptions.resolvedAt, todayStart),
        lt(schema.tripExceptions.resolvedAt, tomorrow),
      )),
      this.db.select({ count: count() }).from(schema.tripExceptions).where(and(
        eq(schema.tripExceptions.accountId, accountId),
        inArray(schema.tripExceptions.status, activeStatuses),
      )),
    ]);

    return {
      activeBreakdowns: Number(breakdowns[0]?.count || 0),
      activeAccidents: Number(accidents[0]?.count || 0),
      activeTransfers: Number(transfers[0]?.count || 0),
      activeOverdue: Number(overdue[0]?.count || 0),
      resolvedToday: Number(resolvedToday[0]?.count || 0),
      totalActive: Number(totalActive[0]?.count || 0),
    };
  }

  /**
   * Get exception timeline events for a specific exception.
   */
  async getExceptionTimeline(exceptionId: number, accountId: number): Promise<ExceptionEvent[]> {
    await this.getExceptionOrThrow(exceptionId, accountId);
    return this.db
      .select()
      .from(schema.exceptionEvents)
      .where(eq(schema.exceptionEvents.exceptionId, exceptionId))
      .orderBy(asc(schema.exceptionEvents.timestamp));
  }

  /**
   * Get all exceptions for a specific trip (for trip detail page side panel).
   */
  async getExceptionsByTrip(tripId: number, accountId: number): Promise<TripException[]> {
    return this.db
      .select()
      .from(schema.tripExceptions)
      .where(and(eq(schema.tripExceptions.tripId, tripId), eq(schema.tripExceptions.accountId, accountId)))
      .orderBy(desc(schema.tripExceptions.reportedAt));
  }

  // ────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────────────────────────

  private async getTripOrThrow(tripId: number, accountId: number) {
    const [trip] = await this.db
      .select()
      .from(schema.trips)
      .where(and(eq(schema.trips.id, tripId), eq(schema.trips.accountId, accountId)))
      .limit(1);
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);
    return trip;
  }

  private async getExceptionOrThrow(exceptionId: number, accountId: number): Promise<TripException> {
    const [exception] = await this.db
      .select()
      .from(schema.tripExceptions)
      .where(and(eq(schema.tripExceptions.id, exceptionId), eq(schema.tripExceptions.accountId, accountId)))
      .limit(1);
    if (!exception) throw new NotFoundException(`Exception ${exceptionId} not found`);
    return exception;
  }

  private ensureExceptionActive(exception: TripException): void {
    const activeStatuses = [ExceptionStatus.ACTIVE, ExceptionStatus.IN_PROGRESS];
    if (!activeStatuses.includes(exception.status as ExceptionStatus)) {
      throw new BadRequestException(`Exception is not active. Current status: ${exception.status}`);
    }
  }

  private async createExceptionEvent(
    exceptionId: number,
    eventType: string,
    actorId: number,
    accountId: number,
    metadata?: any,
  ): Promise<ExceptionEvent> {
    const [event] = await this.db
      .insert(schema.exceptionEvents)
      .values({
        exceptionId,
        eventType,
        actorId,
        timestamp: new Date(),
        metadata: metadata || {},
        accountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return event;
  }

  /**
   * Generate auto-increment incident reference: INC-YYYYMMDD-seq
   */
  private async generateIncidentReference(accountId: number): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `INC-${dateStr}-`;

    // Count how many incident references exist today for this account
    const existing = await this.db
      .select({ count: count() })
      .from(schema.tripExceptions)
      .where(
        and(
          eq(schema.tripExceptions.accountId, accountId),
          sql`${schema.tripExceptions.incidentReference} LIKE ${prefix + '%'}`,
        ),
      );

    const seq = Number(existing[0]?.count || 0) + 1;
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }
}
