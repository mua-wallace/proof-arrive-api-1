import { Injectable, Inject, NotFoundException, Logger, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
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
    options?: { include?: string[]; accountId?: number },
  ): Promise<PaginateResult<Center>> {
    try {
      const page = query.page || 1;
      const limit = query.limit || 100;
      const offset = (page - 1) * limit;

      // Build where conditions (centers don't have deletedAt)
      const conditions: SQL[] = [];

      // Automatically filter by accountId if provided
      if (options?.accountId !== undefined) {
        conditions.push(eq(schema.centers.accountId, options.accountId));
      }

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
        if (options.include.includes('vehicles')) {
          withRelations.vehicles = true;
        }
        if (options.include.includes('arrivals')) {
          withRelations.arrivals = true;
        }
        if (options.include.includes('exits')) {
          withRelations.exits = true;
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
    } catch (error: any) {
      this.logger.error(`Failed to fetch centers: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to fetch centers: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  // Override BaseService.findOneById to handle number IDs (serial) instead of string IDs (UUID)
  async findOneById(id: number | string, options?: { include?: string[]; accountId?: number }): Promise<Center> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (!numericId || isNaN(numericId)) {
      throw new NotFoundException(`Invalid center ID: ${id}`);
    }

    try {
      // Build where conditions
      const whereConditions: SQL[] = [eq(schema.centers.id, numericId)];
      
      // Automatically filter by accountId if provided
      if (options?.accountId !== undefined) {
        whereConditions.push(eq(schema.centers.accountId, options.accountId));
      }

      // Build relations object for Drizzle query API
      const withRelations: any = {};
      if (options?.include) {
        if (options.include.includes('geozone')) {
          withRelations.geozone = true;
        }
        if (options.include.includes('vehicles')) {
          withRelations.vehicles = true;
        }
        if (options.include.includes('arrivals')) {
          withRelations.arrivals = true;
        }
        if (options.include.includes('exits')) {
          withRelations.exits = true;
        }
      }

      let center: any;
      if (Object.keys(withRelations).length > 0) {
        // Use relational query API when relations are requested
        center = await this.dbConnection.query.centers.findFirst({
          where: (centers: any, { eq: eqFn, and: andFn }: any) => {
            const conditions = [eqFn(centers.id, numericId)];
            if (options?.accountId !== undefined) {
              conditions.push(eqFn(centers.accountId, options.accountId));
            }
            return andFn(...conditions);
          },
          with: withRelations,
        });
      } else {
        // Use standard query when no relations
        [center] = await this.dbConnection
          .select()
          .from(schema.centers)
          .where(and(...whereConditions))
          .limit(1);
      }

      if (!center) {
        throw new NotFoundException(`Center with ID ${numericId} not found`);
      }
      return center as Center;
    } catch (error: any) {
      this.logger.error(`Failed to fetch center with id=${numericId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to get center details: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async findOneBy(
    requestData: any,
    options?: { accountId?: number; [key: string]: any },
  ): Promise<Center> {
    const accountId = options?.accountId;

    try {
      const conditions = Object.entries(requestData)
        .map(([key, value]) => {
          const column = (schema.centers as any)[key];
          if (column && value !== undefined) {
            return eq(column, value as any);
          }
          return null;
        })
        .filter(Boolean) as any[];

      // Automatically filter by accountId if provided
      if (accountId !== undefined) {
        conditions.push(eq(schema.centers.accountId, accountId));
      }

      if (conditions.length === 0) {
        throw new NotFoundException('No search criteria provided');
      }

      const [center] = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(1);

      if (!center) {
        throw new NotFoundException(`Center not found with criteria: ${JSON.stringify(requestData)}`);
      }
      return center as Center;
    } catch (error: any) {
      this.logger.error(`Failed to find center by criteria: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to find center: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  // Override BaseService.remove to handle number IDs (serial) instead of string IDs (UUID)
  async remove(id: number | string, accountId?: number): Promise<Center> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (!numericId || isNaN(numericId)) {
      throw new NotFoundException(`Invalid center ID: ${id}`);
    }

    try {
      // First check if center exists and belongs to the account
      const center = await this.findOneById(numericId, { accountId });
      
      // Delete the center
      const whereConditions: SQL[] = [eq(schema.centers.id, numericId)];
      if (accountId !== undefined) {
        whereConditions.push(eq(schema.centers.accountId, accountId));
      }

      await this.dbConnection
        .delete(schema.centers)
        .where(and(...whereConditions));

      return center;
    } catch (error: any) {
      this.logger.error(`Failed to remove center with id=${numericId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to remove center: ${error?.message || 'Unknown error occurred'}`,
      );
    }
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

    if (!token || !accId || !subId) {
      throw new UnauthorizedException(
        'Unauthorized. Please make sure you are logged in correctly',
      );
    }

    if (!geozoneId || isNaN(geozoneId)) {
      throw new NotFoundException(`Invalid geozone ID: ${geozoneId}`);
    }

    try {
      return await this.centersSyncService.syncCenterByGeozoneId(token, accId, subId, geozoneId);
    } catch (error: any) {
      this.logger.error(`Failed to sync center by geozoneId=${geozoneId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new InternalServerErrorException(
        `Failed to sync center: ${error?.message || 'Unknown error occurred'}`,
      );
    }
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

    if (!token || !accId || !subId) {
      throw new UnauthorizedException(
        'Unauthorized. Please make sure you are logged in correctly',
      );
    }

    try {
      const centers = await this.malambiApi.getCenters(token, accId, subId, options);
      if (!centers) {
        throw new NotFoundException('No centers found from Malambi API');
      }
      return centers;
    } catch (error: any) {
      this.logger.error(`Failed to get centers from Malambi API: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new InternalServerErrorException(
        `Failed to get centers from API: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  /**
   * List centers from Malambi API with pagination, filtering, and searching
   * Supports pagination, filtering, and searching
   */
  async listCenters(
    token: string,
    accId: string,
    subId: string,
    query?: PaginateQuery,
    apiOptions?: {
      limit?: number;
      regionid?: number;
      filtertype?: number;
    },
  ): Promise<any[] | PaginateResult<any>> {
    if (!token || !accId || !subId) {
      throw new UnauthorizedException(
        'Unauthorized. Please make sure you are logged in correctly',
      );
    }

    try {
      // Fetch all centers from API
      const response = await this.malambiApi.getCenters(token, accId, subId, apiOptions);
      
      if (!response.success || !Array.isArray(response.rows)) {
        throw new NotFoundException('No centers found from Malambi API');
      }

      const allCenters = response.rows;

      // If no pagination/filtering requested, return as-is
      if (!query || (!query.search && !query.page && !query.limit && !query.sortBy)) {
        return allCenters;
      }

      // Apply filtering and searching
      let filteredCenters = [...allCenters];

      // Apply search if provided
      if (query.search && query.searchBy && query.searchBy.length > 0) {
        const searchTerm = query.search.toLowerCase();
        filteredCenters = filteredCenters.filter((center) => {
          return query.searchBy!.some((field) => {
            switch (field) {
              case 'name':
                return center.name?.toLowerCase().includes(searchTerm);
              case 'fullname':
                return center.fullname?.toLowerCase().includes(searchTerm);
              case 'manager':
                return center.manager?.toLowerCase().includes(searchTerm);
              case 'geozone':
                return center.geozone?.toLowerCase().includes(searchTerm);
              case 'groupname':
                return center.groupname?.toLowerCase().includes(searchTerm);
              case 'id':
                return center.id?.toString().includes(searchTerm);
              case 'siteid':
                return center.siteid?.toString().includes(searchTerm);
              case 'gzone_id':
              case 'geozoneId':
                return center.gzone_id?.toString().includes(searchTerm);
              default:
                return false;
            }
          });
        });
      }

      // Apply sorting
      if (query.sortBy && query.sortBy.length > 0) {
        filteredCenters.sort((a, b) => {
          for (const [field, direction] of query.sortBy!) {
            let comparison = 0;
            switch (field) {
              case 'id':
                comparison = (a.id || 0) - (b.id || 0);
                break;
              case 'siteid':
                comparison = (a.siteid || 0) - (b.siteid || 0);
                break;
              case 'name':
                comparison = (a.name || '').localeCompare(b.name || '');
                break;
              case 'fullname':
                comparison = (a.fullname || '').localeCompare(b.fullname || '');
                break;
              case 'manager':
                comparison = (a.manager || '').localeCompare(b.manager || '');
                break;
              case 'geozone':
                comparison = (a.geozone || '').localeCompare(b.geozone || '');
                break;
              case 'groupname':
                comparison = (a.groupname || '').localeCompare(b.groupname || '');
                break;
              case 'gzone_id':
              case 'geozoneId':
                comparison = (a.gzone_id || 0) - (b.gzone_id || 0);
                break;
              default:
                continue;
            }
            if (comparison !== 0) {
              return direction === 'DESC' ? -comparison : comparison;
            }
          }
          return 0;
        });
      } else {
        // Default sort by name ASC
        filteredCenters.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      }

      // Calculate pagination
      const page = query.page || 1;
      const limit = query.limit || 100;
      const totalItems = filteredCenters.length;
      const totalPages = Math.ceil(totalItems / limit);
      const offset = (page - 1) * limit;
      const paginatedCenters = filteredCenters.slice(offset, offset + limit);

      // Build pagination result
      const result: PaginateResult<any> = {
        data: paginatedCenters,
        meta: {
          itemsPerPage: limit,
          totalItems,
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

      return result;
    } catch (error: any) {
      this.logger.error(
        `Failed to list centers: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new InternalServerErrorException(
        `Failed to list centers: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  /**
   * Bulk sync centers from API response
   * Processes all centers and triggers background sync jobs for centers that don't exist
   */
  async bulkSyncCenters(
    centers: any[],
    accountId: number,
  ): Promise<{
    totalCenters: number;
    synced: number;
    skipped: number;
    errors: number;
    message: string;
  }> {
    return await this.centersSyncService.bulkSyncCenters(centers, accountId);
  }
}

