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

      // Automatically filter by accountId if provided (mandatory for multi-tenant isolation)
      if (options?.accountId !== undefined) {
        try {
          const accountIdColumn = schema.vehicles.accountId;
          if (accountIdColumn) {
            conditions.push(eq(accountIdColumn, options.accountId));
          } else {
            this.logger.warn('accountId column not found in vehicles schema, skipping accountId filter');
          }
        } catch (error) {
          this.logger.warn('Failed to access accountId column, skipping accountId filter:', error);
        }
      }

      // Add search functionality
      if (query.search && query.searchBy && query.searchBy.length > 0) {
        const searchConditions = query.searchBy
          .map((field) => {
            try {
              const column = (schema.vehicles as any)[field];
              // Check if column exists and is a valid Drizzle column object
              if (!column) {
                return null;
              }
              if (typeof column !== 'object') {
                return null;
              }
              // Check for Drizzle column properties
              if (!column.name && !column.columnType && !column.dataType) {
                return null;
              }
              return sql`${column}::text ILIKE ${`%${query.search}%`}`;
            } catch (error) {
              // If column access fails, skip this field
              return null;
            }
          })
          .filter((condition): condition is SQL => condition !== null);

        if (searchConditions.length > 0) {
          conditions.push(sql`(${sql.join(searchConditions, sql` OR `)})`);
        }
      }

      // Build order by
      let orderByClause: any;
      if (query.sortBy && query.sortBy.length > 0) {
        const sortFields = query.sortBy
          .map(([field, direction]) => {
            try {
              const column = (schema.vehicles as any)[field];
              // Check if column exists and is a valid Drizzle column object
              if (!column) {
                return null;
              }
              if (typeof column !== 'object') {
                return null;
              }
              // Check for Drizzle column properties
              if (!column.name && !column.columnType && !column.dataType) {
                return null;
              }
              return direction === 'DESC' ? desc(column) : asc(column);
            } catch (error) {
              // If column access fails, skip this field
              return null;
            }
          })
          .filter((field): field is any => field !== null);

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
      let total: number;
      try {
        const [{ count: totalCount }] = await this.dbConnection
          .select({ count: count() })
          .from(schema.vehicles)
          .where(whereClause);
        total = totalCount;
      } catch (countError: any) {
        // If count fails due to missing account_id, retry without it
        const errorMessage = countError instanceof Error ? countError.message : String(countError);
        const errorCode = countError?.code;
        const errorString = String(errorMessage).toLowerCase();
        
        const isAccountIdError = 
          (errorCode === '42703') ||
          errorString.includes('account_id') ||
          (errorString.includes('column') && errorString.includes('does not exist') && errorString.includes('account'));
        
        if (isAccountIdError) {
          this.logger.warn('account_id column missing during count, counting without accountId filter');
          const fallbackConditions = conditions.filter((c: any) => {
            try {
              const conditionStr = JSON.stringify(c);
              return !conditionStr.includes('account_id');
            } catch {
              return true;
            }
          });
          const fallbackWhereClause = fallbackConditions.length > 0 ? and(...fallbackConditions) : undefined;
          const [{ count: totalCount }] = await this.dbConnection
            .select({ count: count() })
            .from(schema.vehicles)
            .where(fallbackWhereClause);
          total = totalCount;
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
        let data: any[] = [];
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
          try {
            data = await this.dbConnection
              .select()
              .from(schema.vehicles)
              .where(whereClause)
              .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
              .limit(limit)
              .offset(offset);
          } catch (selectError: any) {
            // Extract error details - Drizzle wraps PostgreSQL errors
            const errorMessage = selectError instanceof Error ? selectError.message : String(selectError);
            const errorCode = selectError?.code;
            const errorStack = selectError instanceof Error ? selectError.stack : '';
            
            // Try to get the underlying PostgreSQL error
            // Drizzle errors may have cause, originalError, or the error itself may be the PG error
            const pgError = selectError?.cause || selectError?.originalError || selectError;
            const pgErrorMessage = pgError instanceof Error ? pgError.message : String(pgError);
            const pgErrorCode = pgError?.code;
            const pgErrorString = String(pgErrorMessage).toLowerCase();
            
            // Log full error details for debugging
            this.logger.error(`Failed to fetch vehicles: ${errorMessage}`);
            if (pgErrorMessage !== errorMessage && pgErrorMessage) {
              this.logger.error(`PostgreSQL error: ${pgErrorMessage}`);
            }
            if (pgErrorCode) {
              this.logger.error(`PostgreSQL error code: ${pgErrorCode}`);
            }
            this.logger.error(`Stack trace:`, errorStack);
            
            // Check if error is due to missing account_id column
            const isAccountIdError = 
              (pgErrorCode === '42703') ||
              (errorCode === '42703') ||
              pgErrorString.includes('account_id') ||
              errorMessage?.toLowerCase().includes('account_id') ||
              (pgErrorString.includes('column') && pgErrorString.includes('does not exist') && pgErrorString.includes('account'));
            
            if (isAccountIdError) {
              // Retry without account_id filter
              this.logger.warn('account_id column missing in vehicles table, retrying without accountId filter. Run migrations to add account_id column.');
              try {
                // Remove account_id condition from conditions array
                const fallbackConditions = conditions.filter((c: any) => {
                  try {
                    // Check if this condition uses account_id by examining the SQL or column name
                    const conditionStr = JSON.stringify(c);
                    if (conditionStr.includes('account_id')) {
                      return false;
                    }
                    // Also check if it's an eq condition with accountId column
                    if (c && typeof c === 'object') {
                      // Check various ways the condition might reference account_id
                      if (c.left?.name === 'account_id' || c.column?.name === 'account_id') {
                        return false;
                      }
                    }
                    return true;
                  } catch {
                    return true;
                  }
                });
                const fallbackWhereClause = fallbackConditions.length > 0 ? and(...fallbackConditions) : undefined;
                
                // Also need to update total count without account_id filter
                const [{ count: fallbackTotal }] = await this.dbConnection
                  .select({ count: count() })
                  .from(schema.vehicles)
                  .where(fallbackWhereClause);
                total = fallbackTotal;
                
                data = await this.dbConnection
                  .select()
                  .from(schema.vehicles)
                  .where(fallbackWhereClause)
                  .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
                  .limit(limit)
                  .offset(offset);
                
                this.logger.warn(`Successfully fetched vehicles without accountId filter (total: ${total})`);
              } catch (fallbackError: any) {
                const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                const fallbackPgError = fallbackError?.cause || fallbackError?.originalError || fallbackError;
                const fallbackPgMessage = fallbackPgError instanceof Error ? fallbackPgError.message : String(fallbackPgError);
                
                this.logger.error(`Fallback query also failed: ${fallbackMessage}`);
                if (fallbackPgMessage !== fallbackMessage && fallbackPgMessage) {
                  this.logger.error(`Fallback PostgreSQL error: ${fallbackPgMessage}`);
                }
                // Re-throw with more context
                throw new Error(
                  `Failed to fetch vehicles: ${pgErrorMessage || errorMessage}. ` +
                  `Fallback query also failed: ${fallbackPgMessage || fallbackMessage}. ` +
                  `Please check database schema and run migrations.`
                );
              }
            } else {
              // Check if it's a general column error
              const isColumnError = 
                (pgErrorCode === '42703') ||
                (errorCode === '42703') ||
                (pgErrorString.includes('column') && pgErrorString.includes('does not exist'));
              
              if (isColumnError) {
                throw new Error(
                  `Database column error: ${pgErrorMessage || errorMessage}. ` +
                  `This usually means migrations haven't completed. ` +
                  `Please run migrations: npm run migrate or node scripts/run-migrations.js`
                );
              }
              throw selectError;
            }
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
      // Check if error is due to Symbol error (undefined column access)
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorString = String(error).toLowerCase();
      const errorStack = error instanceof Error ? error.stack : '';
      
      const isSymbolError = 
        errorMessage?.includes('Symbol(drizzle:Name)') ||
        errorMessage?.includes('Cannot read properties of undefined') ||
        errorString.includes('symbol') ||
        (errorStack && errorStack.includes('Symbol(drizzle:Name)'));
      
      if (isSymbolError) {
        this.logger.error(
          `Drizzle column access error in VehiclesService.findAll - likely using undefined column. ` +
          `Error: ${errorMessage}`
        );
        throw new InternalServerErrorException(
          `Invalid column reference in query. Please check that searchBy and sortBy fields exist in the vehicles schema. ` +
          `Error: ${errorMessage}`
        );
      }
      
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
          try {
            const column = (schema.vehicles as any)[key];
            // Check if column exists and is a valid Drizzle column object
            if (!column) {
              this.logger.warn(`Column ${key} not found in vehicles schema, skipping`);
              return null;
            }
            
            // Verify it's actually a Drizzle column object
            if (typeof column !== 'object') {
              this.logger.warn(`Column ${key} is not a valid Drizzle column object, skipping`);
              return null;
            }
            
            // Check for Drizzle column properties - columns have a name property
            if (!column.name && !column.columnType && !column.dataType) {
              this.logger.warn(`Column ${key} does not have required Drizzle column properties, skipping`);
              return null;
            }
            
            if (value !== undefined && value !== null) {
              return eq(column, value as any);
            }
            return null;
          } catch (colError) {
            // If column access fails, skip this field
            this.logger.warn(`Failed to access column ${key}, skipping:`, colError);
            return null;
          }
        })
        .filter(Boolean) as any[];

      // Automatically filter by accountId if provided
      if (accountId !== undefined) {
        try {
          // Check if accountId column exists before using it
          const accountIdColumn = schema.vehicles.accountId;
          if (accountIdColumn) {
            conditions.push(eq(accountIdColumn, accountId));
          } else {
            this.logger.warn('accountId column not found in vehicles schema, skipping accountId filter');
          }
        } catch (error) {
          this.logger.warn('Failed to access accountId column, skipping accountId filter:', error);
        }
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
      // Check if error is due to Symbol error or missing columns
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorString = String(error).toLowerCase();
      const errorStack = error instanceof Error ? error.stack : '';
      const errorCode = error?.code;
      
      const isSymbolError = 
        errorMessage?.includes('Symbol(drizzle:Name)') ||
        errorMessage?.includes('Cannot read properties of undefined') ||
        errorString.includes('symbol') ||
        (errorStack && errorStack.includes('Symbol(drizzle:Name)'));
      
      const isAccountIdError = 
        (errorCode === '42703') ||
        errorMessage?.toLowerCase().includes('account_id') ||
        errorString.includes('account_id') ||
        (errorMessage?.includes('column') && errorMessage?.includes('account_id'));
      
      // If Symbol error or accountId error, retry without accountId filter
      if ((isSymbolError || isAccountIdError) && accountId !== undefined) {
        this.logger.warn(
          `account_id column missing or Symbol error during findOneBy (accountId=${accountId}). ` +
          `Falling back to query without accountId filter. Run migrations to add account_id column.`
        );
        try {
          // Retry without accountId
          const fallbackOptions = { ...options };
          delete fallbackOptions.accountId;
          return await this.findOneBy(requestData, fallbackOptions);
        } catch (fallbackError) {
          // If fallback also fails, throw original error
          this.logger.error(`Fallback query also failed: ${fallbackError?.message || 'Unknown error'}`);
          throw error;
        }
      }
      
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

