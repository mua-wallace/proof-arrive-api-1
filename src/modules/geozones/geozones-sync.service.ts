import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '@modules/schemas';
import { MalambiApiService } from '@integrations/malambi-api/malambi-api.service';

export interface RawMalambiZone {
  i?: number | string;
  n?: string;
  c?: string;
  l?: number | string;
  s?: string;
  [key: string]: any;
}

export type CoordinatePair = [number, number];

function parsePath(s: string | undefined): CoordinatePair[] {
  if (!s || typeof s !== 'string') return [];
  return s
    .split('!')
    .map((pair) => {
      const parts = pair.split(':').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return [parts[0], parts[1]] as CoordinatePair;
      }
      return undefined;
    })
    .filter((x): x is CoordinatePair => Array.isArray(x));
}

function toThirdPartyId(i: number | string | undefined): number | null {
  if (i === undefined || i === null || i === '') return null;
  const n = typeof i === 'number' ? i : Number(i);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

function toSpeedLimit(l: number | string | undefined): number | null {
  if (l === undefined || l === null || l === '') return null;
  const n = typeof l === 'number' ? l : Number(l);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

@Injectable()
export class GeozonesSyncService {
  private readonly logger = new Logger(GeozonesSyncService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly dbConnection: PostgresJsDatabase<typeof schema>,
    private readonly malambiApi: MalambiApiService,
  ) {}

  /**
   * Fetch all geozones from Malambi API and upsert them into the local DB for the given account.
   */
  async syncAllFromApi(
    token: string,
    accId: string,
    subId: string,
    accountId: number,
    options?: { limit?: number; query?: string },
  ): Promise<{
    totalFetched: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
    message: string;
  }> {
    const response = await this.malambiApi.getGeozones(token, accId, subId, {
      limit: options?.limit ?? 1000,
      query: options?.query ?? '%',
    });

    const rows = Array.isArray(response?.rows) ? response.rows : [];
    return this.bulkSyncGeozones(rows, accountId);
  }

  /**
   * Upsert a batch of Malambi zones for the given account.
   */
  async bulkSyncGeozones(
    zones: RawMalambiZone[],
    accountId: number,
  ): Promise<{
    totalFetched: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
    message: string;
  }> {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    if (!accountId || !Number.isInteger(accountId) || accountId <= 0) {
      throw new Error(`Invalid accountId: ${accountId}`);
    }

    const validThirdPartyIds = new Set<number>();
    const normalized: Array<{
      thirdPartyId: number;
      accountId: number;
      name: string;
      color: string | null;
      speedLimit: number | null;
      polygon: CoordinatePair[];
    }> = [];

    for (const zone of zones) {
      const thirdPartyId = toThirdPartyId(zone.i);
      if (!thirdPartyId || validThirdPartyIds.has(thirdPartyId)) {
        skipped++;
        continue;
      }

      const polygon = parsePath(zone.s);
      if (polygon.length === 0) {
        // Malambi sometimes returns non-polygon rows; skip them.
        skipped++;
        continue;
      }

      validThirdPartyIds.add(thirdPartyId);
      normalized.push({
        thirdPartyId,
        accountId,
        name: String(zone.n ?? `Zone_${thirdPartyId}`),
        color: zone.c ? String(zone.c) : null,
        speedLimit: toSpeedLimit(zone.l),
        polygon,
      });
    }

    if (normalized.length === 0) {
      return {
        totalFetched: zones.length,
        inserted: 0,
        updated: 0,
        skipped,
        errors: 0,
        message: `No valid zones to sync (fetched=${zones.length}, skipped=${skipped})`,
      };
    }

    try {
      // Load existing rows for this account to distinguish inserts vs updates.
      const existing = await this.dbConnection
        .select({
          id: schema.geozones.id,
          thirdPartyId: schema.geozones.thirdPartyId,
        })
        .from(schema.geozones)
        .where(
          and(
            eq(schema.geozones.accountId, accountId),
            inArray(
              schema.geozones.thirdPartyId,
              Array.from(validThirdPartyIds),
            ),
          ),
        );

      const existingMap = new Map<number, number>();
      for (const row of existing) existingMap.set(row.thirdPartyId, row.id);

      for (const z of normalized) {
        try {
          const existingId = existingMap.get(z.thirdPartyId);
          if (existingId !== undefined) {
            await this.dbConnection
              .update(schema.geozones)
              .set({
                name: z.name,
                color: z.color,
                speedLimit: z.speedLimit,
                polygon: z.polygon as any,
                updatedAt: new Date(),
              })
              .where(eq(schema.geozones.id, existingId));
            updated++;
          } else {
            await this.dbConnection.insert(schema.geozones).values({
              accountId: z.accountId,
              thirdPartyId: z.thirdPartyId,
              name: z.name,
              color: z.color,
              speedLimit: z.speedLimit,
              polygon: z.polygon as any,
            });
            inserted++;
          }
        } catch (err) {
          this.logger.error(
            `Error syncing geozone thirdPartyId=${z.thirdPartyId}:`,
            err instanceof Error ? err.stack : err,
          );
          errors++;
        }
      }

      return {
        totalFetched: zones.length,
        inserted,
        updated,
        skipped,
        errors,
        message: `Geozone sync completed: ${inserted} inserted, ${updated} updated, ${skipped} skipped, ${errors} errors`,
      };
    } catch (error) {
      this.logger.error(
        'Error in bulk geozone sync:',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }
}
