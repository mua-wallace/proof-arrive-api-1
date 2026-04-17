import { pgTable, integer, varchar, timestamp, text, boolean, index, jsonb } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';
import { trips } from './trips.schema';
import { vehicles } from './vehicles.schema';
import { users } from './users.schema';

/**
 * Trip exceptions represent incidents during an in-transit trip:
 * breakdowns, accidents, overdue flags, police stops, or other issues.
 * Each exception is linked to exactly one trip. A trip can have multiple exceptions
 * over its lifetime (e.g. overdue → breakdown → transfer).
 */
export const tripExceptions = pgTable('trip_exceptions', {
  ...baseColumnsSerial,

  tripId: integer('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),

  /** BREAKDOWN | ACCIDENT | OVERDUE | POLICE_STOP | OTHER */
  type: varchar('type', { length: 30 }).notNull(),

  /** ACTIVE | IN_PROGRESS | RESOLVED_RESUMED | CLOSED_TRANSFERRED | CLOSED_RETURNED | ESCALATED | CANCELLED */
  status: varchar('status', { length: 30 }).notNull().default('ACTIVE'),

  /** Auto-generated for accidents: INC-YYYYMMDD-seq */
  incidentReference: varchar('incident_reference', { length: 30 }),

  // --- Common fields (all exception types) ---
  /** Free-text location as entered by reporter (e.g. "N4 km 142, after Edea junction") */
  location: text('location').notNull(),

  /** What happened — free text description */
  description: text('description').notNull(),

  /** User who filed the exception */
  reportedById: integer('reported_by_id').notNull().references(() => users.id, { onDelete: 'restrict' }),

  /** Timestamp when the exception was reported (device clock) */
  reportedAt: timestamp('reported_at').notNull().defaultNow(),

  // --- Accident-specific fields (null for non-accidents) ---
  /** MINOR | MAJOR | CRITICAL */
  severity: varchar('severity', { length: 20 }),

  /** Are there injuries? */
  hasInjuries: boolean('has_injuries'),

  /** Is the cargo damaged? */
  isCargoDamaged: boolean('is_cargo_damaged'),

  /** Cargo damage description */
  cargoDamageDescription: text('cargo_damage_description'),

  /** Is the vehicle driveable? */
  isVehicleDriveable: boolean('is_vehicle_driveable'),

  /** Police report reference number */
  policeReportReference: varchar('police_report_reference', { length: 100 }),

  // --- Breakdown / repair fields ---
  /** Technician name (when dispatched) */
  technicianName: varchar('technician_name', { length: 200 }),

  /** Technician phone */
  technicianPhone: varchar('technician_phone', { length: 50 }),

  /** Estimated repair/arrival time (free text or ISO timestamp) */
  estimatedRepairTime: varchar('estimated_repair_time', { length: 100 }),

  // --- Transfer fields ---
  /** Rescue vehicle ID (when transfer is initiated) */
  rescueVehicleId: integer('rescue_vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),

  /** The rescue trip created for the transfer */
  rescueTripId: integer('rescue_trip_id').references(() => trips.id, { onDelete: 'set null' }),

  /** Transfer location (free text) */
  transferLocation: text('transfer_location'),

  /** Number of cargo units transferred */
  cargoCountTransferred: integer('cargo_count_transferred'),

  /** GOOD | MINOR_DAMAGE | MAJOR_DAMAGE */
  cargoCondition: varchar('cargo_condition', { length: 20 }),

  // --- Overdue fields ---
  /** Expected arrival time that was exceeded */
  expectedArrivalAt: timestamp('expected_arrival_at'),

  /** Number of contact attempts made */
  contactAttempts: integer('contact_attempts').default(0),

  // --- Escalation fields ---
  /** DRIVER_UNREACHABLE | SUSPECTED_BREAKDOWN | SUSPECTED_ACCIDENT | UNKNOWN */
  escalationReason: varchar('escalation_reason', { length: 30 }),

  /** Actions taken during escalation (JSON array of strings) */
  escalationActions: jsonb('escalation_actions'),

  // --- Resolution fields ---
  /** Who resolved the exception */
  resolvedById: integer('resolved_by_id').references(() => users.id, { onDelete: 'set null' }),

  /** When the exception was resolved */
  resolvedAt: timestamp('resolved_at'),

  /** Resolution notes */
  resolutionNotes: text('resolution_notes'),

  /** Repair description (for breakdown resolution) */
  repairDescription: text('repair_description'),

  /** Who performed the repair */
  repairedBy: varchar('repaired_by', { length: 200 }),
}, (table) => ({
  accountIdx: index('idx_trip_exceptions_account').on(table.accountId),
  tripIdx: index('idx_trip_exceptions_trip').on(table.tripId),
  vehicleIdx: index('idx_trip_exceptions_vehicle').on(table.vehicleId),
  typeIdx: index('idx_trip_exceptions_type').on(table.type),
  statusIdx: index('idx_trip_exceptions_status').on(table.status),
  reportedAtIdx: index('idx_trip_exceptions_reported_at').on(table.reportedAt),
  incidentRefIdx: index('idx_trip_exceptions_incident_ref').on(table.incidentReference),
  /** Active exceptions per account — used for dashboard banner and KPI card */
  activeAccountIdx: index('idx_trip_exceptions_active_account').on(table.accountId, table.status),
}));
