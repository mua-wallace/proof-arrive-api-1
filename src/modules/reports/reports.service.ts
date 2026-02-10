import {
  Injectable,
  Inject,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { eq, and, SQL, sql, gte, lte, count, desc, asc, inArray } from 'drizzle-orm';
import * as schema from '@modules/schemas';
import { ReportQueryDto } from './dto/report-query.dto';

type DrizzleDatabase = ReturnType<typeof import('drizzle-orm/postgres-js').drizzle>;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDatabase,
  ) {}

  /**
   * Get dashboard summary with key metrics
   */
  async getDashboardSummary(query: ReportQueryDto = {}) {
    
    try {
      const conditions = this.buildDateConditions(query);

      // Total arrivals
      const arrivalsCount = await this.db
        .select({ count: count() })
        .from(schema.arrivals)
        .where(and(...conditions.arrivals));

      // Total exits
      const exitsCount = await this.db
        .select({ count: count() })
        .from(schema.exits)
        .where(and(...conditions.exits));

      // Arrivals by status
      const arrivalsByStatus = await this.db
        .select({
          status: schema.arrivals.status,
          count: count(),
        })
        .from(schema.arrivals)
        .where(and(...conditions.arrivals))
        .groupBy(schema.arrivals.status);

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
        summary: {
          totalArrivals: Number(arrivalsCount[0]?.count || 0),
          totalExits: Number(exitsCount[0]?.count || 0),
        },
        arrivalsByStatus: arrivalsByStatus.map((item) => ({
          status: item.status,
          count: Number(item.count),
        })),
        exitsByType: exitsByType.map((item) => ({
          exitType: item.exitType,
          count: Number(item.count),
        })),
      };
    } catch (error: any) {
      this.logger.error(`Error generating dashboard summary: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate dashboard summary');
    }
  }

  /**
   * Get arrival analytics
   */
  async getArrivalAnalytics(query: ReportQueryDto = {}) {
    
    try {
      const conditions = this.buildDateConditions(query);

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
   * Get exit analytics
   */
  async getExitAnalytics(query: ReportQueryDto = {}) {
    
    try {
      const conditions = this.buildDateConditions(query);

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
   * Get processing stage analytics
   */
  async getProcessingStageAnalytics(query: ReportQueryDto = {}) {
    
    try {
      const conditions = this.buildDateConditions(query);

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
   * Get center performance metrics
   */
  async getCenterPerformance(query: ReportQueryDto = {}) {
    
    try {
      const conditions = this.buildDateConditions(query);

      // Get all centers or specific center
      let centers: any[] = [];
      if (query.centerId) {
        const center = await this.db
          .select()
          .from(schema.centers)
          .where(eq(schema.centers.id, query.centerId))
          .limit(1);
        centers = center;
      } else {
        centers = await this.db.select().from(schema.centers);
      }

      const performanceMetrics = await Promise.all(
        centers.map(async (center) => {
          // Arrivals count
          const arrivalsCount = await this.db
            .select({ count: count() })
            .from(schema.arrivals)
            .where(
              and(
                eq(schema.arrivals.centerId, center.id),
                ...conditions.arrivals.filter((c) => !c.toString().includes('center_id')),
              ),
            );

          // Exits count
          const exitsCount = await this.db
            .select({ count: count() })
            .from(schema.exits)
            .where(
              and(
                eq(schema.exits.centerId, center.id),
                ...conditions.exits.filter((c) => !c.toString().includes('center_id')),
              ),
            );

          return {
            center,
            metrics: {
              arrivals: Number(arrivalsCount[0]?.count || 0),
              exits: Number(exitsCount[0]?.count || 0),
              netFlow: Number(arrivalsCount[0]?.count || 0) - Number(exitsCount[0]?.count || 0),
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
   * Get vehicle activity report
   */
  async getVehicleActivity(query: ReportQueryDto = {}) {
    
    try {
      const conditions = this.buildDateConditions(query);

      // Get vehicles or specific vehicle
      let vehicles: any[] = [];
      if (query.vehicleId) {
        const vehicle = await this.db
          .select()
          .from(schema.vehicles)
          .where(eq(schema.vehicles.id, query.vehicleId))
          .limit(1);
        vehicles = vehicle;
      } else {
        vehicles = await this.db.select().from(schema.vehicles);
      }

      const vehicleActivity = await Promise.all(
        vehicles.map(async (vehicle) => {
          // Arrivals count
          const arrivalsCount = await this.db
            .select({ count: count() })
            .from(schema.arrivals)
            .where(
              and(
                eq(schema.arrivals.vehicleId, vehicle.id),
                ...conditions.arrivals.filter((c) => !c.toString().includes('vehicle_id')),
              ),
            );

          // Exits count
          const exitsCount = await this.db
            .select({ count: count() })
            .from(schema.exits)
            .where(
              and(
                eq(schema.exits.vehicleId, vehicle.id),
                ...conditions.exits.filter((c) => !c.toString().includes('vehicle_id')),
              ),
            );

          return {
            vehicle,
            activity: {
              arrivals: Number(arrivalsCount[0]?.count || 0),
              exits: Number(exitsCount[0]?.count || 0),
              totalMovements: Number(arrivalsCount[0]?.count || 0) + Number(exitsCount[0]?.count || 0),
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
   * Get agent activity report
   */
  async getAgentActivity(query: ReportQueryDto = {}) {
    
    try {
      const conditions = this.buildDateConditions(query);

      // Get unique agents from arrivals
      const arrivalAgents = await this.db
        .select({
          agentId: schema.arrivals.agentId,
          count: count(),
        })
        .from(schema.arrivals)
        .where(and(...conditions.arrivals))
        .groupBy(schema.arrivals.agentId);

      // Get unique agents from exits
      const exitAgents = await this.db
        .select({
          agentId: schema.exits.agentId,
          count: count(),
        })
        .from(schema.exits)
        .where(and(...conditions.exits))
        .groupBy(schema.exits.agentId);

      // Combine and aggregate
      // Note: agentId is now integer (users.id equals subid)
      const agentMap = new Map<number, { arrivals: number; exits: number }>();

      arrivalAgents.forEach((item) => {
        agentMap.set(item.agentId, {
          arrivals: Number(item.count),
          exits: 0,
        });
      });

      exitAgents.forEach((item) => {
        const existing = agentMap.get(item.agentId) || { arrivals: 0, exits: 0 };
        agentMap.set(item.agentId, {
          ...existing,
          exits: Number(item.count),
        });
      });

      // Get user details
      // Note: agentId is now users.id (subid), not accid
      const agentIds = Array.from(agentMap.keys());
      const users = agentIds.length > 0
        ? await this.db
            .select()
            .from(schema.users)
            .where(inArray(schema.users.id, agentIds))
        : [];

      const userMap = new Map(users.map((u) => [u.id, u]));

      return Array.from(agentMap.entries()).map(([agentId, activity]) => ({
        agentId,
        user: userMap.get(agentId) || null,
        activity: {
          arrivals: activity.arrivals,
          exits: activity.exits,
          total: activity.arrivals + activity.exits,
        },
      }));
    } catch (error: any) {
      this.logger.error(`Error generating agent activity: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate agent activity report');
    }
  }

  /**
   * Build date conditions for queries
   */
  private buildDateConditions(query: ReportQueryDto) {
    const conditions: {
      arrivals: SQL[];
      exits: SQL[];
    } = {
      arrivals: [],
      exits: [],
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
      // agentId is now integer (users.id equals subid)
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
