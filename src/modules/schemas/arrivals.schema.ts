import { pgTable, integer, varchar, text, timestamp, decimal, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';
import { vehicles } from './vehicles.schema';
import { centers } from './centers.schema';
import { users } from './users.schema';
import { ArrivalStatus } from '@modules/arrivals/dto';

// Arrivals
export const arrivals = pgTable('arrivals', {
  ...baseColumnsSerial,
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.thirdPartyId, { onDelete: 'cascade' }),
  centerId: integer('center_id').notNull().references(() => centers.geozoneId, { onDelete: 'restrict' }),
  agentId: integer('agent_id').notNull().references(() => users.id, { onDelete: 'restrict' }), // References users.id (which equals subid)
  createdBy: integer('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }), // References users.id (which equals subid)
  // Status: arrival, arrived, in_processing, completed, cancelled, in_transit, exited
  status: varchar('status', { length: 50 }).default(ArrivalStatus.ARRIVAL),
  arrivedAt: timestamp('arrived_at').notNull().defaultNow(),
  latitude: decimal('latitude', { precision: 10, scale: 8 }),
  longitude: decimal('longitude', { precision: 11, scale: 8 }),
  notes: text('notes'),
}, (table) => ({
  accountIdx: index('idx_arrivals_account').on(table.accountId),
  vehicleIdx: index('idx_arrivals_vehicle').on(table.vehicleId),
  centerIdx: index('idx_arrivals_center').on(table.centerId),
  agentIdx: index('idx_arrivals_agent').on(table.agentId),
  createdByIdx: index('idx_arrivals_created_by').on(table.createdBy),
  statusIdx: index('idx_arrivals_status').on(table.status),
  arrivedAtIdx: index('idx_arrivals_arrived_at').on(table.arrivedAt),
}));

