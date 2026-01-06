import { Injectable, Inject, NotFoundException, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PaginateQuery, PaginateResult, BaseEntity } from '@common/interfaces';
import { BaseService } from '@common/services/base.service';
import { eq, and, SQL, desc, asc, count, sql, inArray } from 'drizzle-orm';
import * as schema from '@modules/schemas';
import { CreateArrivalDto } from './dto/create-arrival.dto';
import { UpdateArrivalStatusDto } from './dto/update-arrival-status.dto';
import { CreateProcessingStageDto } from './dto/create-processing-stage.dto';
import { UpdateProcessingStageDto } from './dto/update-processing-stage.dto';
import { ArrivalStatus } from './dto/arrival-status.enum';


type Arrival = typeof schema.arrivals.$inferSelect & BaseEntity;
type ProcessingStage = typeof schema.processingStages.$inferSelect & BaseEntity;

@Injectable()
export class ArrivalsService extends BaseService<Arrival> {
  private readonly logger = new Logger(ArrivalsService.name);
  private readonly dbConnection: any;

  constructor(
    @Inject(DATABASE_CONNECTION)
    db: any,
  ) {
    // Note: arrivals table uses serial ID and no deletedAt, so we pass it but override methods
    super(db, schema.arrivals as any);
    this.dbConnection = db;
  }

  /**
   * Transform arrival response - no longer needed as we store thirdPartyId and geozoneId directly
   * Kept for backward compatibility but returns data as-is
   */
  private async transformArrivalResponse(arrival: any): Promise<any> {
    // Data is already stored as thirdPartyId and geozoneId, no transformation needed
    return arrival;
  }

  /**
   * Transform multiple arrival responses - no longer needed as we store thirdPartyId and geozoneId directly
   * Kept for backward compatibility but returns data as-is
   */
  private async transformArrivalResponses(arrivals: any[]): Promise<any[]> {
    // Data is already stored as thirdPartyId and geozoneId, no transformation needed
    return arrivals;
  }

  async findAll(
    query: PaginateQuery = {},
    options?: { include?: string[] },
  ): Promise<PaginateResult<Arrival>> {
    
    try {
      const page = query.page || 1;
      const limit = query.limit || 100;
      const offset = (page - 1) * limit;

      // Build where conditions (arrivals don't have deletedAt)
      const conditions: SQL[] = [];

      // Add search functionality
      if (query.search && query.searchBy && query.searchBy.length > 0) {
        const searchConditions = query.searchBy
          .map((field) => {
            const column = (schema.arrivals as any)[field];
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
          const column = (schema.arrivals as any)[field];
          if (column) {
            return direction === 'DESC' ? desc(column) : asc(column);
          }
          return null;
        }).filter(Boolean);

        if (sortFields.length > 0) {
          orderByClause = sortFields;
        }
      }

      // Default ordering by arrivedAt DESC if no sort specified
      if (!orderByClause) {
        orderByClause = [desc(schema.arrivals.arrivedAt)];
      }

      // Get total count
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const [{ count: total }] = await this.dbConnection
        .select({ count: count() })
        .from(schema.arrivals)
        .where(whereClause);

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
        if (options.include.includes('processingStages')) {
          withRelations.processingStages = true;
        }
      }

      // Get paginated results with relations
      let data: any[];
      if (Object.keys(withRelations).length > 0) {
        // When relations are requested, first get the IDs that match the conditions
        const matchingIds = await this.dbConnection
          .select({ id: schema.arrivals.id })
          .from(schema.arrivals)
          .where(whereClause)
          .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
          .limit(limit)
          .offset(offset);

        const ids = matchingIds.map((row: any) => row.id);

        if (ids.length > 0) {
          try {
            // Use relational query API to get data with relations
            const allData = await this.dbConnection.query.arrivals.findMany({
              where: (arrivals: any, { inArray: inArrayFn }: any) => inArrayFn(arrivals.id, ids),
              with: withRelations,
            });
            // Re-sort to match original order
            const idMap = new Map<number, number>(ids.map((id: number, idx: number) => [id, idx]));
            allData.sort((a: any, b: any) => {
              const aIdx: number = idMap.get(a.id) ?? 0;
              const bIdx: number = idMap.get(b.id) ?? 0;
              return aIdx - bIdx;
            });
            // Filter out arrivals with missing required relations (e.g., vehicle, center)
            // This handles cases where foreign key references point to deleted records
            data = allData.filter((arrival: any) => {
              if (withRelations.vehicle && !arrival.vehicle) {
                return false; // Exclude arrivals with missing vehicles
              }
              if (withRelations.center && !arrival.center) {
                return false; // Exclude arrivals with missing centers
              }
              return true;
            });
          } catch (error: any) {
            // If relational query fails (e.g., due to missing relations or database constraints),
            // fall back to standard query without relations
            // Fall back to query without relations to avoid breaking the request
            data = await this.dbConnection
              .select()
              .from(schema.arrivals)
              .where(
                and(
                  whereClause,
                  inArray(schema.arrivals.id, ids),
                ),
              )
              .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
              .limit(limit)
              .offset(offset);
          }
        } else {
          data = [];
        }
      } else {
        // Use standard query when no relations
        data = await this.dbConnection
          .select()
          .from(schema.arrivals)
          .where(whereClause)
          .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
          .limit(limit)
          .offset(offset);
      }

      // Transform arrivals to show thirdPartyId and geozoneId instead of internal IDs
      const transformedData = await this.transformArrivalResponses(data);

      return {
        data: transformedData as Arrival[],
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
      this.logger.error(`Failed to fetch arrivals: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to fetch arrivals: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  // Override BaseService.findOneById to handle number IDs (serial) instead of string IDs (UUID)
  async findOneById(id: number | string, options?: { include?: string[] }): Promise<Arrival> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (!numericId || isNaN(numericId)) {
      throw new NotFoundException(`Invalid arrival ID: ${id}`);
    }

    try {
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
        if (options.include.includes('processingStages')) {
          withRelations.processingStages = true;
        }
      }

      let arrival: any;
      if (Object.keys(withRelations).length > 0) {
        // Use relational query API when relations are requested
        arrival = await this.dbConnection.query.arrivals.findFirst({
          where: (arrivals: any, { eq: eqFn }: any) => eqFn(arrivals.id, numericId),
          with: withRelations,
        });
      } else {
        // Use standard query when no relations
        [arrival] = await this.dbConnection
          .select()
          .from(schema.arrivals)
          .where(eq(schema.arrivals.id, numericId))
          .limit(1);
      }

      if (!arrival) {
        throw new NotFoundException(`Arrival with ID ${numericId} not found`);
      }
      
      // Transform arrival to show thirdPartyId and geozoneId instead of internal IDs
      const transformedArrival = await this.transformArrivalResponse(arrival);
      return transformedArrival as Arrival;
    } catch (error: any) {
      this.logger.error(`Failed to fetch arrival with id=${numericId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to get arrival details: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async createArrival(createDto: CreateArrivalDto, agentId: string): Promise<Arrival> {

    try {
      // Validate vehicle exists
      const [vehicle] = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(eq(schema.vehicles.thirdPartyId, createDto.vehicleId))
        .limit(1);

      if (!vehicle) {
        throw new NotFoundException(
          `Vehicle with thirdPartyId ${createDto.vehicleId} not found. ` +
          `Please ensure the vehicle is synced from the Malambi API first using POST /api/v1/vehicles/sync?vehicle_id=${createDto.vehicleId}`
        );
      }

      // Validate center exists
      const [center] = await this.dbConnection
        .select()
        .from(schema.centers)
        .where(eq(schema.centers.geozoneId, createDto.centerId))
        .limit(1);

      if (!center) {
        throw new NotFoundException(`Center with geozoneId ${createDto.centerId} not found`);
      }

      // Create arrival using third-party IDs (thirdPartyId and geozoneId) to match schema foreign keys
      const [arrival] = await this.dbConnection
        .insert(schema.arrivals)
        .values({
          vehicleId: vehicle.thirdPartyId, // Use thirdPartyId to match schema FK
          centerId: center.geozoneId, // Use geozoneId to match schema FK
          agentId: agentId,
          createdBy: agentId, // The logged-in user who created the record
          status: createDto.status || ArrivalStatus.ARRIVED,
          latitude: createDto.latitude || null,
          longitude: createDto.longitude || null,
          notes: createDto.notes || null,
          arrivedAt: new Date(),
        })
        .returning();

      return arrival as Arrival;
    } catch (error: any) {
      this.logger.error(`Failed to create arrival: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        `Failed to create arrival: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async updateStatus(id: number | string, updateDto: UpdateArrivalStatusDto): Promise<Arrival> {
    const numericId = typeof id === 'string' ? Number(id) : id;

    if (!numericId || isNaN(numericId)) {
      throw new NotFoundException(`Invalid arrival ID: ${id}`);
    }

    try {
      // Check if arrival exists
      await this.findOneById(numericId);

      // Update status
      const [updated] = await this.dbConnection
        .update(schema.arrivals)
        .set({
          status: updateDto.status,
          updatedAt: new Date(),
        })
        .where(eq(schema.arrivals.id, numericId))
        .returning();

      // Transform arrival to show thirdPartyId and geozoneId instead of internal IDs
      const transformedArrival = await this.transformArrivalResponse(updated);
      return transformedArrival as Arrival;
    } catch (error: any) {
      this.logger.error(`Failed to update arrival status for id=${numericId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to update arrival status: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async getAllProcessingStages(
    query: PaginateQuery = {},
    options?: { include?: string[] },
  ): Promise<PaginateResult<ProcessingStage>> {
    try {
      const page = query.page || 1;
      const limit = query.limit || 100;
      const offset = (page - 1) * limit;

      // Build where conditions
      const conditions: SQL[] = [];

      // Add search functionality
      if (query.search && query.searchBy && query.searchBy.length > 0) {
        const searchConditions = query.searchBy
          .map((field) => {
            const column = (schema.processingStages as any)[field];
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
          const column = (schema.processingStages as any)[field];
          if (column) {
            return direction === 'DESC' ? desc(column) : asc(column);
          }
          return null;
        }).filter(Boolean);

        if (sortFields.length > 0) {
          orderByClause = sortFields;
        }
      }

      // Default ordering by startedAt DESC if no sort specified
      if (!orderByClause) {
        orderByClause = [desc(schema.processingStages.startedAt)];
      }

      // Get total count
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const [{ count: total }] = await this.dbConnection
        .select({ count: count() })
        .from(schema.processingStages)
        .where(whereClause);

      // Build relations object for Drizzle query API
      const withRelations: any = {};
      if (options?.include) {
        if (options.include.includes('arrival')) {
          withRelations.arrival = true;
        }
      }

      // Get paginated results with relations
      let data: any[];
      if (Object.keys(withRelations).length > 0) {
        // When relations are requested, first get the IDs that match the conditions
        const matchingIds = await this.dbConnection
          .select({ id: schema.processingStages.id })
          .from(schema.processingStages)
          .where(whereClause)
          .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
          .limit(limit)
          .offset(offset);

        const ids = matchingIds.map((row: any) => row.id);

        if (ids.length > 0) {
          try {
            // Use relational query API to get data with relations
            const allData = await this.dbConnection.query.processingStages.findMany({
              where: (processingStages: any, { inArray: inArrayFn }: any) => inArrayFn(processingStages.id, ids),
              with: withRelations,
            });
            // Re-sort to match original order
            const idMap = new Map<number, number>(ids.map((id: number, idx: number) => [id, idx]));
            allData.sort((a: any, b: any) => {
              const aIdx: number = idMap.get(a.id) ?? 0;
              const bIdx: number = idMap.get(b.id) ?? 0;
              return aIdx - bIdx;
            });
            // Filter out processing stages with missing required relations
            data = allData.filter((stage: any) => {
              if (withRelations.arrival && !stage.arrival) {
                return false; // Exclude stages with missing arrivals
              }
              return true;
            });
          } catch (error: any) {
            // If relational query fails, fall back to standard query without relations
            data = await this.dbConnection
              .select()
              .from(schema.processingStages)
              .where(
                and(
                  whereClause,
                  inArray(schema.processingStages.id, ids),
                ),
              )
              .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
              .limit(limit)
              .offset(offset);
          }
        } else {
          data = [];
        }
      } else {
        // Use standard query when no relations
        data = await this.dbConnection
          .select()
          .from(schema.processingStages)
          .where(whereClause)
          .orderBy(...(Array.isArray(orderByClause) ? orderByClause : [orderByClause]))
          .limit(limit)
          .offset(offset);
      }

      return {
        data: data as ProcessingStage[],
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
      this.logger.error(`Failed to fetch all processing stages: ${error?.message || 'Unknown error'}`, error?.stack);
      throw new InternalServerErrorException(
        `Failed to fetch processing stages: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async getProcessingStage(
    arrivalId: number | string,
    stageId: number | string,
  ): Promise<ProcessingStage> {
    const numericArrivalId = typeof arrivalId === 'string' ? Number(arrivalId) : arrivalId;
    const numericStageId = typeof stageId === 'string' ? Number(stageId) : stageId;

    if (!numericArrivalId || isNaN(numericArrivalId)) {
      throw new NotFoundException(`Invalid arrival ID: ${arrivalId}`);
    }

    if (!numericStageId || isNaN(numericStageId)) {
      throw new NotFoundException(`Invalid processing stage ID: ${stageId}`);
    }

    try {
      // Check if arrival exists
      await this.findOneById(numericArrivalId);

      // Get processing stage
      const [stage] = await this.dbConnection
        .select()
        .from(schema.processingStages)
        .where(
          and(
            eq(schema.processingStages.id, numericStageId),
            eq(schema.processingStages.arrivalId, numericArrivalId),
          ),
        )
        .limit(1);

      if (!stage) {
        throw new NotFoundException(
          `Processing stage with ID ${numericStageId} not found for arrival ${numericArrivalId}`,
        );
      }

      return stage as ProcessingStage;
    } catch (error: any) {
      this.logger.error(`Failed to fetch processing stage id=${numericStageId} for arrivalId=${numericArrivalId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to get processing stage details: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async createProcessingStage(
    arrivalId: number | string,
    createDto: CreateProcessingStageDto,
  ): Promise<ProcessingStage> {
    const numericArrivalId = typeof arrivalId === 'string' ? Number(arrivalId) : arrivalId;

    if (!numericArrivalId || isNaN(numericArrivalId)) {
      throw new NotFoundException(`Invalid arrival ID: ${arrivalId}`);
    }

    try {
      // Check if arrival exists
      await this.findOneById(numericArrivalId);

      // Create processing stage
      // Note: startedAt must be explicitly set to null - it will only be set when status changes to in_processing via updateProcessingStage
      const insertValues: any = {
        arrivalId: numericArrivalId,
        stageType: createDto.stageType,
        startedAt: null, // Explicitly set to null to prevent any database defaults or triggers
        completedAt: null, // Explicitly set to null for consistency
        notes: createDto.notes || null,
      };

      // Only include status if provided
      if (createDto.status !== undefined) {
        insertValues.status = createDto.status;
      }

      const [stage] = await this.dbConnection
        .insert(schema.processingStages)
        .values(insertValues)
        .returning();

      return stage as ProcessingStage;
    } catch (error: any) {
      this.logger.error(`Failed to create processing stage for arrivalId=${numericArrivalId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to create processing stage: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async updateProcessingStage(
    arrivalId: number | string,
    stageId: number | string,
    updateDto: UpdateProcessingStageDto,
  ): Promise<ProcessingStage> {
    const numericArrivalId = typeof arrivalId === 'string' ? Number(arrivalId) : arrivalId;
    const numericStageId = typeof stageId === 'string' ? Number(stageId) : stageId;

    if (!numericArrivalId || isNaN(numericArrivalId)) {
      throw new NotFoundException(`Invalid arrival ID: ${arrivalId}`);
    }

    if (!numericStageId || isNaN(numericStageId)) {
      throw new NotFoundException(`Invalid processing stage ID: ${stageId}`);
    }

    try {
      // Check if arrival exists
      await this.findOneById(numericArrivalId);

      // Check if processing stage exists and belongs to this arrival
      const [stage] = await this.dbConnection
        .select()
        .from(schema.processingStages)
        .where(
          and(
            eq(schema.processingStages.id, numericStageId),
            eq(schema.processingStages.arrivalId, numericArrivalId),
          ),
        )
        .limit(1);

      if (!stage) {
        throw new NotFoundException(
          `Processing stage with ID ${numericStageId} not found for arrival ${numericArrivalId}`,
        );
      }

      // Update processing stage
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (updateDto.status !== undefined) {
        updateData.status = updateDto.status;
        // If status is being set to in_processing, set startedAt
        if (updateDto.status === ArrivalStatus.IN_PROCESSING && !stage.startedAt) {
          updateData.startedAt = new Date();
        }
        // If status is being set to completed, set completedAt
        if (updateDto.status === ArrivalStatus.COMPLETED && !stage.completedAt) {
          updateData.completedAt = new Date();
        }
        // If status is being changed from completed, clear completedAt
        if (updateDto.status !== ArrivalStatus.COMPLETED && stage.completedAt) {
          updateData.completedAt = null;
        }
      }

      if (updateDto.notes !== undefined) {
        updateData.notes = updateDto.notes;
      }

      const [updated] = await this.dbConnection
        .update(schema.processingStages)
        .set(updateData)
        .where(eq(schema.processingStages.id, numericStageId))
        .returning();

      return updated as ProcessingStage;
    } catch (error: any) {
      this.logger.error(`Failed to update processing stage id=${numericStageId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to update processing stage: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }

  async removeProcessingStage(
    arrivalId: number | string,
    stageId: number | string,
  ): Promise<ProcessingStage> {
    const numericArrivalId = typeof arrivalId === 'string' ? Number(arrivalId) : arrivalId;
    const numericStageId = typeof stageId === 'string' ? Number(stageId) : stageId;

    if (!numericArrivalId || isNaN(numericArrivalId)) {
      throw new NotFoundException(`Invalid arrival ID: ${arrivalId}`);
    }

    if (!numericStageId || isNaN(numericStageId)) {
      throw new NotFoundException(`Invalid processing stage ID: ${stageId}`);
    }

    try {
      // Check if arrival exists
      await this.findOneById(numericArrivalId);

      // Check if processing stage exists and belongs to this arrival
      const [stage] = await this.dbConnection
        .select()
        .from(schema.processingStages)
        .where(
          and(
            eq(schema.processingStages.id, numericStageId),
            eq(schema.processingStages.arrivalId, numericArrivalId),
          ),
        )
        .limit(1);

      if (!stage) {
        throw new NotFoundException(
          `Processing stage with ID ${numericStageId} not found for arrival ${numericArrivalId}`,
        );
      }

      // Delete the processing stage
      await this.dbConnection
        .delete(schema.processingStages)
        .where(eq(schema.processingStages.id, numericStageId));

      return stage as ProcessingStage;
    } catch (error: any) {
      this.logger.error(`Failed to remove processing stage id=${numericStageId} for arrivalId=${numericArrivalId}: ${error?.message || 'Unknown error'}`, error?.stack);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        `Failed to remove processing stage: ${error?.message || 'Unknown error occurred'}`,
      );
    }
  }
}
