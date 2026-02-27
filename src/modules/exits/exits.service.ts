import { Injectable, Inject, NotFoundException, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PaginateQuery, PaginateResult, BaseEntity } from '@common/interfaces';
import { BaseService } from '@common/services/base.service';
import { eq, and, SQL, desc, asc, count, sql, inArray } from 'drizzle-orm';
import * as schema from '@modules/schemas';
import { CreateExitDto } from './dto/create-exit.dto';
import { UpdateExitDto } from './dto/update-exit.dto';

type Exit = typeof schema.exits.$inferSelect & BaseEntity;

@Injectable()
export class ExitsService extends BaseService<Exit> {
  private readonly logger = new Logger(ExitsService.name);
  private readonly dbConnection: any;

  constructor(
    @Inject(DATABASE_CONNECTION)
    db: any,
  ) {
    // Note: exits table uses serial ID and no deletedAt, so we pass it but override methods
    super(db, schema.exits as any);
    this.dbConnection = db;
  }

  async findAll(
    query: PaginateQuery = {},
    options?: { include?: string[]; status?: string; destinationCenterId?: number; accountId?: number },
  ): Promise<PaginateResult<Exit>> {
    
    try {
      const page = query.page || 1;
      const limit = query.limit || 100;
      const offset = (page - 1) * limit;

      // Build where conditions (exits don't have deletedAt)
      const conditions: SQL[] = [];

      // Automatically filter by accountId if provided
      if (options?.accountId !== undefined) {
        conditions.push(eq(schema.exits.accountId, options.accountId));
      }

      // Filter by status if provided
      if (options?.status) {
        conditions.push(eq(schema.exits.status, options.status));
      }

      // Filter by destinationCenterId (direct center ID) if provided
      if (options?.destinationCenterId !== undefined && options?.destinationCenterId !== null) {
        conditions.push(eq(schema.exits.destinationCenterId, Number(options.destinationCenterId)));
      }

      // Add search functionality
      if (query.search && query.searchBy && query.searchBy.length > 0) {
        const searchConditions = query.searchBy
          .map((field) => {
            const column = (schema.exits as any)[field];
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
          const column = (schema.exits as any)[field];
          if (column) {
            return direction === 'DESC' ? desc(column) : asc(column);
          }
          return null;
        }).filter(Boolean);

        if (sortFields.length > 0) {
          orderByClause = sortFields;
        }
      }

      // Default ordering by exitedAt DESC if no sort specified
      if (!orderByClause) {
        orderByClause = [desc(schema.exits.exitedAt)];
      }

      // Get total count
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      let countResult;
      if (whereClause) {
        countResult = await this.dbConnection
          .select({ count: count() })
          .from(schema.exits)
          .where(whereClause);
      } else {
        countResult = await this.dbConnection
          .select({ count: count() })
          .from(schema.exits);
      }
      const [{ count: total }] = countResult;

      // Build relations object for Drizzle query API
      const withRelations: any = {};
      if (options?.include) {
        if (options.include.includes('vehicle')) {
          withRelations.vehicle = true;
        }
        if (options.include.includes('center')) {
          withRelations.center = true;
        }
        if (options.include.includes('agent')) {
          withRelations.agent = true;
        }
        if (options.include.includes('destinationCenter')) {
          withRelations.destinationCenter = true;
        }
      }
      
      // Automatically include destinationCenter relation when filtering by destinationCenterId
      // This ensures the center's fullname is available in the response
      if (options?.destinationCenterId !== undefined && options?.destinationCenterId !== null && !withRelations.destinationCenter) {
        withRelations.destinationCenter = true;
      }

      // Get paginated results with relations
      let data: any[];
      if (Object.keys(withRelations).length > 0) {
        // When relations are requested, first get the IDs that match the conditions
        const matchingIdsQuery = this.dbConnection
          .select({ id: schema.exits.id })
          .from(schema.exits);
        
        const matchingIds = whereClause
          ? await matchingIdsQuery.where(whereClause)
              .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
              .limit(limit)
              .offset(offset)
          : await matchingIdsQuery
              .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
              .limit(limit)
              .offset(offset);

        const ids = matchingIds.map((row: any) => row.id);

        if (ids.length > 0) {
          // Use relational query API to get data with relations
          const allData = await this.dbConnection.query.exits.findMany({
            where: (exits: any, { inArray: inArrayFn }: any) => inArrayFn(exits.id, ids),
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
        if (whereClause) {
          data = await this.dbConnection
            .select()
            .from(schema.exits)
            .where(whereClause)
            .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
            .limit(limit)
            .offset(offset);
        } else {
          data = await this.dbConnection
            .select()
            .from(schema.exits)
            .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
            .limit(limit)
            .offset(offset);
        }
      }

      return {
        data: data as Exit[],
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
      // Log detailed error information for debugging
      this.logger.error(
        `Failed to fetch exits: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      
      // Log additional error details for production debugging
      if (error?.cause) {
        this.logger.error(`Error cause: ${JSON.stringify(error.cause)}`);
      }
      if (error?.code) {
        this.logger.error(`Error code: ${error.code}`);
      }
      if (error?.detail) {
        this.logger.error(`Error detail: ${error.detail}`);
      }
      if (error?.hint) {
        this.logger.error(`Error hint: ${error.hint}`);
      }
      
      // Check if it's a table/column not found error
      const errorMessage = error?.message?.toLowerCase() || '';
      if (errorMessage.includes('does not exist') || errorMessage.includes('relation') || errorMessage.includes('column')) {
        this.logger.error(
          '⚠️  Database schema mismatch detected. Please ensure migrations have been run in production.',
        );
      }
      
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to fetch exits: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  // Override BaseService.findOneById to handle number IDs (serial) instead of string IDs (UUID)
  async findOneById(id: number | string, options?: { include?: string[]; accountId?: number }): Promise<Exit> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (!numericId || isNaN(numericId)) {
      throw new NotFoundException(`Invalid exit ID: ${id}`);
    }

    try {
      // Build where conditions
      const whereConditions: SQL[] = [eq(schema.exits.id, numericId)];
      
      // Automatically filter by accountId if provided
      if (options?.accountId !== undefined) {
        whereConditions.push(eq(schema.exits.accountId, options.accountId));
      }

      // Build relations object for Drizzle query API
      const withRelations: any = {};
      if (options?.include) {
        if (options.include.includes('vehicle')) {
          withRelations.vehicle = true;
        }
        if (options.include.includes('center')) {
          withRelations.center = true;
        }
        if (options.include.includes('agent')) {
          withRelations.agent = true;
        }
        if (options.include.includes('destinationCenter')) {
          withRelations.destinationCenter = true;
        }
      }

      let exit: any;
      if (Object.keys(withRelations).length > 0) {
        // Use relational query API when relations are requested
        exit = await this.dbConnection.query.exits.findFirst({
          where: (exits: any, { eq: eqFn, and: andFn }: any) => {
            const conditions = [eqFn(exits.id, numericId)];
            if (options?.accountId !== undefined) {
              conditions.push(eqFn(exits.accountId, options.accountId));
            }
            return andFn(...conditions);
          },
          with: withRelations,
        });
      } else {
        // Use standard query when no relations
        [exit] = await this.dbConnection
          .select()
          .from(schema.exits)
          .where(and(...whereConditions))
          .limit(1);
      }

      if (!exit) {
        throw new NotFoundException(`Exit with ID ${numericId} not found`);
      }
      return exit as Exit;
    } catch (error: any) {
      this.logger.error(`Failed to fetch exit with id=${numericId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to get exit details: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async createExit(createDto: CreateExitDto, agentId: number, accountId: number): Promise<Exit> {

    try {
      // Validate vehicle exists and belongs to the account
      const [vehicle] = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.thirdPartyId, createDto.vehicleId),
            eq(schema.vehicles.accountId, accountId),
          ),
        )
        .limit(1);

      if (!vehicle) {
        throw new NotFoundException(
          `Vehicle with thirdPartyId ${createDto.vehicleId} not found. ` +
          `Please ensure the vehicle is synced from the Malambi API first using POST /api/v1/vehicles/sync?vehicle_id=${createDto.vehicleId}`
        );
      }

      // Validate center exists and belongs to the account
      const [center] = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(
          and(
            eq(schema.centers.geozoneId, createDto.centerId),
            eq(schema.centers.accountId, accountId),
          ),
        )
        .limit(1);

      if (!center) {
        throw new NotFoundException(`Center with geozoneId ${createDto.centerId} not found`);
      }

      // Validate destination center exists (if provided) and belongs to the account
      let destinationCenterId: number | null = null;
      if (createDto.destinationCenterId) {
        const [destCenter] = await this.dbConnection
          .select()
          .from(schema.centers)
          .where(
            and(
              eq(schema.centers.geozoneId, createDto.destinationCenterId),
              eq(schema.centers.accountId, accountId),
            ),
          )
          .limit(1);

        if (!destCenter) {
          throw new NotFoundException(`Destination center with geozoneId ${createDto.destinationCenterId} not found`);
        }
        destinationCenterId = destCenter.geozoneId;
      }

      // Create exit using third-party IDs (thirdPartyId and geozoneId) to match schema foreign keys
      const [exit] = await this.dbConnection
        .insert(schema.exits)
        .values({
          accountId: accountId, // Multi-tenant: account ID from logged-in user
          vehicleId: vehicle.thirdPartyId, // Use thirdPartyId to match schema FK
          centerId: center.geozoneId, // Use geozoneId to match schema FK
          agentId: Number(agentId), // Use subid (users.id equals subid)
          createdBy: Number(agentId), // The logged-in user who created the record (users.id equals subid)
          exitType: createDto.exitType,
          status: createDto.status,
          destinationCenterId: destinationCenterId,
          destinationName: createDto.destinationName || null,
          latitude: createDto.latitude || null,
          longitude: createDto.longitude || null,
          notes: createDto.notes || null,
          exitedAt: new Date(),
        })
        .returning();

      return exit as Exit;
    } catch (error: any) {
      this.logger.error(`Failed to create exit: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        `Failed to create exit: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async update(id: number | string, updateDto: UpdateExitDto, accountId?: number): Promise<Exit> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (!numericId || isNaN(numericId)) {
      throw new NotFoundException(`Invalid exit ID: ${id}`);
    }

    try {
      // Check if exit exists and belongs to the account
      await this.findOneById(numericId, { accountId });

      // Build update data
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (updateDto.exitType !== undefined) {
        updateData.exitType = updateDto.exitType;
      }
      if (updateDto.status !== undefined) {
        updateData.status = updateDto.status;
      }
      if (updateDto.destinationCenterId !== undefined) {
        // Validate destination center exists if provided and belongs to the account
        if (updateDto.destinationCenterId !== null) {
          const whereConditions: SQL[] = [eq(schema.centers.id, updateDto.destinationCenterId)];
          if (accountId !== undefined) {
            whereConditions.push(eq(schema.centers.accountId, accountId));
          }
          const destCenter = await this.dbConnection
            .select()
            .from(schema.centers)
            .where(and(...whereConditions))
            .limit(1);

          if (!destCenter || destCenter.length === 0) {
            throw new NotFoundException(`Destination center with ID ${updateDto.destinationCenterId} not found`);
          }
        }
        updateData.destinationCenterId = updateDto.destinationCenterId;
      }
      if (updateDto.destinationName !== undefined) {
        updateData.destinationName = updateDto.destinationName;
      }
      if (updateDto.latitude !== undefined) {
        updateData.latitude = updateDto.latitude;
      }
      if (updateDto.longitude !== undefined) {
        updateData.longitude = updateDto.longitude;
      }
      if (updateDto.notes !== undefined) {
        updateData.notes = updateDto.notes;
      }

      // Update exit
      const whereConditions: SQL[] = [eq(schema.exits.id, numericId)];
      if (accountId !== undefined) {
        whereConditions.push(eq(schema.exits.accountId, accountId));
      }

      const [updated] = await this.dbConnection
        .update(schema.exits)
        .set(updateData)
        .where(and(...whereConditions))
        .returning();

      return updated as Exit;
    } catch (error: any) {
      this.logger.error(`Failed to update exit with id=${numericId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to update exit: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  // Override BaseService.remove to handle number IDs (serial) instead of string IDs (UUID)
  async remove(id: number | string, accountId?: number): Promise<Exit> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (!numericId || isNaN(numericId)) {
      throw new NotFoundException(`Invalid exit ID: ${id}`);
    }

    try {
      // First check if exit exists and belongs to the account
      const exit = await this.findOneById(numericId, { accountId });

      // Delete the exit
      const whereConditions: SQL[] = [eq(schema.exits.id, numericId)];
      if (accountId !== undefined) {
        whereConditions.push(eq(schema.exits.accountId, accountId));
      }

      await this.dbConnection
        .delete(schema.exits)
        .where(and(...whereConditions));

      return exit;
    } catch (error: any) {
      this.logger.error(`Failed to remove exit with id=${numericId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to remove exit: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }
}
