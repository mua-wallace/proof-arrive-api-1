import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUserCredentials } from '@modules/auth/decorators/current-user-credentials.decorator';
import { ExceptionsService } from './exceptions.service';
import {
  ReportExceptionDto,
  DispatchTechnicianDto,
  MarkRepairedDto,
  DispatchRescueVehicleDto,
  ConfirmTransferDto,
  ReturnToOriginDto,
  LogCallAttemptDto,
  EscalateExceptionDto,
  AddExceptionNoteDto,
  FilterExceptionsDto,
} from './dto';

@ApiTags('Exceptions')
@Controller('exceptions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExceptionsController {
  constructor(private readonly exceptionsService: ExceptionsService) {}

  // ──────────────────────────────────────────────────────────────
  //  REPORT
  // ────────────────────���─────────────────────────────────────────

  @Post('trips/:tripId/report')
  @ApiOperation({
    summary: 'Report an exception on an in-transit trip',
    description:
      'Creates a new exception (breakdown, accident, overdue, police stop, or other) on a trip that is currently IN_TRANSIT or OVERDUE. ' +
      'Updates the trip phase to match the exception type. For accidents, an incident reference (INC-YYYYMMDD-seq) is auto-generated. ' +
      'This is the primary endpoint used by both the mobile "Report an issue" button and the dashboard "Report exception" button.',
  })
  @ApiParam({ name: 'tripId', description: 'ID of the in-transit trip' })
  @ApiResponse({ status: 201, description: 'Exception created. Returns the full exception record with incident reference (if accident).' })
  @ApiResponse({ status: 400, description: 'Trip is not in an allowed phase (must be IN_TRANSIT or OVERDUE)' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  async reportException(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: ReportExceptionDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.exceptionsService.reportException(
      tripId,
      dto,
      credentials.accid,
      credentials.subid,
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  BREAKDOWN / REPAIR ACTIONS
  // ──────────────────────────────────────────────────────────────

  @Post(':id/dispatch-technician')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dispatch a technician to the exception site',
    description:
      'Records technician details (name, phone, ETA) on the exception. Sets exception status to IN_PROGRESS and trip phase to AWAITING_REPAIR. ' +
      'A "Technician dispatched" event is added to the exception timeline. Used for both breakdown and accident exceptions.',
  })
  @ApiParam({ name: 'id', description: 'Exception ID' })
  @ApiResponse({ status: 200, description: 'Technician dispatched. Exception updated with technician details.' })
  @ApiResponse({ status: 400, description: 'Exception is not active' })
  async dispatchTechnician(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DispatchTechnicianDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.exceptionsService.dispatchTechnician(id, dto, credentials.accid, credentials.subid);
  }

  @Post(':id/mark-repaired')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark vehicle as repaired and resume the trip',
    description:
      'Closes the exception as RESOLVED_RESUMED. Records who performed the repair and what was fixed. ' +
      'The trip phase returns to IN_TRANSIT and the vehicle status is set back to IN_TRANSIT. ' +
      'A "Repair complete" and "Trip resumed" event are logged on both the exception and trip timelines.',
  })
  @ApiParam({ name: 'id', description: 'Exception ID' })
  @ApiResponse({ status: 200, description: 'Exception resolved. Trip resumed to IN_TRANSIT.' })
  @ApiResponse({ status: 400, description: 'Exception is not active or in progress' })
  async markRepaired(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarkRepairedDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.exceptionsService.markRepaired(id, dto, credentials.accid, credentials.subid);
  }

  // ──────────────────────────────────────────────────────────────
  //  TRANSFER FLOW
  // ──────────────────────────────────────────────────────────────

  @Post(':id/dispatch-rescue-vehicle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dispatch a rescue vehicle for goods transfer',
    description:
      'Selects an available vehicle to rescue the cargo. Sets exception status to IN_PROGRESS and trip phase to TRANSFER_IN_PROGRESS. ' +
      'The rescue vehicle must be in AVAILABLE status. ' +
      'A "Rescue vehicle dispatched" event is logged. This is Step 1 of the transfer flow.',
  })
  @ApiParam({ name: 'id', description: 'Exception ID' })
  @ApiResponse({ status: 200, description: 'Rescue vehicle dispatched. Exception updated with rescue vehicle details.' })
  @ApiResponse({ status: 400, description: 'Exception is not active, or rescue vehicle is not available' })
  @ApiResponse({ status: 404, description: 'Rescue vehicle not found' })
  async dispatchRescueVehicle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DispatchRescueVehicleDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.exceptionsService.dispatchRescueVehicle(id, dto, credentials.accid, credentials.subid);
  }

  @Post(':id/confirm-transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm goods transfer to rescue vehicle',
    description:
      'Called after the rescue vehicle QR code has been scanned at the transfer site. ' +
      'Records cargo count and condition. Seals the original trip as CLOSED_TRANSFERRED (read-only). ' +
      'Auto-creates a new rescue trip (TRP-xxx-R) linked to the original trip. ' +
      'The rescue vehicle is set to IN_TRANSIT. The original vehicle is set to AVAILABLE. ' +
      'Returns both the updated exception and the new rescue trip.',
  })
  @ApiParam({ name: 'id', description: 'Exception ID' })
  @ApiResponse({ status: 200, description: 'Transfer confirmed. Original trip sealed. Rescue trip created.' })
  @ApiResponse({ status: 400, description: 'Exception is not IN_PROGRESS, or no rescue vehicle dispatched' })
  async confirmTransfer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmTransferDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.exceptionsService.confirmTransfer(id, dto, credentials.accid, credentials.subid);
  }

  // ────────────────────────────────���─────────────────────────────
  //  RETURN TO ORIGIN
  // ────���─────────────────────────────────────────────────────────

  @Post(':id/return-to-origin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Return goods to origin center',
    description:
      'Closes the exception as CLOSED_RETURNED and the trip as CLOSED_RETURNED. ' +
      'A reason is required. The origin center is notified (via timeline event). ' +
      'Used when the vehicle cannot be repaired and no rescue vehicle is available.',
  })
  @ApiParam({ name: 'id', description: 'Exception ID' })
  @ApiResponse({ status: 200, description: 'Exception closed. Trip closed as returned to origin.' })
  @ApiResponse({ status: 400, description: 'Exception is not active' })
  async returnToOrigin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReturnToOriginDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.exceptionsService.returnToOrigin(id, dto, credentials.accid, credentials.subid);
  }

  // ──────────────────────────��───────────────────────────────────
  //  OVERDUE ACTIONS
  // ──────────────────────────────────────────────────────────────

  @Post(':id/log-call-attempt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log a driver contact attempt',
    description:
      'Records a timestamped call attempt on the exception timeline. Increments the contact attempts counter. ' +
      'Outcome can be ANSWERED, NO_ANSWER, or VOICEMAIL. If the driver answered, notes should capture the outcome. ' +
      'Used primarily on overdue exceptions but works on any active exception.',
  })
  @ApiParam({ name: 'id', description: 'Exception ID' })
  @ApiResponse({ status: 200, description: 'Call attempt logged on the exception timeline.' })
  async logCallAttempt(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LogCallAttemptDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.exceptionsService.logCallAttempt(id, dto, credentials.accid, credentials.subid);
  }

  @Post(':id/escalate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Escalate exception to no-show status',
    description:
      'Used when the driver cannot be reached after multiple contact attempts. ' +
      'Records the escalation reason, actions taken (e.g. police notified, management notified), and notes. ' +
      'Sets exception status to ESCALATED and trip phase to NO_SHOW_ESCALATED. The trip is closed. ' +
      'A sealed incident record is created in the Incidents log.',
  })
  @ApiParam({ name: 'id', description: 'Exception ID' })
  @ApiResponse({ status: 200, description: 'Exception escalated. Trip closed as no-show.' })
  @ApiResponse({ status: 400, description: 'Exception is not active' })
  async escalate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EscalateExceptionDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.exceptionsService.escalate(id, dto, credentials.accid, credentials.subid);
  }

  // ──────────────────────────���───────────────────────────────────
  //  NOTES
  // ──────────────────���───────────────────────────────────────────

  @Post(':id/notes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a free-text note to the exception timeline',
    description:
      'Allows the dispatcher to add an update note without changing the exception status. ' +
      'Use cases: "Technician confirmed on site", "Driver called, tow truck 20 min away". ' +
      'The note appears in the timeline with the dispatcher name and timestamp.',
  })
  @ApiParam({ name: 'id', description: 'Exception ID' })
  @ApiResponse({ status: 201, description: 'Note added to exception timeline.' })
  async addNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddExceptionNoteDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.exceptionsService.addNote(id, dto, credentials.accid, credentials.subid);
  }

  // ──────────────────────────────────────────────────────────────
  //  QUERIES
  // ─────────────────��────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List all exceptions with filtering and pagination',
    description:
      'Powers the Incidents & Exceptions Log page. Supports filtering by type (BREAKDOWN, ACCIDENT, OVERDUE, etc.), ' +
      'status (ACTIVE, IN_PROGRESS, RESOLVED_RESUMED, etc.), trip ID, vehicle ID, and free-text search. ' +
      'Each result includes the vehicle plate, route (origin -> destination), and who reported it. ' +
      'Default sort: most recently reported first.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of exceptions with vehicle and route data.' })
  async findAll(
    @Query() filterDto: FilterExceptionsDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.exceptionsService.findAllExceptions(filterDto, credentials.accid);
  }

  @Get('active')
  @ApiOperation({
    summary: 'Get all active exceptions (for dashboard alert banner)',
    description:
      'Returns all exceptions with status ACTIVE or IN_PROGRESS. Used to power the dashboard exception alert banner, ' +
      'the Active Exceptions table, and the exception count KPI card. Each result includes vehicle plate and route.',
  })
  @ApiResponse({ status: 200, description: 'List of active exceptions with vehicle and route data.' })
  async getActive(@CurrentUserCredentials() credentials: any) {
    return this.exceptionsService.getActiveExceptions(credentials.accid);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Get exception summary KPIs (for dashboard and incidents page)',
    description:
      'Returns counts of active breakdowns, active accidents, active transfers, active overdue, ' +
      'resolved today, and total active exceptions. Used for the Incidents page KPI cards and the dashboard Exceptions KPI card.',
  })
  @ApiResponse({ status: 200, description: 'Exception summary counts.' })
  async getSummary(@CurrentUserCredentials() credentials: any) {
    return this.exceptionsService.getExceptionSummary(credentials.accid);
  }

  @Get('trip/:tripId')
  @ApiOperation({
    summary: 'Get all exceptions for a specific trip',
    description:
      'Returns all exceptions (active and resolved) associated with a trip. Used for the trip detail page ' +
      'exception banner and side panel. Sorted by most recently reported first.',
  })
  @ApiParam({ name: 'tripId', description: 'Trip ID' })
  @ApiResponse({ status: 200, description: 'List of exceptions for the trip.' })
  async getByTrip(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.exceptionsService.getExceptionsByTrip(tripId, credentials.accid);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get exception details by ID',
    description:
      'Returns the full exception record with vehicle, trip (including origin/destination center names), ' +
      'reporter details, timeline events, and photos (for accidents). Used for the exception detail view.',
  })
  @ApiParam({ name: 'id', description: 'Exception ID' })
  @ApiResponse({ status: 200, description: 'Full exception details with relations.' })
  @ApiResponse({ status: 404, description: 'Exception not found' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUserCredentials() credentials: any,
  ) {
    const exception = await this.exceptionsService.findExceptionById(id, credentials.accid);
    if (!exception) {
      throw new NotFoundException('Exception not found');
    }
    return exception;
  }

  @Get(':id/timeline')
  @ApiOperation({
    summary: 'Get exception timeline events',
    description:
      'Returns the ordered list of events for an exception. Events include: EXCEPTION_REPORTED, ' +
      'TECHNICIAN_DISPATCHED, REPAIR_COMPLETE, RESCUE_VEHICLE_DISPATCHED, TRANSFER_CONFIRMED, ' +
      'CALL_ATTEMPTED, ESCALATED, NOTE_ADDED, etc. Each event has a timestamp, actor, and metadata.',
  })
  @ApiParam({ name: 'id', description: 'Exception ID' })
  @ApiResponse({ status: 200, description: 'Ordered list of exception timeline events.' })
  @ApiResponse({ status: 404, description: 'Exception not found' })
  async getTimeline(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.exceptionsService.getExceptionTimeline(id, credentials.accid);
  }
}
