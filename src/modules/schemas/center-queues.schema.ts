import { pgTable, integer, varchar, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';
import { centers } from './centers.schema';
import { vehicles } from './vehicles.schema';
import { trips } from './trips.schema';
import { QueueType } from '@common/enums/queue-type.enum';

/**
 * Center Queues represent real-time queue state at centers
 * This table is derived from trip events but provides fast queue visibility
 * Used for dashboards and real-time queue management
 */
export const centerQueues = pgTable('center_queues', {
  ...baseColumnsSerial,
  centerId: integer('center_id').notNull().references(() => centers.id, { onDelete: 'cascade' }),
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  tripId: integer('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  queueType: varchar('queue_type', { length: 20 }).notNull(), // LOADING | UNLOADING
  position: integer('position').notNull(), // Position in queue (1 = first, 2 = second, etc.) - resets daily
  queuedAt: timestamp('queued_at').notNull().defaultNow(),
  serviceStartedAt: timestamp('service_started_at'), // Set when SERVICE_STARTED event occurs
  isActive: boolean('is_active').default(true), // false when vehicle exits queue or starts service
  queueDate: timestamp('queue_date').notNull().defaultNow(), // Date for daily position reset (YYYY-MM-DD)
}, (table) => ({
  accountIdx: index('idx_center_queues_account').on(table.accountId),
  centerIdx: index('idx_center_queues_center').on(table.centerId),
  vehicleIdx: index('idx_center_queues_vehicle').on(table.vehicleId),
  tripIdx: index('idx_center_queues_trip').on(table.tripId),
  queueTypeIdx: index('idx_center_queues_queue_type').on(table.queueType),
  isActiveIdx: index('idx_center_queues_is_active').on(table.isActive),
  // Composite index for queue queries (get queue at center by type)
  centerQueueTypeActiveIdx: index('idx_center_queues_center_type_active').on(table.centerId, table.queueType, table.isActive),
  // Index for ordering queue by position
  centerQueueTypePositionIdx: index('idx_center_queues_center_type_position').on(table.centerId, table.queueType, table.position),
  // Index for daily queue queries (get today's queue)
  queueDateIdx: index('idx_center_queues_queue_date').on(table.queueDate),
  // Composite index for daily queue by center and type
  centerQueueTypeDateIdx: index('idx_center_queues_center_type_date').on(table.centerId, table.queueType, table.queueDate, table.isActive),
}));
