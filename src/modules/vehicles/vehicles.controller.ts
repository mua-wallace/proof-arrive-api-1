import { Controller, Post, Get, Put, Delete, Query, Param, Body, BadRequestException, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth, ApiQuery, ApiResponse, ApiBody } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { QrCodeService } from './qr-code.service';
import { CurrentUserCredentials } from '@modules/auth/decorators/current-user-credentials.decorator';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Credentials, PaginateQuery, PaginateResult } from '@common/interfaces';
import { FilterVehiclesDto, FilterVehicleGroupsDto, VehicleGroupDto, BulkQrCodeDto, UpdateVehicleStatusDto, UpdateVehicleAssignmentDto } from './dto';
import { VehicleStatus } from '@common/enums/vehicle-status.enum';
import * as schema from '@modules/schemas';

type Vehicle = typeof schema.vehicles.$inferSelect;

@Controller('vehicles')
@ApiTags('Vehicles')
@ApiBearerAuth()
@UseGuards(RolesGuard)
export class VehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly qrCodeService: QrCodeService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List all synced vehicles in the system with filtering and pagination',
    description: 'Retrieves a paginated list of vehicles that have been synced from the Malambi API. Supports filtering, searching, sorting, and optional relation loading (qrCodes, group, assignedCenter, currentCenter).',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term' })
  @ApiQuery({ name: 'searchBy', required: false, type: String, description: 'Comma-separated fields to search in' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Comma-separated sort fields (format: field:direction)' })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (qrCodes, group, assignedCenter, currentCenter)' })
  async findAll(
    @Query() filterDto: FilterVehiclesDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<PaginateResult<Vehicle>> {
    const query = {
      page: filterDto.page ?? 1,
      limit: filterDto.limit ?? 100,
      search: filterDto.search,
      searchBy: filterDto.searchBy ? filterDto.searchBy.split(',') : undefined,
      sortBy: filterDto.sortBy
        ? (filterDto.sortBy.split(',').map((s) => {
            const [field, direction] = s.split(':');
            return [field, (direction || 'ASC').toUpperCase()] as [string, 'ASC' | 'DESC'];
          }) as [string, 'ASC' | 'DESC'][])
        : undefined,
    };

    // Convert accid to number for accountId (multi-tenant filtering)
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }

    const options = {
      include: filterDto.include ? filterDto.include.split(',') : undefined,
      accountId: accountIdNum, // Multi-tenant: filter by account ID
    };

    return this.vehiclesService.findAll(query, options);
  }

  @Get('from-api')
  @ApiOperation({
    summary: 'Get vehicle from Malambi API',
    description: 'This endpoint fetches a vehicle from the Malambi API without saving it to the database.',
  })
  @ApiQuery({ name: 'vehicle_id', required: true, type: String, description: 'The vehicle ID from Malambi API' })
  async getVehicleFromApi(
    @CurrentUserCredentials() credentials: Credentials,
    @Query('vehicle_id') vehicleId: string,
  ) {
    if (!vehicleId) {
      throw new BadRequestException('vehicle_id is required');
    }

    return this.vehiclesService.getVehicleFromApi(
      credentials.token,
      credentials.accid.toString(),
      credentials.subid.toString(),
      vehicleId,
    );
  }

  @Get('groups/from-api')
  @ApiOperation({
    summary: 'Get vehicle groups from Malambi API with filtering and pagination',
    description: 'Retrieves the vehicle groups tree from the Malambi API with support for pagination, filtering, searching, and sorting. Optional query param "node" (default: root) to list groups under a specific node. Optional query param "sync" (default: false) to bulk sync vehicles to local database.',
  })
  @ApiResponse({ status: 200, description: 'List of vehicle groups from Malambi API (paginated or array format)' })
  async getVehicleGroupsFromApi(
    @Query() filterDto: FilterVehicleGroupsDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<VehicleGroupDto[] | PaginateResult<VehicleGroupDto> | { groups: VehicleGroupDto[] | PaginateResult<VehicleGroupDto>; syncResult: any }> {
    // Build pagination query
    const query: PaginateQuery = {
      page: filterDto.page ?? 1,
      limit: filterDto.limit ?? 100,
      search: filterDto.search,
      searchBy: filterDto.searchBy ? filterDto.searchBy.split(',') : undefined,
      sortBy: filterDto.sortBy
        ? (filterDto.sortBy.split(',').map((s) => {
            const [field, direction] = s.split(':');
            return [field, (direction || 'ASC').toUpperCase()] as [string, 'ASC' | 'DESC'];
          }) as [string, 'ASC' | 'DESC'][])
        : undefined,
    };

    // Fetch groups with pagination/filtering
    const groupsResult = await this.vehiclesService.listVehicleGroups(
      credentials.token,
      credentials.accid.toString(),
      credentials.subid.toString(),
      filterDto.node ?? 'root',
      query,
    );

    // If sync parameter is true, trigger bulk sync
    // Handle both boolean and string values from query params
    const shouldSync = filterDto.sync === true || 
                       filterDto.sync === 'true' || 
                       filterDto.sync === '1';
    if (shouldSync) {
      const accountIdNum = Number(credentials.accid);
      if (isNaN(accountIdNum) || accountIdNum <= 0) {
        throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
      }

      // Extract groups array from result (could be array or PaginateResult)
      const groupsArray = Array.isArray(groupsResult) ? groupsResult : groupsResult.data;
      
      const syncResult = await this.vehiclesService.bulkSyncVehiclesFromGroups(groupsArray, accountIdNum);
      return {
        groups: groupsResult,
        syncResult,
      };
    }

    return groupsResult;
  }

  @Get('groups/database')
  @ApiOperation({
    summary: 'Get all vehicle groups with their vehicles from database',
    description: 'Retrieves all vehicle groups that have been synced to the local database along with their associated vehicles. Returns groups ordered by name. Supports optional relation loading (qrCodes).',
  })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (qrCodes)' })
  @ApiResponse({ status: 200, description: 'List of vehicle groups with their vehicles', type: [VehicleGroupDto] })
  async getAllGroupsWithVehicles(
    @Query('include') include?: string,
    @CurrentUserCredentials() credentials?: Credentials,
  ): Promise<VehicleGroupDto[]> {
    const accountIdNum = credentials ? Number(credentials.accid) : undefined;
    if (accountIdNum !== undefined && (isNaN(accountIdNum) || accountIdNum <= 0)) {
      throw new BadRequestException(`Invalid account ID: ${credentials?.accid}`);
    }
    if (!accountIdNum) {
      throw new BadRequestException('Account ID is required');
    }

    const options = {
      include: include ? include.split(',') : undefined,
    };

    return this.vehiclesService.getAllGroupsWithVehicles(accountIdNum, options);
  }

  @Get('find')
  @ApiOperation({
    summary: 'Find a vehicle by any field(s)',
    description: 'Searches for a vehicle using one or more field criteria. Returns the first matching vehicle. Supports fields like: plate, id, model, brand, year, tag2, groupId, isActive, etc.',
  })
  @ApiQuery({ name: 'plate', required: false, type: String, description: 'Vehicle plate number' })
  @ApiQuery({ name: 'id', required: false, type: Number, description: 'Vehicle ID (Malambi API vehicle ID)' })
  @ApiQuery({ name: 'model', required: false, type: String, description: 'Vehicle model' })
  @ApiQuery({ name: 'brand', required: false, type: String, description: 'Vehicle brand' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Vehicle year' })
  @ApiQuery({ name: 'tag2', required: false, type: String, description: 'Vehicle tag2' })
  @ApiQuery({ name: 'groupId', required: false, type: Number, description: 'Group ID' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Active status' })
  @ApiQuery({ name: 'id', required: false, type: Number, description: 'Internal vehicle ID' })
  async findOneBy(
    @Query() query: Record<string, any>,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<Vehicle> {
    // Convert string numbers to numbers for numeric fields
    const requestData: Record<string, any> = {};
    
    if (query.id !== undefined) requestData.id = Number(query.id);
    if (query.plate !== undefined) requestData.plate = query.plate;
    if (query.model !== undefined) requestData.model = query.model;
    if (query.brand !== undefined) requestData.brand = query.brand;
    if (query.year !== undefined) requestData.year = Number(query.year);
    if (query.tag2 !== undefined) requestData.tag2 = query.tag2;
    if (query.groupId !== undefined) requestData.groupId = Number(query.groupId);
    if (query.isActive !== undefined) {
      requestData.isActive = query.isActive === 'true' || query.isActive === true;
    }
    
    // Validate that at least one search criterion is provided
    if (Object.keys(requestData).length === 0) {
      throw new BadRequestException('At least one search criterion must be provided (e.g., plate, id, model, etc.)');
    }
    
    // Convert accid to number for accountId (multi-tenant filtering)
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }
    return this.vehiclesService.findOneBy(requestData, { accountId: accountIdNum });
  }

  @Get('qr-code/vehicle/:vehicleId')
  @ApiOperation({
    summary: 'Get QR code for a vehicle with vehicle details',
    description: 'Returns the QR code (image data URL and string) for the given vehicleId, with full vehicle details included. Generates and stores the QR code if it does not exist yet.',
  })
  @ApiResponse({ status: 200, description: 'QR code and vehicle details returned successfully' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  async getQrCodeByVehicleId(
    @Param('vehicleId') vehicleId: string,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<{
    vehicle: Vehicle;
    qrCodeDataUrl: string;
    qrCodeString: string;
    vehicleId: number;
  }> {
    const vehicleIdNum = Number(vehicleId);
    if (isNaN(vehicleIdNum) || vehicleIdNum <= 0) {
      throw new BadRequestException(`Invalid vehicle ID: ${vehicleId}`);
    }
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }
    return this.qrCodeService.getQrCodeByVehicleId(vehicleIdNum, accountIdNum);
  }

  @Get('qr-code/:qrCode')
  @ApiOperation({
    summary: 'Validate QR code and get vehicle information',
    description: 'Validates a scanned QR code and returns the associated vehicle information. Used by agents when scanning QR codes to get the vehicleId.',
  })
  @ApiResponse({ status: 200, description: 'QR code validated successfully' })
  @ApiResponse({ status: 404, description: 'Vehicle not found for this QR code' })
  @ApiResponse({ status: 400, description: 'Invalid QR code format' })
  async validateQrCode(
    @Param('qrCode') qrCode: string,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<{
    vehicle: Vehicle;
    vehicleId: number;
    qrCode: string;
  }> {
    // Convert accid to number for accountId
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }
    const result = await this.qrCodeService.validateQrCode(qrCode, accountIdNum);
    return {
      vehicle: result.vehicle as Vehicle,
      vehicleId: result.vehicleId,
      qrCode: qrCode,
    };
  }

  @Get('by-status/:status')
  @ApiOperation({
    summary: 'Get vehicles by status',
    description: 'Retrieves all vehicles with a specific status. Useful for dashboard queries (e.g., all available vehicles, all vehicles in transit).',
  })
  @ApiResponse({ status: 200, description: 'Vehicles retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid status or account ID' })
  async getVehiclesByStatus(
    @Param('status') status: VehicleStatus,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<Vehicle[]> {
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }
    if (!Object.values(VehicleStatus).includes(status)) {
      throw new BadRequestException(`Invalid vehicle status: ${status}`);
    }
    return this.vehiclesService.getVehiclesByStatus(status, accountIdNum);
  }

  @Get('by-center/:centerId')
  @ApiOperation({
    summary: 'Get vehicles by center',
    description: 'Retrieves all vehicles currently located at a specific center. Useful for dashboard queries showing vehicles at a specific location.',
  })
  @ApiResponse({ status: 200, description: 'Vehicles retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Center not found' })
  @ApiResponse({ status: 400, description: 'Invalid center ID or account ID' })
  async getVehiclesByCenter(
    @Param('centerId') centerId: string,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<Vehicle[]> {
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }
    const centerIdNum = Number(centerId);
    if (isNaN(centerIdNum) || centerIdNum <= 0) {
      throw new BadRequestException(`Invalid center ID: ${centerId}`);
    }
    return this.vehiclesService.getVehiclesByCenter(centerIdNum, accountIdNum);
  }

  @Get('status-summary')
  @ApiOperation({
    summary: 'Get vehicles status summary',
    description: 'Retrieves a summary of vehicle counts grouped by status. Useful for dashboard statistics showing how many vehicles are in each status.',
  })
  @ApiResponse({ status: 200, description: 'Status summary retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid account ID' })
  async getVehiclesStatusSummary(
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<Record<VehicleStatus, number>> {
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }
    return this.vehiclesService.getVehiclesByStatusSummary(accountIdNum);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get vehicle details by ID',
    description: 'Provides access to view the details of a specific vehicle by its internal ID (serial integer).',
  })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (qrCodes, group, assignedCenter, currentCenter)' })
  async findOneById(
    @Param('id') id: string,
    @Query('include') include?: string,
    @CurrentUserCredentials() credentials?: Credentials,
  ): Promise<Vehicle> {
    // Convert accid to number for accountId (multi-tenant filtering)
    const accountIdNum = credentials?.accid ? Number(credentials.accid) : undefined;
    if (accountIdNum !== undefined && (isNaN(accountIdNum) || accountIdNum <= 0)) {
      throw new BadRequestException(`Invalid account ID: ${credentials?.accid}`);
    }

    const options = {
      include: include ? include.split(',') : undefined,
      accountId: accountIdNum, // Multi-tenant: filter by account ID
    };
    return this.vehiclesService.findOneById(Number(id), options);
  }

  @Get(':id/status-history')
  @ApiOperation({
    summary: 'Get vehicle status history',
    description: 'Retrieves the status change history for a vehicle, ordered by most recent first. The vehicle can be identified by its internal ID or thirdPartyId.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum number of history records to return (default: 100)' })
  @ApiResponse({ status: 200, description: 'Vehicle status history retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  async getVehicleStatusHistory(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @CurrentUserCredentials() credentials?: Credentials,
  ): Promise<Array<typeof schema.vehicleStatusHistory.$inferSelect>> {
    if (!credentials) {
      throw new BadRequestException('Authentication required');
    }
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }
    const limitNum = limit ? Number(limit) : 100;
    return this.vehiclesService.getVehicleStatusHistory(Number(id), accountIdNum, limitNum);
  }

  @Post('sync')
  @ApiOperation({
    summary: 'Find and sync a vehicle by vehicleId',
    description: 'This endpoint fetches a vehicle from the Malambi API, checks if it exists in the database, and triggers a background job to save it if missing.',
  })
  @ApiQuery({ name: 'vehicle_id', required: true, type: String, description: 'The vehicle ID from Malambi API' })
  async syncVehicle(
    @CurrentUserCredentials() credentials: Credentials,
    @Query('vehicle_id') vehicleId: string,
  ) {
    if (!vehicleId) {
      throw new BadRequestException('vehicle_id is required');
    }

    return this.vehiclesService.syncVehicleByVehicleId(
      credentials.token,
      credentials.accid.toString(),
      credentials.subid.toString(),
      vehicleId,
    );
  }

  @Post(':id/qr-code')
  @Roles('admin', 'manager')
  @ApiOperation({
    summary: 'Generate QR code for a vehicle',
    description: 'Generates a downloadable QR code for a vehicle. The QR code contains the vehicleId as a string. Only users with admin or manager role can generate QR codes. A vehicle can have only one unique QR code. If a QR code already exists, it will be returned instead of generating a new one. The :id parameter is the vehicle ID (Malambi API vehicle ID).',
  })
  @ApiResponse({ status: 200, description: 'QR code generated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied. Admin or manager role required.' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  async generateQrCode(
    @Param('id') id: string,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<{
    qrCodeDataUrl: string;
    qrCodeString: string;
    vehicleId: number;
    vehicle: Vehicle;
  }> {
    // Find vehicle by ID (Malambi API vehicle ID)
    const numericId = Number(id);
    
    if (isNaN(numericId)) {
      throw new BadRequestException(`Invalid vehicle ID: ${id}`);
    }

    // Convert accid to number for accountId
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }

    // Find vehicle by ID
    const vehicle = await this.vehiclesService.findOneById(numericId, {
      accountId: accountIdNum,
    });

    // Generate QR code
    const qrCodeResult = await this.qrCodeService.generateQrCode(
      vehicle.id,
      accountIdNum,
    );

    return {
      ...qrCodeResult,
      vehicle,
    };
  }

  @Post(':id/qr-code/regenerate')
  @Roles('admin', 'manager')
  @ApiOperation({
    summary: 'Regenerate QR code for a vehicle',
    description: 'Regenerates (replaces) the QR code for a vehicle. Only users with admin or manager role can regenerate QR codes. The :id parameter is the vehicle ID (Malambi API vehicle ID).',
  })
  @ApiResponse({ status: 200, description: 'QR code regenerated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied. Admin or manager role required.' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  async regenerateQrCode(
    @Param('id') id: string,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<{
    qrCodeDataUrl: string;
    qrCodeString: string;
    vehicleId: number;
    vehicle: Vehicle;
  }> {
    // Find vehicle by ID (Malambi API vehicle ID)
    const numericId = Number(id);
    
    if (isNaN(numericId)) {
      throw new BadRequestException(`Invalid vehicle ID: ${id}`);
    }

    // Convert accid to number for accountId
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }

    // Find vehicle by ID
    const vehicle = await this.vehiclesService.findOneById(numericId, {
      accountId: accountIdNum,
    });

    // Regenerate QR code
    const qrCodeResult = await this.qrCodeService.regenerateQrCode(
      vehicle.id,
      accountIdNum,
    );

    // Get updated vehicle
    const updatedVehicle = await this.vehiclesService.findOneById(vehicle.id, {
      accountId: accountIdNum,
    });

    return {
      ...qrCodeResult,
      vehicle: updatedVehicle,
    };
  }

  @Post('qr-codes/bulk')
  @Roles('admin', 'manager')
  @ApiOperation({
    summary: 'Bulk generate QR codes for multiple vehicles',
    description: 'Generates QR codes for multiple vehicles in a single request. Only users with admin or manager role can bulk generate QR codes. Vehicles that already have QR codes will return their existing QR codes. Returns a summary of successful, failed, and skipped operations.',
  })
  @ApiBody({ type: BulkQrCodeDto })
  @ApiResponse({ status: 200, description: 'Bulk QR code generation completed' })
  @ApiResponse({ status: 403, description: 'Access denied. Admin or manager role required.' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async bulkGenerateQrCodes(
    @Body() bulkQrCodeDto: BulkQrCodeDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<{
    success: Array<{
      vehicleId: number;
      qrCodeDataUrl: string;
      qrCodeString: string;
    }>;
    failed: Array<{
      vehicleId: number;
      error: string;
    }>;
    skipped: Array<{
      vehicleId: number;
      reason: string;
    }>;
    summary: {
      total: number;
      successCount: number;
      failedCount: number;
      skippedCount: number;
    };
  }> {
    // Convert accid to number for accountId
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }

    if (!bulkQrCodeDto.vehicleIds || bulkQrCodeDto.vehicleIds.length === 0) {
      throw new BadRequestException('At least one vehicle ID is required');
    }

    return this.qrCodeService.bulkGenerateQrCodes(bulkQrCodeDto.vehicleIds, accountIdNum);
  }

  @Delete(':id/qr-code')
  @Roles('admin', 'manager')
  @ApiOperation({
    summary: 'Delete QR code for a vehicle',
    description: 'Deletes the QR code for a vehicle. Only users with admin or manager role can delete QR codes. The :id parameter is the vehicle ID (Malambi API vehicle ID / thirdPartyId).',
  })
  @ApiResponse({ status: 200, description: 'QR code deleted successfully' })
  @ApiResponse({ status: 403, description: 'Access denied. Admin or manager role required.' })
  @ApiResponse({ status: 404, description: 'Vehicle or QR code not found' })
  @ApiResponse({ status: 400, description: 'Invalid account ID or vehicle ID' })
  async deleteQrCode(
    @Param('id') id: string,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<typeof schema.qrCodes.$inferSelect> {
    // Find vehicle by ID (Malambi API vehicle ID / thirdPartyId)
    const numericId = Number(id);
    
    if (isNaN(numericId)) {
      throw new BadRequestException(`Invalid vehicle ID: ${id}`);
    }

    // Convert accid to number for accountId
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }

    return this.qrCodeService.deleteQrCode(numericId, accountIdNum);
  }

  @Delete('group/:id')
  @ApiOperation({
    summary: 'Delete vehicle group',
    description: 'Deletes a vehicle group from the database by its internal ID (serial integer). All vehicles in this group will have their groupId set to null before the group is deleted.',
  })
  @ApiResponse({ status: 200, description: 'Vehicle group deleted successfully' })
  @ApiResponse({ status: 404, description: 'Vehicle group not found' })
  @ApiResponse({ status: 400, description: 'Invalid account ID or group ID' })
  async deleteVehicleGroup(
    @Param('id') id: string,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<typeof schema.vehicleGroups.$inferSelect> {
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }
    return this.vehiclesService.removeGroup(Number(id), accountIdNum);
  }

  @Delete('vehicle/:id')
  @ApiOperation({
    summary: 'Delete vehicle',
    description: 'Deletes a vehicle from the database by its internal ID (serial integer). This permanently removes the vehicle record.',
  })
  @ApiResponse({ status: 200, description: 'Vehicle deleted successfully' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  @ApiResponse({ status: 400, description: 'Invalid account ID or vehicle ID' })
  async deleteVehicle(
    @Param('id') id: string,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<Vehicle> {
    // Convert accid to number for accountId
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }
    return this.vehiclesService.remove(Number(id), accountIdNum);
  }

  @Put(':id/status')
  @ApiOperation({
    summary: 'Update vehicle status',
    description: 'Updates the current status and optionally the center location of a vehicle. Automatically logs the change to vehicle status history. Center ID is required for statuses that require a location (at_center, in_processing, in_garage).',
  })
  @ApiResponse({ status: 200, description: 'Vehicle status updated successfully' })
  @ApiResponse({ status: 404, description: 'Vehicle or center not found' })
  @ApiResponse({ status: 400, description: 'Invalid status or missing required center ID' })
  async updateVehicleStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateVehicleStatusDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<Vehicle> {
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }
    return this.vehiclesService.updateVehicleStatus(
      Number(id),
      updateDto,
      accountIdNum,
      credentials.accid.toString(),
    );
  }

  @Put(':id/assignment')
  @ApiOperation({
    summary: 'Update vehicle center assignment',
    description: 'Updates the center assignment for a vehicle. A vehicle can be assigned to one center (or none). This is separate from currentCenterId which tracks the vehicle\'s current location. Set centerId to null to remove assignment.',
  })
  @ApiResponse({ status: 200, description: 'Vehicle center assignment updated successfully' })
  @ApiResponse({ status: 404, description: 'Vehicle or center not found' })
  async updateVehicleAssignment(
    @Param('id') id: string,
    @Body() updateDto: UpdateVehicleAssignmentDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<Vehicle> {
    const accountIdNum = Number(credentials.accid);
    if (isNaN(accountIdNum) || accountIdNum <= 0) {
      throw new BadRequestException(`Invalid account ID: ${credentials.accid}`);
    }
    return this.vehiclesService.updateVehicleAssignment(
      Number(id),
      updateDto,
      accountIdNum,
    );
  }
}

