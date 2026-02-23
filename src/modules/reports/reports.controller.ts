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
}
