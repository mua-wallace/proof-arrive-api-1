import { Injectable } from '@nestjs/common';
import { VehiclesSyncService } from '@modules/vehicles/vehicles-sync.service';
import { CentersSyncService } from '@modules/centers/centers-sync.service';

/**
 * Arrivals Service
 * 
 * When creating an arrival record, ensure to check and sync vehicles and centers:
 * 
 * Example usage:
 * ```typescript
 * async createArrival(data: CreateArrivalDto) {
 *   // Check and trigger sync job for vehicle if not exists
 *   await this.vehiclesSyncService.ensureVehicleSynced(data.thirdPartyVehicleId);
 *   
 *   // Check and trigger sync job for center if not exists
 *   await this.centersSyncService.ensureCenterSynced(data.centerId, data.centerName);
 *   
 *   // Then create the arrival record
 *   // ...
 * }
 * ```
 */
@Injectable()
export class ArrivalsService {
  constructor(
    private readonly vehiclesSyncService: VehiclesSyncService,
    private readonly centersSyncService: CentersSyncService,
  ) {}
}

