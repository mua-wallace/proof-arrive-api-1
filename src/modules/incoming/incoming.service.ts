import { Injectable, Inject, NotFoundException, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PaginateQuery, PaginateResult, BaseEntity } from '@common/interfaces';
import { BaseService } from '@common/services/base.service';
import { eq, and, SQL, desc, asc, count, sql, inArray } from 'drizzle-orm';
import * as schema from '@modules/schemas';
import { CreateIncomingVehicleDto } from './dto/create-incoming-vehicle.dto';
import { UpdateIncomingVehicleDto } from './dto/update-incoming-vehicle.dto';
import { ArrivalStatus } from '@modules/arrivals/dto/arrival-status.enum';

type IncomingVehicle = typeof schema.incomingVehicles.$inferSelect & BaseEntity;

@Injectable()
export class IncomingService extends BaseService<IncomingVehicle> {
  private readonly logger = new Logger(IncomingService.name);
  private readonly dbConnection: any;

  constructor(
    @Inject(DATABASE_CONNECTION)
    db: any,
  ) {
    // Note: incoming_vehicles table uses serial ID and no deletedAt, so we pass it but override methods
    super(db, schema.incomingVehicles as any);
    this.dbConnection = db;
  }

  async findAll(
    query: PaginateQuery = {},
    options?: { include?: string[] },
  ): Promise<PaginateResult<IncomingVehicle>> {
    
    try {
      const page = query.page || 1;
      const limit = query.limit || 100;
      const offset = (page - 1) * limit;

      // Build where conditions (incoming_vehicles don't have deletedAt)
      const conditions: SQL[] = [];

      // Add search functionality
      if (query.search && query.searchBy && query.searchBy.length > 0) {
        const searchConditions = query.searchBy
          .map((field) => {
            const column = (schema.incomingVehicles as any)[field];
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
          const column = (schema.incomingVehicles as any)[field];
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
        orderByClause = [desc(schema.incomingVehicles.createdAt)];
      }

      // Get total count
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const [{ count: total }] = await this.dbConnection
        .select({ count: count() })
        .from(schema.incomingVehicles)
        .where(whereClause);

      // Build relations object for Drizzle query API
      const withRelations: any = {};
      if (options?.include) {
        if (options.include.includes('exit')) {
          withRelations.exit = true;
        }
        if (options.include.includes('vehicle')) {
          withRelations.vehicle = true;
        }
        if (options.include.includes('destinationCenter')) {
          withRelations.destinationCenter = true;
        }
        if (options.include.includes('sourceCenter')) {
          withRelations.sourceCenter = true;
        }
      }

      // Get paginated results with relations
      let data: any[];
      if (Object.keys(withRelations).length > 0) {
        // When relations are requested, first get the IDs that match the conditions
        const matchingIds = await this.dbConnection
          .select({ id: schema.incomingVehicles.id })
          .from(schema.incomingVehicles)
          .where(whereClause)
          .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
          .limit(limit)
          .offset(offset);

        const ids = matchingIds.map((row: any) => row.id);

        if (ids.length > 0) {
          // Use relational query API to get data with relations
          const allData = await this.dbConnection.query.incomingVehicles.findMany({
            where: (incomingVehicles: any, { inArray: inArrayFn }: any) => inArrayFn(incomingVehicles.id, ids),
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
          .from(schema.incomingVehicles)
          .where(whereClause)
          .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
          .limit(limit)
          .offset(offset);
      }

      return {
        data: data as IncomingVehicle[],
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
      this.logger.error(`Failed to fetch incoming vehicles: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to fetch incoming vehicles: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  // Override BaseService.findOneById to handle number IDs (serial) instead of string IDs (UUID)
  async findOneById(id: number | string, options?: { include?: string[] }): Promise<IncomingVehicle> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (!numericId || isNaN(numericId)) {
      throw new NotFoundException(`Invalid incoming vehicle ID: ${id}`);
    }

    try {
      // Build relations object for Drizzle query API
      const withRelations: any = {};
      if (options?.include) {
        if (options.include.includes('exit')) {
          withRelations.exit = true;
        }
        if (options.include.includes('vehicle')) {
          withRelations.vehicle = true;
        }
        if (options.include.includes('destinationCenter')) {
          withRelations.destinationCenter = true;
        }
        if (options.include.includes('sourceCenter')) {
          withRelations.sourceCenter = true;
        }
      }

      let incomingVehicle: any;
      if (Object.keys(withRelations).length > 0) {
        // Use relational query API when relations are requested
        incomingVehicle = await this.dbConnection.query.incomingVehicles.findFirst({
          where: (incomingVehicles: any, { eq: eqFn }: any) => eqFn(incomingVehicles.id, numericId),
          with: withRelations,
        });
      } else {
        // Use standard query when no relations
        [incomingVehicle] = await this.dbConnection
          .select()
          .from(schema.incomingVehicles)
          .where(eq(schema.incomingVehicles.id, numericId))
          .limit(1);
      }

      if (!incomingVehicle) {
        throw new NotFoundException(`Incoming vehicle with ID ${numericId} not found`);
      }
      return incomingVehicle as IncomingVehicle;
    } catch (error: any) {
      this.logger.error(`Failed to fetch incoming vehicle with id=${numericId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to get incoming vehicle details: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async createIncomingVehicle(createDto: CreateIncomingVehicleDto, createdBy: string): Promise<IncomingVehicle> {

    try {
      // Validate exit exists
      const exit = await this.dbConnection
        .select()
        .from(schema.exits)
        .where(eq(schema.exits.id, createDto.exitId))
        .limit(1);

      if (!exit || exit.length === 0) {
        throw new NotFoundException(`Exit with ID ${createDto.exitId} not found`);
      }

      // Validate vehicle exists
      const vehicle = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(eq(schema.vehicles.id, createDto.vehicleId))
        .limit(1);

      if (!vehicle || vehicle.length === 0) {
        throw new NotFoundException(`Vehicle with ID ${createDto.vehicleId} not found`);
      }

      // Validate destination center exists
      const destCenter = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(eq(schema.centers.id, createDto.destinationCenterId))
        .limit(1);

      if (!destCenter || destCenter.length === 0) {
        throw new NotFoundException(`Destination center with ID ${createDto.destinationCenterId} not found`);
      }

      // Validate source center exists
      const sourceCenter = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(eq(schema.centers.id, createDto.sourceCenterId))
        .limit(1);

      if (!sourceCenter || sourceCenter.length === 0) {
        throw new NotFoundException(`Source center with ID ${createDto.sourceCenterId} not found`);
      }

      // Check if incoming vehicle already exists for this exit
      const existing = await this.dbConnection
        .select()
        .from(schema.incomingVehicles)
        .where(eq(schema.incomingVehicles.exitId, createDto.exitId))
        .limit(1);

      if (existing && existing.length > 0) {
        throw new BadRequestException(`Incoming vehicle already exists for exit ID ${createDto.exitId}`);
      }

      // Create incoming vehicle
      const [incomingVehicle] = await this.dbConnection
        .insert(schema.incomingVehicles)
        .values({
          exitId: createDto.exitId,
          vehicleId: createDto.vehicleId,
          destinationCenterId: createDto.destinationCenterId,
          sourceCenterId: createDto.sourceCenterId,
          createdBy: createdBy, // The logged-in user who created the record
          status: createDto.status || ArrivalStatus.IN_TRANSIT,
          estimatedArrival: createDto.estimatedArrival || null,
          distanceKm: createDto.distanceKm || null,
        })
        .returning();

      return incomingVehicle as IncomingVehicle;
    } catch (error: any) {
      this.logger.error(`Failed to create incoming vehicle: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        `Failed to create incoming vehicle: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async update(id: number | string, updateDto: UpdateIncomingVehicleDto): Promise<IncomingVehicle> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (!numericId || isNaN(numericId)) {
      throw new NotFoundException(`Invalid incoming vehicle ID: ${id}`);
    }

    try {
      // Check if incoming vehicle exists
      await this.findOneById(numericId);

      // Build update data
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (updateDto.status !== undefined) {
        updateData.status = updateDto.status;
      }
      if (updateDto.estimatedArrival !== undefined) {
        updateData.estimatedArrival = updateDto.estimatedArrival;
      }
      if (updateDto.actualArrival !== undefined) {
        updateData.actualArrival = updateDto.actualArrival;
      }
      if (updateDto.distanceKm !== undefined) {
        updateData.distanceKm = updateDto.distanceKm;
      }

      // Update incoming vehicle
      const [updated] = await this.dbConnection
        .update(schema.incomingVehicles)
        .set(updateData)
        .where(eq(schema.incomingVehicles.id, numericId))
        .returning();

      return updated as IncomingVehicle;
    } catch (error: any) {
      this.logger.error(`Failed to update incoming vehicle with id=${numericId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to update incoming vehicle: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  // Override BaseService.remove to handle number IDs (serial) instead of string IDs (UUID)
  async remove(id: number | string): Promise<IncomingVehicle> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (!numericId || isNaN(numericId)) {
      throw new NotFoundException(`Invalid incoming vehicle ID: ${id}`);
    }

    try {
      // First check if incoming vehicle exists
      const incomingVehicle = await this.findOneById(numericId);
      
      // Delete the incoming vehicle
      await this.dbConnection
        .delete(schema.incomingVehicles)
        .where(eq(schema.incomingVehicles.id, numericId));

      return incomingVehicle;
    } catch (error: any) {
      this.logger.error(`Failed to remove incoming vehicle with id=${numericId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to remove incoming vehicle: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }
}
