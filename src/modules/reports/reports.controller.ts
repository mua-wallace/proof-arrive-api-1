import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUserCredentials } from '@modules/auth/decorators/current-user-credentials.decorator';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './dto/report-query.dto';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get dashboard summary with key metrics',
    description:
      'Returns dashboard summary: vehicles by status (including IN_GARAGE), trips (ongoing, completed, by purpose/phase), queue counts (loading/unloading), centers, and optional legacy arrivals/exits.',
  })
  async getDashboardSummary(
    @Query() query: ReportQueryDto,
    @CurrentUserCredentials() credentials: { accid: string | number },
  ) {
    const accountId = Number(credentials?.accid);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('Invalid account context');
    }
    return this.reportsService.getDashboardSummary(query, accountId);
  }

  @Get('arrivals')
  @ApiOperation({
    summary: 'Get arrival analytics (legacy)',
    description:
      'Returns analytics about arrivals by center, date, and top vehicles. Filtered by account.',
  })
  async getArrivalAnalytics(
    @Query() query: ReportQueryDto,
    @CurrentUserCredentials() credentials: { accid: string | number },
  ) {
    const accountId = Number(credentials?.accid);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('Invalid account context');
    }
    return this.reportsService.getArrivalAnalytics(query, accountId);
  }

  @Get('exits')
  @ApiOperation({
    summary: 'Get exit analytics (legacy)',
    description:
      'Returns analytics about exits by center, date, and exit type. Filtered by account.',
  })
  async getExitAnalytics(
    @Query() query: ReportQueryDto,
    @CurrentUserCredentials() credentials: { accid: string | number },
  ) {
    const accountId = Number(credentials?.accid);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('Invalid account context');
    }
    return this.reportsService.getExitAnalytics(query, accountId);
  }

  @Get('processing-stages')
  @ApiOperation({
    summary: 'Get processing stage analytics (legacy)',
    description:
      'Returns analytics about processing stages by type and status. Filtered by account.',
  })
  async getProcessingStageAnalytics(
    @Query() query: ReportQueryDto,
    @CurrentUserCredentials() credentials: { accid: string | number },
  ) {
    const accountId = Number(credentials?.accid);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('Invalid account context');
    }
    return this.reportsService.getProcessingStageAnalytics(query, accountId);
  }

  @Get('centers/performance')
  @ApiOperation({
    summary: 'Get center performance metrics',
    description:
      'Returns performance per center: trip counts (as origin/destination), vehicles at center, queue counts. Filtered by account.',
  })
  async getCenterPerformance(
    @Query() query: ReportQueryDto,
    @CurrentUserCredentials() credentials: { accid: string | number },
  ) {
    const accountId = Number(credentials?.accid);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('Invalid account context');
    }
    return this.reportsService.getCenterPerformance(query, accountId);
  }

  @Get('vehicles/activity')
  @ApiOperation({
    summary: 'Get vehicle activity report',
    description:
      'Returns activity per vehicle: trip count, completed trips (in period). Filtered by account.',
  })
  async getVehicleActivity(
    @Query() query: ReportQueryDto,
    @CurrentUserCredentials() credentials: { accid: string | number },
  ) {
    const accountId = Number(credentials?.accid);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('Invalid account context');
    }
    return this.reportsService.getVehicleActivity(query, accountId);
  }

  @Get('agents/activity')
  @ApiOperation({
    summary: 'Get agent activity report',
    description:
      'Returns activity per agent from trip events: events count by type. Filtered by account.',
  })
  async getAgentActivity(
    @Query() query: ReportQueryDto,
    @CurrentUserCredentials() credentials: { accid: string | number },
  ) {
    const accountId = Number(credentials?.accid);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('Invalid account context');
    }
    return this.reportsService.getAgentActivity(query, accountId);
  }

  // ========== Trips stats (dashboard) ==========

  @Get('trips/summary')
  @ApiOperation({
    summary: 'Trips stats summary',
    description:
      'Trip counts: ongoing, completed in period, total started, completion rate, by status/purpose/phase. Optional: startDate, endDate, centerId, vehicleId.',
  })
  async getTripsStatsSummary(
    @Query() query: ReportQueryDto,
    @CurrentUserCredentials() credentials: { accid: string | number },
  ) {
    const accountId = Number(credentials?.accid);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('Invalid account context');
    }
    return this.reportsService.getTripsStatsSummary(query, accountId);
  }

  @Get('trips/by-date')
  @ApiOperation({
    summary: 'Trips over time',
    description:
      'Trip counts grouped by day/week/month (started and completed). For charts. Optional: startDate, endDate, centerId, vehicleId, groupBy (day|week|month).',
  })
  async getTripsStatsByDate(
    @Query() query: ReportQueryDto,
    @CurrentUserCredentials() credentials: { accid: string | number },
  ) {
    const accountId = Number(credentials?.accid);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('Invalid account context');
    }
    return this.reportsService.getTripsStatsByDate(query, accountId);
  }

  @Get('trips/by-center')
  @ApiOperation({
    summary: 'Trips by center',
    description:
      'Per-center trip counts: as origin, as destination, completed at destination. Optional: startDate, endDate, centerId, vehicleId.',
  })
  async getTripsStatsByCenter(
    @Query() query: ReportQueryDto,
    @CurrentUserCredentials() credentials: { accid: string | number },
  ) {
    const accountId = Number(credentials?.accid);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('Invalid account context');
    }
    return this.reportsService.getTripsStatsByCenter(query, accountId);
  }

  @Get('trips/by-origin-destination')
  @ApiOperation({
    summary: 'Trips by origin–destination (OD matrix)',
    description:
      'Trip counts by (originCenterId, destinationCenterId). For route volume / OD charts. Optional: startDate, endDate, centerId, vehicleId.',
  })
  async getTripsStatsByOriginDestination(
    @Query() query: ReportQueryDto,
    @CurrentUserCredentials() credentials: { accid: string | number },
  ) {
    const accountId = Number(credentials?.accid);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('Invalid account context');
    }
    return this.reportsService.getTripsStatsByOriginDestination(query, accountId);
  }

  @Get('trips/completion-rate')
  @ApiOperation({
    summary: 'Trips completion rate',
    description:
      'In period: started count, completed count, completion rate (%). Optional: startDate, endDate, centerId, vehicleId.',
  })
  async getTripsCompletionRate(
    @Query() query: ReportQueryDto,
    @CurrentUserCredentials() credentials: { accid: string | number },
  ) {
    const accountId = Number(credentials?.accid);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('Invalid account context');
    }
    return this.reportsService.getTripsCompletionRate(query, accountId);
  }

  // ========== Center queue stats (dashboard) ==========

  @Get('queues/summary')
  @ApiOperation({
    summary: 'Queue stats summary',
    description:
      'Global loading/unloading active counts and per-center breakdown. Optional: startDate, endDate (default: today). centerId to filter to one center.',
  })
  async getQueueStatsSummary(
    @Query() query: ReportQueryDto,
    @CurrentUserCredentials() credentials: { accid: string | number },
  ) {
    const accountId = Number(credentials?.accid);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('Invalid account context');
    }
    return this.reportsService.getQueueStatsSummary(query, accountId);
  }

  @Get('queues/by-center')
  @ApiOperation({
    summary: 'Queue stats by center',
    description:
      'Per-center: loading total/active, unloading total/active. Optional: startDate, endDate (default: today), centerId.',
  })
  async getQueueStatsByCenter(
    @Query() query: ReportQueryDto,
    @CurrentUserCredentials() credentials: { accid: string | number },
  ) {
    const accountId = Number(credentials?.accid);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('Invalid account context');
    }
    return this.reportsService.getQueueStatsByCenter(query, accountId);
  }

  @Get('queues/by-date')
  @ApiOperation({
    summary: 'Queue activity over time',
    description:
      'Loading/unloading active counts by day. For charts. Optional: startDate, endDate (default: last 7 days), centerId.',
  })
  async getQueueStatsByDate(
    @Query() query: ReportQueryDto,
    @CurrentUserCredentials() credentials: { accid: string | number },
  ) {
    const accountId = Number(credentials?.accid);
    if (!accountId || isNaN(accountId)) {
      throw new BadRequestException('Invalid account context');
    }
    return this.reportsService.getQueueStatsByDate(query, accountId);
  }
}
