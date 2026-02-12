import { pgTable, integer, varchar, timestamp, text, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';
import { vehicles } from './vehicles.schema';
import { centers } from './centers.schema';

/**
 * Vehicle Status History
 * Tracks all status changes for vehicles over time
 * Allows querying historical location and status data
 */
export const vehicleStatusHistory = pgTable('vehicle_status_history', {
  ...baseColumnsSerial,
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }), // References vehicles.id (local serial ID)
  status: varchar('status', { length: 50 }).notNull(), // VehicleStatus enum value
  centerId: integer('center_id'), // References centers.id - center where vehicle was/is located (nullable for in_transit)
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
