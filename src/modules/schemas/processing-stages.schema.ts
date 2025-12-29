import { pgTable, integer, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';
import { arrivals } from './arrivals.schema';
import { ArrivalStatus } from '@modules/arrivals/dto';

// Processing Stages
export const processingStages = pgTable('processing_stages', {
  ...baseColumnsSerial,
  arrivalId: integer('arrival_id').notNull().references(() => arrivals.id, { onDelete: 'cascade' }),
  stageType: varchar('stage_type', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
}, (table) => ({
  arrivalIdx: index('idx_processing_arrival').on(table.arrivalId),
  statusIdx: index('idx_processing_status').on(table.status),
  typeIdx: index('idx_processing_type').on(table.stageType),
}));

