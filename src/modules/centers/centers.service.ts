import { Injectable } from '@nestjs/common';
import { CentersSyncService } from './centers-sync.service';
import { MalambiApiService } from '@integrations/malambi-api/malambi-api.service';

@Injectable()
export class CentersService {
  constructor(
    private readonly centersSyncService: CentersSyncService,
    private readonly malambiApi: MalambiApiService,
  ) {}

  /**
   * Sync center by geozone_id
   * Fetches centers from Malambi API, finds the one with matching gzone_id,
   * and triggers a background job to save it if it doesn't exist in database
   */
  async syncCenterByGeozoneId(
    token: string,
    accId: string,
    subId: string,
    geozoneId: number,
  ) {
    return this.centersSyncService.syncCenterByGeozoneId(token, accId, subId, geozoneId);
  }

  /**
   * Get all centers from Malambi API (without saving to database)
   */
  async getAllCentersFromApi(
    token: string,
    accId: string,
    subId: string,
    options?: {
      limit?: number;
      regionid?: number;
      filtertype?: number;
    },
  ) {
    return this.malambiApi.getCenters(token, accId, subId, options);
  }
}

