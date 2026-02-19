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
    summary: 'Start service for a vehicle (by vehicleId)',
    description:
      'Starts service for the given vehicle. The vehicle must be first in the queue (position 1) for the given queue type at its center. Use this instead of center-based start when the mobile app only has vehicleId (e.g. from QR scan).',
  })
  @ApiResponse({ status: 200, description: 'Service started for vehicle' })
  @ApiResponse({ status: 404, description: 'Vehicle not found or not first in queue' })
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
