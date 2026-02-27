import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUserCredentials } from '@modules/auth/decorators/current-user-credentials.decorator';
import { QueuesService } from './queues.service';
import { StartNextServiceDto } from './dto/start-next-service.dto';

@ApiTags('Queues')
@Controller('vehicles/:vehicleId/queue')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VehicleQueueController {
  constructor(private readonly queuesService: QueuesService) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start processing for a vehicle (by vehicleId)',
    description:
      'Finds the vehicle in the queue by vehicleId (any position). If found, updates serviceStartedAt and creates SERVICE_STARTED event. Use when the agent scans a vehicle and taps "Start processing" — no queue position needed in the UI. Body: { "queueType": "LOADING" } at origin, "UNLOADING" at destination.',
  })
  @ApiResponse({ status: 200, description: 'Service started for vehicle; move to End processing' })
  @ApiResponse({ status: 404, description: 'Vehicle not found or vehicle not in queue' })
  async startService(
    @Param('vehicleId', ParseIntPipe) vehicleId: number,
    @Body() startNextDto: StartNextServiceDto,
    @CurrentUserCredentials() credentials: any,
  ) {
    return this.queuesService.startServiceByVehicleId(
      vehicleId,
      startNextDto,
      credentials.accid,
      credentials.subid,
    );
  }
}
