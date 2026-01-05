import { pgTable, integer, varchar, text, timestamp, decimal, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';
import { vehicles } from './vehicles.schema';
import { centers } from './centers.schema';
import { users } from './users.schema';
import { ArrivalStatus } from '@modules/arrivals/dto';

// Exits
export const exits = pgTable('exits', {
  ...baseColumnsSerial,
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.thirdPartyId, { onDelete: 'cascade' }),
  centerId: integer('center_id').notNull().references(() => centers.geozoneId, { onDelete: 'restrict' }),
  agentId: text('agent_id').notNull().references(() => users.accid, { onDelete: 'restrict' }),
  createdBy: text('created_by').notNull(), // No FK constraint since accid is not unique
  exitType: varchar('exit_type', { length: 50 }).notNull(),
  // Status: arrival, arrived, in_processing, completed, cancelled, in_transit, exited
  status: varchar('status', { length: 50 }),
  destinationCenterId: integer('destination_center_id').references(() => centers.geozoneId, { onDelete: 'set null' }),
  destinationName: varchar('destination_name', { length: 255 }),
  exitedAt: timestamp('exited_at').notNull().defaultNow(),
  latitude: decimal('latitude', { precision: 10, scale: 8 }),
  longitude: decimal('longitude', { precision: 11, scale: 8 }),
  notes: text('notes'),
}, (table) => ({
  vehicleIdx: index('idx_exits_vehicle').on(table.vehicleId),
  centerIdx: index('idx_exits_center').on(table.centerId),
  agentIdx: index('idx_exits_agent').on(table.agentId),
  createdByIdx: index('idx_exits_created_by').on(table.createdBy),
  statusIdx: index('idx_exits_status').on(table.status),
  destinationIdx: index('idx_exits_destination').on(table.destinationCenterId),
  exitedAtIdx: index('idx_exits_exited_at').on(table.exitedAt),
}));

