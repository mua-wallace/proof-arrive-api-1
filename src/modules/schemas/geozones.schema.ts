import { pgTable, integer, varchar, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';

// Geozones
// thirdPartyId is the zone id returned by the Malambi API (field `i`).
// It is unique per account and used as the sync/upsert key.
export const geozones = pgTable('geozones', {
  ...baseColumnsSerial,
  thirdPartyId: integer('third_party_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  color: varchar('color', { length: 20 }),
  speedLimit: integer('speed_limit'),
  polygon: jsonb('polygon').notNull(),
  centerId: integer('center_id'), // Reference handled at application level to avoid circular dependency
  radiusMeters: integer('radius_meters'),
}, (table) => ({
  accountIdx: index('idx_geozones_account').on(table.accountId),
  centerIdx: index('idx_geozones_center').on(table.centerId),
  thirdPartyIdx: index('idx_geozones_third_party').on(table.thirdPartyId),
  accountThirdPartyUq: uniqueIndex('uq_geozones_account_third_party').on(table.accountId, table.thirdPartyId),
}));
