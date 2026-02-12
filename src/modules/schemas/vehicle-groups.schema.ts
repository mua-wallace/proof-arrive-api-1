import { pgTable, integer, varchar, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';

// Vehicle Groups
export const vehicleGroups = pgTable('vehicle_groups', {
  ...baseColumnsSerial,
  groupId: integer('group_id').notNull(), // Malambi API group ID (e.g., 3991)
  groupName: varchar('group_name', { length: 255 }).notNull(), // Group name (e.g., "Motos")
}, (table) => ({
  accountIdx: index('idx_vehicle_groups_account').on(table.accountId),
  groupIdIdx: index('idx_vehicle_groups_group_id').on(table.groupId),
  accountGroupIdUnique: uniqueIndex('uq_vehicle_groups_account_group_id').on(table.accountId, table.groupId), // Unique groupId per account
}));
