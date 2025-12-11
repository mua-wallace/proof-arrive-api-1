import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
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
      'Returns a comprehensive dashboard summary including total arrivals, exits, in-transit vehicles, and breakdowns by status and type.',
  })
  async getDashboardSummary(@Query() query: ReportQueryDto) {
    return this.reportsService.getDashboardSummary(query);
  }

  @Get('arrivals')
  @ApiOperation({
    summary: 'Get arrival analytics',
    description:
      'Returns detailed analytics about arrivals including breakdowns by center, date, and top vehicles.',
  })
  async getArrivalAnalytics(@Query() query: ReportQueryDto) {
    return this.reportsService.getArrivalAnalytics(query);
  }

  @Get('exits')
  @ApiOperation({
    summary: 'Get exit analytics',
    description:
      'Returns detailed analytics about exits including breakdowns by center, date, and exit type.',
  })
  async getExitAnalytics(@Query() query: ReportQueryDto) {
    return this.reportsService.getExitAnalytics(query);
  }

  @Get('incoming-vehicles')
  @ApiOperation({
    summary: 'Get incoming vehicle analytics',
    description:
      'Returns detailed analytics about incoming vehicles including status breakdowns, destination centers, transit time statistics, and average distances.',
  })
  async getIncomingVehicleAnalytics(@Query() query: ReportQueryDto) {
    return this.reportsService.getIncomingVehicleAnalytics(query);
  }

  @Get('processing-stages')
  @ApiOperation({
    summary: 'Get processing stage analytics',
    description:
      'Returns analytics about processing stages including breakdowns by type and status, and average processing times.',
  })
  async getProcessingStageAnalytics(@Query() query: ReportQueryDto) {
    return this.reportsService.getProcessingStageAnalytics(query);
  }

  @Get('centers/performance')
  @ApiOperation({
    summary: 'Get center performance metrics',
    description:
      'Returns performance metrics for centers including arrivals, exits, incoming vehicles, and net flow calculations.',
  })
  async getCenterPerformance(@Query() query: ReportQueryDto) {
    return this.reportsService.getCenterPerformance(query);
  }

  @Get('vehicles/activity')
  @ApiOperation({
    summary: 'Get vehicle activity report',
    description:
      'Returns activity metrics for vehicles including arrivals, exits, incoming vehicles, and total movements.',
  })
  async getVehicleActivity(@Query() query: ReportQueryDto) {
    return this.reportsService.getVehicleActivity(query);
  }

  @Get('agents/activity')
  @ApiOperation({
    summary: 'Get agent activity report',
    description:
      'Returns activity metrics for agents/users including arrivals, exits, and total activities.',
  })
  async getAgentActivity(@Query() query: ReportQueryDto) {
    return this.reportsService.getAgentActivity(query);
  }
}
