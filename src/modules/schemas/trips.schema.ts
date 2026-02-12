import { pgTable, integer, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';
import { vehicles } from './vehicles.schema';
import { centers } from './centers.schema';
import { TripStatus } from '@common/enums/trip-status.enum';
import { TripPurpose } from '@common/enums/trip-purpose.enum';

/**
 * Trips represent one journey of a vehicle from one center to another
 * A vehicle can have many trips, but only one active (ONGOING) trip at a time
 */
export const trips = pgTable('trips', {
  ...baseColumnsSerial,
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  originCenterId: integer('origin_center_id').notNull().references(() => centers.id, { onDelete: 'restrict' }),
  destinationCenterId: integer('destination_center_id').references(() => centers.id, { onDelete: 'set null' }), // Can be set later when ready to exit
  purpose: varchar('purpose', { length: 20 }).notNull().default(TripPurpose.DELIVERY), // DELIVERY | PICKUP
  status: varchar('status', { length: 20 }).notNull().default(TripStatus.ONGOING), // ONGOING | COMPLETED
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'), // Set when trip is completed
}, (table) => ({
  accountIdx: index('idx_trips_account').on(table.accountId),
  vehicleIdx: index('idx_trips_vehicle').on(table.vehicleId),
  originCenterIdx: index('idx_trips_origin_center').on(table.originCenterId),
  destinationCenterIdx: index('idx_trips_destination_center').on(table.destinationCenterId),
  statusIdx: index('idx_trips_status').on(table.status),
  startedAtIdx: index('idx_trips_started_at').on(table.startedAt),
  // Ensure only one active trip per vehicle per account
  vehicleStatusIdx: index('idx_trips_vehicle_status').on(table.vehicleId, table.status),
}));
