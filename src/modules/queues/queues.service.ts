import { Injectable, Inject, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { BaseService } from '@common/services/base.service';
import { eq, and, SQL, asc, sql, gt, max, count, gte, lt } from 'drizzle-orm';
import * as schema from '@modules/schemas';
import { AddToQueueDto } from './dto/add-to-queue.dto';
import { StartNextServiceDto } from './dto/start-next-service.dto';
import { QueueType } from '@common/enums/queue-type.enum';
import { TripEventType } from '@common/enums/trip-event-type.enum';

// CenterQueue uses serial ID (number) but BaseEntity expects string
// Create types: one for actual DB type, one for BaseService compatibility
type CenterQueue = typeof schema.centerQueues.$inferSelect & { deletedAt?: null };
type CenterQueueEntity = Omit<CenterQueue, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> & {
  id: string; // BaseEntity requires string
  createdAt: Date; // BaseEntity requires non-null Date
  updatedAt: Date; // BaseEntity requires non-null Date
  deletedAt: Date | null; // BaseEntity requires Date | null
};

@Injectable()
export class QueuesService extends BaseService<CenterQueueEntity> {
  private readonly logger = new Logger(QueuesService.name);
  private readonly dbConnection: any;

  constructor(
    @Inject(DATABASE_CONNECTION)
    db: any,
  ) {
    super(db, schema.centerQueues as any);
    this.dbConnection = db;
  }

  /**
   * Get today's date in YYYY-MM-DD format (for daily queue reset)
   */
  private getTodayDate(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day
    return today;
  }

  /**
   * Get start and end of today for date filtering
   */
  private getTodayDateRange(): { start: Date; end: Date } {
    const start = this.getTodayDate();
    const end = new Date(start);
    end.setDate(end.getDate() + 1); // Start of next day
    return { start, end };
  }

  /**
   * Add a vehicle to a center queue
   * Position is automatically calculated from today's active queue entries
   * Positions reset daily (start from 1 each day)
   */
  async addToQueue(
    centerId: number,
    data: AddToQueueDto,
    accountId: number,
    agentId: number
  ): Promise<CenterQueue> {
    // Look up center by id (geozoneId) or geozoneId since API might send either
    // center_queues.centerId references centers.id (which equals geozoneId)
    let [center] = await this.dbConnection
      .select()
      .from(schema.centers)
      .where(
        and(
          eq(schema.centers.id, centerId),
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
            eq(schema.centers.geozoneId, centerId),
            eq(schema.centers.accountId, accountId)
          )
        )
        .limit(1);
    }

    if (!center) {
      throw new NotFoundException(`Center ${centerId} not found for this account (tried both id and geozoneId)`);
    }

    // Use center.id (which equals geozoneId) for the foreign key
    const actualCenterId = center.id;

    // Verify trip exists and belongs to account
    const trip = await this.dbConnection
      .select()
      .from(schema.trips)
      .where(
        and(
          eq(schema.trips.id, data.tripId),
          eq(schema.trips.accountId, accountId)
        )
      )
      .limit(1);

    if (trip.length === 0) {
      throw new NotFoundException(`Trip ${data.tripId} not found`);
    }

    // Verify vehicle exists and get its id (which equals thirdPartyId)
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

    // If not found by id, try thirdPartyId
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
      throw new NotFoundException(`Vehicle ${data.vehicleId} not found for this account`);
    }

    const actualVehicleId = vehicle.id;

    // Check if vehicle is already in queue
    const existingQueue = await this.dbConnection
      .select()
      .from(schema.centerQueues)
      .where(
        and(
          eq(schema.centerQueues.centerId, actualCenterId),
          eq(schema.centerQueues.vehicleId, actualVehicleId),
          eq(schema.centerQueues.queueType, data.queueType),
          eq(schema.centerQueues.isActive, true),
          eq(schema.centerQueues.accountId, accountId)
        )
      )
      .limit(1);

    if (existingQueue.length > 0) {
      throw new BadRequestException(`Vehicle ${data.vehicleId} is already in ${data.queueType} queue at center ${centerId}`);
    }

    // Get today's date range for daily queue reset
    const { start: todayStart, end: todayEnd } = this.getTodayDateRange();

    // Get next position in queue - automatically calculate from count of TODAY'S active queue entries
    // Positions reset daily: each day starts from position 1
    // This ensures positions are always sequential (1, 2, 3...) without gaps, and reset each day
    const positionResult = await this.dbConnection
      .select({ count: count() })
      .from(schema.centerQueues)
      .where(
        and(
          eq(schema.centerQueues.centerId, actualCenterId),
          eq(schema.centerQueues.queueType, data.queueType),
          eq(schema.centerQueues.isActive, true),
          eq(schema.centerQueues.accountId, accountId),
          gte(schema.centerQueues.queueDate, todayStart),
          lt(schema.centerQueues.queueDate, todayEnd)
        )
      );

    // Calculate next position: count of TODAY'S active vehicles + 1
    // If 0 vehicles in queue today, next position is 1
    // If 3 vehicles in queue today (positions 1, 2, 3), next position is 4
    // Tomorrow, positions reset and start from 1 again
    const activeCount = positionResult[0]?.count || 0;
    const nextPosition = activeCount + 1;

    // Create queue entry with today's date for daily reset
    // Use actualCenterId and actualVehicleId to match schema foreign keys
    const todayDate = this.getTodayDate();
    
    // Log the queue data being inserted
    console.log('📦 Add to Queue Payload:', JSON.stringify({ 
      centerId, 
      actualCenterId, 
      vehicleId: data.vehicleId, 
      actualVehicleId,
      tripId: data.tripId,
      queueType: data.queueType,
      accountId 
    }, null, 2));
    console.log('🔍 Center found:', { id: center.id, thirdPartyId: center.thirdPartyId, geozoneId: center.geozoneId });
    console.log('🔍 Vehicle found:', { id: vehicle.id, thirdPartyId: vehicle.thirdPartyId });
    
    const [queueEntry] = await this.dbConnection
      .insert(schema.centerQueues)
      .values({
        centerId: actualCenterId, // Use center.id (which equals geozoneId) to match schema FK
        vehicleId: actualVehicleId, // Use vehicle.id (which equals thirdPartyId) to match schema FK
        tripId: data.tripId,
        queueType: data.queueType,
        position: nextPosition,
        queuedAt: new Date(),
        queueDate: todayDate, // Set to start of today for daily reset
        isActive: true,
        accountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Create QUEUED trip event
    // trip_events.centerId also references centers.id (which equals geozoneId)
    await this.dbConnection
      .insert(schema.tripEvents)
      .values({
        tripId: data.tripId,
        centerId: actualCenterId, // Use center.id (which equals geozoneId) to match schema FK
        agentId,
        eventType: TripEventType.QUEUED,
        timestamp: new Date(),
        metadata: {
          queue_type: data.queueType,
          queue_position: nextPosition,
        },
        accountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    return queueEntry;
  }

  /**
   * Start service for the next vehicle in queue at a center (center-based API).
   * Only processes today's queue entries (daily reset).
   */
  async startNextService(
    centerId: number,
    data: StartNextServiceDto,
    accountId: number,
    agentId: number
  ): Promise<{ queue: CenterQueue; tripEvent: any }> {
    const { start: todayStart, end: todayEnd } = this.getTodayDateRange();

    let [center] = await this.dbConnection
      .select()
      .from(schema.centers)
      .where(and(eq(schema.centers.id, centerId), eq(schema.centers.accountId, accountId)))
      .limit(1);
    if (!center) {
      [center] = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(and(eq(schema.centers.geozoneId, centerId), eq(schema.centers.accountId, accountId)))
        .limit(1);
    }
    if (!center) {
      throw new NotFoundException(`Center ${centerId} not found for this account (tried both id and geozoneId)`);
    }
    const actualCenterId = center.id;

    const [queueEntry] = await this.dbConnection
      .select()
      .from(schema.centerQueues)
      .where(
        and(
          eq(schema.centerQueues.centerId, actualCenterId),
          eq(schema.centerQueues.queueType, data.queueType),
          eq(schema.centerQueues.isActive, true),
          eq(schema.centerQueues.accountId, accountId),
          gte(schema.centerQueues.queueDate, todayStart),
          lt(schema.centerQueues.queueDate, todayEnd)
        )
      )
      .orderBy(asc(schema.centerQueues.position))
      .limit(1);

    if (!queueEntry) {
      const centerName = center.name || `center ${centerId}`;
      throw new NotFoundException(
        `No vehicles in ${data.queueType} queue at ${centerName} (ID: ${center.id}). ` +
        `Please add vehicles to the queue first using POST /api/v1/centers/${centerId}/queue`
      );
    }

    return this.executeStartService(queueEntry, data.queueType, agentId, accountId);
  }

  /**
   * Start service for a specific vehicle (vehicle-based API).
   * Finds the vehicle in the queue by vehicleId (any position); if found, updates serviceStartedAt
   * and creates SERVICE_STARTED event. Use when the agent scans a vehicle and clicks "Start processing".
   */
  async startServiceByVehicleId(
    vehicleId: number,
    data: StartNextServiceDto,
    accountId: number,
    agentId: number
  ): Promise<{ queue: CenterQueue; tripEvent: any }> {
    const { start: todayStart, end: todayEnd } = this.getTodayDateRange();

    let [vehicle] = await this.dbConnection
      .select()
      .from(schema.vehicles)
      .where(and(eq(schema.vehicles.id, vehicleId), eq(schema.vehicles.accountId, accountId)))
      .limit(1);
    if (!vehicle) {
      [vehicle] = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(and(eq(schema.vehicles.thirdPartyId, vehicleId), eq(schema.vehicles.accountId, accountId)))
        .limit(1);
    }
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} not found for this account (tried both id and thirdPartyId)`);
    }
    const actualVehicleId = vehicle.id;

    const [queueEntry] = await this.dbConnection
      .select()
      .from(schema.centerQueues)
      .where(
        and(
          eq(schema.centerQueues.vehicleId, actualVehicleId),
          eq(schema.centerQueues.queueType, data.queueType),
          eq(schema.centerQueues.isActive, true),
          eq(schema.centerQueues.accountId, accountId),
          gte(schema.centerQueues.queueDate, todayStart),
          lt(schema.centerQueues.queueDate, todayEnd)
        )
      )
      .limit(1);

    if (!queueEntry) {
      throw new NotFoundException(
        `Vehicle ${vehicleId} is not in the ${data.queueType} queue. ` +
        `Ensure the vehicle has been added to the queue (e.g. after trip creation or arrival at destination).`
      );
    }

    return this.executeStartService(queueEntry, data.queueType, agentId, accountId);
  }

  /**
   * Mark queue entry as service started, create SERVICE_STARTED event, renumber remaining positions.
   */
  private async executeStartService(
    queue: CenterQueue,
    queueType: QueueType,
    agentId: number,
    accountId: number
  ): Promise<{ queue: CenterQueue; tripEvent: any }> {
    const actualCenterId = queue.centerId;
    const { start: todayStart, end: todayEnd } = this.getTodayDateRange();
    const startedAt = new Date();

    await this.dbConnection
      .update(schema.centerQueues)
      .set({
        serviceStartedAt: startedAt,
        isActive: false,
        updatedAt: startedAt,
      })
      .where(eq(schema.centerQueues.id, queue.id));

    const waitMinutes = queue.queuedAt
      ? Math.floor((startedAt.getTime() - new Date(queue.queuedAt).getTime()) / 1000 / 60)
      : null;
    const [tripEvent] = await this.dbConnection
      .insert(schema.tripEvents)
      .values({
        tripId: queue.tripId,
        centerId: actualCenterId,
        agentId,
        eventType: TripEventType.SERVICE_STARTED,
        timestamp: startedAt,
        metadata: { service_type: queueType, queue_wait_time: waitMinutes },
        accountId,
        createdAt: startedAt,
        updatedAt: startedAt,
      })
      .returning();

    const remainingQueues = await this.dbConnection
      .select()
      .from(schema.centerQueues)
      .where(
        and(
          eq(schema.centerQueues.centerId, actualCenterId),
          eq(schema.centerQueues.queueType, queueType),
          eq(schema.centerQueues.isActive, true),
          gt(schema.centerQueues.position, queue.position),
          eq(schema.centerQueues.accountId, accountId),
          gte(schema.centerQueues.queueDate, todayStart),
          lt(schema.centerQueues.queueDate, todayEnd)
        )
      )
      .orderBy(asc(schema.centerQueues.position));

    for (let i = 0; i < remainingQueues.length; i++) {
      await this.dbConnection
        .update(schema.centerQueues)
        .set({ position: i + 1, updatedAt: new Date() })
        .where(eq(schema.centerQueues.id, remainingQueues[i].id));
    }

    return { queue, tripEvent };
  }

  /**
   * Get queue at a center
   * By default, returns today's queue (positions reset daily).
   * Pass include=center,trip to add center and trip (and vehicle) to the response.
   */
  async getQueue(
    centerId: number,
    accountId: number,
    filterDto?: { type?: QueueType; isActive?: boolean; date?: Date; include?: string[] }
  ): Promise<{
    center: Record<string, unknown> | null;
    queue: Array<CenterQueue & { vehicle?: any; trip?: any; waitingTimeMinutes?: number; queueTypeLabel?: string }>;
  }> {
    const include = filterDto?.include ?? [];
    const includeCenter = include.includes('center');
    const includeTrip = include.includes('trip');
    // Look up center by id (thirdPartyId) or geozoneId since API might send either
    let [center] = await this.dbConnection
      .select()
      .from(schema.centers)
      .where(
        and(
          eq(schema.centers.id, centerId),
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
            eq(schema.centers.geozoneId, centerId),
            eq(schema.centers.accountId, accountId)
          )
        )
        .limit(1);
    }

    if (!center) {
      throw new NotFoundException(`Center ${centerId} not found for this account (tried both id and geozoneId)`);
    }

    // Use center.id (which equals geozoneId) for the foreign key
    const actualCenterId = center.id;

    const conditions: SQL[] = [
      eq(schema.centerQueues.centerId, actualCenterId),
      eq(schema.centerQueues.accountId, accountId),
    ];

    // Filter by date (default: today for daily reset)
    if (filterDto?.date) {
      const filterDate = new Date(filterDto.date);
      filterDate.setHours(0, 0, 0, 0);
      const filterDateEnd = new Date(filterDate);
      filterDateEnd.setDate(filterDateEnd.getDate() + 1);
      conditions.push(gte(schema.centerQueues.queueDate, filterDate));
      conditions.push(lt(schema.centerQueues.queueDate, filterDateEnd));
    } else {
      // Default to today's queue (daily reset)
      const { start: todayStart, end: todayEnd } = this.getTodayDateRange();
      conditions.push(gte(schema.centerQueues.queueDate, todayStart));
      conditions.push(lt(schema.centerQueues.queueDate, todayEnd));
    }

    if (filterDto?.type) {
      conditions.push(eq(schema.centerQueues.queueType, filterDto.type));
    }

    if (filterDto?.isActive !== undefined) {
      conditions.push(eq(schema.centerQueues.isActive, filterDto.isActive));
    }

    const queues = await this.dbConnection
      .select()
      .from(schema.centerQueues)
      .where(and(...conditions))
      .orderBy(asc(schema.centerQueues.queueType), asc(schema.centerQueues.position));

    // Load vehicle and trip when include=trip; enhance with queue visibility
    for (const queue of queues) {
      if (includeTrip) {
        const vehicle = await this.dbConnection
          .select()
          .from(schema.vehicles)
          .where(eq(schema.vehicles.id, queue.vehicleId))
          .limit(1);
        (queue as any).vehicle = vehicle[0] || null;

        const trip = await this.dbConnection
          .select()
          .from(schema.trips)
          .where(eq(schema.trips.id, queue.tripId))
          .limit(1);
        (queue as any).trip = trip[0] || null;
      } else {
        (queue as any).vehicle = undefined;
        (queue as any).trip = undefined;
      }

      // Calculate waiting time
      if (queue.queuedAt && !queue.serviceStartedAt) {
        const waitTimeMs = new Date().getTime() - new Date(queue.queuedAt).getTime();
        (queue as any).waitingTimeMinutes = Math.floor(waitTimeMs / 1000 / 60);
      } else if (queue.queuedAt && queue.serviceStartedAt) {
        const waitTimeMs = new Date(queue.serviceStartedAt).getTime() - new Date(queue.queuedAt).getTime();
        (queue as any).waitingTimeMinutes = Math.floor(waitTimeMs / 1000 / 60);
      }

      (queue as any).queueTypeLabel = queue.queueType === QueueType.LOADING ? 'Loading Queue' : 'Unloading Queue';
      const totalInQueue = queues.filter(q => q.queueType === queue.queueType && q.isActive).length;
      (queue as any).positionDisplay = `Position ${queue.position} of ${totalInQueue}`;
    }

    return {
      center: includeCenter ? (center ?? null) : null,
      queue: queues,
    };
  }

  /**
   * Get all vehicles currently in the queue at a center.
   * Use include=center,trip to add center and trip to the response.
   */
  async getVehiclesInQueue(
    centerId: number,
    accountId: number,
    filterDto?: { type?: QueueType; isActive?: boolean; date?: Date; include?: string[] }
  ): Promise<{
    center: Record<string, unknown> | null;
    vehicles: Array<{
      vehicle: any;
      trip?: any;
      queueEntryId: number;
      position: number;
      queueType: QueueType;
      queueTypeLabel: string;
      waitingTimeMinutes?: number;
      tripId: number;
      isActive: boolean;
    }>;
  }> {
    // Always load vehicle (and trip when requested) for this endpoint
    const include = filterDto?.include ?? [];
    const includeTrip = include.includes('trip');
    const getQueueInclude = includeTrip ? include : [...include, 'trip'];
    const { center, queue: queues } = await this.getQueue(centerId, accountId, {
      ...filterDto,
      include: getQueueInclude,
    });

    const vehicles = queues.map((q) => {
      const item: any = {
        vehicle: (q as any).vehicle ?? null,
        queueEntryId: q.id,
        position: q.position,
        queueType: q.queueType as QueueType,
        queueTypeLabel: String((q as any).queueTypeLabel ?? (q.queueType === QueueType.LOADING ? 'Loading Queue' : 'Unloading Queue')),
        waitingTimeMinutes: (q as any).waitingTimeMinutes as number | undefined,
        tripId: q.tripId,
        isActive: q.isActive ?? false,
      };
      if (includeTrip) item.trip = (q as any).trip ?? null;
      return item;
    });

    return {
      center: include.includes('center') ? center : null,
      vehicles,
    };
  }

  /**
   * Get queue summary/statistics for a center
   * Shows queue position and type clearly
   */
  async getQueueSummary(
    centerId: number,
    accountId: number
  ): Promise<{
    centerId: number;
    date: string;
    loadingQueue: { total: number; active: number; positions: Array<{ position: number; vehicleId: number; plate: string }> };
    unloadingQueue: { total: number; active: number; positions: Array<{ position: number; vehicleId: number; plate: string }> };
  }> {
    const { start: todayStart } = this.getTodayDateRange();
    const todayDateStr = todayStart.toISOString().split('T')[0]; // YYYY-MM-DD

    // Get all today's queues (include trip so vehicle is loaded for plate)
    const { queue: allQueues } = await this.getQueue(centerId, accountId, { isActive: true, include: ['trip'] });

    // Separate by queue type
    const loadingQueues = allQueues.filter(q => q.queueType === QueueType.LOADING);
    const unloadingQueues = allQueues.filter(q => q.queueType === QueueType.UNLOADING);

    return {
      centerId,
      date: todayDateStr,
      loadingQueue: {
        total: loadingQueues.length,
        active: loadingQueues.filter(q => q.isActive).length,
        positions: loadingQueues
          .sort((a, b) => a.position - b.position)
          .map(q => ({
            position: q.position,
            vehicleId: q.vehicleId,
            plate: (q as any).vehicle?.plate || 'Unknown',
          })),
      },
      unloadingQueue: {
        total: unloadingQueues.length,
        active: unloadingQueues.filter(q => q.isActive).length,
        positions: unloadingQueues
          .sort((a, b) => a.position - b.position)
          .map(q => ({
            position: q.position,
            vehicleId: q.vehicleId,
            plate: (q as any).vehicle?.plate || 'Unknown',
          })),
      },
    };
  }
}
