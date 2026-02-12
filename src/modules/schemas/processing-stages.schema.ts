import { pgTable, integer, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';
import { arrivals } from './arrivals.schema';

// Processing Stages
export const processingStages = pgTable('processing_stages', {
  ...baseColumnsSerial,
  arrivalId: integer('arrival_id').notNull().references(() => arrivals.id, { onDelete: 'cascade' }),
  stageType: varchar('stage_type', { length: 50 }).notNull(),
  // Status: arrival, arrived, in_processing, completed, cancelled, in_transit, exited
  status: varchar('status', { length: 50 }),
  // startedAt is set automatically when status changes to in_processing (not set on creation)
  startedAt: timestamp('started_at'),
  // completedAt is set automatically when status changes to completed
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
}, (table) => ({
  accountIdx: index('idx_processing_account').on(table.accountId),
  arrivalIdx: index('idx_processing_arrival').on(table.arrivalId),
  statusIdx: index('idx_processing_status').on(table.status),
  typeIdx: index('idx_processing_type').on(table.stageType),
}));

