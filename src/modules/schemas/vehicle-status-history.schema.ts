import { pgTable, integer, varchar, timestamp, text, index, serial } from 'drizzle-orm/pg-core';
import { vehicles } from './vehicles.schema';
import { centers } from './centers.schema';

/**
 * Vehicle Status History
 * Tracks all status changes for vehicles over time
 * Allows querying historical location and status data
 */
export const vehicleStatusHistory = pgTable('vehicle_status_history', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id').notNull(), // Multi-tenant: account ID from logged-in user
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }), // References vehicles.id (which equals thirdPartyId)
  status: varchar('status', { length: 50 }).notNull(), // VehicleStatus enum value
  centerId: integer('center_id'), // References centers.id (which equals thirdPartyId) - center where vehicle was/is located (nullable for in_transit)
  changedBy: text('changed_by'), // User who changed the status (accid)
  notes: text('notes'), // Optional notes about the status change
  changedAt: timestamp('changed_at').defaultNow().notNull(), // When the status was changed
}, (table) => ({
  vehicleIdx: index('idx_vehicle_status_history_vehicle').on(table.vehicleId),
  statusIdx: index('idx_vehicle_status_history_status').on(table.status),
  centerIdx: index('idx_vehicle_status_history_center').on(table.centerId),
  changedAtIdx: index('idx_vehicle_status_history_changed_at').on(table.changedAt),
  accountVehicleIdx: index('idx_vehicle_status_history_account_vehicle').on(table.accountId, table.vehicleId),
}));
