import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { VehiclesSyncService } from './vehicles-sync.service';
import { MalambiApiService } from '@integrations/malambi-api/malambi-api.service';
import { PaginateQuery, PaginateResult, BaseEntity } from '@common/interfaces';
import { BaseService } from '@common/services/base.service';
import { eq, and, SQL, desc, asc, count, sql, inArray } from 'drizzle-orm';
import * as schema from '@modules/schemas';

type Vehicle = typeof schema.vehicles.$inferSelect & BaseEntity;

@Injectable()
export class VehiclesService extends BaseService<Vehicle> {
  private readonly logger = new Logger(VehiclesService.name);
  private readonly dbConnection: any;

  constructor(
    @Inject(DATABASE_CONNECTION)
    db: any,
    private readonly vehiclesSyncService: VehiclesSyncService,
    private readonly malambiApi: MalambiApiService,
  ) {
    // Note: vehicles table uses serial ID and no deletedAt, so we pass it but override methods
    super(db, schema.vehicles as any);
    this.dbConnection = db;
  }

  async findAll(
    query: PaginateQuery = {},
    options?: { include?: string[] },
  ): Promise<PaginateResult<Vehicle>> {
    const page = query.page || 1;
    const limit = query.limit || 100;
    const offset = (page - 1) * limit;

    // Build where conditions (vehicles don't have deletedAt)
    const conditions: SQL[] = [];

    // Add search functionality
    if (query.search && query.searchBy && query.searchBy.length > 0) {
      const searchConditions = query.searchBy
        .map((field) => {
          const column = (schema.vehicles as any)[field];
          if (column) {
            return sql`${column}::text ILIKE ${`%${query.search}%`}`;
          }
          return null;
        })
        .filter(Boolean) as SQL[];

      if (searchConditions.length > 0) {
        conditions.push(sql`(${sql.join(searchConditions, sql` OR `)})`);
      }
    }

    // Build order by
    let orderByClause: any;
    if (query.sortBy && query.sortBy.length > 0) {
      const sortFields = query.sortBy.map(([field, direction]) => {
        const column = (schema.vehicles as any)[field];
        if (column) {
          return direction === 'DESC' ? desc(column) : asc(column);
        }
        return null;
      }).filter(Boolean);

      if (sortFields.length > 0) {
        orderByClause = sortFields;
      }
    }

    // Default ordering by createdAt DESC if no sort specified
    if (!orderByClause) {
      orderByClause = [desc(schema.vehicles.createdAt)];
    }

    // Get total count
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ count: total }] = await this.dbConnection
      .select({ count: count() })
      .from(schema.vehicles)
      .where(whereClause);

    // Build relations object for Drizzle query API
    const withRelations: any = {};
    if (options?.include) {
      if (options.include.includes('arrivals')) {
        withRelations.arrivals = true;
      }
      if (options.include.includes('exits')) {
        withRelations.exits = true;
      }
      if (options.include.includes('incomingVehicles')) {
        withRelations.incomingVehicles = true;
      }
    }

    // Get paginated results with relations
    let data: any[];
    if (Object.keys(withRelations).length > 0) {
      // When relations are requested, first get the IDs that match the conditions
      const matchingIds = await this.dbConnection
        .select({ id: schema.vehicles.id })
        .from(schema.vehicles)
        .where(whereClause)
        .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
        .limit(limit)
        .offset(offset);

      const ids = matchingIds.map((row: any) => row.id);

      if (ids.length > 0) {
        // Use relational query API to get data with relations
        const allData = await this.dbConnection.query.vehicles.findMany({
          where: (vehicles: any, { inArray: inArrayFn }: any) => inArrayFn(vehicles.id, ids),
          with: withRelations,
        });
        // Re-sort to match original order
        const idMap = new Map<number, number>(ids.map((id: number, idx: number) => [id, idx]));
        allData.sort((a: any, b: any) => {
          const aIdx: number = idMap.get(a.id) ?? 0;
          const bIdx: number = idMap.get(b.id) ?? 0;
          return aIdx - bIdx;
        });
        data = allData;
      } else {
        data = [];
      }
    } else {
      // Use standard query when no relations
      data = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(whereClause)
        .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
        .limit(limit)
        .offset(offset);
    }

    return {
      data: data as Vehicle[],
      meta: {
        itemsPerPage: limit,
        totalItems: total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        sortBy: query.sortBy || [],
        search: query.search,
        searchBy: query.searchBy,
      },
      links: {
        first: page > 1 ? `?page=1&limit=${limit}` : undefined,
        previous: page > 1 ? `?page=${page - 1}&limit=${limit}` : undefined,
        current: `?page=${page}&limit=${limit}`,
        next: page < Math.ceil(total / limit) ? `?page=${page + 1}&limit=${limit}` : undefined,
        last: page < Math.ceil(total / limit) ? `?page=${Math.ceil(total / limit)}&limit=${limit}` : undefined,
      },
    };
  }

  // Override BaseService.findOneById to handle number IDs (serial) instead of string IDs (UUID)
  async findOneById(id: number | string, options?: { include?: string[] }): Promise<Vehicle> {
    const numericId = typeof id === 'string' ? Number(id) : id;
    // Build relations object for Drizzle query API
    const withRelations: any = {};
    if (options?.include) {
      if (options.include.includes('arrivals')) {
        withRelations.arrivals = true;
      }
      if (options.include.includes('exits')) {
        withRelations.exits = true;
      }
      if (options.include.includes('incomingVehicles')) {
        withRelations.incomingVehicles = true;
      }
    }

    let vehicle: any;
    if (Object.keys(withRelations).length > 0) {
      // Use relational query API when relations are requested
      vehicle = await this.dbConnection.query.vehicles.findFirst({
        where: (vehicles: any, { eq: eqFn }: any) => eqFn(vehicles.id, numericId),
        with: withRelations,
      });
    } else {
      // Use standard query when no relations
      [vehicle] = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(eq(schema.vehicles.id, numericId))
        .limit(1);
    }

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    return vehicle as Vehicle;
  }

  async findOneBy(requestData: any): Promise<Vehicle> {
    const conditions = Object.entries(requestData)
      .map(([key, value]) => {
        const column = (schema.vehicles as any)[key];
        if (column && value !== undefined) {
          return eq(column, value as any);
        }
        return null;
      })
      .filter(Boolean) as any[];

    const [vehicle] = await this.dbConnection
      .select()
      .from(schema.vehicles)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(1);

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    return vehicle as Vehicle;
  }

  /**
   * Sync vehicle by vehicleId
   * Fetches vehicle from Malambi API and triggers a background job to save it if it doesn't exist in database
   */
  async syncVehicleByVehicleId(
    token: string,
    accId: string,
    subId: string,
    vehicleId: string,
  ) {
    return this.vehiclesSyncService.syncVehicleByVehicleId(token, accId, subId, vehicleId);
  }

  /**
   * Get vehicle from Malambi API (without saving to database)
   */
  async getVehicleFromApi(
    token: string,
    accId: string,
    subId: string,
    vehicleId: string,
  ) {
    return this.malambiApi.getVehicleDetail(token, accId, subId, vehicleId);
  }

  /**
   * Override BaseService.remove to handle number IDs (serial) instead of string IDs (UUID)
   */
  async remove(id: number | string): Promise<Vehicle> {
    const numericId = typeof id === 'string' ? Number(id) : id;
    // First check if vehicle exists
    const vehicle = await this.findOneById(numericId);
    
    // Delete the vehicle
    await this.dbConnection
      .delete(schema.vehicles)
      .where(eq(schema.vehicles.id, numericId));

    return vehicle;
  }
}

