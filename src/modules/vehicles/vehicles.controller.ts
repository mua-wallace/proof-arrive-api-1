import { Controller, Post, Get, Delete, Query, Param, BadRequestException, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { QrCodeService } from './qr-code.service';
import { CurrentUserCredentials } from '@modules/auth/decorators/current-user-credentials.decorator';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Credentials, PaginateResult } from '@common/interfaces';
import { FilterVehiclesDto } from './dto';
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
    description: 'Retrieves a paginated list of vehicles that have been synced from the Malambi API. Supports filtering, searching, sorting, and optional relation loading (arrivals, exits, incomingVehicles).',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term' })
  @ApiQuery({ name: 'searchBy', required: false, type: String, description: 'Comma-separated fields to search in' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Comma-separated sort fields (format: field:direction)' })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (arrivals, exits, incomingVehicles)' })
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

    const options = {
      include: filterDto.include ? filterDto.include.split(',') : undefined,
      accountId: credentials.accid, // Multi-tenant: filter by account ID
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

  @Get('find')
  @ApiOperation({
    summary: 'Find a vehicle by any field(s)',
    description: 'Searches for a vehicle using one or more field criteria. Returns the first matching vehicle. Supports fields like: plate, thirdPartyId, model, brand, year, tag2, groupId, isActive, etc.',
  })
  @ApiQuery({ name: 'plate', required: false, type: String, description: 'Vehicle plate number' })
  @ApiQuery({ name: 'thirdPartyId', required: false, type: Number, description: 'Third party ID from Malambi API' })
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
    if (query.thirdPartyId !== undefined) requestData.thirdPartyId = Number(query.thirdPartyId);
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
      throw new BadRequestException('At least one search criterion must be provided (e.g., plate, thirdPartyId, id, etc.)');
    }
    
    return this.vehiclesService.findOneBy(requestData, { accountId: credentials.accid });
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
    const result = await this.qrCodeService.validateQrCode(qrCode, credentials.accid);
    return {
      vehicle: result.vehicle as Vehicle,
      vehicleId: result.vehicleId,
      qrCode: qrCode,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get vehicle details by ID',
    description: 'Provides access to view the details of a specific vehicle by its internal ID (serial integer).',
  })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (arrivals, exits, incomingVehicles)' })
  async findOneById(
    @Param('id') id: string,
    @Query('include') include?: string,
    @CurrentUserCredentials() credentials?: Credentials,
  ): Promise<Vehicle> {
    const options = {
      include: include ? include.split(',') : undefined,
      accountId: credentials?.accid, // Multi-tenant: filter by account ID
    };
    return this.vehiclesService.findOneById(Number(id), options);
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
    description: 'Generates a downloadable QR code for a vehicle. The QR code contains the vehicleId (thirdPartyId) as a string. Only users with admin or manager role can generate QR codes. A vehicle can have only one unique QR code. If a QR code already exists, it will be returned instead of generating a new one. The :id parameter can be either the internal database ID or the thirdPartyId (vehicleId from Malambi API).',
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
    // Try to find vehicle by internal ID first, then by thirdPartyId
    let vehicle: Vehicle;
    const numericId = Number(id);
    
    if (isNaN(numericId)) {
      throw new BadRequestException(`Invalid vehicle ID: ${id}`);
    }

    try {
      // First, try to find by internal database ID
      vehicle = await this.vehiclesService.findOneById(numericId, {
        accountId: credentials.accid,
      });
    } catch (error) {
      // If not found by ID, try to find by thirdPartyId
      if (error instanceof NotFoundException) {
        try {
          vehicle = await this.vehiclesService.findOneBy(
            { thirdPartyId: numericId },
            { accountId: credentials.accid },
          );
        } catch (secondError) {
          throw new NotFoundException(
            `Vehicle not found with ID ${id} (tried both internal ID and thirdPartyId)`,
          );
        }
      } else {
        throw error;
      }
    }

    // Generate QR code
    const qrCodeResult = await this.qrCodeService.generateQrCode(
      vehicle.thirdPartyId,
      credentials.accid,
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
    description: 'Regenerates (replaces) the QR code for a vehicle. Only users with admin or manager role can regenerate QR codes. The :id parameter can be either the internal database ID or the thirdPartyId (vehicleId from Malambi API).',
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
    // Try to find vehicle by internal ID first, then by thirdPartyId
    let vehicle: Vehicle;
    const numericId = Number(id);
    
    if (isNaN(numericId)) {
      throw new BadRequestException(`Invalid vehicle ID: ${id}`);
    }

    try {
      // First, try to find by internal database ID
      vehicle = await this.vehiclesService.findOneById(numericId, {
        accountId: credentials.accid,
      });
    } catch (error) {
      // If not found by ID, try to find by thirdPartyId
      if (error instanceof NotFoundException) {
        try {
          vehicle = await this.vehiclesService.findOneBy(
            { thirdPartyId: numericId },
            { accountId: credentials.accid },
          );
        } catch (secondError) {
          throw new NotFoundException(
            `Vehicle not found with ID ${id} (tried both internal ID and thirdPartyId)`,
          );
        }
      } else {
        throw error;
      }
    }

    // Regenerate QR code
    const qrCodeResult = await this.qrCodeService.regenerateQrCode(
      vehicle.thirdPartyId,
      credentials.accid,
    );

    // Get updated vehicle (use the same lookup method)
    let updatedVehicle: Vehicle;
    try {
      updatedVehicle = await this.vehiclesService.findOneById(vehicle.id, {
        accountId: credentials.accid,
      });
    } catch {
      // Fallback to thirdPartyId if needed
      updatedVehicle = await this.vehiclesService.findOneBy(
        { thirdPartyId: vehicle.thirdPartyId },
        { accountId: credentials.accid },
      );
    }

    return {
      ...qrCodeResult,
      vehicle: updatedVehicle,
    };
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Remove a vehicle from the system by ID',
    description: 'Removes a vehicle from the database by its internal ID (serial integer).',
  })
  async remove(
    @Param('id') id: string,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<Vehicle> {
    return this.vehiclesService.remove(Number(id), credentials.accid);
  }
}

