import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { eq, and, isNull, SQL, desc, asc, count, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '@database/database-connection';
import {
  PaginateQuery,
  PaginateResult,
  BaseEntity,
  TableWithBaseColumns,
} from '@common/interfaces';

type DrizzleDatabase = ReturnType<typeof import('drizzle-orm/postgres-js').drizzle>;

@Injectable()
export class BaseService<T extends BaseEntity> {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDatabase,
    private readonly table: TableWithBaseColumns,
  ) {}

  /**
   * Check if the table has an accountId column
   */
  private hasAccountIdColumn(): boolean {
    const accountIdColumn = (this.table as any).accountId;
    return accountIdColumn !== undefined && accountIdColumn !== null;
  }

  /**
   * Get the accountId column from the table
   * Throws error if column doesn't exist (accountId is mandatory)
   */
  private getAccountIdColumn(): any {
    const accountIdColumn = (this.table as any).accountId;
    if (!accountIdColumn) {
      throw new Error(`accountId column not found in table. Run migrations to add account_id column.`);
    }
    return accountIdColumn;
  }

  async create(
    data: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
    accountId?: number,
  ): Promise<T> {
    const insertData: any = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Automatically add accountId if the table has the column and accountId is provided
    if (this.hasAccountIdColumn() && accountId !== undefined) {
      insertData.accountId = accountId;
    }

    const [entity] = await this.db
      .insert(this.table)
      .values(insertData)
      .returning();
    return entity as unknown as T;
  }

  async findAll(
    query: PaginateQuery = {},
    options?: { accountId?: number; [key: string]: any },
  ): Promise<PaginateResult<T>> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions: SQL[] = [isNull(this.table.deletedAt)];
    let useAccountIdFilter = false;

    // Automatically filter by accountId if the table has the column and accountId is provided
    if (this.hasAccountIdColumn() && options?.accountId !== undefined) {
      try {
        const accountIdColumn = this.getAccountIdColumn();
        if (accountIdColumn) {
          conditions.push(eq(accountIdColumn, options.accountId));
          useAccountIdFilter = true;
        }
      } catch (error) {
        // If accountId column doesn't exist, log warning but don't fail
        // This should not happen if migrations ran, but handle gracefully
        console.warn('accountId column not found, skipping accountId filter:', error);
      }
    }

    // Add search functionality
    if (query.search && query.searchBy && query.searchBy.length > 0) {
      const searchConditions = query.searchBy
        .map((field) => {
          try {
            const column = (this.table as any)[field];
            // Check if column exists and is a valid Drizzle column object
            // Drizzle columns have a Symbol(drizzle:Name) property, so we check for that
            if (!column) {
              return null;
            }
            // Verify it's actually a Drizzle column object
            if (typeof column !== 'object') {
              return null;
            }
            // Check for Drizzle column properties - columns have a name property
            if (!column.name) {
              return null;
            }
            // Additional safety check: try to access the column to ensure it's valid
            // If accessing the column throws or returns undefined, skip it
            try {
              // Use the column in a safe way - if it's invalid, this will fail gracefully
              return sql`${column}::text ILIKE ${`%${query.search}%`}`;
            } catch (colError) {
              // If column is invalid, skip it
              return null;
            }
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
            const column = (this.table as any)[field];
            // Check if column exists and is a valid Drizzle column object
            if (!column) {
              return null;
            }
            // Verify it's actually a Drizzle column object
            if (typeof column !== 'object') {
              return null;
            }
            // Check for Drizzle column properties - columns have a name property
            if (!column.name) {
              return null;
            }
            // Additional safety check: try to create the orderBy clause
            // If the column is invalid, this will fail gracefully
            try {
              return direction === 'DESC' ? desc(column) : asc(column);
            } catch (colError) {
              // If column is invalid, skip it
              return null;
            }
          } catch (error) {
            // If column access fails, skip this field
            return null;
          }
        })
        .filter((field): field is any => field !== null);

      if (sortFields.length > 0) {
        orderByClause = sortFields.length === 1 ? sortFields[0] : sortFields;
      }
    }

    try {
      // Ensure conditions array is valid (not empty or containing invalid SQL)
      const validConditions = conditions.filter((c): c is SQL => c !== null && c !== undefined);
      
      // Get total count
      const whereClause = validConditions.length > 0 ? and(...validConditions) : undefined;
      const [{ count: totalItems }] = await this.db
        .select({ count: count() })
        .from(this.table)
        .where(whereClause);

      // Get paginated data
      // Note: Drizzle's .select() includes all schema columns, which may not exist in DB yet
      // If email/role columns don't exist, we'll catch the error and retry with explicit columns
      let queryBuilder = this.db
        .select()
        .from(this.table)
        .where(whereClause)
        .limit(limit)
        .offset(offset);

      if (orderByClause) {
        // Handle both single orderBy and array of orderBy clauses
        try {
          if (Array.isArray(orderByClause)) {
            queryBuilder = queryBuilder.orderBy(...orderByClause) as any;
          } else {
            queryBuilder = queryBuilder.orderBy(orderByClause) as any;
          }
        } catch (orderError) {
          // If ordering fails, log and continue without ordering
          console.warn('Failed to apply orderBy clause:', orderError);
        }
      } else {
        // Default ordering by createdAt DESC if available, otherwise by id
        try {
          if (this.table.createdAt) {
            queryBuilder = queryBuilder.orderBy(desc(this.table.createdAt)) as any;
          } else if ((this.table as any).id) {
            queryBuilder = queryBuilder.orderBy(desc((this.table as any).id)) as any;
          }
        } catch (error) {
          // If default ordering fails, continue without ordering
        }
      }

      let data;
      try {
        data = await queryBuilder;
      } catch (selectError: any) {
        // Check if error is due to missing columns (common during migration)
        const errorMessage = selectError instanceof Error ? selectError.message : String(selectError);
        const isColumnError = 
          errorMessage?.toLowerCase().includes('column') && 
          (errorMessage?.toLowerCase().includes('does not exist') || 
           errorMessage?.toLowerCase().includes('doesn\'t exist'));
        
        if (isColumnError) {
          // This is a column missing error - log and rethrow with helpful message
          // Specific services (like UsersService) should handle this with explicit column selection
          console.warn(`Column missing error in BaseService.findAll: ${errorMessage}`);
          console.warn('This usually means migrations haven\'t completed. The specific service should handle this with explicit column selection.');
          throw new Error(
            `Database column missing: ${errorMessage}. ` +
            `This usually means migrations haven't completed. ` +
            `Please run migrations or check if the service has fallback logic for missing columns.`
          );
        } else {
          // For other errors, rethrow
          throw selectError;
        }
      }

      const totalPages = Math.ceil(totalItems / limit);

      return {
        data: data as unknown as T[],
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
    } catch (error: any) {
      // Check if error is due to undefined column access (Symbol error)
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorString = String(error).toLowerCase();
      const errorStack = error instanceof Error ? error.stack : '';
      
      const isSymbolError = 
        errorMessage?.includes('Symbol(drizzle:Name)') ||
        errorMessage?.includes('Cannot read properties of undefined') ||
        errorString.includes('symbol') ||
        (errorStack && errorStack.includes('Symbol(drizzle:Name)'));
      
      if (isSymbolError) {
        // This usually means we're trying to use an undefined column
        // Log the error and throw a more helpful message
        console.error('Drizzle column access error - likely using undefined column:', {
          error: errorMessage,
          query: { search: query.search, searchBy: query.searchBy, sortBy: query.sortBy },
        });
        throw new Error(
          `Invalid column reference in query. Please check that searchBy and sortBy fields exist in the schema. ` +
          `Error: ${errorMessage}`
        );
      }
      
      // Check if error is due to missing account_id column
      const errorCode = error?.code;
      const isAccountIdError = 
        (errorCode === '42703') ||
        errorMessage?.toLowerCase().includes('account_id') ||
        errorString.includes('account_id') ||
        (errorMessage?.includes('column') && errorMessage?.includes('account_id'));
      
      // If account_id column doesn't exist, use Drizzle ORM with explicit column selection to exclude it
      // Drizzle's .select() includes all schema columns, so account_id is selected even if not filtered
      if (isAccountIdError) {
        // Rebuild conditions without accountId filter (if it was used)
        const fallbackConditions: SQL[] = [isNull(this.table.deletedAt)];
        
        // Add search functionality
        if (query.search && query.searchBy && query.searchBy.length > 0) {
          const searchConditions = query.searchBy
            .map((field) => {
              try {
                const column = (this.table as any)[field];
                // Check if column exists and is a valid Drizzle column object
                if (column && typeof column === 'object' && column.name !== undefined) {
                  // Additional check: verify it's actually a Drizzle column
                  if (column.columnType || column.dataType || column.name) {
                    return sql`${column}::text ILIKE ${`%${query.search}%`}`;
                  }
                }
                return null;
              } catch (error) {
                return null;
              }
            })
            .filter((condition): condition is SQL => condition !== null);

          if (searchConditions.length > 0) {
            fallbackConditions.push(sql`(${sql.join(searchConditions, sql` OR `)})`);
          }
        }

        // Get total count without accountId filter
        const [{ count: totalItems }] = await this.db
          .select({ count: count() })
          .from(this.table)
          .where(and(...fallbackConditions));

        // Get paginated data without accountId filter
        // Use explicit column selection to exclude account_id if it doesn't exist
        const whereClause = fallbackConditions.length > 0 ? and(...fallbackConditions) : undefined;
        
        let data: any[];
        try {
          // Try with explicit column selection excluding account_id
          const selectColumns: any = {};
          const tableColumns = this.table as any;
          
          // Build select object with all columns except account_id
          if (tableColumns.id) selectColumns.id = tableColumns.id;
          if (tableColumns.createdAt) selectColumns.createdAt = tableColumns.createdAt;
          if (tableColumns.updatedAt) selectColumns.updatedAt = tableColumns.updatedAt;
          if (tableColumns.deletedAt) selectColumns.deletedAt = tableColumns.deletedAt;
          
          // Add other columns dynamically (excluding accountId)
          Object.keys(tableColumns).forEach((key) => {
            if (key !== 'accountId' && tableColumns[key] && typeof tableColumns[key] === 'object' && tableColumns[key].name) {
              // Convert camelCase to the property name used in select
              const selectKey = key;
              selectColumns[selectKey] = tableColumns[key];
            }
          });
          
          let queryBuilder = this.db
            .select(selectColumns)
            .from(this.table)
            .where(whereClause)
            .limit(limit)
            .offset(offset);

          if (orderByClause) {
            queryBuilder = queryBuilder.orderBy(orderByClause) as any;
          }

          data = await queryBuilder;
        } catch (selectError: any) {
          // If explicit selection fails, try with minimal columns
          console.warn('Explicit column selection failed, trying minimal columns:', selectError?.message);
          try {
            const minimalSelect: any = {};
            if (this.table.id) minimalSelect.id = this.table.id;
            if (this.table.createdAt) minimalSelect.createdAt = this.table.createdAt;
            if (this.table.updatedAt) minimalSelect.updatedAt = this.table.updatedAt;
            if (this.table.deletedAt) minimalSelect.deletedAt = this.table.deletedAt;
            
            let queryBuilder = this.db
              .select(minimalSelect)
              .from(this.table)
              .where(whereClause)
              .limit(limit)
              .offset(offset);

            if (orderByClause) {
              queryBuilder = queryBuilder.orderBy(orderByClause) as any;
            }

            data = await queryBuilder;
          } catch (minimalError) {
            // Last resort: try without explicit selection (will fail if columns missing)
            let queryBuilder = this.db
              .select()
              .from(this.table)
              .where(whereClause)
              .limit(limit)
              .offset(offset);

            if (orderByClause) {
              queryBuilder = queryBuilder.orderBy(orderByClause) as any;
            }

            data = await queryBuilder;
          }
        }
        
        const totalPages = Math.ceil(totalItems / limit);

        return {
          data: data as unknown as T[],
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
      }
      
      // For other errors, rethrow
      throw error;
    }
  }

  async findOneById(
    id: string | number,
    accountIdOrOptions?: number | { accountId?: number; [key: string]: any },
  ): Promise<T> {
    if (!id) {
      throw new NotFoundException('Missing id!');
    }

    // Extract accountId from options object or use it directly
    let accountId: number | undefined;
    if (typeof accountIdOrOptions === 'number') {
      accountId = accountIdOrOptions;
    } else if (accountIdOrOptions && typeof accountIdOrOptions === 'object' && 'accountId' in accountIdOrOptions) {
      accountId = accountIdOrOptions.accountId;
    }

    const conditions: SQL[] = [
      eq(this.table.id, id as any),
      isNull(this.table.deletedAt),
    ];
    let useAccountIdFilter = false;

    // Automatically filter by accountId if the table has the column and accountId is provided
    if (this.hasAccountIdColumn() && accountId !== undefined) {
      conditions.push(eq(this.getAccountIdColumn(), accountId));
      useAccountIdFilter = true;
    }

    try {
      const [entity] = await this.db
        .select()
        .from(this.table)
        .where(and(...conditions))
        .limit(1);

      if (!entity) {
        throw new NotFoundException(`Entity with id ${id} not found`);
      }

      return entity as unknown as T;
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
      
      // If account_id column doesn't exist, use explicit column selection to exclude it
      if (isAccountIdError) {
        const fallbackConditions: SQL[] = [
          eq(this.table.id, id as any),
          isNull(this.table.deletedAt),
        ];
        
        try {
          // Build select object with all columns except account_id
          const selectColumns: any = {};
          const tableColumns = this.table as any;
          
          // Add base columns
          if (tableColumns.id) selectColumns.id = tableColumns.id;
          if (tableColumns.createdAt) selectColumns.createdAt = tableColumns.createdAt;
          if (tableColumns.updatedAt) selectColumns.updatedAt = tableColumns.updatedAt;
          if (tableColumns.deletedAt) selectColumns.deletedAt = tableColumns.deletedAt;
          
          // Add other columns dynamically (excluding accountId)
          Object.keys(tableColumns).forEach((key) => {
            if (key !== 'accountId' && tableColumns[key] && typeof tableColumns[key] === 'object' && tableColumns[key].name) {
              selectColumns[key] = tableColumns[key];
            }
          });
          
          const [entity] = await this.db
            .select(selectColumns)
            .from(this.table)
            .where(and(...fallbackConditions))
            .limit(1);

          if (!entity) {
            throw new NotFoundException(`Entity with id ${id} not found`);
          }

          return entity as unknown as T;
        } catch (selectError: any) {
          // If explicit selection fails, try with minimal columns
          try {
            const minimalSelect: any = {};
            if (this.table.id) minimalSelect.id = this.table.id;
            if (this.table.createdAt) minimalSelect.createdAt = this.table.createdAt;
            if (this.table.updatedAt) minimalSelect.updatedAt = this.table.updatedAt;
            if (this.table.deletedAt) minimalSelect.deletedAt = this.table.deletedAt;
            
            const [entity] = await this.db
              .select(minimalSelect)
              .from(this.table)
              .where(and(...fallbackConditions))
              .limit(1);

            if (!entity) {
              throw new NotFoundException(`Entity with id ${id} not found`);
            }

            return entity as unknown as T;
          } catch (minimalError) {
            // Last resort: try without explicit selection
            const [entity] = await this.db
              .select()
              .from(this.table)
              .where(and(...fallbackConditions))
              .limit(1);

            if (!entity) {
              throw new NotFoundException(`Entity with id ${id} not found`);
            }

            return entity as unknown as T;
          }
        }
      }
      
      // For NotFoundException, rethrow as-is
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      // For other errors, rethrow
      throw error;
    }
  }

  async findOneBy(
    conditions: Partial<T>,
    options?: { accountId?: number; relations?: string[] },
  ): Promise<T | null> {
    const whereConditions: SQL[] = [isNull(this.table.deletedAt)];

    // Automatically filter by accountId if the table has the column and accountId is provided
    if (this.hasAccountIdColumn() && options?.accountId !== undefined) {
      try {
        const accountIdColumn = this.getAccountIdColumn();
        if (accountIdColumn) {
          whereConditions.push(eq(accountIdColumn, options.accountId));
        }
      } catch (error) {
        // If accountId column doesn't exist, skip it (will be handled in error handler)
        console.warn('accountId column not found, skipping accountId filter:', error);
      }
    }

    // Known text columns that should always be converted to strings
    const textColumns = ['accid', 'subid', 'username', 'company', 'token', 'session', 'k_u', 'pid', 'partner', 'k_k', 'expire', 'k_p', 'createdBy'];

    Object.entries(conditions).forEach(([key, value]) => {
      // Skip accountId if it's in conditions - it's handled separately via options
      if (key === 'accountId') {
        return;
      }
      
      try {
        const column = (this.table as any)[key];
        // Check if column exists and is a valid Drizzle column object
        if (!column) {
          console.warn(`Column ${key} not found in schema, skipping`);
          return;
        }
        
        // Verify it's actually a Drizzle column object
        if (typeof column !== 'object') {
          console.warn(`Column ${key} is not a valid Drizzle column object, skipping`);
          return;
        }
        
        // Check for Drizzle column properties - columns have a name property
        if (!column.name && !column.columnType && !column.dataType) {
          console.warn(`Column ${key} does not have required Drizzle column properties, skipping`);
          return;
        }
        
        if (value !== undefined && value !== null) {
          // Convert to string if it's a known text column (handle both numbers and string numbers)
          let processedValue = value;
          if (textColumns.includes(key)) {
            // Always convert to string for text columns, regardless of input type
            processedValue = String(value);
          }
          whereConditions.push(eq(column, processedValue as any));
        }
      } catch (error) {
        // If column access fails, skip this field
        console.warn(`Failed to access column ${key}, skipping:`, error);
      }
    });

    try {
      const [entity] = await this.db
        .select()
        .from(this.table)
        .where(and(...whereConditions))
        .limit(1);

      // Note: Relations in Drizzle are handled differently - you'd need to use relational queries
      // For now, returning the base entity. Relations should be handled in specific service methods.

      return (entity as unknown as T) || null;
    } catch (error: any) {
      // Check if error is due to Symbol(drizzle:Name) error (undefined column access)
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorString = String(error).toLowerCase();
      const errorStack = error instanceof Error ? error.stack : '';
      
      const isSymbolError = 
        errorMessage?.includes('Symbol(drizzle:Name)') ||
        errorMessage?.includes('Cannot read properties of undefined') ||
        errorString.includes('symbol') ||
        (errorStack && errorStack.includes('Symbol(drizzle:Name)'));
      
      // Check if error is due to missing account_id column
      const errorCode = error?.code;
      const isAccountIdError = 
        (errorCode === '42703') ||
        errorMessage?.toLowerCase().includes('account_id') ||
        errorString.includes('account_id') ||
        (errorMessage?.includes('column') && errorMessage?.includes('account_id'));
      
      // Check if error is due to missing email/role columns
      const isEmailRoleError = 
        errorMessage?.toLowerCase().includes('email') ||
        errorMessage?.toLowerCase().includes('role') ||
        (errorMessage?.includes('column') && (errorMessage?.includes('email') || errorMessage?.includes('role')));
      
      // If account_id column doesn't exist or Symbol error, use raw SQL to exclude problematic columns
      if (isAccountIdError || isSymbolError || isEmailRoleError) {
        // Rebuild conditions without accountId filter (if it was used)
        const fallbackConditions: SQL[] = [isNull(this.table.deletedAt)];
        
        // Re-add search conditions without accountId, with proper error handling
        const textColumns = ['accid', 'subid', 'username', 'company', 'token', 'session', 'k_u', 'pid', 'partner', 'k_k', 'expire', 'k_p', 'createdBy'];
        Object.entries(conditions).forEach(([key, value]) => {
          // Skip accountId - it's handled separately
          if (key === 'accountId') {
            return;
          }
          
          try {
            const column = (this.table as any)[key];
            // Check if column exists and is a valid Drizzle column object
            if (!column || typeof column !== 'object' || (!column.name && !column.columnType && !column.dataType)) {
              console.warn(`Column ${key} not found or invalid in schema, skipping`);
              return;
            }
            
            if (value !== undefined && value !== null) {
              let processedValue = value;
              if (textColumns.includes(key)) {
                processedValue = String(value);
              }
              fallbackConditions.push(eq(column, processedValue as any));
            }
          } catch (colError) {
            console.warn(`Failed to access column ${key}, skipping:`, colError);
          }
        });
        
        // Use explicit column selection to exclude problematic columns
        const whereClause = fallbackConditions.length > 0 ? and(...fallbackConditions) : undefined;
        
        try {
          // Build select object excluding accountId, email, role if they cause issues
          const selectColumns: any = {};
          const tableColumns = this.table as any;
          
          // Add base columns
          if (tableColumns.id) selectColumns.id = tableColumns.id;
          if (tableColumns.createdAt) selectColumns.createdAt = tableColumns.createdAt;
          if (tableColumns.updatedAt) selectColumns.updatedAt = tableColumns.updatedAt;
          if (tableColumns.deletedAt) selectColumns.deletedAt = tableColumns.deletedAt;
          
          // Add other columns dynamically (excluding problematic ones)
          const excludeColumns = ['accountId', 'email', 'role', 'fullname'];
          Object.keys(tableColumns).forEach((key) => {
            if (!excludeColumns.includes(key) && tableColumns[key] && typeof tableColumns[key] === 'object' && tableColumns[key].name) {
              selectColumns[key] = tableColumns[key];
            }
          });
          
          const [entity] = await this.db
            .select(selectColumns)
            .from(this.table)
            .where(whereClause)
            .limit(1);
          
          return (entity as unknown as T) || null;
        } catch (selectError: any) {
          // If explicit selection fails, try with minimal columns
          try {
            const minimalSelect: any = {};
            if (this.table.id) minimalSelect.id = this.table.id;
            if (this.table.createdAt) minimalSelect.createdAt = this.table.createdAt;
            if (this.table.updatedAt) minimalSelect.updatedAt = this.table.updatedAt;
            if (this.table.deletedAt) minimalSelect.deletedAt = this.table.deletedAt;
            
            const [entity] = await this.db
              .select(minimalSelect)
              .from(this.table)
              .where(whereClause)
              .limit(1);
            
            return (entity as unknown as T) || null;
          } catch (minimalError) {
            // Last resort: try without explicit selection
            try {
              const [entity] = await this.db
                .select()
                .from(this.table)
                .where(whereClause)
                .limit(1);
              return (entity as unknown as T) || null;
            } catch (fallbackError) {
              // Last resort: throw original error
              throw error;
            }
          }
        }
      }
      
      // For other errors, rethrow
      throw error;
    }
  }

  async update(
    id: string,
    data: Partial<Omit<T, 'id' | 'createdAt' | 'deletedAt'>>,
    accountId?: number,
  ): Promise<T> {
    await this.findOneById(id, accountId); // Throws if not found and validates accountId

    const conditions: SQL[] = [eq(this.table.id, id)];

    // Automatically filter by accountId if the table has the column and accountId is provided
    if (this.hasAccountIdColumn() && accountId !== undefined) {
      conditions.push(eq(this.getAccountIdColumn(), accountId));
    }

    const [updated] = await this.db
      .update(this.table)
      .set({
        ...data,
        updatedAt: new Date(),
      } as any)
      .where(and(...conditions))
      .returning();

    return updated as unknown as T;
  }

  async remove(id: string, accountId?: number): Promise<T> {
    const entity = await this.findOneById(id, accountId); // Throws if not found and validates accountId

    const conditions: SQL[] = [eq(this.table.id, id)];

    // Automatically filter by accountId if the table has the column and accountId is provided
    if (this.hasAccountIdColumn() && accountId !== undefined) {
      conditions.push(eq(this.getAccountIdColumn(), accountId));
    }

    const [deleted] = await this.db
      .delete(this.table)
      .where(and(...conditions))
      .returning();

    return deleted as unknown as T;
  }

  async bulkInsert(
    data: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>[],
    accountId?: number,
  ): Promise<T[]> {
    const now = new Date();
    const entities = await this.db
      .insert(this.table)
      .values(
        data.map((item) => {
          const insertItem: any = {
            ...item,
            createdAt: now,
            updatedAt: now,
          };
          // Automatically add accountId if the table has the column and accountId is provided
          if (this.hasAccountIdColumn() && accountId !== undefined) {
            insertItem.accountId = accountId;
          }
          return insertItem;
        }) as any[],
      )
      .returning();

    return entities as unknown as T[];
  }

  async softDelete(id: string): Promise<void> {
    await this.findOneById(id); // Throws if not found

    await this.db
      .update(this.table)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .where(eq(this.table.id, id));
  }

  async count(conditions?: Partial<T>, accountId?: number): Promise<number> {
    const whereConditions: SQL[] = [isNull(this.table.deletedAt)];

    // Automatically filter by accountId if the table has the column and accountId is provided
    if (this.hasAccountIdColumn() && accountId !== undefined) {
      whereConditions.push(eq(this.getAccountIdColumn(), accountId));
    }

    // Known text columns that should always be converted to strings
    const textColumns = ['accid', 'subid', 'username', 'company', 'token', 'session', 'k_u', 'pid', 'partner', 'k_k', 'expire', 'k_p', 'createdBy'];

    if (conditions) {
      Object.entries(conditions).forEach(([key, value]) => {
        const column = (this.table as any)[key];
        if (column !== undefined && value !== undefined && value !== null) {
          // Convert to string if it's a known text column (handle both numbers and string numbers)
          let processedValue = value;
          if (textColumns.includes(key)) {
            // Always convert to string for text columns, regardless of input type
            processedValue = String(value);
          }
          whereConditions.push(eq(column, processedValue as any));
        }
      });
    }

    const [{ count: total }] = await this.db
      .select({ count: count() })
      .from(this.table)
      .where(and(...whereConditions));

    return total;
  }
}
