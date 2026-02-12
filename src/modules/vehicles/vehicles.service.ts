import { Injectable, Inject, NotFoundException, Logger, InternalServerErrorException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { VehiclesSyncService } from './vehicles-sync.service';
import { MalambiApiService } from '@integrations/malambi-api/malambi-api.service';
import { PaginateQuery, PaginateResult, BaseEntity } from '@common/interfaces';
import { BaseService } from '@common/services/base.service';
import { eq, and, SQL, desc, asc, count, sql, inArray } from 'drizzle-orm';
import * as schema from '@modules/schemas';
import { VehicleGroupDto, VehicleDto } from './dto/vehicle-group.dto';
import { UpdateVehicleStatusDto, VehicleStatus } from './dto';
import { QrCodeService } from './qr-code.service';
import { EncryptionService } from '@common/services/encryption.service';
import * as QRCode from 'qrcode';

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
    private readonly qrCodeService: QrCodeService,
    private readonly encryptionService: EncryptionService,
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
          if (options.include.includes('qrCodes')) {
            withRelations.qrCode = true;
          }
          if (options.include.includes('group')) {
            withRelations.group = true;
          }
        }

        // Get paginated results with relations
        let data: any[] = [];
        let useStandardQuery = Object.keys(withRelations).length === 0;
        
        if (Object.keys(withRelations).length > 0) {
          try {
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
          } catch (relError: any) {
            // If relational query fails due to missing columns, fall back to standard query
            const relErrorMessage = relError instanceof Error ? relError.message : String(relError);
            const relPgError = relError?.cause || relError?.originalError || relError;
            const relPgMessage = relPgError instanceof Error ? relPgError.message : String(relPgError);
            const relPgString = String(relPgMessage).toLowerCase();
            
            const isRelColumnError = 
              (relPgString.includes('column') && relPgString.includes('does not exist')) ||
              relPgString.includes('qr_code') || relPgString.includes('account_id');
            
            if (isRelColumnError) {
              this.logger.warn('Relational query failed due to missing columns, falling back to standard query');
              useStandardQuery = true;
            } else {
              throw relError;
            }
          }
        }
        
        // Use standard query when no relations or relational query failed
        if (useStandardQuery) {
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
            
            // Check if error is due to missing columns (account_id, qr_code, etc.)
            const isAccountIdError = 
              (pgErrorCode === '42703') ||
              (errorCode === '42703') ||
              pgErrorString.includes('account_id') ||
              errorMessage?.toLowerCase().includes('account_id') ||
              (pgErrorString.includes('column') && pgErrorString.includes('does not exist') && pgErrorString.includes('account'));
            
            const isQrCodeError = 
              (pgErrorCode === '42703') ||
              (errorCode === '42703') ||
              pgErrorString.includes('qr_code') ||
              errorMessage?.toLowerCase().includes('qr_code') ||
              (pgErrorString.includes('column') && pgErrorString.includes('does not exist') && pgErrorString.includes('qr'));
            
            const isColumnError = 
              (pgErrorCode === '42703') ||
              (errorCode === '42703') ||
              (pgErrorString.includes('column') && pgErrorString.includes('does not exist'));
            
            if (isAccountIdError || isQrCodeError || isColumnError) {
              // Retry with explicit column selection excluding problematic columns
              const missingColumns: string[] = [];
              if (isAccountIdError) missingColumns.push('account_id');
              if (isQrCodeError) missingColumns.push('qr_code');
              
              this.logger.warn(
                `Missing columns in vehicles table (${missingColumns.join(', ')}), retrying with explicit column selection. Run migrations to add missing columns.`
              );
              
              try {
                // Remove account_id condition from conditions array if account_id is missing
                let fallbackConditions = conditions;
                if (isAccountIdError) {
                  fallbackConditions = conditions.filter((c: any) => {
                    try {
                      const conditionStr = JSON.stringify(c);
                      if (conditionStr.includes('account_id')) {
                        return false;
                      }
                      if (c && typeof c === 'object') {
                        if (c.left?.name === 'account_id' || c.column?.name === 'account_id') {
                          return false;
                        }
                      }
                      return true;
                    } catch {
                      return true;
                    }
                  });
                }
                
                const fallbackWhereClause = fallbackConditions.length > 0 ? and(...fallbackConditions) : undefined;
                
                // Build explicit select excluding problematic columns
                const selectColumns: any = {
                  id: schema.vehicles.id,
                  createdAt: schema.vehicles.createdAt,
                  updatedAt: schema.vehicles.updatedAt,
                  thirdPartyId: schema.vehicles.thirdPartyId,
                  plate: schema.vehicles.plate,
                  model: schema.vehicles.model,
                  brand: schema.vehicles.brand,
                  year: schema.vehicles.year,
                  tag2: schema.vehicles.tag2,
                  groupId: schema.vehicles.groupId,
                  isActive: schema.vehicles.isActive,
                  lastSyncedAt: schema.vehicles.lastSyncedAt,
                };
                
                // Only include accountId if it exists
                if (!isAccountIdError && schema.vehicles.accountId) {
                  selectColumns.accountId = schema.vehicles.accountId;
                }
                
                // qrCode is now in qr_codes table; use include=qrCodes to get it
                
                // Update total count
                const [{ count: fallbackTotal }] = await this.dbConnection
                  .select({ count: count() })
                  .from(schema.vehicles)
                  .where(fallbackWhereClause);
                total = fallbackTotal;
                
                // Fetch data with explicit column selection
                data = await this.dbConnection
                  .select(selectColumns)
                  .from(schema.vehicles)
                  .where(fallbackWhereClause)
                  .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
                  .limit(limit)
                  .offset(offset);
                
                this.logger.warn(`Successfully fetched vehicles with explicit column selection (total: ${total}, excluded: ${missingColumns.join(', ')})`);
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
   * List vehicle groups from Malambi API (tree structure, optionally for a given node)
   * Supports pagination, filtering, and searching
   */
  async listVehicleGroups(
    token: string,
    accId: string,
    subId: string,
    node = 'root',
    query?: PaginateQuery,
  ): Promise<VehicleGroupDto[] | PaginateResult<VehicleGroupDto>> {
    if (!token || !accId || !subId) {
      throw new UnauthorizedException(
        'Unauthorized. Please make sure you are logged in correctly',
      );
    }

    try {
      // Fetch all groups from API
      const allGroups = await this.malambiApi.listVehicleGroups(token, accId, subId, node);

      // If no pagination/filtering requested, return as-is
      if (!query || (!query.search && !query.page && !query.limit && !query.sortBy)) {
        return allGroups;
      }

      // Apply filtering and searching
      let filteredGroups = [...allGroups];

      // Apply search if provided
      if (query.search && query.searchBy && query.searchBy.length > 0) {
        const searchTerm = query.search.toLowerCase();
        filteredGroups = filteredGroups.filter((group) => {
          return query.searchBy!.some((field) => {
            switch (field) {
              case 'groupName':
                return group.groupName?.toLowerCase().includes(searchTerm);
              case 'groupId':
                return group.groupId?.toString().includes(searchTerm);
              default:
                return false;
            }
          });
        });
      }

      // Apply sorting
      if (query.sortBy && query.sortBy.length > 0) {
        filteredGroups.sort((a, b) => {
          for (const [field, direction] of query.sortBy!) {
            let comparison = 0;
            switch (field) {
              case 'groupId':
                comparison = a.groupId - b.groupId;
                break;
              case 'groupName':
                comparison = (a.groupName || '').localeCompare(b.groupName || '');
                break;
              case 'total':
                comparison = a.total - b.total;
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
        // Default sort by groupName ASC
        filteredGroups.sort((a, b) => (a.groupName || '').localeCompare(b.groupName || ''));
      }

      // Calculate pagination
      const page = query.page || 1;
      const limit = query.limit || 100;
      const totalItems = filteredGroups.length;
      const totalPages = Math.ceil(totalItems / limit);
      const offset = (page - 1) * limit;
      const paginatedGroups = filteredGroups.slice(offset, offset + limit);

      // Build pagination result
      const result: PaginateResult<VehicleGroupDto> = {
        data: paginatedGroups,
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
        `Failed to list vehicle groups: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error instanceof UnauthorizedException) throw error;
      throw new InternalServerErrorException(
        `Failed to list vehicle groups: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  /**
   * Bulk sync vehicles from vehicle groups
   * Processes all vehicles from the groups and triggers background sync jobs for vehicles that don't exist
   */
  async bulkSyncVehiclesFromGroups(
    groups: VehicleGroupDto[],
    accountId: number,
  ) {
    if (!groups || groups.length === 0) {
      throw new BadRequestException('No groups provided for bulk sync');
    }

    if (!accountId || accountId <= 0) {
      throw new BadRequestException(`Invalid account ID: ${accountId}`);
    }

    try {
      return await this.vehiclesSyncService.bulkSyncVehiclesFromGroups(groups, accountId);
    } catch (error: any) {
      this.logger.error(
        `Failed to bulk sync vehicles from groups: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        `Failed to bulk sync vehicles: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  /**
   * Get all vehicle groups with their associated vehicles from the database
   * @param accountId - Account ID for multi-tenancy
   * @param options - Optional include relations (e.g., qrCodes)
   * @returns Array of groups with their vehicles
   */
  async getAllGroupsWithVehicles(
    accountId: number,
    options?: { include?: string[] },
  ): Promise<VehicleGroupDto[]> {
    if (!accountId || accountId <= 0) {
      throw new BadRequestException(`Invalid account ID: ${accountId}`);
    }

    try {
      // Query all groups for this account
      const groups = await this.dbConnection
        .select()
        .from(schema.vehicleGroups)
        .where(eq(schema.vehicleGroups.accountId, accountId))
        .orderBy(asc(schema.vehicleGroups.groupName));

      if (groups.length === 0) {
        return [];
      }

      // Get all group IDs
      const groupIds = groups.map((g) => g.id);

      // Query all vehicles for these groups
      const vehicles = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.accountId, accountId),
            inArray(schema.vehicles.groupId, groupIds),
          ),
        );

      // Fetch QR codes only if requested via include parameter
      const qrCodesMap = new Map<number, { qrCodeDataUrl: string; qrCodeString: string }>();
      const shouldIncludeQrCodes = options?.include?.includes('qrCodes');

      if (shouldIncludeQrCodes && vehicles.length > 0) {
        try {
          const vehicleThirdPartyIds = vehicles.map((v) => v.thirdPartyId);

          // Try to use Drizzle relational query API first (similar to findAll)
          try {
            const vehicleIds = vehicles.map((v) => v.id);
            const vehiclesWithQrCodes = await this.dbConnection.query.vehicles.findMany({
              where: (vehicles: any, { inArray: inArrayFn }: any) => inArrayFn(vehicles.id, vehicleIds),
              with: {
                qrCode: true,
              },
            });

            // Process QR codes from relation data
            for (const vehicleWithQrCode of vehiclesWithQrCodes) {
              if (vehicleWithQrCode.qrCode) {
                try {
                  // Decrypt QR code
                  let decryptedQrCode: string;
                  if (this.encryptionService.isEncrypted(vehicleWithQrCode.qrCode.qrCode)) {
                    decryptedQrCode = this.encryptionService.decrypt(vehicleWithQrCode.qrCode.qrCode);
                  } else {
                    decryptedQrCode = vehicleWithQrCode.qrCode.qrCode;
                  }

                  // Generate QR code data URL
                  const qrCodeDataUrl = await QRCode.toDataURL(decryptedQrCode, {
                    errorCorrectionLevel: 'M',
                    width: 300,
                    margin: 1,
                  });

                  qrCodesMap.set(vehicleWithQrCode.thirdPartyId, {
                    qrCodeDataUrl,
                    qrCodeString: decryptedQrCode,
                  });
                } catch (qrError) {
                  this.logger.warn(
                    `Failed to process QR code for vehicle ${vehicleWithQrCode.thirdPartyId}: ${qrError instanceof Error ? qrError.message : 'Unknown error'}`,
                  );
                }
              }
            }
          } catch (relError: any) {
            // Fallback to manual query if relational query fails
            this.logger.debug('Relational query failed, falling back to manual QR code fetch');
            const qrCodes = await this.dbConnection
              .select()
              .from(schema.qrCodes)
              .where(
                and(
                  eq(schema.qrCodes.accountId, accountId),
                  inArray(schema.qrCodes.vehicleThirdPartyId, vehicleThirdPartyIds),
                ),
              );

            // Process QR codes: decrypt and generate data URLs in bulk
            for (const qrCodeRecord of qrCodes) {
              try {
                // Decrypt QR code
                let decryptedQrCode: string;
                if (this.encryptionService.isEncrypted(qrCodeRecord.qrCode)) {
                  decryptedQrCode = this.encryptionService.decrypt(qrCodeRecord.qrCode);
                } else {
                  decryptedQrCode = qrCodeRecord.qrCode;
                }

                // Generate QR code data URL
                const qrCodeDataUrl = await QRCode.toDataURL(decryptedQrCode, {
                  errorCorrectionLevel: 'M',
                  width: 300,
                  margin: 1,
                });

                qrCodesMap.set(qrCodeRecord.vehicleThirdPartyId, {
                  qrCodeDataUrl,
                  qrCodeString: decryptedQrCode,
                });
              } catch (qrError) {
                this.logger.warn(
                  `Failed to process QR code for vehicle ${qrCodeRecord.vehicleThirdPartyId}: ${qrError instanceof Error ? qrError.message : 'Unknown error'}`,
                );
              }
            }
          }
        } catch (qrFetchError) {
          this.logger.warn(
            `Failed to fetch QR codes for vehicles: ${qrFetchError instanceof Error ? qrFetchError.message : 'Unknown error'}`,
          );
          // Continue without QR codes
        }
      }

      // Group vehicles by groupId
      const vehiclesByGroupId = new Map<number, typeof vehicles>();
      for (const vehicle of vehicles) {
        if (vehicle.groupId) {
          if (!vehiclesByGroupId.has(vehicle.groupId)) {
            vehiclesByGroupId.set(vehicle.groupId, []);
          }
          vehiclesByGroupId.get(vehicle.groupId)!.push(vehicle);
        }
      }

      // Transform to VehicleGroupDto format with QR codes
      return groups.map((group) => {
        const groupVehicles = vehiclesByGroupId.get(group.id) || [];
        return {
          groupId: group.groupId, // Malambi API group ID
          groupName: group.groupName,
          total: groupVehicles.length,
          vehicles: groupVehicles.map((vehicle): VehicleDto => {
            const qrCode = qrCodesMap.get(vehicle.thirdPartyId);
            return {
              id: vehicle.id, // Local database ID (serial integer)
              thirdPartyId: vehicle.thirdPartyId,
              accountId: vehicle.accountId,
              plate: vehicle.plate,
              model: vehicle.model ?? undefined,
              brand: vehicle.brand ?? undefined,
              year: vehicle.year ?? undefined,
              tag2: vehicle.tag2 ?? undefined,
              isActive: vehicle.isActive ?? undefined,
              lastSyncedAt: vehicle.lastSyncedAt ?? undefined,
              createdAt: vehicle.createdAt ?? undefined,
              updatedAt: vehicle.updatedAt ?? undefined,
              // Include QR codes only if requested
              ...(shouldIncludeQrCodes && qrCode
                ? {
                    qrCodeDataUrl: qrCode.qrCodeDataUrl,
                    qrCodeString: qrCode.qrCodeString,
                  }
                : {}),
              // Exclude groupId from vehicle response as requested
            };
          }),
        };
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to get groups with vehicles for accountId ${accountId}: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      throw new InternalServerErrorException(
        `Failed to get groups with vehicles: ${error?.message || 'Unknown error occurred'}`,
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

  /**
   * Delete a vehicle group by ID
   * @param id - The group's database ID (serial integer)
   * @param accountId - Account ID for multi-tenancy
   * @returns The deleted group
   */
  async removeGroup(id: number | string, accountId: number): Promise<typeof schema.vehicleGroups.$inferSelect> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (!numericId || isNaN(numericId)) {
      throw new NotFoundException(`Invalid group ID: ${id}`);
    }

    if (!accountId || accountId <= 0) {
      throw new BadRequestException(`Invalid account ID: ${accountId}`);
    }

    try {
      // First check if group exists and belongs to the account
      const [group] = await this.dbConnection
        .select()
        .from(schema.vehicleGroups)
        .where(
          and(
            eq(schema.vehicleGroups.id, numericId),
            eq(schema.vehicleGroups.accountId, accountId),
          ),
        )
        .limit(1);

      if (!group) {
        throw new NotFoundException(`Vehicle group with ID ${id} not found for this account`);
      }

      // Check if group has vehicles (optional: prevent deletion if vehicles exist)
      const [vehiclesCount] = await this.dbConnection
        .select({ count: count() })
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.groupId, numericId),
            eq(schema.vehicles.accountId, accountId),
          ),
        );

      if (vehiclesCount.count > 0) {
        // Set vehicles' groupId to null before deleting group (cascade behavior)
        await this.dbConnection
          .update(schema.vehicles)
          .set({ groupId: null })
          .where(
            and(
              eq(schema.vehicles.groupId, numericId),
              eq(schema.vehicles.accountId, accountId),
            ),
          )
          .execute();
      }

      // Delete the group
      await this.dbConnection
        .delete(schema.vehicleGroups)
        .where(
          and(
            eq(schema.vehicleGroups.id, numericId),
            eq(schema.vehicleGroups.accountId, accountId),
          ),
        )
        .execute();

      return group;
    } catch (error: any) {
      this.logger.error(`Failed to remove vehicle group with id=${numericId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        `Failed to remove vehicle group: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  /**
   * Update vehicle status and optionally center location
   * Automatically logs the change to vehicle_status_history
   * @param vehicleId - Vehicle ID (internal database ID or thirdPartyId)
   * @param updateDto - Status update data
   * @param accountId - Account ID for multi-tenancy
   * @param changedBy - User who made the change (accid)
   * @returns Updated vehicle
   */
  async updateVehicleStatus(
    vehicleId: number | string,
    updateDto: UpdateVehicleStatusDto,
    accountId: number,
    changedBy?: string,
  ): Promise<Vehicle> {
    const numericId = typeof vehicleId === 'string' ? Number(vehicleId) : vehicleId;

    if (!numericId || isNaN(numericId)) {
      throw new NotFoundException(`Invalid vehicle ID: ${vehicleId}`);
    }

    if (!accountId || accountId <= 0) {
      throw new BadRequestException(`Invalid account ID: ${accountId}`);
    }

    try {
      // First, find the vehicle - try by internal ID first, then by thirdPartyId
      let vehicle: any;
      const [vehicleById] = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.id, numericId),
            eq(schema.vehicles.accountId, accountId),
          ),
        )
        .limit(1);

      if (vehicleById) {
        vehicle = vehicleById;
      } else {
        // Try by thirdPartyId
        const [vehicleByThirdPartyId] = await this.dbConnection
          .select()
          .from(schema.vehicles)
          .where(
            and(
              eq(schema.vehicles.thirdPartyId, numericId),
              eq(schema.vehicles.accountId, accountId),
            ),
          )
          .limit(1);

        if (!vehicleByThirdPartyId) {
          throw new NotFoundException(`Vehicle with ID ${vehicleId} not found for this account`);
        }
        vehicle = vehicleByThirdPartyId;
      }

      // Validate center if provided
      let centerIdToSet: number | null = null;
      if (updateDto.centerId !== undefined && updateDto.centerId !== null) {
        // Verify center exists and belongs to account
        const [center] = await this.dbConnection
          .select()
          .from(schema.centers)
          .where(
            and(
              eq(schema.centers.id, updateDto.centerId),
              eq(schema.centers.accountId, accountId),
            ),
          )
          .limit(1);

        if (!center) {
          throw new NotFoundException(`Center with ID ${updateDto.centerId} not found for this account`);
        }

        centerIdToSet = updateDto.centerId;
      } else {
        // For statuses that require a center, throw error if not provided
        if (
          updateDto.status === VehicleStatus.AT_CENTER ||
          updateDto.status === VehicleStatus.IN_PROCESSING ||
          updateDto.status === VehicleStatus.IN_GARAGE
        ) {
          throw new BadRequestException(
            `Center ID is required for status: ${updateDto.status}`,
          );
        }
        // For in_transit and available, center can be null
        if (updateDto.status === VehicleStatus.IN_TRANSIT || updateDto.status === VehicleStatus.AVAILABLE) {
          centerIdToSet = null;
        }
      }

      // Check if status is actually changing
      const statusChanged = vehicle.currentStatus !== updateDto.status;
      const centerChanged = vehicle.currentCenterId !== centerIdToSet;

      if (!statusChanged && !centerChanged) {
        // No change, return current vehicle
        this.logger.log(`Vehicle ${vehicle.id} status and center unchanged, skipping update`);
        return vehicle as Vehicle;
      }

      // Update vehicle status and center
      const [updatedVehicle] = await this.dbConnection
        .update(schema.vehicles)
        .set({
          currentStatus: updateDto.status,
          currentCenterId: centerIdToSet,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.vehicles.id, vehicle.id),
            eq(schema.vehicles.accountId, accountId),
          ),
        )
        .returning();

      // Log status change to history
      await this.logStatusChange(
        vehicle.id,
        updateDto.status,
        centerIdToSet,
        accountId,
        changedBy,
        updateDto.notes,
      );

      this.logger.log(
        `Vehicle ${vehicle.id} status updated: ${vehicle.currentStatus} -> ${updateDto.status}, center: ${vehicle.currentCenterId} -> ${centerIdToSet}`,
      );

      return updatedVehicle as Vehicle;
    } catch (error: any) {
      this.logger.error(
        `Failed to update vehicle status for id=${vehicleId}: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        `Failed to update vehicle status: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  /**
   * Get vehicle status history
   * @param vehicleId - Vehicle ID (internal database ID or thirdPartyId)
   * @param accountId - Account ID for multi-tenancy
   * @param limit - Maximum number of history records to return (default: 100)
   * @returns Array of status history records
   */
  async getVehicleStatusHistory(
    vehicleId: number | string,
    accountId: number,
    limit: number = 100,
  ): Promise<Array<typeof schema.vehicleStatusHistory.$inferSelect>> {
    const numericId = typeof vehicleId === 'string' ? Number(vehicleId) : vehicleId;

    if (!numericId || isNaN(numericId)) {
      throw new NotFoundException(`Invalid vehicle ID: ${vehicleId}`);
    }

    if (!accountId || accountId <= 0) {
      throw new BadRequestException(`Invalid account ID: ${accountId}`);
    }

    try {
      // First, find the vehicle to get its internal ID
      let vehicle: any;
      const [vehicleById] = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.id, numericId),
            eq(schema.vehicles.accountId, accountId),
          ),
        )
        .limit(1);

      if (vehicleById) {
        vehicle = vehicleById;
      } else {
        // Try by thirdPartyId
        const [vehicleByThirdPartyId] = await this.dbConnection
          .select()
          .from(schema.vehicles)
          .where(
            and(
              eq(schema.vehicles.thirdPartyId, numericId),
              eq(schema.vehicles.accountId, accountId),
            ),
          )
          .limit(1);

        if (!vehicleByThirdPartyId) {
          throw new NotFoundException(`Vehicle with ID ${vehicleId} not found for this account`);
        }
        vehicle = vehicleByThirdPartyId;
      }

      // Get status history
      const history = await this.dbConnection
        .select()
        .from(schema.vehicleStatusHistory)
        .where(
          and(
            eq(schema.vehicleStatusHistory.vehicleId, vehicle.id),
            eq(schema.vehicleStatusHistory.accountId, accountId),
          ),
        )
        .orderBy(desc(schema.vehicleStatusHistory.changedAt))
        .limit(limit);

      return history;
    } catch (error: any) {
      this.logger.error(
        `Failed to get vehicle status history for id=${vehicleId}: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        `Failed to get vehicle status history: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  /**
   * Get vehicles by status
   * Useful for dashboard queries
   * @param status - Vehicle status to filter by
   * @param accountId - Account ID for multi-tenancy
   * @param options - Optional include relations
   * @returns Array of vehicles with the specified status
   */
  async getVehiclesByStatus(
    status: VehicleStatus,
    accountId: number,
    options?: { include?: string[] },
  ): Promise<Vehicle[]> {
    if (!accountId || accountId <= 0) {
      throw new BadRequestException(`Invalid account ID: ${accountId}`);
    }

    try {
      const conditions: SQL[] = [
        eq(schema.vehicles.accountId, accountId),
        eq(schema.vehicles.currentStatus, status),
      ];

      const vehicles = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(and(...conditions))
        .orderBy(asc(schema.vehicles.plate));

      return vehicles as Vehicle[];
    } catch (error: any) {
      this.logger.error(
        `Failed to get vehicles by status ${status}: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      throw new InternalServerErrorException(
        `Failed to get vehicles by status: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  /**
   * Get vehicles by center
   * Useful for dashboard queries showing vehicles at a specific center
   * @param centerId - Center ID (internal database ID)
   * @param accountId - Account ID for multi-tenancy
   * @param options - Optional include relations
   * @returns Array of vehicles at the specified center
   */
  async getVehiclesByCenter(
    centerId: number,
    accountId: number,
    options?: { include?: string[] },
  ): Promise<Vehicle[]> {
    if (!accountId || accountId <= 0) {
      throw new BadRequestException(`Invalid account ID: ${accountId}`);
    }

    if (!centerId || centerId <= 0) {
      throw new BadRequestException(`Invalid center ID: ${centerId}`);
    }

    try {
      // Verify center exists and belongs to account
      const [center] = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(
          and(
            eq(schema.centers.id, centerId),
            eq(schema.centers.accountId, accountId),
          ),
        )
        .limit(1);

      if (!center) {
        throw new NotFoundException(`Center with ID ${centerId} not found for this account`);
      }

      const conditions: SQL[] = [
        eq(schema.vehicles.accountId, accountId),
        eq(schema.vehicles.currentCenterId, centerId),
      ];

      const vehicles = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(and(...conditions))
        .orderBy(asc(schema.vehicles.plate));

      return vehicles as Vehicle[];
    } catch (error: any) {
      this.logger.error(
        `Failed to get vehicles by center ${centerId}: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        `Failed to get vehicles by center: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  /**
   * Get vehicles grouped by status
   * Useful for dashboard summary
   * @param accountId - Account ID for multi-tenancy
   * @returns Object with status as keys and vehicle counts as values
   */
  async getVehiclesByStatusSummary(accountId: number): Promise<Record<VehicleStatus, number>> {
    if (!accountId || accountId <= 0) {
      throw new BadRequestException(`Invalid account ID: ${accountId}`);
    }

    try {
      const vehicles = await this.dbConnection
        .select({
          status: schema.vehicles.currentStatus,
          count: count(),
        })
        .from(schema.vehicles)
        .where(eq(schema.vehicles.accountId, accountId))
        .groupBy(schema.vehicles.currentStatus);

      // Initialize all statuses with 0
      const summary: Record<VehicleStatus, number> = {
        [VehicleStatus.AVAILABLE]: 0,
        [VehicleStatus.IN_GARAGE]: 0,
        [VehicleStatus.IN_TRANSIT]: 0,
        [VehicleStatus.IN_PROCESSING]: 0,
        [VehicleStatus.AT_CENTER]: 0,
        [VehicleStatus.UNAVAILABLE]: 0,
      };

      // Fill in actual counts
      vehicles.forEach((item: any) => {
        if (item.status && Object.values(VehicleStatus).includes(item.status as VehicleStatus)) {
          summary[item.status as VehicleStatus] = Number(item.count || 0);
        }
      });

      return summary;
    } catch (error: any) {
      this.logger.error(
        `Failed to get vehicles by status summary: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      throw new InternalServerErrorException(
        `Failed to get vehicles by status summary: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  /**
   * Helper method to log status changes to vehicle_status_history
   * @private
   */
  private async logStatusChange(
    vehicleId: number,
    status: VehicleStatus,
    centerId: number | null,
    accountId: number,
    changedBy?: string,
    notes?: string,
  ): Promise<void> {
    try {
      await this.dbConnection
        .insert(schema.vehicleStatusHistory)
        .values({
          vehicleId,
          status,
          centerId,
          accountId,
          changedBy: changedBy || null,
          notes: notes || null,
          changedAt: new Date(),
        });
    } catch (error: any) {
      // Log error but don't fail the status update
      this.logger.error(
        `Failed to log status change for vehicle ${vehicleId}: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
    }
  }
}

