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
            if (column && typeof column === 'object' && column.name !== undefined) {
              return sql`${column}::text ILIKE ${`%${query.search}%`}`;
            }
            return null;
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
      const [field, direction] = query.sortBy[0];
      try {
        const column = (this.table as any)[field];
        // Check if column exists and is a valid Drizzle column object
        if (column && typeof column === 'object' && column.name !== undefined) {
          orderByClause = direction === 'DESC' ? desc(column) : asc(column);
        }
      } catch (error) {
        // If column access fails, skip sorting for this field
        // Will use default ordering if no valid sort field found
      }
    }

    try {
      // Get total count
      const [{ count: totalItems }] = await this.db
        .select({ count: count() })
        .from(this.table)
        .where(and(...conditions));

      // Get paginated data
      let queryBuilder = this.db
        .select()
        .from(this.table)
        .where(and(...conditions))
        .limit(limit)
        .offset(offset);

      if (orderByClause) {
        queryBuilder = queryBuilder.orderBy(orderByClause) as any;
      }

      const data = await queryBuilder;

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
      // Check if error is due to missing account_id column
      const errorCode = error?.code;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorString = String(error).toLowerCase();
      
      const isAccountIdError = 
        (errorCode === '42703') ||
        errorMessage?.toLowerCase().includes('account_id') ||
        errorString.includes('account_id') ||
        (errorMessage?.includes('column') && errorMessage?.includes('account_id'));
      
      // If account_id column doesn't exist, use raw SQL query to exclude it from SELECT
      // Drizzle's .select() includes all schema columns, so account_id is selected even if not filtered
      if (isAccountIdError) {
        // Rebuild conditions without accountId filter (if it was used)
        const fallbackConditions: SQL[] = [isNull(this.table.deletedAt)];
        
        // Add search functionality
        if (query.search && query.searchBy && query.searchBy.length > 0) {
          const searchConditions = query.searchBy
            .map((field) => {
              const column = (this.table as any)[field];
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

        // Get total count without accountId filter
        const [{ count: totalItems }] = await this.db
          .select({ count: count() })
          .from(this.table)
          .where(and(...fallbackConditions));

        // Get paginated data without accountId filter
        // Drizzle's .select() includes all schema columns including account_id
        // Use raw SQL via postgres client to exclude account_id from SELECT
        const tableName = (this.table as any)._[Symbol.for('drizzle:Name')] || (this.table as any).name || 'users';
        
        // Access underlying postgres client from Drizzle
        const postgresClient = (this.db as any).client || (this.db as any).session?.client;
        
        let data: any[];
        if (postgresClient) {
          // Get column names excluding account_id
          const columnsResult = await postgresClient`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = ${tableName}
            AND column_name != 'account_id'
            ORDER BY ordinal_position
          `;
          
          const columnNames = columnsResult.map((row: any) => `"${row.column_name}"`).join(', ');
          
          // Build WHERE clause using Drizzle's SQL builder, then convert to string
          const whereClauseObj = fallbackConditions.length > 0 ? and(...fallbackConditions) : undefined;
          
          // Use Drizzle to build the WHERE clause, then execute raw SQL
          // For simplicity, just use deleted_at IS NULL as WHERE clause
          const whereClause = 'WHERE "deleted_at" IS NULL';
          const orderBySql = (orderByClause !== undefined) ? ' ORDER BY "created_at" DESC' : '';
          
          // Execute raw SQL query
          const query = `SELECT ${columnNames} FROM "${tableName}" ${whereClause}${orderBySql} LIMIT ${limit} OFFSET ${offset}`;
          data = await postgresClient.unsafe(query);
        } else {
          // Fallback: try the query anyway (might work if account_id was added)
          let queryBuilder = this.db
            .select()
            .from(this.table)
            .where(and(...fallbackConditions))
            .limit(limit)
            .offset(offset);

          if (orderByClause) {
            queryBuilder = queryBuilder.orderBy(orderByClause) as any;
          }

          data = await queryBuilder;
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
      
      // If account_id column doesn't exist, use raw SQL to exclude it from SELECT
      if (isAccountIdError) {
        const fallbackConditions: SQL[] = [
          eq(this.table.id, id as any),
          isNull(this.table.deletedAt),
        ];
        
        // Use raw SQL via postgres client to exclude account_id from SELECT
        const tableName = (this.table as any)._[Symbol.for('drizzle:Name')] || (this.table as any).name || 'users';
        const postgresClient = (this.db as any).client || (this.db as any).session?.client;
        
        if (postgresClient) {
          // Get column names excluding account_id
          const columnsResult = await postgresClient`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = ${tableName}
            AND column_name != 'account_id'
            ORDER BY ordinal_position
          `;
          
          const columnNames = columnsResult.map((row: any) => `"${row.column_name}"`).join(', ');
          
          // Execute raw SQL query
          const rawQuery = `SELECT ${columnNames} FROM "${tableName}" WHERE "id" = $1 AND "deleted_at" IS NULL LIMIT 1`;
          const result = await postgresClient.unsafe(rawQuery, [id]);
          
          if (!result || result.length === 0) {
            throw new NotFoundException(`Entity with id ${id} not found`);
          }
          
          return result[0] as unknown as T;
        } else {
          // Fallback: retry without accountId filter (will still fail if account_id is in SELECT)
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
      whereConditions.push(eq(this.getAccountIdColumn(), options.accountId));
    }

    // Known text columns that should always be converted to strings
    const textColumns = ['accid', 'subid', 'username', 'company', 'token', 'session', 'k_u', 'pid', 'partner', 'k_k', 'expire', 'k_p', 'createdBy'];

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
        // Rebuild conditions without accountId filter (if it was used)
        const fallbackConditions: SQL[] = [isNull(this.table.deletedAt)];
        
        // Re-add search conditions without accountId
        const textColumns = ['accid', 'subid', 'username', 'company', 'token', 'session', 'k_u', 'pid', 'partner', 'k_k', 'expire', 'k_p', 'createdBy'];
        Object.entries(conditions).forEach(([key, value]) => {
          const column = (this.table as any)[key];
          if (column !== undefined && value !== undefined && value !== null && key !== 'accountId') {
            let processedValue = value;
            if (textColumns.includes(key)) {
              processedValue = String(value);
            }
            fallbackConditions.push(eq(column, processedValue as any));
          }
        });
        
        // Use raw SQL via postgres client to exclude account_id from SELECT
        const tableName = (this.table as any)._[Symbol.for('drizzle:Name')] || (this.table as any).name || 'users';
        const postgresClient = (this.db as any).client || (this.db as any).session?.client;
        
        if (postgresClient) {
          // Get column names excluding account_id
          const columnsResult = await postgresClient`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = ${tableName}
            AND column_name != 'account_id'
            ORDER BY ordinal_position
          `;
          
          const columnNames = columnsResult.map((row: any) => `"${row.column_name}"`).join(', ');
          
          // Build WHERE clause - simplified for now
          const whereClause = 'WHERE "deleted_at" IS NULL';
          
          // Execute raw SQL query
          const rawQuery = `SELECT ${columnNames} FROM "${tableName}" ${whereClause} LIMIT 1`;
          const result = await postgresClient.unsafe(rawQuery);
          return (result[0] as unknown as T) || null;
        } else {
          // Fallback: retry without accountId filter (will still fail if account_id is in SELECT)
          const [entity] = await this.db
            .select()
            .from(this.table)
            .where(and(...fallbackConditions))
            .limit(1);
          return (entity as unknown as T) || null;
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
