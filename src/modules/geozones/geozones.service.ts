import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { and, asc, count, desc, eq, SQL, sql } from 'drizzle-orm';
import * as schema from '@modules/schemas';
import { PaginateQuery, PaginateResult } from '@common/interfaces';
import { MalambiApiService } from '@integrations/malambi-api/malambi-api.service';
import { GeozonesSyncService } from './geozones-sync.service';

type Geozone = typeof schema.geozones.$inferSelect;

@Injectable()
export class GeozonesService {
  private readonly logger = new Logger(GeozonesService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly dbConnection: any,
    private readonly malambiApi: MalambiApiService,
    private readonly geozonesSyncService: GeozonesSyncService,
  ) {}

  async findAll(
    query: PaginateQuery = {},
    options?: { accountId?: number },
  ): Promise<PaginateResult<Geozone>> {
    try {
      const page = query.page || 1;
      const limit = query.limit || 100;
      const offset = (page - 1) * limit;

      const conditions: SQL[] = [];
      if (options?.accountId !== undefined) {
        conditions.push(eq(schema.geozones.accountId, options.accountId));
      }

      if (query.search && query.searchBy && query.searchBy.length > 0) {
        const searchConditions = query.searchBy
          .map((field) => {
            const column = (schema.geozones as any)[field];
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

      let orderByClause: any;
      if (query.sortBy && query.sortBy.length > 0) {
        const sortFields = query.sortBy
          .map(([field, direction]) => {
            const column = (schema.geozones as any)[field];
            if (column) return direction === 'DESC' ? desc(column) : asc(column);
            return null;
          })
          .filter(Boolean);
        if (sortFields.length > 0) orderByClause = sortFields;
      }
      if (!orderByClause) orderByClause = [asc(schema.geozones.name)];

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [{ count: total }] = await this.dbConnection
        .select({ count: count() })
        .from(schema.geozones)
        .where(whereClause);

      const data = await this.dbConnection
        .select()
        .from(schema.geozones)
        .where(whereClause)
        .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
        .limit(limit)
        .offset(offset);

      const totalPages = Math.ceil(total / limit);

      return {
        data: data as Geozone[],
        meta: {
          itemsPerPage: limit,
          totalItems: total,
          currentPage: page,
          totalPages,
          sortBy: query.sortBy || [],
          search: query.search,
          searchBy: query.searchBy,
        },
        links: {
          first: page > 1 ? `?page=1&limit=${limit}` : undefined,
          previous: page > 1 ? `?page=${page - 1}&limit=${limit}` : undefined,
          current: `?page=${page}&limit=${limit}`,
          next: page < totalPages ? `?page=${page + 1}&limit=${limit}` : undefined,
          last: page < totalPages ? `?page=${totalPages}&limit=${limit}` : undefined,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch geozones: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      throw new InternalServerErrorException(
        `Failed to fetch geozones: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  /**
   * Fetch geozones directly from Malambi API.
   */
  async listFromApi(
    token: string,
    accId: string,
    subId: string,
    apiOptions?: { limit?: number; query?: string; page?: number },
  ) {
    if (!token || !accId || !subId) {
      throw new UnauthorizedException(
        'Unauthorized. Please make sure you are logged in correctly',
      );
    }

    try {
      const response = await this.malambiApi.getGeozones(token, accId, subId, apiOptions);
      if (!response) {
        throw new NotFoundException('No geozones found from Malambi API');
      }
      return response;
    } catch (error: any) {
      this.logger.error(
        `Failed to get geozones from Malambi API: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new InternalServerErrorException(
        `Failed to get geozones from API: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  /**
   * Fetch all geozones from Malambi API and upsert them into the local DB.
   */
  async syncAllFromApi(
    token: string,
    accId: string,
    subId: string,
    accountId: number,
    options?: { limit?: number; query?: string },
  ) {
    if (!token || !accId || !subId) {
      throw new UnauthorizedException(
        'Unauthorized. Please make sure you are logged in correctly',
      );
    }
    if (!accountId || isNaN(accountId) || accountId <= 0) {
      throw new BadRequestException(`Invalid account ID: ${accountId}`);
    }

    try {
      return await this.geozonesSyncService.syncAllFromApi(
        token,
        accId,
        subId,
        accountId,
        options,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to sync geozones: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new InternalServerErrorException(
        `Failed to sync geozones: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }
}
