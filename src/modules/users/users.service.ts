import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
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
    options?: { include?: string[] },
  ): Promise<PaginateResult<User>> {
    // If relations are requested, use custom implementation
    if (options?.include && options.include.length > 0) {
      return this.findAllWithRelations(query, options);
    }
    return super.findAll(query, options);
  }

  private async findAllWithRelations(
    query: PaginateQuery = {},
    options?: { include?: string[] },
  ): Promise<PaginateResult<User>> {
    const page = query.page || 1;
    const limit = query.limit || 100;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions: any[] = [sql`${schema.users.deletedAt} IS NULL`];

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

  async findOneById(id: string, options?: { include?: string[] }): Promise<User> {
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

    let user: any;
    if (Object.keys(withRelations).length > 0) {
      // Use relational query API when relations are requested
      user = await this.dbConnection.query.users.findFirst({
        where: (users: any, { eq: eqFn }: any) => eqFn(users.id, id),
        with: withRelations,
      });
    } else {
      // Use standard query when no relations
      user = await super.findOneById(id);
    }

    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findOneBy(requestData: any): Promise<User> {
    const user = await super.findOneBy(requestData);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByUsername(username: string): Promise<User> {
    const user = await this.findOneBy({ username } as any);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByAccid(accid: string): Promise<User> {
    const user = await this.findOneBy({ accid } as any);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByAccidAndSubid(accid: string, subid: string): Promise<User> {
    const user = await this.findOneBy({ accid, subid } as any);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async remove(id: string): Promise<User> {
    return super.remove(id);
  }
}
