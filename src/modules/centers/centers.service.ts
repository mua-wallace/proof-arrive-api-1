import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { CentersSyncService } from './centers-sync.service';
import { MalambiApiService } from '@integrations/malambi-api/malambi-api.service';
import { PaginateQuery, PaginateResult } from '@common/interfaces';
import { eq, and, SQL, desc, asc, count, sql } from 'drizzle-orm';
import * as schema from '@modules/schemas';

type Center = typeof schema.centers.$inferSelect;

@Injectable()
export class CentersService {
  private readonly logger = new Logger(CentersService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: any,
    private readonly centersSyncService: CentersSyncService,
    private readonly malambiApi: MalambiApiService,
  ) {}

  async findAll(
    query: PaginateQuery = {},
    options?: any,
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
    const [{ count: total }] = await this.db
      .select({ count: count() })
      .from(schema.centers)
      .where(whereClause);

    // Get paginated results
    const data = await this.db
      .select()
      .from(schema.centers)
      .where(whereClause)
      .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
      .limit(limit)
      .offset(offset);

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

  async findOneById(id: number): Promise<Center> {
    const [center] = await this.db
      .select()
      .from(schema.centers)
      .where(eq(schema.centers.id, id))
      .limit(1);

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

    const [center] = await this.db
      .select()
      .from(schema.centers)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(1);

    if (!center) {
      throw new NotFoundException('Center not found');
    }
    return center as Center;
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

