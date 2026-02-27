import { pgTable, integer, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';
import { trips } from './trips.schema';
import { centers } from './centers.schema';
import { users } from './users.schema';
import { TripEventType } from '@common/enums/trip-event-type.enum';

/**
 * Trip Events represent immutable timeline of actions during a trip
 * All vehicle movements, status changes, and operations are logged here
 * Events are never edited - they form the audit trail
 */
export const tripEvents = pgTable('trip_events', {
  ...baseColumnsSerial,
  tripId: integer('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  centerId: integer('center_id').notNull().references(() => centers.id, { onDelete: 'restrict' }),
  agentId: integer('agent_id').notNull().references(() => users.id, { onDelete: 'restrict' }), // Agent who recorded the event
  eventType: varchar('event_type', { length: 50 }).notNull(), // TripEventType enum values
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  metadata: jsonb('metadata'), // JSON object for additional data (weight, notes, photos, queue_position, etc.)
}, (table) => ({
  accountIdx: index('idx_trip_events_account').on(table.accountId),
  tripIdx: index('idx_trip_events_trip').on(table.tripId),
  centerIdx: index('idx_trip_events_center').on(table.centerId),
  agentIdx: index('idx_trip_events_agent').on(table.agentId),
  eventTypeIdx: index('idx_trip_events_event_type').on(table.eventType),
  timestampIdx: index('idx_trip_events_timestamp').on(table.timestamp),
  // Composite index for trip timeline queries
  tripTimestampIdx: index('idx_trip_events_trip_timestamp').on(table.tripId, table.timestamp),
}));
