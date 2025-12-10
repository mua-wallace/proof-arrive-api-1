import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { CentersSyncService } from './centers-sync.service';
import { MalambiApiService } from '@integrations/malambi-api/malambi-api.service';
import { PaginateQuery, PaginateResult, BaseEntity } from '@common/interfaces';
import { BaseService } from '@common/services/base.service';
import { eq, and, SQL, desc, asc, count, sql, inArray } from 'drizzle-orm';
import * as schema from '@modules/schemas';

type Center = typeof schema.centers.$inferSelect & BaseEntity;

@Injectable()
export class CentersService extends BaseService<Center> {
  private readonly logger = new Logger(CentersService.name);
  private readonly dbConnection: any;

  constructor(
    @Inject(DATABASE_CONNECTION)
    db: any,
    private readonly centersSyncService: CentersSyncService,
    private readonly malambiApi: MalambiApiService,
  ) {
    // Note: centers table uses serial ID and no deletedAt, so we pass it but override methods
    super(db, schema.centers as any);
    this.dbConnection = db;
  }

  async findAll(
    query: PaginateQuery = {},
    options?: { include?: string[] },
  ): Promise<PaginateResult<Center>> {
    const page = query.page || 1;
    const limit = query.limit || 100;
    const offset = (page - 1) * limit;

    // Build where conditions (centers don't have deletedAt)
    const conditions: SQL[] = [];

    // Add search functionality
    if (query.search && query.searchBy && query.searchBy.length > 0) {
      const searchConditions = query.searchBy
        .map((field) => {
          const column = (schema.centers as any)[field];
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
        const column = (schema.centers as any)[field];
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
      orderByClause = [desc(schema.centers.createdAt)];
    }

    // Get total count
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ count: total }] = await this.dbConnection
      .select({ count: count() })
      .from(schema.centers)
      .where(whereClause);

    // Build relations object for Drizzle query API
    const withRelations: any = {};
    if (options?.include) {
      if (options.include.includes('geozone')) {
        withRelations.geozone = true;
      }
      if (options.include.includes('arrivals')) {
        withRelations.arrivals = true;
      }
      if (options.include.includes('exits')) {
        withRelations.exits = true;
      }
      if (options.include.includes('incomingVehicles')) {
        withRelations.incomingVehiclesAsDestination = true;
        withRelations.incomingVehiclesAsSource = true;
      }
    }

    // Get paginated results with relations
    let data: any[];
    if (Object.keys(withRelations).length > 0) {
      // When relations are requested, first get the IDs that match the conditions
      const matchingIds = await this.dbConnection
        .select({ id: schema.centers.id })
        .from(schema.centers)
        .where(whereClause)
        .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
        .limit(limit)
        .offset(offset);

      const ids = matchingIds.map((row: any) => row.id);

      if (ids.length > 0) {
        // Use relational query API to get data with relations
        // Drizzle query API where clause uses operators from drizzle-orm
        const allData = await this.dbConnection.query.centers.findMany({
          where: (centers: any, { inArray: inArrayFn }: any) => inArrayFn(centers.id, ids),
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
        .from(schema.centers)
        .where(whereClause)
        .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
        .limit(limit)
        .offset(offset);
    }

    return {
      data: data as Center[],
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
  async findOneById(id: number | string, options?: { include?: string[] }): Promise<Center> {
    const numericId = typeof id === 'string' ? Number(id) : id;
    // Build relations object for Drizzle query API
    const withRelations: any = {};
    if (options?.include) {
      if (options.include.includes('geozone')) {
        withRelations.geozone = true;
      }
      if (options.include.includes('arrivals')) {
        withRelations.arrivals = true;
      }
      if (options.include.includes('exits')) {
        withRelations.exits = true;
      }
      if (options.include.includes('incomingVehicles')) {
        withRelations.incomingVehiclesAsDestination = true;
        withRelations.incomingVehiclesAsSource = true;
      }
    }

    let center: any;
    if (Object.keys(withRelations).length > 0) {
      // Use relational query API when relations are requested
      center = await this.dbConnection.query.centers.findFirst({
        where: (centers: any, { eq: eqFn }: any) => eqFn(centers.id, numericId),
        with: withRelations,
      });
    } else {
      // Use standard query when no relations
      [center] = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(eq(schema.centers.id, numericId))
        .limit(1);
    }

    if (!center) {
      throw new NotFoundException('Center not found');
    }
    return center as Center;
  }

  async findOneBy(requestData: any): Promise<Center> {
    const conditions = Object.entries(requestData)
      .map(([key, value]) => {
        const column = (schema.centers as any)[key];
        if (column && value !== undefined) {
          return eq(column, value as any);
        }
        return null;
      })
      .filter(Boolean) as any[];

    const [center] = await this.dbConnection
      .select()
      .from(schema.centers)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(1);

    if (!center) {
      throw new NotFoundException('Center not found');
    }
    return center as Center;
  }

  // Override BaseService.remove to handle number IDs (serial) instead of string IDs (UUID)
  async remove(id: number | string): Promise<Center> {
    const numericId = typeof id === 'string' ? Number(id) : id;
    // First check if center exists
    const center = await this.findOneById(numericId);
    
    // Delete the center
    await this.dbConnection
      .delete(schema.centers)
      .where(eq(schema.centers.id, numericId));

    return center;
  }

  /**
   * Sync center by geozone_id
   * Fetches centers from Malambi API, finds the one with matching gzone_id,
   * and triggers a background job to save it if it doesn't exist in database
   */
  async syncCenterByGeozoneId(
    token: string,
    accId: string,
    subId: string,
    geozoneId: number,
  ) {
    return this.centersSyncService.syncCenterByGeozoneId(token, accId, subId, geozoneId);
  }

  /**
   * Get all centers from Malambi API (without saving to database)
   */
  async getAllCentersFromApi(
    token: string,
    accId: string,
    subId: string,
    options?: {
      limit?: number;
      regionid?: number;
      filtertype?: number;
    },
  ) {
    return this.malambiApi.getCenters(token, accId, subId, options);
  }
}

