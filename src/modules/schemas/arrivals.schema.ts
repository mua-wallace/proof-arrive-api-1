import { pgTable, integer, varchar, text, timestamp, decimal, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';
import { vehicles } from './vehicles.schema';
import { centers } from './centers.schema';
import { users } from './users.schema';

// Arrivals
export const arrivals = pgTable('arrivals', {
  ...baseColumnsSerial,
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  centerId: integer('center_id').notNull().references(() => centers.id, { onDelete: 'restrict' }),
  agentId: text('agent_id').notNull().references(() => users.accid, { onDelete: 'restrict' }),
  createdBy: text('created_by').notNull().references(() => users.accid, { onDelete: 'restrict' }),
  qrCode: varchar('qr_code', { length: 255 }).unique(),
  status: varchar('status', { length: 50 }).default('arrived'),
  arrivedAt: timestamp('arrived_at').notNull().defaultNow(),
  latitude: decimal('latitude', { precision: 10, scale: 8 }),
  longitude: decimal('longitude', { precision: 11, scale: 8 }),
  notes: text('notes'),
}, (table) => ({
  vehicleIdx: index('idx_arrivals_vehicle').on(table.vehicleId),
  centerIdx: index('idx_arrivals_center').on(table.centerId),
  agentIdx: index('idx_arrivals_agent').on(table.agentId),
  createdByIdx: index('idx_arrivals_created_by').on(table.createdBy),
  statusIdx: index('idx_arrivals_status').on(table.status),
  arrivedAtIdx: index('idx_arrivals_arrived_at').on(table.arrivedAt),
  qrCodeIdx: index('idx_arrivals_qr_code').on(table.qrCode),
}));

