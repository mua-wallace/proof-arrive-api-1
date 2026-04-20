import {
  Injectable,
  Inject,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { eq, and, SQL, sql, gte, lte, lt, count, desc, asc, inArray } from 'drizzle-orm';
import * as schema from '@modules/schemas';
import { ReportQueryDto } from './dto/report-query.dto';
import { VehicleStatus } from '@common/enums/vehicle-status.enum';
import { TripStatus } from '@common/enums/trip-status.enum';
import { TripPurpose } from '@common/enums/trip-purpose.enum';
import { QueueType } from '@common/enums/queue-type.enum';
import { ExceptionStatus } from '@common/enums/exception-status.enum';
import { ExceptionType } from '@common/enums/exception-type.enum';
import { TripEventType } from '@common/enums/trip-event-type.enum';

const ARRIVAL_EVENT_TYPES = [TripEventType.ARRIVED, TripEventType.ARRIVED_DESTINATION];
const PROCESSING_EVENT_TYPES = [
  TripEventType.QUEUED,
  TripEventType.SERVICE_STARTED,
  TripEventType.LOADING_ENDED,
  TripEventType.UNLOADING_ENDED,
];

type DrizzleDatabase = ReturnType<typeof import('drizzle-orm/postgres-js').drizzle>;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDatabase,
  ) {}

  /**
   * Get today's date range (start of day to start of next day)
   */
  private getTodayDateRange(): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  /**
   * Resolve trip report date range from query.
   * - If startDate/endDate are provided, use them.
   * - If neither is provided, default to "today" (current day) so trip reports are scoped to today by default.
   */
  private getTripReportDateRange(query: ReportQueryDto): { startDate?: Date; endDate?: Date } {
    const hasStart = !!query.startDate;
    const hasEnd = !!query.endDate;

    if (hasStart || hasEnd) {
      return {
        startDate: hasStart ? new Date(query.startDate as string) : undefined,
        endDate: hasEnd ? new Date(query.endDate as string) : undefined,
      };
    }

    const { start, end } = this.getTodayDateRange();
    return { startDate: start, endDate: end };
  }

  /**
   * Get dashboard summary with key metrics (trips, vehicles by status, queues, centers)
   * Scoped by accountId. Optional date range applies to trip counts.
   */
  async getDashboardSummary(query: ReportQueryDto = {}, accountId: number) {
    try {
      const tripConditions = this.buildTripDateConditions(query, accountId);
      const { start: todayStart, end: todayEnd } = this.getTodayDateRange();

      // --- Vehicles (current state, always account-scoped) ---
      const totalVehicles = await this.db
        .select({ count: count() })
        .from(schema.vehicles)
        .where(eq(schema.vehicles.accountId, accountId));

      const vehiclesByStatus = await this.db
        .select({ status: schema.vehicles.status, count: count() })
        .from(schema.vehicles)
        .where(eq(schema.vehicles.accountId, accountId))
        .groupBy(schema.vehicles.status);

      const statusCounts: Record<string, number> = {};
      Object.values(VehicleStatus).forEach((s) => (statusCounts[s] = 0));
      vehiclesByStatus.forEach((row) => {
        statusCounts[row.status || ''] = Number(row.count);
      });

      const vehiclesInGarage = await this.db
        .select({ count: count() })
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.accountId, accountId),
            eq(schema.vehicles.status, VehicleStatus.IN_GARAGE),
          ),
        );

      const vehiclesAtCenter = await this.db
        .select({ count: count() })
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.accountId, accountId),
            sql`${schema.vehicles.currentCenterId} IS NOT NULL`,
          ),
        );

      const vehiclesInTransit = await this.db
        .select({ count: count() })
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.accountId, accountId),
            eq(schema.vehicles.status, VehicleStatus.IN_TRANSIT),
          ),
        );

      // --- Trips ---
      const ongoingTrips = await this.db
        .select({ count: count() })
        .from(schema.trips)
        .where(
          and(
            eq(schema.trips.accountId, accountId),
            eq(schema.trips.status, TripStatus.ONGOING),
          ),
        );

      const pendingTrips = await this.db
        .select({ count: count() })
        .from(schema.trips)
        .where(
          and(
            eq(schema.trips.accountId, accountId),
            eq(schema.trips.status, TripStatus.ONGOING),
            lt(schema.trips.createdAt, todayStart),
          ),
        );

      const completedTripsInPeriod = await this.db
        .select({ count: count() })
        .from(schema.trips)
        .where(and(...tripConditions.completed));

      const totalTripsInPeriod = await this.db
        .select({ count: count() })
        .from(schema.trips)
        .where(and(...tripConditions.started));

      const tripsByPurpose = await this.db
        .select({ purpose: schema.trips.purpose, count: count() })
        .from(schema.trips)
        .where(and(...tripConditions.started))
        .groupBy(schema.trips.purpose);

      const tripsByPhase = await this.db
        .select({ phase: schema.trips.phase, count: count() })
        .from(schema.trips)
        .where(
          and(
            eq(schema.trips.accountId, accountId),
            eq(schema.trips.status, TripStatus.ONGOING),
          ),
        )
        .groupBy(schema.trips.phase);

      // --- Queues (today's active entries) ---
      const loadingQueueCount = await this.db
        .select({ count: count() })
        .from(schema.centerQueues)
        .where(
          and(
            eq(schema.centerQueues.accountId, accountId),
            eq(schema.centerQueues.queueType, QueueType.LOADING),
            eq(schema.centerQueues.isActive, true),
            gte(schema.centerQueues.queueDate, todayStart),
            lt(schema.centerQueues.queueDate, todayEnd),
          ),
        );

      const unloadingQueueCount = await this.db
        .select({ count: count() })
        .from(schema.centerQueues)
        .where(
          and(
            eq(schema.centerQueues.accountId, accountId),
            eq(schema.centerQueues.queueType, QueueType.UNLOADING),
            eq(schema.centerQueues.isActive, true),
            gte(schema.centerQueues.queueDate, todayStart),
            lt(schema.centerQueues.queueDate, todayEnd),
          ),
        );

      // --- Centers ---
      const totalCenters = await this.db
        .select({ count: count() })
        .from(schema.centers)
        .where(eq(schema.centers.accountId, accountId));

      // --- Exceptions ---
      const activeExceptionStatuses = [ExceptionStatus.ACTIVE, ExceptionStatus.IN_PROGRESS];
      const activeExceptions = await this.db
        .select({ count: count() })
        .from(schema.tripExceptions)
        .where(
          and(
            eq(schema.tripExceptions.accountId, accountId),
            inArray(schema.tripExceptions.status, activeExceptionStatuses),
          ),
        );

      const exceptionsByType = await this.db
        .select({ type: schema.tripExceptions.type, count: count() })
        .from(schema.tripExceptions)
        .where(
          and(
            eq(schema.tripExceptions.accountId, accountId),
            inArray(schema.tripExceptions.status, activeExceptionStatuses),
          ),
        )
        .groupBy(schema.tripExceptions.type);

      const resolvedExceptionsToday = await this.db
        .select({ count: count() })
        .from(schema.tripExceptions)
        .where(
          and(
            eq(schema.tripExceptions.accountId, accountId),
            gte(schema.tripExceptions.resolvedAt, todayStart),
            lt(schema.tripExceptions.resolvedAt, todayEnd),
          ),
        );

      return {
        vehicles: {
          total: Number(totalVehicles[0]?.count || 0),
          byStatus: statusCounts,
          inGarage: Number(vehiclesInGarage[0]?.count || 0),
          atCenter: Number(vehiclesAtCenter[0]?.count || 0),
          inTransit: Number(vehiclesInTransit[0]?.count || 0),
        },
        trips: {
          ongoing: Number(ongoingTrips[0]?.count || 0),
          pending: Number(pendingTrips[0]?.count || 0),
          completedInPeriod: Number(completedTripsInPeriod[0]?.count || 0),
          totalStartedInPeriod: Number(totalTripsInPeriod[0]?.count || 0),
          byPurpose: tripsByPurpose.map((r) => ({ purpose: r.purpose, count: Number(r.count) })),
          ongoingByPhase: tripsByPhase.map((r) => ({ phase: r.phase, count: Number(r.count) })),
        },
        queues: {
          loadingActiveToday: Number(loadingQueueCount[0]?.count || 0),
          unloadingActiveToday: Number(unloadingQueueCount[0]?.count || 0),
        },
        centers: {
          total: Number(totalCenters[0]?.count || 0),
        },
        exceptions: {
          totalActive: Number(activeExceptions[0]?.count || 0),
          byType: exceptionsByType.map((r) => ({ type: r.type, count: Number(r.count) })),
          resolvedToday: Number(resolvedExceptionsToday[0]?.count || 0),
        },
      };
    } catch (error: any) {
      this.logger.error(`Error generating dashboard summary: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate dashboard summary');
    }
  }

  /**
   * Build date conditions for trips (startedAt / endedAt) and account
   */
  private buildTripDateConditions(query: ReportQueryDto, accountId: number): { started: SQL[]; completed: SQL[] } {
    const started: SQL[] = [eq(schema.trips.accountId, accountId)];
    const completed: SQL[] = [eq(schema.trips.accountId, accountId), eq(schema.trips.status, TripStatus.COMPLETED)];

    const { startDate, endDate } = this.getTripReportDateRange(query);
    if (startDate) {
      started.push(gte(schema.trips.startedAt, startDate));
      completed.push(gte(schema.trips.endedAt, startDate));
    }
    if (endDate) {
      started.push(lte(schema.trips.startedAt, endDate));
      completed.push(lte(schema.trips.endedAt, endDate));
    }
    if (query.centerId) {
      started.push(
        sql`(${schema.trips.originCenterId} = ${query.centerId} OR ${schema.trips.destinationCenterId} = ${query.centerId})`,
      );
      completed.push(
        sql`(${schema.trips.originCenterId} = ${query.centerId} OR ${schema.trips.destinationCenterId} = ${query.centerId})`,
      );
    }
    if (query.vehicleId) {
      started.push(eq(schema.trips.vehicleId, query.vehicleId));
      completed.push(eq(schema.trips.vehicleId, query.vehicleId));
    }
    return { started, completed };
  }

  /**
   * Get arrival analytics (backed by trip_events where eventType in ARRIVED/ARRIVED_DESTINATION)
   */
  async getArrivalAnalytics(query: ReportQueryDto = {}, accountId: number) {
    try {
      const conditions = this.buildTripEventConditions(query, accountId, ARRIVAL_EVENT_TYPES);

      const arrivalsByCenter = await this.db
        .select({
          centerId: schema.tripEvents.centerId,
          count: count(),
        })
        .from(schema.tripEvents)
        .where(and(...conditions))
        .groupBy(schema.tripEvents.centerId);

      const centerIds = arrivalsByCenter.map((item) => item.centerId);
      const centers = centerIds.length > 0
        ? await this.db
            .select()
            .from(schema.centers)
            .where(inArray(schema.centers.id, centerIds))
        : [];

      const centerMap = new Map(centers.map((c) => [c.id, c]));

      const dateGrouping = this.getDateGrouping(query.groupBy || 'day');
      const arrivalsByDate = await this.db
        .select({
          date: sql<string>`DATE_TRUNC(${sql.raw(`'${dateGrouping}'`)}, ${schema.tripEvents.timestamp})`,
          count: count(),
        })
        .from(schema.tripEvents)
        .where(and(...conditions))
        .groupBy(sql`DATE_TRUNC(${sql.raw(`'${dateGrouping}'`)}, ${schema.tripEvents.timestamp})`)
        .orderBy(asc(sql`DATE_TRUNC(${sql.raw(`'${dateGrouping}'`)}, ${schema.tripEvents.timestamp})`));

      // Top vehicles (joins trip_events to trips to resolve vehicleId)
      const arrivalsByVehicle = await this.db
        .select({
          vehicleId: schema.trips.vehicleId,
          count: count(),
        })
        .from(schema.tripEvents)
        .innerJoin(schema.trips, eq(schema.tripEvents.tripId, schema.trips.id))
        .where(and(...conditions))
        .groupBy(schema.trips.vehicleId)
        .orderBy(desc(count()))
        .limit(10);

      const vehicleIds = arrivalsByVehicle.map((item) => item.vehicleId);
      const vehicles = vehicleIds.length > 0
        ? await this.db
            .select()
            .from(schema.vehicles)
            .where(inArray(schema.vehicles.id, vehicleIds))
        : [];

      const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

      return {
        byCenter: arrivalsByCenter.map((item) => ({
          centerId: item.centerId,
          center: centerMap.get(item.centerId) || null,
          count: Number(item.count),
        })),
        byDate: arrivalsByDate.map((item) => ({
          date: item.date,
          count: Number(item.count),
        })),
        topVehicles: arrivalsByVehicle.map((item) => ({
          vehicleId: item.vehicleId,
          vehicle: vehicleMap.get(item.vehicleId) || null,
          count: Number(item.count),
        })),
      };
    } catch (error: any) {
      this.logger.error(`Error generating arrival analytics: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate arrival analytics');
    }
  }

  /**
   * Get exit analytics (backed by trip_events where eventType = EXITED).
   * "byType" is now broken down by the trip's purpose rather than a legacy exitType field.
   */
  async getExitAnalytics(query: ReportQueryDto = {}, accountId: number) {
    try {
      const conditions = this.buildTripEventConditions(query, accountId, [TripEventType.EXITED]);

      const exitsByCenter = await this.db
        .select({
          centerId: schema.tripEvents.centerId,
          count: count(),
        })
        .from(schema.tripEvents)
        .where(and(...conditions))
        .groupBy(schema.tripEvents.centerId);

      const centerIds = exitsByCenter.map((item) => item.centerId);
      const centers = centerIds.length > 0
        ? await this.db
            .select()
            .from(schema.centers)
            .where(inArray(schema.centers.id, centerIds))
        : [];

      const centerMap = new Map(centers.map((c) => [c.id, c]));

      const dateGrouping = this.getDateGrouping(query.groupBy || 'day');
      const exitsByDate = await this.db
        .select({
          date: sql<string>`DATE_TRUNC(${sql.raw(`'${dateGrouping}'`)}, ${schema.tripEvents.timestamp})`,
          count: count(),
        })
        .from(schema.tripEvents)
        .where(and(...conditions))
        .groupBy(sql`DATE_TRUNC(${sql.raw(`'${dateGrouping}'`)}, ${schema.tripEvents.timestamp})`)
        .orderBy(asc(sql`DATE_TRUNC(${sql.raw(`'${dateGrouping}'`)}, ${schema.tripEvents.timestamp})`));

      const exitsByPurpose = await this.db
        .select({
          purpose: schema.trips.purpose,
          count: count(),
        })
        .from(schema.tripEvents)
        .innerJoin(schema.trips, eq(schema.tripEvents.tripId, schema.trips.id))
        .where(and(...conditions))
        .groupBy(schema.trips.purpose);

      return {
        byCenter: exitsByCenter.map((item) => ({
          centerId: item.centerId,
          center: centerMap.get(item.centerId) || null,
          count: Number(item.count),
        })),
        byDate: exitsByDate.map((item) => ({
          date: item.date,
          count: Number(item.count),
        })),
        byType: exitsByPurpose.map((item) => ({
          exitType: item.purpose,
          count: Number(item.count),
        })),
      };
    } catch (error: any) {
      this.logger.error(`Error generating exit analytics: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate exit analytics');
    }
  }

  /**
   * Get processing stage analytics (backed by trip_events for QUEUED/SERVICE_STARTED/LOADING_ENDED/UNLOADING_ENDED).
   */
  async getProcessingStageAnalytics(query: ReportQueryDto = {}, accountId: number) {
    try {
      const conditions = this.buildTripEventConditions(query, accountId, PROCESSING_EVENT_TYPES);

      const stagesByType = await this.db
        .select({
          stageType: schema.tripEvents.eventType,
          count: count(),
        })
        .from(schema.tripEvents)
        .where(and(...conditions))
        .groupBy(schema.tripEvents.eventType);

      const averageTimes = await this.computeStageAverages(accountId, query);

      return {
        byType: stagesByType.map((item) => ({
          stageType: item.stageType,
          count: Number(item.count),
        })),
        byStatus: [],
        averageTimes,
      };
    } catch (error: any) {
      this.logger.error(`Error generating processing stage analytics: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate processing stage analytics');
    }
  }

  /**
   * Per-trip average duration (in minutes) between service start and end events.
   * Keys: LOADING (SERVICE_STARTED -> LOADING_ENDED), UNLOADING (SERVICE_STARTED -> UNLOADING_ENDED).
   */
  private async computeStageAverages(accountId: number, query: ReportQueryDto) {
    const baseConds: SQL[] = [eq(schema.tripEvents.accountId, accountId)];
    if (query.startDate) baseConds.push(gte(schema.tripEvents.timestamp, new Date(query.startDate)));
    if (query.endDate) baseConds.push(lte(schema.tripEvents.timestamp, new Date(query.endDate)));
    if (query.centerId) baseConds.push(eq(schema.tripEvents.centerId, query.centerId));
    if (query.agentId) baseConds.push(eq(schema.tripEvents.agentId, Number(query.agentId)));

    const rows = await this.db
      .select({
        tripId: schema.tripEvents.tripId,
        eventType: schema.tripEvents.eventType,
        timestamp: schema.tripEvents.timestamp,
      })
      .from(schema.tripEvents)
      .where(
        and(
          ...baseConds,
          inArray(schema.tripEvents.eventType, [
            TripEventType.SERVICE_STARTED,
            TripEventType.LOADING_ENDED,
            TripEventType.UNLOADING_ENDED,
          ]),
        ),
      );

    const byTrip = new Map<number, { start?: Date; loadingEnd?: Date; unloadingEnd?: Date }>();
    rows.forEach((r) => {
      const entry = byTrip.get(r.tripId) || {};
      if (r.eventType === TripEventType.SERVICE_STARTED && !entry.start) entry.start = r.timestamp;
      if (r.eventType === TripEventType.LOADING_ENDED) entry.loadingEnd = r.timestamp;
      if (r.eventType === TripEventType.UNLOADING_ENDED) entry.unloadingEnd = r.timestamp;
      byTrip.set(r.tripId, entry);
    });

    const loadingDurations: number[] = [];
    const unloadingDurations: number[] = [];
    byTrip.forEach((e) => {
      if (e.start && e.loadingEnd) loadingDurations.push(e.loadingEnd.getTime() - e.start.getTime());
      if (e.start && e.unloadingEnd) unloadingDurations.push(e.unloadingEnd.getTime() - e.start.getTime());
    });

    if (loadingDurations.length === 0 && unloadingDurations.length === 0) return null;

    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length / 1000 / 60;
    const result: Record<string, number> = {};
    if (loadingDurations.length > 0) result[TripEventType.LOADING_ENDED] = avg(loadingDurations);
    if (unloadingDurations.length > 0) result[TripEventType.UNLOADING_ENDED] = avg(unloadingDurations);
    return result;
  }

  /**
   * Get center performance metrics (trips as origin/destination, vehicles at center, queue counts)
   */
  async getCenterPerformance(query: ReportQueryDto = {}, accountId: number) {
    try {
      const { start: todayStart, end: todayEnd } = this.getTodayDateRange();

      let centers: any[] = [];
      if (query.centerId) {
        const center = await this.db
          .select()
          .from(schema.centers)
          .where(
            and(
              eq(schema.centers.id, query.centerId),
              eq(schema.centers.accountId, accountId),
            ),
          )
          .limit(1);
        centers = center;
      } else {
        centers = await this.db
          .select()
          .from(schema.centers)
          .where(eq(schema.centers.accountId, accountId));
      }

      const performanceMetrics = await Promise.all(
        centers.map(async (center) => {
          const centerId = center.id;
          const tripsAsOrigin = await this.db
            .select({ count: count() })
            .from(schema.trips)
            .where(
              and(
                eq(schema.trips.accountId, accountId),
                eq(schema.trips.originCenterId, centerId),
              ),
            );
          const tripsAsDestination = await this.db
            .select({ count: count() })
            .from(schema.trips)
            .where(
              and(
                eq(schema.trips.accountId, accountId),
                eq(schema.trips.destinationCenterId, centerId),
              ),
            );
          const completedTripsAtCenter = await this.db
            .select({ count: count() })
            .from(schema.trips)
            .where(
              and(
                eq(schema.trips.accountId, accountId),
                eq(schema.trips.status, TripStatus.COMPLETED),
                eq(schema.trips.destinationCenterId, centerId),
              ),
            );
          const vehiclesAtCenter = await this.db
            .select({ count: count() })
            .from(schema.vehicles)
            .where(
              and(
                eq(schema.vehicles.accountId, accountId),
                eq(schema.vehicles.currentCenterId, centerId),
              ),
            );
          const loadingQueueNow = await this.db
            .select({ count: count() })
            .from(schema.centerQueues)
            .where(
              and(
                eq(schema.centerQueues.accountId, accountId),
                eq(schema.centerQueues.centerId, centerId),
                eq(schema.centerQueues.queueType, QueueType.LOADING),
                eq(schema.centerQueues.isActive, true),
                gte(schema.centerQueues.queueDate, todayStart),
                lt(schema.centerQueues.queueDate, todayEnd),
              ),
            );
          const unloadingQueueNow = await this.db
            .select({ count: count() })
            .from(schema.centerQueues)
            .where(
              and(
                eq(schema.centerQueues.accountId, accountId),
                eq(schema.centerQueues.centerId, centerId),
                eq(schema.centerQueues.queueType, QueueType.UNLOADING),
                eq(schema.centerQueues.isActive, true),
                gte(schema.centerQueues.queueDate, todayStart),
                lt(schema.centerQueues.queueDate, todayEnd),
              ),
            );

          return {
            center,
            metrics: {
              tripsAsOrigin: Number(tripsAsOrigin[0]?.count || 0),
              tripsAsDestination: Number(tripsAsDestination[0]?.count || 0),
              completedTripsAtDestination: Number(completedTripsAtCenter[0]?.count || 0),
              vehiclesAtCenter: Number(vehiclesAtCenter[0]?.count || 0),
              loadingQueueActive: Number(loadingQueueNow[0]?.count || 0),
              unloadingQueueActive: Number(unloadingQueueNow[0]?.count || 0),
            },
          };
        }),
      );

      return performanceMetrics;
    } catch (error: any) {
      this.logger.error(`Error generating center performance: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate center performance metrics');
    }
  }

  /**
   * Get vehicle activity report (trip-based, filtered by account)
   */
  async getVehicleActivity(query: ReportQueryDto = {}, accountId: number) {
    try {
      let vehicles: any[] = [];
      if (query.vehicleId) {
        const vehicle = await this.db
          .select()
          .from(schema.vehicles)
          .where(
            and(
              eq(schema.vehicles.id, query.vehicleId),
              eq(schema.vehicles.accountId, accountId),
            ),
          )
          .limit(1);
        vehicles = vehicle;
      } else {
        vehicles = await this.db
          .select()
          .from(schema.vehicles)
          .where(eq(schema.vehicles.accountId, accountId));
      }

      const vehicleActivity = await Promise.all(
        vehicles.map(async (vehicle) => {
          const totalTrips = await this.db
            .select({ count: count() })
            .from(schema.trips)
            .where(
              and(
                eq(schema.trips.accountId, accountId),
                eq(schema.trips.vehicleId, vehicle.id),
              ),
            );
          const completedCond: SQL[] = [
            eq(schema.trips.accountId, accountId),
            eq(schema.trips.vehicleId, vehicle.id),
            eq(schema.trips.status, TripStatus.COMPLETED),
          ];
          if (query.startDate) completedCond.push(gte(schema.trips.endedAt, new Date(query.startDate)));
          if (query.endDate) completedCond.push(lte(schema.trips.endedAt, new Date(query.endDate)));
          const completedInPeriod = await this.db
            .select({ count: count() })
            .from(schema.trips)
            .where(and(...completedCond));
          const ongoing = await this.db
            .select({ count: count() })
            .from(schema.trips)
            .where(
              and(
                eq(schema.trips.accountId, accountId),
                eq(schema.trips.vehicleId, vehicle.id),
                eq(schema.trips.status, TripStatus.ONGOING),
              ),
            );

          return {
            vehicle,
            activity: {
              totalTrips: Number(totalTrips[0]?.count || 0),
              completedTripsInPeriod: Number(completedInPeriod[0]?.count || 0),
              ongoingTrips: Number(ongoing[0]?.count || 0),
            },
          };
        }),
      );

      return vehicleActivity;
    } catch (error: any) {
      this.logger.error(`Error generating vehicle activity: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate vehicle activity report');
    }
  }

  /**
   * Get agent activity report (from trip_events, filtered by account)
   */
  async getAgentActivity(query: ReportQueryDto = {}, accountId: number) {
    try {
      const eventConditions: SQL[] = [eq(schema.tripEvents.accountId, accountId)];
      if (query.startDate) {
        eventConditions.push(gte(schema.tripEvents.timestamp, new Date(query.startDate)));
      }
      if (query.endDate) {
        eventConditions.push(lte(schema.tripEvents.timestamp, new Date(query.endDate)));
      }
      if (query.agentId) {
        eventConditions.push(eq(schema.tripEvents.agentId, query.agentId));
      }

      const eventsByAgent = await this.db
        .select({
          agentId: schema.tripEvents.agentId,
          count: count(),
        })
        .from(schema.tripEvents)
        .where(and(...eventConditions))
        .groupBy(schema.tripEvents.agentId)
        .orderBy(desc(count()));

      const eventsByType = await this.db
        .select({
          agentId: schema.tripEvents.agentId,
          eventType: schema.tripEvents.eventType,
          count: count(),
        })
        .from(schema.tripEvents)
        .where(and(...eventConditions))
        .groupBy(schema.tripEvents.agentId, schema.tripEvents.eventType);

      const agentIds = eventsByAgent.map((r) => r.agentId);
      const users = agentIds.length > 0
        ? await this.db
            .select()
            .from(schema.users)
            .where(inArray(schema.users.id, agentIds))
        : [];
      const userMap = new Map(users.map((u) => [u.id, u]));

      const typeMap = new Map<number, Record<string, number>>();
      eventsByType.forEach((r) => {
        const existing = typeMap.get(r.agentId) || {};
        existing[r.eventType] = Number(r.count);
        typeMap.set(r.agentId, existing);
      });

      return eventsByAgent.map((row) => ({
        agentId: row.agentId,
        user: userMap.get(row.agentId) || null,
        activity: {
          totalEvents: Number(row.count),
          byEventType: typeMap.get(row.agentId) || {},
        },
      }));
    } catch (error: any) {
      this.logger.error(`Error generating agent activity: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate agent activity report');
    }
  }

  // ========== Trips stats (dashboard) ==========

  /**
   * Trip stats summary: counts by status, purpose, phase; ongoing/completed in period.
   * Optional: startDate, endDate, centerId, vehicleId.
   */
  async getTripsStatsSummary(query: ReportQueryDto = {}, accountId: number) {
    try {
      const tripConditions = this.buildTripDateConditions(query, accountId);

      const { start: todayStart } = this.getTodayDateRange();

      const [ongoing, pending, completedInPeriod, totalStartedInPeriod, byStatus, byPurpose, ongoingByPhase] = await Promise.all([
        this.db.select({ count: count() }).from(schema.trips).where(and(eq(schema.trips.accountId, accountId), eq(schema.trips.status, TripStatus.ONGOING))),
        this.db.select({ count: count() }).from(schema.trips).where(and(eq(schema.trips.accountId, accountId), eq(schema.trips.status, TripStatus.ONGOING), lt(schema.trips.createdAt, todayStart))),
        this.db.select({ count: count() }).from(schema.trips).where(and(...tripConditions.completed)),
        this.db.select({ count: count() }).from(schema.trips).where(and(...tripConditions.started)),
        this.db.select({ status: schema.trips.status, count: count() }).from(schema.trips).where(and(...tripConditions.started)).groupBy(schema.trips.status),
        this.db.select({ purpose: schema.trips.purpose, count: count() }).from(schema.trips).where(and(...tripConditions.started)).groupBy(schema.trips.purpose),
        this.db.select({ phase: schema.trips.phase, count: count() }).from(schema.trips).where(and(eq(schema.trips.accountId, accountId), eq(schema.trips.status, TripStatus.ONGOING))).groupBy(schema.trips.phase),
      ]);

      const startedCount = Number(totalStartedInPeriod[0]?.count || 0);
      const completedCount = Number(completedInPeriod[0]?.count || 0);

      return {
        ongoing: Number(ongoing[0]?.count || 0),
        pending: Number(pending[0]?.count || 0),
        completedInPeriod: completedCount,
        totalStartedInPeriod: startedCount,
        completionRatePercent: startedCount > 0 ? Number(((completedCount / startedCount) * 100).toFixed(2)) : null,
        byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
        byPurpose: byPurpose.map((r) => ({ purpose: r.purpose, count: Number(r.count) })),
        ongoingByPhase: ongoingByPhase.map((r) => ({ phase: r.phase, count: Number(r.count) })),
      };
    } catch (error: any) {
      this.logger.error(`Error generating trips stats summary: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate trips stats summary');
    }
  }

  /**
   * Trip counts over time (grouped by day/week/month). For charts.
   */
  async getTripsStatsByDate(query: ReportQueryDto = {}, accountId: number) {
    try {
      const baseStarted: SQL[] = [eq(schema.trips.accountId, accountId)];
      const baseCompleted: SQL[] = [eq(schema.trips.accountId, accountId), eq(schema.trips.status, TripStatus.COMPLETED)];

      const { startDate, endDate } = this.getTripReportDateRange(query);
      if (startDate) {
        baseStarted.push(gte(schema.trips.startedAt, startDate));
        baseCompleted.push(gte(schema.trips.endedAt, startDate));
      }
      if (endDate) {
        baseStarted.push(lte(schema.trips.startedAt, endDate));
        baseCompleted.push(lte(schema.trips.endedAt, endDate));
      }
      if (query.centerId) {
        baseStarted.push(sql`(${schema.trips.originCenterId} = ${query.centerId} OR ${schema.trips.destinationCenterId} = ${query.centerId})`);
        baseCompleted.push(sql`(${schema.trips.originCenterId} = ${query.centerId} OR ${schema.trips.destinationCenterId} = ${query.centerId})`);
      }
      if (query.vehicleId) {
        baseStarted.push(eq(schema.trips.vehicleId, query.vehicleId));
        baseCompleted.push(eq(schema.trips.vehicleId, query.vehicleId));
      }

      const groupBy = this.getDateGrouping(query.groupBy || 'day');

      const startedByDate = await this.db
        .select({
          date: sql<string>`DATE_TRUNC(${sql.raw(`'${groupBy}'`)}, ${schema.trips.startedAt})`,
          count: count(),
        })
        .from(schema.trips)
        .where(and(...baseStarted))
        .groupBy(sql`DATE_TRUNC(${sql.raw(`'${groupBy}'`)}, ${schema.trips.startedAt})`)
        .orderBy(asc(sql`DATE_TRUNC(${sql.raw(`'${groupBy}'`)}, ${schema.trips.startedAt})`));

      const completedByDate = await this.db
        .select({
          date: sql<string>`DATE_TRUNC(${sql.raw(`'${groupBy}'`)}, ${schema.trips.endedAt})`,
          count: count(),
        })
        .from(schema.trips)
        .where(and(...baseCompleted))
        .groupBy(sql`DATE_TRUNC(${sql.raw(`'${groupBy}'`)}, ${schema.trips.endedAt})`)
        .orderBy(asc(sql`DATE_TRUNC(${sql.raw(`'${groupBy}'`)}, ${schema.trips.endedAt})`));

      const dateMap = new Map<string, { started: number; completed: number }>();
      startedByDate.forEach((r) => dateMap.set(String(r.date), { started: Number(r.count), completed: 0 }));
      completedByDate.forEach((r) => {
        const cur = dateMap.get(String(r.date)) || { started: 0, completed: 0 };
        dateMap.set(String(r.date), { ...cur, completed: Number(r.count) });
      });
      const byDate = Array.from(dateMap.entries()).map(([date, v]) => ({ date, ...v })).sort((a, b) => (a.date < b.date ? -1 : 1));

      return { byDate };
    } catch (error: any) {
      this.logger.error(`Error generating trips stats by date: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate trips stats by date');
    }
  }

  /**
   * Trips by center: as origin, as destination, completed at destination. Optional date range.
   */
  async getTripsStatsByCenter(query: ReportQueryDto = {}, accountId: number) {
    try {
      const tripConditions = this.buildTripDateConditions(query, accountId);

      const centers = query.centerId
        ? await this.db.select().from(schema.centers).where(and(eq(schema.centers.id, query.centerId), eq(schema.centers.accountId, accountId)))
        : await this.db.select().from(schema.centers).where(eq(schema.centers.accountId, accountId));

      const byCenter = await Promise.all(
        centers.map(async (center) => {
          const [asOrigin, asDestination, completedAtDestination] = await Promise.all([
            this.db.select({ count: count() }).from(schema.trips).where(and(...tripConditions.started, eq(schema.trips.originCenterId, center.id))),
            this.db.select({ count: count() }).from(schema.trips).where(and(...tripConditions.started, eq(schema.trips.destinationCenterId, center.id))),
            this.db.select({ count: count() }).from(schema.trips).where(and(...tripConditions.completed, eq(schema.trips.destinationCenterId, center.id))),
          ]);
          return {
            centerId: center.id,
            center: { id: center.id, name: center.name, fullname: center.fullname },
            asOrigin: Number(asOrigin[0]?.count || 0),
            asDestination: Number(asDestination[0]?.count || 0),
            completedAtDestination: Number(completedAtDestination[0]?.count || 0),
          };
        }),
      );

      return { byCenter };
    } catch (error: any) {
      this.logger.error(`Error generating trips stats by center: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate trips stats by center');
    }
  }

  /**
   * Origin–destination matrix: trip counts by (originCenterId, destinationCenterId). For route volume charts.
   */
  async getTripsStatsByOriginDestination(query: ReportQueryDto = {}, accountId: number) {
    try {
      const tripConditions = this.buildTripDateConditions(query, accountId);

      const rows = await this.db
        .select({
          originCenterId: schema.trips.originCenterId,
          destinationCenterId: schema.trips.destinationCenterId,
          count: count(),
        })
        .from(schema.trips)
        .where(and(...tripConditions.started))
        .groupBy(schema.trips.originCenterId, schema.trips.destinationCenterId)
        .orderBy(desc(count()));

      const centerIds = [...new Set(rows.flatMap((r) => [r.originCenterId, r.destinationCenterId]).filter(Boolean))] as number[];
      const centers = centerIds.length > 0
        ? await this.db.select().from(schema.centers).where(inArray(schema.centers.id, centerIds))
        : [];
      const centerMap = new Map(centers.map((c) => [c.id, c]));

      return {
        rows: rows.map((r) => ({
          originCenterId: r.originCenterId,
          destinationCenterId: r.destinationCenterId,
          originCenter: centerMap.get(r.originCenterId) || null,
          destinationCenter: r.destinationCenterId != null ? (centerMap.get(r.destinationCenterId) || null) : null,
          count: Number(r.count),
        })),
      };
    } catch (error: any) {
      this.logger.error(`Error generating trips stats by origin-destination: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate trips stats by origin-destination');
    }
  }

  /**
   * Completion rate in period: completed / started (percentage) and raw counts.
   */
  async getTripsCompletionRate(query: ReportQueryDto = {}, accountId: number) {
    try {
      const tripConditions = this.buildTripDateConditions(query, accountId);
      const [started, completed] = await Promise.all([
        this.db.select({ count: count() }).from(schema.trips).where(and(...tripConditions.started)),
        this.db.select({ count: count() }).from(schema.trips).where(and(...tripConditions.completed)),
      ]);
      const startedCount = Number(started[0]?.count || 0);
      const completedCount = Number(completed[0]?.count || 0);
      return {
        startedInPeriod: startedCount,
        completedInPeriod: completedCount,
        completionRatePercent: startedCount > 0 ? Number(((completedCount / startedCount) * 100).toFixed(2)) : null,
      };
    } catch (error: any) {
      this.logger.error(`Error generating trips completion rate: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate trips completion rate');
    }
  }

  // ========== Center queue stats (dashboard) ==========

  /**
   * Queue stats summary: global loading/unloading active counts; per-center breakdown. Optional date (default today).
   */
  async getQueueStatsSummary(query: ReportQueryDto = {}, accountId: number) {
    try {
      const today = this.getTodayDateRange();
      const rangeStart = query.startDate ? new Date(query.startDate) : today.start;
      const rangeEnd = query.endDate ? new Date(query.endDate) : today.end;

      const baseQueueConditions: SQL[] = [
        eq(schema.centerQueues.accountId, accountId),
        eq(schema.centerQueues.isActive, true),
        gte(schema.centerQueues.queueDate, rangeStart),
        lt(schema.centerQueues.queueDate, rangeEnd),
      ];
      if (query.centerId) baseQueueConditions.push(eq(schema.centerQueues.centerId, query.centerId));

      const [loadingTotal, unloadingTotal, byCenterRows] = await Promise.all([
        this.db.select({ count: count() }).from(schema.centerQueues).where(and(...baseQueueConditions, eq(schema.centerQueues.queueType, QueueType.LOADING))),
        this.db.select({ count: count() }).from(schema.centerQueues).where(and(...baseQueueConditions, eq(schema.centerQueues.queueType, QueueType.UNLOADING))),
        this.db
          .select({
            centerId: schema.centerQueues.centerId,
            queueType: schema.centerQueues.queueType,
            count: count(),
          })
          .from(schema.centerQueues)
          .where(and(...baseQueueConditions))
          .groupBy(schema.centerQueues.centerId, schema.centerQueues.queueType),
      ]);

      const centerIds = [...new Set(byCenterRows.map((r) => r.centerId))];
      const centers = centerIds.length > 0
        ? await this.db.select().from(schema.centers).where(inArray(schema.centers.id, centerIds))
        : [];
      const centerMap = new Map(centers.map((c) => [c.id, c]));

      const byCenterMap = new Map<number, { loadingActive: number; unloadingActive: number }>();
      byCenterRows.forEach((r) => {
        const cur = byCenterMap.get(r.centerId) || { loadingActive: 0, unloadingActive: 0 };
        if (r.queueType === QueueType.LOADING) cur.loadingActive = Number(r.count);
        else cur.unloadingActive = Number(r.count);
        byCenterMap.set(r.centerId, cur);
      });

      return {
        loadingActive: Number(loadingTotal[0]?.count || 0),
        unloadingActive: Number(unloadingTotal[0]?.count || 0),
        dateFrom: rangeStart,
        dateTo: rangeEnd,
        byCenter: centerIds.map((cid) => ({
          centerId: cid,
          center: centerMap.get(cid) || null,
          loadingActive: byCenterMap.get(cid)?.loadingActive ?? 0,
          unloadingActive: byCenterMap.get(cid)?.unloadingActive ?? 0,
        })),
      };
    } catch (error: any) {
      this.logger.error(`Error generating queue stats summary: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate queue stats summary');
    }
  }

  /**
   * Queue stats per center: loading/unloading total and active. Optional date range (default today).
   */
  async getQueueStatsByCenter(query: ReportQueryDto = {}, accountId: number) {
    try {
      const today = this.getTodayDateRange();
      const rangeStart = query.startDate ? new Date(query.startDate) : today.start;
      const rangeEnd = query.endDate ? new Date(query.endDate) : today.end;

      const centers = query.centerId
        ? await this.db.select().from(schema.centers).where(and(eq(schema.centers.id, query.centerId), eq(schema.centers.accountId, accountId)))
        : await this.db.select().from(schema.centers).where(eq(schema.centers.accountId, accountId));

      const baseCond: SQL[] = [
        eq(schema.centerQueues.accountId, accountId),
        gte(schema.centerQueues.queueDate, rangeStart),
        lt(schema.centerQueues.queueDate, rangeEnd),
      ];

      const result = await Promise.all(
        centers.map(async (center) => {
          const [loadingTotal, loadingActive, unloadingTotal, unloadingActive] = await Promise.all([
            this.db.select({ count: count() }).from(schema.centerQueues).where(and(...baseCond, eq(schema.centerQueues.centerId, center.id), eq(schema.centerQueues.queueType, QueueType.LOADING))),
            this.db.select({ count: count() }).from(schema.centerQueues).where(and(...baseCond, eq(schema.centerQueues.centerId, center.id), eq(schema.centerQueues.queueType, QueueType.LOADING), eq(schema.centerQueues.isActive, true))),
            this.db.select({ count: count() }).from(schema.centerQueues).where(and(...baseCond, eq(schema.centerQueues.centerId, center.id), eq(schema.centerQueues.queueType, QueueType.UNLOADING))),
            this.db.select({ count: count() }).from(schema.centerQueues).where(and(...baseCond, eq(schema.centerQueues.centerId, center.id), eq(schema.centerQueues.queueType, QueueType.UNLOADING), eq(schema.centerQueues.isActive, true))),
          ]);
          return {
            centerId: center.id,
            center: { id: center.id, name: center.name, fullname: center.fullname },
            loading: { total: Number(loadingTotal[0]?.count || 0), active: Number(loadingActive[0]?.count || 0) },
            unloading: { total: Number(unloadingTotal[0]?.count || 0), active: Number(unloadingActive[0]?.count || 0) },
          };
        }),
      );

      return { byCenter: result, dateFrom: rangeStart, dateTo: rangeEnd };
    } catch (error: any) {
      this.logger.error(`Error generating queue stats by center: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate queue stats by center');
    }
  }

  /**
   * Queue activity over time (by day). For charts. Optional centerId. Default last 7 days.
   */
  async getQueueStatsByDate(query: ReportQueryDto = {}, accountId: number) {
    try {
      const rangeStart = query.startDate ? new Date(query.startDate) : (() => { const d = new Date(); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d; })();
      const rangeEnd = query.endDate ? new Date(query.endDate) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d; })();

      const baseCond: SQL[] = [
        eq(schema.centerQueues.accountId, accountId),
        eq(schema.centerQueues.isActive, true),
        gte(schema.centerQueues.queueDate, rangeStart),
        lt(schema.centerQueues.queueDate, rangeEnd),
      ];
      if (query.centerId) baseCond.push(eq(schema.centerQueues.centerId, query.centerId));

      const loadingByDate = await this.db
        .select({
          date: sql<string>`DATE(${schema.centerQueues.queueDate})`,
          count: count(),
        })
        .from(schema.centerQueues)
        .where(and(...baseCond, eq(schema.centerQueues.queueType, QueueType.LOADING)))
        .groupBy(sql`DATE(${schema.centerQueues.queueDate})`)
        .orderBy(asc(sql`DATE(${schema.centerQueues.queueDate})`));

      const unloadingByDate = await this.db
        .select({
          date: sql<string>`DATE(${schema.centerQueues.queueDate})`,
          count: count(),
        })
        .from(schema.centerQueues)
        .where(and(...baseCond, eq(schema.centerQueues.queueType, QueueType.UNLOADING)))
        .groupBy(sql`DATE(${schema.centerQueues.queueDate})`)
        .orderBy(asc(sql`DATE(${schema.centerQueues.queueDate})`));

      const dateSet = new Set<string>([
        ...loadingByDate.map((r) => String(r.date)),
        ...unloadingByDate.map((r) => String(r.date)),
      ]);
      const dates = Array.from(dateSet).sort();
      const loadingMap = new Map(loadingByDate.map((r) => [String(r.date), Number(r.count)]));
      const unloadingMap = new Map(unloadingByDate.map((r) => [String(r.date), Number(r.count)]));

      return {
        byDate: dates.map((date) => ({
          date,
          loadingActive: loadingMap.get(date) ?? 0,
          unloadingActive: unloadingMap.get(date) ?? 0,
        })),
        dateFrom: rangeStart,
        dateTo: rangeEnd,
      };
    } catch (error: any) {
      this.logger.error(`Error generating queue stats by date: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate queue stats by date');
    }
  }

  /**
   * Build filter conditions for trip_events queries. Always includes accountId
   * and restricts to the provided event types. Supports startDate/endDate, centerId,
   * and agentId. vehicleId is resolved via tripId joins, so it must be applied separately.
   */
  private buildTripEventConditions(
    query: ReportQueryDto,
    accountId: number,
    eventTypes: TripEventType[],
  ): SQL[] {
    const conditions: SQL[] = [
      eq(schema.tripEvents.accountId, accountId),
      inArray(schema.tripEvents.eventType, eventTypes),
    ];

    if (query.startDate) conditions.push(gte(schema.tripEvents.timestamp, new Date(query.startDate)));
    if (query.endDate) conditions.push(lte(schema.tripEvents.timestamp, new Date(query.endDate)));
    if (query.centerId) conditions.push(eq(schema.tripEvents.centerId, query.centerId));
    if (query.agentId) conditions.push(eq(schema.tripEvents.agentId, Number(query.agentId)));

    return conditions;
  }

  /**
   * Get date grouping SQL function name
   */
  private getDateGrouping(groupBy: 'day' | 'week' | 'month'): string {
    switch (groupBy) {
      case 'week':
        return 'week';
      case 'month':
        return 'month';
      default:
        return 'day';
    }
  }

}
