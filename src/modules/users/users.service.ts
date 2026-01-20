import { Injectable, Inject, NotFoundException, Logger, InternalServerErrorException } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import * as schema from '@modules/schemas';
import { BaseService } from '@common/services/base.service';
import { PaginateQuery, PaginateResult, BaseEntity } from '@common/interfaces';
import { eq, and, SQL, desc, asc, count, sql, inArray } from 'drizzle-orm';

type User = typeof schema.users.$inferSelect & BaseEntity;

@Injectable()
export class UsersService extends BaseService<User> {
  private readonly logger = new Logger(UsersService.name);
  private readonly dbConnection: any;

  constructor(
    @Inject(DATABASE_CONNECTION)
    db: any, // BaseService expects DrizzleDatabase type
  ) {
    super(db, schema.users);
    this.dbConnection = db;
  }

  async findAll(
    query: PaginateQuery = {},
    options?: { include?: string[]; accountId?: number },
  ): Promise<PaginateResult<User>> {
    try {
      // If relations are requested, use custom implementation
      if (options?.include && options.include.length > 0) {
        return await this.findAllWithRelations(query, options);
      }
      return await super.findAll(query, options);
    } catch (error: any) {
      this.logger.error(`Failed to fetch users: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to fetch users: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  private async findAllWithRelations(
    query: PaginateQuery = {},
    options?: { include?: string[]; accountId?: number },
  ): Promise<PaginateResult<User>> {
    const page = query.page || 1;
    const limit = query.limit || 100;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions: any[] = [sql`${schema.users.deletedAt} IS NULL`];

    // Automatically filter by accountId if provided
    if (options?.accountId !== undefined) {
      conditions.push(eq(schema.users.accountId, options.accountId));
    }

    // Add search functionality
    if (query.search && query.searchBy && query.searchBy.length > 0) {
      const searchConditions = query.searchBy
        .map((field) => {
          const column = (schema.users as any)[field];
          if (column) {
            return sql`${column}::text ILIKE ${`%${query.search}%`}`;
          }
          return null;
        })
        .filter(Boolean);

      if (searchConditions.length > 0) {
        conditions.push(sql`(${sql.join(searchConditions.filter(Boolean) as any[], sql` OR `)})`);
      }
    }

    // Build order by
    let orderByClause: any;
    if (query.sortBy && query.sortBy.length > 0) {
      const sortFields = query.sortBy.map(([field, direction]) => {
        const column = (schema.users as any)[field];
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
      orderByClause = [desc(schema.users.createdAt)];
    }

    // Get total count
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ count: total }] = await this.dbConnection
      .select({ count: count() })
      .from(schema.users)
      .where(whereClause);

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

    // Get paginated results with relations
    let data: any[];
    if (Object.keys(withRelations).length > 0) {
      // When relations are requested, first get the IDs that match the conditions
      const matchingIds = await this.dbConnection
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(whereClause)
        .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
        .limit(limit)
        .offset(offset);

      const ids = matchingIds.map((row: any) => row.id);

      if (ids.length > 0) {
        // Use relational query API to get data with relations
        const allData = await this.dbConnection.query.users.findMany({
          where: (users: any, { inArray: inArrayFn }: any) => inArrayFn(users.id, ids),
          with: withRelations,
        });
        // Re-sort to match original order
        const idMap = new Map<string, number>(ids.map((id: string, idx: number) => [id, idx]));
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
        .from(schema.users)
        .where(whereClause)
        .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
        .limit(limit)
        .offset(offset);
    }

    return {
      data: data as User[],
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

  async findOneById(id: string, options?: { include?: string[]; accountId?: number }): Promise<User> {
    if (!id) {
      throw new NotFoundException(`Invalid user ID: ${id}`);
    }

    try {
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

      // Build where conditions
      const whereConditions: any[] = [];
      if (options?.accountId !== undefined) {
        whereConditions.push((users: any, { eq: eqFn }: any) => eqFn(users.accountId, options.accountId));
      }

      let user: any;
      if (Object.keys(withRelations).length > 0) {
        // Use relational query API when relations are requested
        user = await this.dbConnection.query.users.findFirst({
          where: (users: any, { eq: eqFn, and: andFn }: any) => {
            const conditions = [eqFn(users.id, id)];
            if (options?.accountId !== undefined) {
              conditions.push(eqFn(users.accountId, options.accountId));
            }
            return conditions.length > 1 ? andFn(...conditions) : conditions[0];
          },
          with: withRelations,
        });
      } else {
        // Use standard query when no relations
        if (options?.accountId !== undefined) {
          // Custom query with accountId filter
          const conditions = [
            eq(schema.users.id, id),
            eq(schema.users.accountId, options.accountId),
            sql`${schema.users.deletedAt} IS NULL`,
          ];
          const [foundUser] = await this.dbConnection
            .select()
            .from(schema.users)
            .where(and(...conditions))
            .limit(1);
          user = foundUser;
        } else {
          user = await super.findOneById(id);
        }
      }

      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      return user;
    } catch (error: any) {
      this.logger.error(`Failed to fetch user with id=${id}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to get user details: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async findOneBy(requestData: any): Promise<User> {
    try {
      if (!requestData || Object.keys(requestData).length === 0) {
        throw new NotFoundException('No search criteria provided');
      }

      const user = await super.findOneBy(requestData);
      if (!user) {
        throw new NotFoundException(`User not found with criteria: ${JSON.stringify(requestData)}`);
      }
      return user;
    } catch (error: any) {
      this.logger.error(`Failed to find user by criteria: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to find user: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async findByUsername(username: string): Promise<User> {
    if (!username) {
      throw new NotFoundException('Username is required');
    }

    try {
      return await this.findOneBy({ username } as any);
    } catch (error: any) {
      this.logger.error(`Failed to find user by username=${username}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to find user by username: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async findByAccid(accid: string | number, accountId?: number): Promise<User> {
    // Ensure accid is always a string for text column
    const accidStr = String(accid);
    const accountIdNum = accountId !== undefined ? accountId : Number(accidStr);

    if (!accidStr || accidStr.trim() === '') {
      throw new NotFoundException('Accid is required');
    }

    try {
      // Build search criteria with accountId filter
      const searchCriteria: any = { accid: accidStr };
      if (accountIdNum !== undefined) {
        searchCriteria.accountId = accountIdNum;
      }
      
      const user = await this.findOneBy(searchCriteria);
      if (!user) {
        throw new NotFoundException(`User with accid ${accidStr} not found`);
      }
      return user;
    } catch (error: any) {
      this.logger.error(`Failed to find user by accid=${accidStr}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to find user by accid: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async findByAccidAndSubid(accid: string | number, subid: string | number, accountId?: number): Promise<User> {
    // Ensure accid and subid are always strings for text columns
    const accidStr = String(accid);
    const subidStr = String(subid);
    const accountIdNum = accountId !== undefined ? accountId : Number(accidStr);

    if (!accidStr || !subidStr || accidStr.trim() === '' || subidStr.trim() === '') {
      throw new NotFoundException('Accid and subid are required');
    }

    try {
      // Build search criteria with accountId filter
      const searchCriteria: any = { accid: accidStr, subid: subidStr };
      if (accountIdNum !== undefined) {
        searchCriteria.accountId = accountIdNum;
      }
      
      const user = await this.findOneBy(searchCriteria);
      if (!user) {
        throw new NotFoundException(`User with accid ${accidStr} and subid ${subidStr} not found`);
      }
      return user;
    } catch (error: any) {
      this.logger.error(`Failed to find user by accid=${accidStr}, subid=${subidStr}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to find user by accid and subid: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async remove(id: string): Promise<User> {
    if (!id) {
      throw new NotFoundException(`Invalid user ID: ${id}`);
    }

    try {
      const user = await super.remove(id);
      return user;
    } catch (error: any) {
      this.logger.error(`Failed to remove user with id=${id}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to remove user: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }
}
