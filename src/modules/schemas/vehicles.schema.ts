import { pgTable, integer, varchar, timestamp, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { centers } from './centers.schema';
import { VehicleStatus } from '@common/enums/vehicle-status.enum';

// Vehicles
// id column uses thirdPartyId value (not auto-generated)
export const vehicles = pgTable('vehicles', {
  id: integer('id').primaryKey().notNull(), // Uses thirdPartyId value (not auto-generated)
  accountId: integer('account_id').notNull(), // Multi-tenant: account ID from logged-in user
  thirdPartyId: integer('third_party_id').notNull(), // Malambi API vehicle ID - same value as id
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  plate: varchar('plate', { length: 50 }).notNull(),
  model: varchar('model', { length: 100 }),
  brand: varchar('brand', { length: 100 }),
  year: integer('year'),
  tag2: varchar('tag2', { length: 255 }),
  groupId: integer('group_id'), // References vehicle_groups.id (FK handled in relations)
  centerId: integer('center_id'), // References centers.id (which equals thirdPartyId) - center assignment (nullable, can be updated manually)
  isActive: boolean('is_active').default(true),
  lastSyncedAt: timestamp('last_synced_at'),
  // Current status and location tracking
  // Status is derived from latest trip event, not manually set
  status: varchar('status', { length: 50 }).default(VehicleStatus.AVAILABLE), // VehicleStatus enum: AVAILABLE, IN_TRANSIT, WAITING_IN_QUEUE, LOADING, UNLOADING
  currentCenterId: integer('current_center_id'), // References centers.id (which equals thirdPartyId) - current center where vehicle is located (nullable for IN_TRANSIT)
}, (table) => ({
  accountIdx: index('idx_vehicles_account').on(table.accountId),
  plateIdx: index('idx_vehicles_plate').on(table.plate),
  thirdPartyIdx: index('idx_vehicles_third_party').on(table.thirdPartyId),
  accountThirdPartyUnique: uniqueIndex('uq_vehicles_account_third_party').on(table.accountId, table.thirdPartyId), // Unique thirdPartyId per account
  groupIdx: index('idx_vehicles_group').on(table.groupId),
  centerAssignmentIdx: index('idx_vehicles_center_assignment').on(table.centerId),
  statusIdx: index('idx_vehicles_status').on(table.status),
  centerIdx: index('idx_vehicles_current_center').on(table.currentCenterId),
}));

