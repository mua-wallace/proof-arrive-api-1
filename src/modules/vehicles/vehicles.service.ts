import { Injectable, Inject, NotFoundException, Logger, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
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
    options?: { include?: string[]; accountId?: number },
  ): Promise<PaginateResult<Vehicle>> {
    try {
      const page = query.page || 1;
      const limit = query.limit || 100;
      const offset = (page - 1) * limit;

      // Build where conditions (vehicles don't have deletedAt)
      const conditions: SQL[] = [];

      // Automatically filter by accountId if provided
      if (options?.accountId !== undefined) {
        conditions.push(eq(schema.vehicles.accountId, options.accountId));
      }

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
      let total: number | undefined;
      let data: any[];
      let useAccountIdFilter = options?.accountId !== undefined;
      
      try {
        // Try count query first
        try {
          const [{ count: totalItems }] = await this.dbConnection
            .select({ count: count() })
            .from(schema.vehicles)
            .where(whereClause);
          total = totalItems;
        } catch (countError: any) {
          // Check if count error is due to missing account_id column
          const errorCode = countError?.code;
          const errorMessage = countError instanceof Error ? countError.message : String(countError);
          const errorString = String(errorMessage).toLowerCase();
          
          const isAccountIdError = 
            (errorCode === '42703') ||
            errorMessage?.toLowerCase().includes('account_id') ||
            errorString.includes('account_id') ||
            (errorMessage?.includes('column') && errorMessage?.includes('account_id'));
          
          if (isAccountIdError && useAccountIdFilter) {
            // Retry count without accountId filter
            const fallbackConditions: SQL[] = [];
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
                fallbackConditions.push(sql`(${sql.join(searchConditions, sql` OR `)})`);
              }
            }
            const fallbackWhereClause = fallbackConditions.length > 0 ? and(...fallbackConditions) : undefined;
            const [{ count: totalItems }] = await this.dbConnection
              .select({ count: count() })
              .from(schema.vehicles)
              .where(fallbackWhereClause);
            total = totalItems;
            useAccountIdFilter = false; // Don't use accountId filter for data query either
          } else {
            throw countError;
          }
        }

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
      } catch (error: any) {
        // Check if error is due to missing account_id column
        const errorCode = error?.code;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorString = String(error).toLowerCase();
        
        const isAccountIdError = 
          (errorCode === '42703') ||
          errorMessage?.toLowerCase().includes('account_id') ||
          errorString.includes('account_id') ||
          (errorMessage?.includes('column') && errorMessage?.includes('account_id'));
        
        // If account_id column doesn't exist, use raw SQL to exclude it from SELECT
        if (isAccountIdError) {
          // Rebuild conditions without accountId filter
          const fallbackConditions: SQL[] = [];
          
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
              fallbackConditions.push(sql`(${sql.join(searchConditions, sql` OR `)})`);
            }
          }
          
          const fallbackWhereClause = fallbackConditions.length > 0 ? and(...fallbackConditions) : undefined;
          
          // Get total count without accountId filter (only if not already set)
          if (total === undefined) {
            try {
              const [{ count: totalItems }] = await this.dbConnection
                .select({ count: count() })
                .from(schema.vehicles)
                .where(fallbackWhereClause);
              total = totalItems;
            } catch (countError: any) {
              // If count also fails, use raw SQL
              const postgresClient = (this.dbConnection as any).client || (this.dbConnection as any).session?.client;
              if (postgresClient) {
                const countQuery = `SELECT COUNT(*) as count FROM "vehicles"`;
                const countResult = await postgresClient.unsafe(countQuery);
                total = parseInt(countResult[0]?.count || '0', 10);
              } else {
                total = 0;
              }
            }
          }
          
          // Use raw SQL via postgres client to exclude account_id from SELECT
          const postgresClient = (this.dbConnection as any).client || (this.dbConnection as any).session?.client;
          
          if (postgresClient) {
            // Get column names excluding account_id
            const columnsResult = await postgresClient`
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_schema = 'public' 
              AND table_name = 'vehicles'
              AND column_name != 'account_id'
              ORDER BY ordinal_position
            `;
            
            const columnNames = columnsResult.map((row: any) => `"${row.column_name}"`).join(', ');
            // Simplified WHERE clause - just use empty for now since vehicles don't have deletedAt
            const whereClauseSql = '';
            const orderBySql = (orderByClause !== undefined) ? ' ORDER BY "created_at" DESC' : '';
            
            // Execute raw SQL query
            const rawQuery = `SELECT ${columnNames} FROM "vehicles" ${whereClauseSql}${orderBySql} LIMIT ${limit} OFFSET ${offset}`;
            data = await postgresClient.unsafe(rawQuery);
          } else {
            // Fallback: retry without accountId filter (will still fail if account_id is in SELECT)
            data = await this.dbConnection
              .select()
              .from(schema.vehicles)
              .where(fallbackWhereClause)
              .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
              .limit(limit)
              .offset(offset);
          }
        } else {
          throw error;
        }
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
    } catch (error: any) {
      this.logger.error(`Failed to fetch vehicles: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to fetch vehicles: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  // Override BaseService.findOneById to handle number IDs (serial) instead of string IDs (UUID)
  async findOneById(id: number | string, options?: { include?: string[]; accountId?: number }): Promise<Vehicle> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (!numericId || isNaN(numericId)) {
      throw new NotFoundException(`Invalid vehicle ID: ${id}`);
    }

    try {
      // Build where conditions
      const whereConditions: SQL[] = [eq(schema.vehicles.id, numericId)];
      
      // Automatically filter by accountId if provided
      if (options?.accountId !== undefined) {
        whereConditions.push(eq(schema.vehicles.accountId, options.accountId));
      }

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
          where: (vehicles: any, { eq: eqFn, and: andFn }: any) => {
            const conditions = [eqFn(vehicles.id, numericId)];
            if (options?.accountId !== undefined) {
              conditions.push(eqFn(vehicles.accountId, options.accountId));
            }
            return andFn(...conditions);
          },
          with: withRelations,
        });
      } else {
        // Use standard query when no relations
        [vehicle] = await this.dbConnection
          .select()
          .from(schema.vehicles)
          .where(and(...whereConditions))
          .limit(1);
      }

      if (!vehicle) {
        throw new NotFoundException(`Vehicle with ID ${numericId} not found`);
      }
      return vehicle as Vehicle;
    } catch (error: any) {
      this.logger.error(`Failed to fetch vehicle with id=${numericId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to get vehicle details: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async findOneBy(
    requestData: any,
    options?: { accountId?: number; [key: string]: any },
  ): Promise<Vehicle> {
    const accountId = options?.accountId;

    try {
      const conditions = Object.entries(requestData)
        .map(([key, value]) => {
          const column = (schema.vehicles as any)[key];
          if (column && value !== undefined) {
            return eq(column, value as any);
          }
          return null;
        })
        .filter(Boolean) as any[];

      // Automatically filter by accountId if provided
      if (accountId !== undefined) {
        conditions.push(eq(schema.vehicles.accountId, accountId));
      }

      if (conditions.length === 0) {
        throw new NotFoundException('No search criteria provided');
      }

      const [vehicle] = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(1);

      if (!vehicle) {
        throw new NotFoundException(`Vehicle not found with criteria: ${JSON.stringify(requestData)}`);
      }
      return vehicle as Vehicle;
    } catch (error: any) {
      this.logger.error(`Failed to find vehicle by criteria: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to find vehicle: ${error?.message || 'Unknown error occurred'}`,
      );
    }
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

    if (!token || !accId || !subId) {
      throw new UnauthorizedException(
        'Unauthorized. Please make sure you are logged in correctly',
      );
    }

    if (!vehicleId) {
      throw new NotFoundException(`Invalid vehicle ID: ${vehicleId}`);
    }

    try {
      return await this.vehiclesSyncService.syncVehicleByVehicleId(token, accId, subId, vehicleId);
    } catch (error: any) {
      this.logger.error(`Failed to sync vehicle by vehicleId=${vehicleId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new InternalServerErrorException(
        `Failed to sync vehicle: ${error?.message || 'Unknown error occurred'}`,
      );
    }
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

    if (!token || !accId || !subId) {
      throw new UnauthorizedException(
        'Unauthorized. Please make sure you are logged in correctly',
      );
    }

    if (!vehicleId) {
      throw new NotFoundException(`Invalid vehicle ID: ${vehicleId}`);
    }

    try {
      const vehicle = await this.malambiApi.getVehicleDetail(token, accId, subId, vehicleId);
      if (!vehicle) {
        throw new NotFoundException(`Vehicle with ID ${vehicleId} not found from Malambi API`);
      }
      return vehicle;
    } catch (error: any) {
      this.logger.error(`Failed to get vehicle from API with vehicleId=${vehicleId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) throw error;
      throw new InternalServerErrorException(
        `Failed to get vehicle from API: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  /**
   * Override BaseService.remove to handle number IDs (serial) instead of string IDs (UUID)
   */
  async remove(id: number | string, accountId?: number): Promise<Vehicle> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (!numericId || isNaN(numericId)) {
      throw new NotFoundException(`Invalid vehicle ID: ${id}`);
    }

    try {
      // First check if vehicle exists and belongs to the account
      const vehicle = await this.findOneById(numericId, { accountId });
      
      // Delete the vehicle
      const whereConditions: SQL[] = [eq(schema.vehicles.id, numericId)];
      if (accountId !== undefined) {
        whereConditions.push(eq(schema.vehicles.accountId, accountId));
      }

      await this.dbConnection
        .delete(schema.vehicles)
        .where(and(...whereConditions));

      return vehicle;
    } catch (error: any) {
      this.logger.error(`Failed to remove vehicle with id=${numericId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to remove vehicle: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }
}

