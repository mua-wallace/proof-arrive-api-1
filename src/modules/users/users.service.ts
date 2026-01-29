import { Injectable, Inject, NotFoundException, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
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
    // Always use custom implementation to handle missing email/role columns gracefully
    // BaseService.findAll() would fail if email/role columns don't exist yet
    return await this.findAllWithRelations(query, options);
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

    // Automatically filter by accountId if provided (mandatory for multi-tenant isolation)
    if (options?.accountId !== undefined) {
      conditions.push(eq(schema.users.accountId, options.accountId));
    }

    // Add search functionality
    if (query.search && query.searchBy && query.searchBy.length > 0) {
      const searchConditions = query.searchBy
        .map((field) => {
          try {
            const column = (schema.users as any)[field];
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
        .filter((condition): condition is any => condition !== null);

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
            const column = (schema.users as any)[field];
            // Check if column exists and is a valid Drizzle column object
            if (column && typeof column === 'object' && column.name !== undefined) {
              return direction === 'DESC' ? desc(column) : asc(column);
            }
            return null;
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
      orderByClause = [desc(schema.users.createdAt)];
    }

    // Get total count
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ count: countResult }] = await this.dbConnection
      .select({ count: count() })
      .from(schema.users)
      .where(whereClause);
    const total = countResult;

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
    let data: any[] = [];
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
        try {
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
        } catch (relError: any) {
          this.logger.error(`Failed to fetch users with relations: ${relError?.message || 'Unknown error'}`, relError?.stack);
          throw relError;
        }
      } else {
        data = [];
      }
    } else {
      // Use standard query when no relations
      const finalWhereClause = conditions.length > 0 ? and(...conditions) : undefined;
      try {
        data = await this.dbConnection
          .select()
          .from(schema.users)
          .where(finalWhereClause)
          .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
          .limit(limit)
          .offset(offset);
      } catch (selectError: any) {
        // Check if error is due to missing email/role columns
        const errorMessage = selectError instanceof Error ? selectError.message : String(selectError);
        if (errorMessage?.toLowerCase().includes('email') || errorMessage?.toLowerCase().includes('role')) {
          // Retry with explicit column selection excluding email/role
          this.logger.warn('email/role columns missing, selecting columns explicitly (excluding email/role). Run migration 0005_add_user_fields.sql');
          data = await this.dbConnection
            .select({
              id: schema.users.id,
              accountId: schema.users.accountId,
              createdAt: schema.users.createdAt,
              updatedAt: schema.users.updatedAt,
              deletedAt: schema.users.deletedAt,
              kU: schema.users.k_u,
              pid: schema.users.pid,
              subid: schema.users.subid,
              partner: schema.users.partner,
              kK: schema.users.k_k,
              expire: schema.users.expire,
              token: schema.users.token,
              session: schema.users.session,
              accid: schema.users.accid,
              company: schema.users.company,
              username: schema.users.username,
              kP: schema.users.k_p,
              fullname: schema.users.fullname,
              lastLoginAt: schema.users.lastLoginAt,
            })
            .from(schema.users)
            .where(finalWhereClause)
            .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
            .limit(limit)
            .offset(offset);
        } else {
          this.logger.error(`Failed to fetch users: ${selectError?.message || 'Unknown error'}`, selectError?.stack);
          throw selectError;
        }
      }
    }
    
    // Ensure data is defined
    if (!data) {
      data = [];
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
        try {
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
          
          // If account_id column doesn't exist, retry without accountId filter
          if (isAccountIdError) {
            user = await this.dbConnection.query.users.findFirst({
              where: (users: any, { eq: eqFn }: any) => eqFn(users.id, id),
              with: withRelations,
            });
          } else {
            throw error;
          }
        }
      } else {
        // Use standard query when no relations
        if (options?.accountId !== undefined) {
          // Custom query with accountId filter
          try {
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
              // Use raw SQL via postgres client to exclude account_id from SELECT
              const postgresClient = (this.dbConnection as any).client || (this.dbConnection as any).session?.client;
              
              if (postgresClient) {
                // Get column names excluding account_id
                const columnsResult = await postgresClient`
                  SELECT column_name 
                  FROM information_schema.columns 
                  WHERE table_schema = 'public' 
                  AND table_name = 'users'
                  AND column_name != 'account_id'
                  ORDER BY ordinal_position
                `;
                
                const columnNames = columnsResult.map((row: any) => `"${row.column_name}"`).join(', ');
                
                // Execute raw SQL query
                const rawQuery = `SELECT ${columnNames} FROM "users" WHERE "id" = $1 AND "deleted_at" IS NULL LIMIT 1`;
                const result = await postgresClient.unsafe(rawQuery, [id]);
                user = result[0] || null;
              } else {
                // Fallback: try without accountId filter (will still fail if account_id is in SELECT)
                const fallbackConditions = [
                  eq(schema.users.id, id),
                  sql`${schema.users.deletedAt} IS NULL`,
                ];
                const [foundUser] = await this.dbConnection
                  .select()
                  .from(schema.users)
                  .where(and(...fallbackConditions))
                  .limit(1);
                user = foundUser;
              }
            } else {
              throw error;
            }
          }
        } else {
          user = await super.findOneById(id);
        }
      }

      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      return user;
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
      
      // If accountId filter was used and column doesn't exist, retry without it
      if (isAccountIdError && options?.accountId !== undefined) {
        this.logger.warn(
          `account_id column missing during findOneById (id=${id}, accountId=${options.accountId}). ` +
          `Falling back to query without accountId filter. Run migrations to add account_id column.`
        );
        // Retry without accountId
        const fallbackOptions = { ...options };
        delete fallbackOptions.accountId;
        return await this.findOneById(id, fallbackOptions);
      }
      
      this.logger.error(`Failed to fetch user with id=${id}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to get user details: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async findOneBy(
    requestData: any,
    options?: { accountId?: number; relations?: string[] },
  ): Promise<User> {
    try {
      if (!requestData || Object.keys(requestData).length === 0) {
        throw new NotFoundException('No search criteria provided');
      }

      const user = await super.findOneBy(requestData, options);
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
      // Build search criteria (only accid - accountId goes in options)
      const searchCriteria: any = { accid: accidStr };
      let user: User | null = null;
      
      // Pass accountId via options, not in conditions
      const options = accountIdNum !== undefined ? { accountId: accountIdNum } : undefined;
      
      try {
        user = await this.findOneBy(searchCriteria, options);
      } catch (error: any) {
        // Check if error is due to missing account_id column or Symbol error
        const errorCode = error?.code;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorString = String(error).toLowerCase();
        const errorStack = error instanceof Error ? error.stack : '';
        
        const isAccountIdError = 
          (errorCode === '42703') ||
          errorMessage?.toLowerCase().includes('account_id') ||
          errorString.includes('account_id') ||
          (errorMessage?.includes('column') && errorMessage?.includes('account_id'));
        
        const isSymbolError = 
          errorMessage?.includes('Symbol(drizzle:Name)') ||
          errorMessage?.includes('Cannot read properties of undefined') ||
          errorString.includes('symbol') ||
          (errorStack && errorStack.includes('Symbol(drizzle:Name)'));
        
        // If accountId filter was used and column doesn't exist, or Symbol error, retry without accountId
        if ((isAccountIdError || isSymbolError) && accountIdNum !== undefined) {
          this.logger.warn(
            `account_id column missing or Symbol error during findByAccid (accid=${accidStr}, accountId=${accountIdNum}). ` +
            `Falling back to query without accountId filter. Run migrations to add account_id column.`
          );
          user = await this.findOneBy(searchCriteria);
        } else {
          throw error;
        }
      }
      
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
      // Build search criteria (only accid and subid - accountId goes in options)
      const searchCriteria: any = { accid: accidStr, subid: subidStr };
      let user: User | null = null;
      
      // Pass accountId via options, not in conditions
      const options = accountIdNum !== undefined ? { accountId: accountIdNum } : undefined;
      
      try {
        user = await this.findOneBy(searchCriteria, options);
      } catch (error: any) {
        // Check if error is due to missing account_id column or Symbol error
        const errorCode = error?.code;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorString = String(error).toLowerCase();
        const errorStack = error instanceof Error ? error.stack : '';
        
        const isAccountIdError = 
          (errorCode === '42703') ||
          errorMessage?.toLowerCase().includes('account_id') ||
          errorString.includes('account_id') ||
          (errorMessage?.includes('column') && errorMessage?.includes('account_id'));
        
        const isSymbolError = 
          errorMessage?.includes('Symbol(drizzle:Name)') ||
          errorMessage?.includes('Cannot read properties of undefined') ||
          errorString.includes('symbol') ||
          (errorStack && errorStack.includes('Symbol(drizzle:Name)'));
        
        // If accountId filter was used and column doesn't exist, or Symbol error, retry without accountId
        if ((isAccountIdError || isSymbolError) && accountIdNum !== undefined) {
          this.logger.warn(
            `account_id column missing or Symbol error during findByAccidAndSubid (accid=${accidStr}, subid=${subidStr}, accountId=${accountIdNum}). ` +
            `Falling back to query without accountId filter. Run migrations to add account_id column.`
          );
          user = await this.findOneBy(searchCriteria);
        } else {
          throw error;
        }
      }
      
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

  async update(
    id: string,
    updateData: { email?: string; role?: string; fullname?: string },
    accountId?: number,
  ): Promise<User> {
    if (!id) {
      throw new NotFoundException(`Invalid user ID: ${id}`);
    }

    try {
      // Validate role if provided
      if (updateData.role && !['agent', 'admin', 'manager'].includes(updateData.role)) {
        throw new BadRequestException(`Invalid role: ${updateData.role}. Must be one of: agent, admin, manager`);
      }

      // Build update data object, only including provided fields
      const updateFields: any = {
        updatedAt: new Date(),
      };

      if (updateData.email !== undefined) {
        updateFields.email = updateData.email || null;
      }
      if (updateData.role !== undefined) {
        updateFields.role = updateData.role;
      }
      if (updateData.fullname !== undefined) {
        updateFields.fullname = updateData.fullname || null;
      }

      // Use base service update method which handles accountId filtering
      const updatedUser = await super.update(id, updateFields, accountId);
      return updatedUser;
    } catch (error: any) {
      this.logger.error(`Failed to update user with id=${id}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        `Failed to update user: ${error?.message || 'Unknown error occurred'}`,
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
