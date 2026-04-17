import { pgTable, integer, varchar, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';
import { vehicles } from './vehicles.schema';
import { centers } from './centers.schema';
import { TripStatus } from '@common/enums/trip-status.enum';
import { TripPurpose } from '@common/enums/trip-purpose.enum';
import { TripPhase } from '@common/enums/trip-phase.enum';

/**
 * Trips represent one journey of a vehicle from one center to another
 * A vehicle can have many trips, but only one active (ONGOING) trip at a time.
 * phase: explicit lifecycle state so mobile app can show correct UI from GET /trips/:id
 *
 * Exception-related fields:
 * - estimatedArrivalAt: ETA at destination, set at dispatch. Used for overdue detection.
 * - isRescueTrip: true when this trip was auto-created to carry transferred goods.
 * - originalTripId: for rescue trips, links back to the trip that triggered the transfer.
 */
export const trips = pgTable('trips', {
  ...baseColumnsSerial,
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  originCenterId: integer('origin_center_id').notNull().references(() => centers.id, { onDelete: 'restrict' }),
  destinationCenterId: integer('destination_center_id').references(() => centers.id, { onDelete: 'set null' }), // Set when ready to exit
  purpose: varchar('purpose', { length: 20 }).notNull().default(TripPurpose.DELIVERY), // DELIVERY | PICKUP
  status: varchar('status', { length: 20 }).notNull().default(TripStatus.ONGOING), // ONGOING | COMPLETED
  phase: varchar('phase', { length: 50 }).notNull().default(TripPhase.AT_ORIGIN_ARRIVED), // Lifecycle state
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'), // Set when trip is completed

  // --- Exception / ETA fields ---
  /** Expected arrival at destination. Set at dispatch (exit-origin). Overdue timer runs against this. */
  estimatedArrivalAt: timestamp('estimated_arrival_at'),

  /** True when this trip was auto-created as a rescue trip for a goods transfer */
  isRescueTrip: boolean('is_rescue_trip').default(false),

  /** For rescue trips: the original trip that triggered the transfer */
  originalTripId: integer('original_trip_id'),
}, (table) => ({
  accountIdx: index('idx_trips_account').on(table.accountId),
  vehicleIdx: index('idx_trips_vehicle').on(table.vehicleId),
  originCenterIdx: index('idx_trips_origin_center').on(table.originCenterId),
  destinationCenterIdx: index('idx_trips_destination_center').on(table.destinationCenterId),
  statusIdx: index('idx_trips_status').on(table.status),
  phaseIdx: index('idx_trips_phase').on(table.phase),
  startedAtIdx: index('idx_trips_started_at').on(table.startedAt),
  vehicleStatusIdx: index('idx_trips_vehicle_status').on(table.vehicleId, table.status),
  vehiclePhaseIdx: index('idx_trips_vehicle_phase').on(table.vehicleId, table.phase),
}));
