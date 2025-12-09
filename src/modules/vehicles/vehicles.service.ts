import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { VehiclesSyncService } from './vehicles-sync.service';
import { MalambiApiService } from '@integrations/malambi-api/malambi-api.service';
import { PaginateQuery, PaginateResult } from '@common/interfaces';
import { eq, and, SQL, desc, asc, count, sql } from 'drizzle-orm';
import * as schema from '@modules/schemas';

type Vehicle = typeof schema.vehicles.$inferSelect;

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: any,
    private readonly vehiclesSyncService: VehiclesSyncService,
    private readonly malambiApi: MalambiApiService,
  ) {}

  async findAll(
    query: PaginateQuery = {},
    options?: any,
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
    const [{ count: total }] = await this.db
      .select({ count: count() })
      .from(schema.vehicles)
      .where(whereClause);

    // Get paginated results
    const data = await this.db
      .select()
      .from(schema.vehicles)
      .where(whereClause)
      .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
      .limit(limit)
      .offset(offset);

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

  async findOneById(id: number): Promise<Vehicle> {
    const [vehicle] = await this.db
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.id, id))
      .limit(1);

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

    const [vehicle] = await this.db
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
   * Remove vehicle by ID
   */
  async remove(id: number): Promise<Vehicle> {
    // First check if vehicle exists
    const vehicle = await this.findOneById(id);
    
    // Delete the vehicle
    await this.db
      .delete(schema.vehicles)
      .where(eq(schema.vehicles.id, id));

    return vehicle;
  }
}

