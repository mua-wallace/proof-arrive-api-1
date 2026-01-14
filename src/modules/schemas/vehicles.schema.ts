import { pgTable, integer, varchar, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';

// Vehicles
export const vehicles = pgTable('vehicles', {
  ...baseColumnsSerial,
  thirdPartyId: integer('third_party_id').notNull(),
  plate: varchar('plate', { length: 50 }).notNull(),
  model: varchar('model', { length: 100 }),
  brand: varchar('brand', { length: 100 }),
  year: integer('year'),
  tag2: varchar('tag2', { length: 255 }),
  groupId: integer('group_id'),
  isActive: boolean('is_active').default(true),
  lastSyncedAt: timestamp('last_synced_at'),
}, (table) => ({
  accountIdx: index('idx_vehicles_account').on(table.accountId),
  plateIdx: index('idx_vehicles_plate').on(table.plate),
  thirdPartyIdx: index('idx_vehicles_third_party').on(table.thirdPartyId),
  accountThirdPartyIdx: index('idx_vehicles_account_third_party').on(table.accountId, table.thirdPartyId), // Unique per account
  groupIdx: index('idx_vehicles_group').on(table.groupId),
}));

