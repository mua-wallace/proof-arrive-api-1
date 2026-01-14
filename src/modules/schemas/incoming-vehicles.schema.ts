import { pgTable, integer, varchar, text, timestamp, decimal, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';
import { exits } from './exits.schema';
import { vehicles } from './vehicles.schema';
import { centers } from './centers.schema';

// Incoming Vehicles
export const incomingVehicles = pgTable('incoming_vehicles', {
  ...baseColumnsSerial,
  exitId: integer('exit_id').notNull().references(() => exits.id, { onDelete: 'cascade' }),
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  destinationCenterId: integer('destination_center_id').notNull().references(() => centers.id, { onDelete: 'restrict' }),
  sourceCenterId: integer('source_center_id').notNull().references(() => centers.id, { onDelete: 'restrict' }),
  createdBy: text('created_by').notNull(), // No FK constraint since accid is not unique
  // Status: arrival, arrived, in_processing, completed, cancelled, in_transit, exited
  status: varchar('status', { length: 50 }),
  estimatedArrival: timestamp('estimated_arrival'),
  actualArrival: timestamp('actual_arrival'),
  distanceKm: decimal('distance_km', { precision: 10, scale: 2 }),
}, (table) => ({
  accountIdx: index('idx_incoming_account').on(table.accountId),
  exitIdx: index('idx_incoming_exit').on(table.exitId),
  vehicleIdx: index('idx_incoming_vehicle').on(table.vehicleId),
  createdByIdx: index('idx_incoming_created_by').on(table.createdBy),
  destinationIdx: index('idx_incoming_destination').on(table.destinationCenterId),
  statusIdx: index('idx_incoming_status').on(table.status),
  etaIdx: index('idx_incoming_eta').on(table.estimatedArrival),
}));

