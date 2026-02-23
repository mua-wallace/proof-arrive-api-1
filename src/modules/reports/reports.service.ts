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

type DrizzleDatabase = ReturnType<typeof import('drizzle-orm/postgres-js').drizzle>;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDatabase,
  ) {}

  /**
   * Get today's date range (start of day to start of next day) for queue stats
   */
  private getTodayDateRange(): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  /**
   * Get dashboard summary with key metrics (trips, vehicles by status, queues, centers)
   * Scoped by accountId. Optional date range applies to trip counts and legacy arrivals/exits.
   */
  async getDashboardSummary(query: ReportQueryDto = {}, accountId: number) {
    try {
      const tripConditions = this.buildTripDateConditions(query, accountId);
      const conditions = this.buildDateConditions(query, accountId);
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

      // --- Legacy (arrivals/exits in date range) ---
      let totalArrivals = 0;
      let totalExits = 0;
      let arrivalsByStatus: { status: string | null; count: number }[] = [];
      let exitsByType: { exitType: string | null; count: number }[] = [];
      if (conditions.arrivals.length > 0) {
        const arrivalsCount = await this.db
          .select({ count: count() })
          .from(schema.arrivals)
          .where(and(...conditions.arrivals));
        totalArrivals = Number(arrivalsCount[0]?.count || 0);
        const byStatus = await this.db
          .select({ status: schema.arrivals.status, count: count() })
          .from(schema.arrivals)
          .where(and(...conditions.arrivals))
          .groupBy(schema.arrivals.status);
        arrivalsByStatus = byStatus.map((r) => ({ status: r.status, count: Number(r.count) }));
      }
      if (conditions.exits.length > 0) {
        const exitsCount = await this.db
          .select({ count: count() })
          .from(schema.exits)
          .where(and(...conditions.exits));
        totalExits = Number(exitsCount[0]?.count || 0);
        const byType = await this.db
          .select({ exitType: schema.exits.exitType, count: count() })
          .from(schema.exits)
          .where(and(...conditions.exits))
          .groupBy(schema.exits.exitType);
        exitsByType = byType.map((r) => ({ exitType: r.exitType, count: Number(r.count) }));
      }

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
        legacy: {
          totalArrivals,
          totalExits,
          arrivalsByStatus,
          exitsByType,
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
    if (query.startDate) {
      const startDate = new Date(query.startDate);
      started.push(gte(schema.trips.startedAt, startDate));
      completed.push(gte(schema.trips.endedAt, startDate));
    }
    if (query.endDate) {
      const endDate = new Date(query.endDate);
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
   * Get arrival analytics (legacy, filtered by account)
   */
  async getArrivalAnalytics(query: ReportQueryDto = {}, accountId: number) {
    try {
      const conditions = this.buildDateConditions(query, accountId);

      // Arrivals by center
      const arrivalsByCenter = await this.db
        .select({
          centerId: schema.arrivals.centerId,
          count: count(),
        })
        .from(schema.arrivals)
        .where(and(...conditions.arrivals))
        .groupBy(schema.arrivals.centerId);

      // Get center details
      const centerIds = arrivalsByCenter.map((item) => item.centerId);
      const centers = centerIds.length > 0
        ? await this.db
            .select()
            .from(schema.centers)
            .where(inArray(schema.centers.id, centerIds))
        : [];

      const centerMap = new Map(centers.map((c) => [c.id, c]));

      // Arrivals by date (grouped)
      const dateGrouping = this.getDateGrouping(query.groupBy || 'day');
      const arrivalsByDate = await this.db
        .select({
          date: sql<string>`DATE_TRUNC(${sql.raw(`'${dateGrouping}'`)}, ${schema.arrivals.arrivedAt})`,
          count: count(),
        })
        .from(schema.arrivals)
        .where(and(...conditions.arrivals))
        .groupBy(sql`DATE_TRUNC(${sql.raw(`'${dateGrouping}'`)}, ${schema.arrivals.arrivedAt})`)
        .orderBy(asc(sql`DATE_TRUNC(${sql.raw(`'${dateGrouping}'`)}, ${schema.arrivals.arrivedAt})`));

      // Arrivals by vehicle
      const arrivalsByVehicle = await this.db
        .select({
          vehicleId: schema.arrivals.vehicleId,
          count: count(),
        })
        .from(schema.arrivals)
        .where(and(...conditions.arrivals))
        .groupBy(schema.arrivals.vehicleId)
        .orderBy(desc(count()))
        .limit(10);

      // Get vehicle details
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
   * Get exit analytics (legacy, filtered by account)
   */
  async getExitAnalytics(query: ReportQueryDto = {}, accountId: number) {
    try {
      const conditions = this.buildDateConditions(query, accountId);

      // Exits by center
      const exitsByCenter = await this.db
        .select({
          centerId: schema.exits.centerId,
          count: count(),
        })
        .from(schema.exits)
        .where(and(...conditions.exits))
        .groupBy(schema.exits.centerId);

      // Get center details
      const centerIds = exitsByCenter.map((item) => item.centerId);
      const centers = centerIds.length > 0
        ? await this.db
            .select()
            .from(schema.centers)
            .where(inArray(schema.centers.id, centerIds))
        : [];

      const centerMap = new Map(centers.map((c) => [c.id, c]));

      // Exits by date (grouped)
      const dateGrouping = this.getDateGrouping(query.groupBy || 'day');
      const exitsByDate = await this.db
        .select({
          date: sql<string>`DATE_TRUNC(${sql.raw(`'${dateGrouping}'`)}, ${schema.exits.exitedAt})`,
          count: count(),
        })
        .from(schema.exits)
        .where(and(...conditions.exits))
        .groupBy(sql`DATE_TRUNC(${sql.raw(`'${dateGrouping}'`)}, ${schema.exits.exitedAt})`)
        .orderBy(asc(sql`DATE_TRUNC(${sql.raw(`'${dateGrouping}'`)}, ${schema.exits.exitedAt})`));

      // Exits by type
      const exitsByType = await this.db
        .select({
          exitType: schema.exits.exitType,
          count: count(),
        })
        .from(schema.exits)
        .where(and(...conditions.exits))
        .groupBy(schema.exits.exitType);

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
        byType: exitsByType.map((item) => ({
          exitType: item.exitType,
          count: Number(item.count),
        })),
      };
    } catch (error: any) {
      this.logger.error(`Error generating exit analytics: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate exit analytics');
    }
  }

  /**
   * Get processing stage analytics (legacy, filtered by account)
   */
  async getProcessingStageAnalytics(query: ReportQueryDto = {}, accountId: number) {
    try {
      const conditions = this.buildDateConditions(query, accountId);

      // Get arrival IDs based on query filters
      let arrivalIds: number[] = [];
      if (conditions.arrivals.length > 0) {
        const arrivals = await this.db
          .select({ id: schema.arrivals.id })
          .from(schema.arrivals)
          .where(and(...conditions.arrivals));
        arrivalIds = arrivals.map((a) => a.id);
      } else {
        const allArrivals = await this.db
          .select({ id: schema.arrivals.id })
          .from(schema.arrivals);
        arrivalIds = allArrivals.map((a) => a.id);
      }

      if (arrivalIds.length === 0) {
        return {
          byType: [],
          byStatus: [],
          averageTimes: null,
        };
      }

      // Processing stages by type
      const stagesByType = await this.db
        .select({
          stageType: schema.processingStages.stageType,
          count: count(),
        })
        .from(schema.processingStages)
        .where(inArray(schema.processingStages.arrivalId, arrivalIds))
        .groupBy(schema.processingStages.stageType);

      // Processing stages by status
      const stagesByStatus = await this.db
        .select({
          status: schema.processingStages.status,
          count: count(),
        })
        .from(schema.processingStages)
        .where(inArray(schema.processingStages.arrivalId, arrivalIds))
        .groupBy(schema.processingStages.status);

      // Average processing times
      const completedStages = await this.db
        .select({
          stageType: schema.processingStages.stageType,
          startedAt: schema.processingStages.startedAt,
          completedAt: schema.processingStages.completedAt,
        })
        .from(schema.processingStages)
        .where(
          and(
            inArray(schema.processingStages.arrivalId, arrivalIds),
            sql`${schema.processingStages.startedAt} IS NOT NULL`,
            sql`${schema.processingStages.completedAt} IS NOT NULL`,
          ),
        );

      const averageTimes = this.calculateAverageProcessingTimes(completedStages);

      return {
        byType: stagesByType.map((item) => ({
          stageType: item.stageType,
          count: Number(item.count),
        })),
        byStatus: stagesByStatus.map((item) => ({
          status: item.status,
          count: Number(item.count),
        })),
        averageTimes,
      };
    } catch (error: any) {
      this.logger.error(`Error generating processing stage analytics: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate processing stage analytics');
    }
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

  /**
   * Build date conditions for queries (arrivals/exits). Always include accountId.
   */
  private buildDateConditions(query: ReportQueryDto, accountId: number) {
    const conditions: {
      arrivals: SQL[];
      exits: SQL[];
    } = {
      arrivals: [eq(schema.arrivals.accountId, accountId)],
      exits: [eq(schema.exits.accountId, accountId)],
    };

    if (query.startDate) {
      const startDate = new Date(query.startDate);
      conditions.arrivals.push(gte(schema.arrivals.arrivedAt, startDate));
      conditions.exits.push(gte(schema.exits.exitedAt, startDate));
    }

    if (query.endDate) {
      const endDate = new Date(query.endDate);
      conditions.arrivals.push(lte(schema.arrivals.arrivedAt, endDate));
      conditions.exits.push(lte(schema.exits.exitedAt, endDate));
    }

    if (query.centerId) {
      conditions.arrivals.push(eq(schema.arrivals.centerId, query.centerId));
      conditions.exits.push(eq(schema.exits.centerId, query.centerId));
    }

    if (query.vehicleId) {
      conditions.arrivals.push(eq(schema.arrivals.vehicleId, query.vehicleId));
      conditions.exits.push(eq(schema.exits.vehicleId, query.vehicleId));
    }

    if (query.agentId) {
      conditions.arrivals.push(eq(schema.arrivals.agentId, Number(query.agentId)));
      conditions.exits.push(eq(schema.exits.agentId, Number(query.agentId)));
    }

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

  /**
   * Calculate transit time statistics
   */
  private calculateTransitTimeStats(
    transitTimes: Array<{
      id: number;
      estimatedArrival: Date | null;
      actualArrival: Date | null;
      distanceKm: string | null;
    }>,
  ) {
    if (transitTimes.length === 0) {
      return null;
    }

    const times = transitTimes
      .filter((t) => t.estimatedArrival && t.actualArrival)
      .map((t) => {
        const estimated = new Date(t.estimatedArrival!).getTime();
        const actual = new Date(t.actualArrival!).getTime();
        return actual - estimated; // Difference in milliseconds
      });

    if (times.length === 0) {
      return null;
    }

    const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const sortedTimes = [...times].sort((a, b) => a - b);
    const medianTime = sortedTimes[Math.floor(sortedTimes.length / 2)];
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    // Count on-time (within 1 hour of estimated)
    const onTimeCount = times.filter((time) => Math.abs(time) <= 3600000).length;
    const onTimeRate = (onTimeCount / times.length) * 100;

    return {
      average: avgTime / 1000 / 60, // Convert to minutes
      median: medianTime / 1000 / 60,
      min: minTime / 1000 / 60,
      max: maxTime / 1000 / 60,
      onTimeRate: Number(onTimeRate.toFixed(2)),
      totalSamples: times.length,
    };
  }

  /**
   * Calculate average processing times by stage type
   */
  private calculateAverageProcessingTimes(
    stages: Array<{
      stageType: string;
      startedAt: Date | null;
      completedAt: Date | null;
    }>,
  ) {
    if (stages.length === 0) {
      return null;
    }

    const byType = new Map<string, number[]>();

    stages.forEach((stage) => {
      if (stage.startedAt && stage.completedAt) {
        const duration = new Date(stage.completedAt).getTime() - new Date(stage.startedAt).getTime();
        const existing = byType.get(stage.stageType) || [];
        existing.push(duration);
        byType.set(stage.stageType, existing);
      }
    });

    const averages: Record<string, number> = {};
    byType.forEach((times, type) => {
      const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
      averages[type] = avg / 1000 / 60; // Convert to minutes
    });

    return averages;
  }
}
