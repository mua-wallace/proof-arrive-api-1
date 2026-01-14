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
    return (this.table as any).accountId !== undefined;
  }

  /**
   * Get the accountId column from the table
   */
  private getAccountIdColumn(): any {
    return (this.table as any).accountId;
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

    // Automatically filter by accountId if the table has the column and accountId is provided
    if (this.hasAccountIdColumn() && options?.accountId !== undefined) {
      conditions.push(eq(this.getAccountIdColumn(), options.accountId));
    }

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
        conditions.push(sql`(${sql.join(searchConditions, sql` OR `)})`);
      }
    }

    // Build order by
    let orderByClause: any;
    if (query.sortBy && query.sortBy.length > 0) {
      const [field, direction] = query.sortBy[0];
      const column = (this.table as any)[field];
      if (column) {
        orderByClause = direction === 'DESC' ? desc(column) : asc(column);
      }
    }

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

    // Automatically filter by accountId if the table has the column and accountId is provided
    if (this.hasAccountIdColumn() && accountId !== undefined) {
      conditions.push(eq(this.getAccountIdColumn(), accountId));
    }

    const [entity] = await this.db
      .select()
      .from(this.table)
      .where(and(...conditions))
      .limit(1);

    if (!entity) {
      throw new NotFoundException(`Entity with id ${id} not found`);
    }

    return entity as unknown as T;
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

    const [entity] = await this.db
      .select()
      .from(this.table)
      .where(and(...whereConditions))
      .limit(1);

    // Note: Relations in Drizzle are handled differently - you'd need to use relational queries
    // For now, returning the base entity. Relations should be handled in specific service methods.

    return (entity as unknown as T) || null;
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
