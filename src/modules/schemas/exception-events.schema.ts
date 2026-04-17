import { pgTable, integer, varchar, timestamp, text, jsonb, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';
import { tripExceptions } from './trip-exceptions.schema';
import { users } from './users.schema';

/**
 * Exception events form the immutable timeline of an exception.
 * Every action — technician dispatch, call attempt, transfer confirmation,
 * status change — is recorded as an event. Events are never updated.
 */
export const exceptionEvents = pgTable('exception_events', {
  ...baseColumnsSerial,

  exceptionId: integer('exception_id').notNull().references(() => tripExceptions.id, { onDelete: 'cascade' }),

  /**
   * Event types:
   * EXCEPTION_REPORTED, TECHNICIAN_DISPATCHED, TECHNICIAN_ON_SITE,
   * REPAIR_COMPLETE, TRIP_RESUMED, RESCUE_VEHICLE_DISPATCHED,
   * RESCUE_VEHICLE_SCANNED, TRANSFER_CONFIRMED, ORIGINAL_TRIP_CLOSED,
   * RESCUE_TRIP_CREATED, PHOTOS_UPLOADED, TOW_ARRANGED,
   * OVERDUE_FLAGGED, CALL_ATTEMPTED, CONTACT_MADE, ETA_UPDATED,
   * ESCALATED, TRIP_CLOSED_NO_SHOW, RETURN_INITIATED, NOTE_ADDED,
   * STATUS_CHANGED
   */
  eventType: varchar('event_type', { length: 50 }).notNull(),

  /** Human-readable summary of this event */
  description: text('description'),

  /** User who triggered/recorded the event */
  actorId: integer('actor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),

  /** When the event occurred (device clock at submission) */
  timestamp: timestamp('timestamp').notNull().defaultNow(),

  /** Flexible JSON payload for event-specific data */
  metadata: jsonb('metadata'),
}, (table) => ({
  accountIdx: index('idx_exception_events_account').on(table.accountId),
  exceptionIdx: index('idx_exception_events_exception').on(table.exceptionId),
  eventTypeIdx: index('idx_exception_events_event_type').on(table.eventType),
  timestampIdx: index('idx_exception_events_timestamp').on(table.timestamp),
  /** Composite for ordered timeline queries */
  exceptionTimestampIdx: index('idx_exception_events_exception_timestamp').on(table.exceptionId, table.timestamp),
}));
