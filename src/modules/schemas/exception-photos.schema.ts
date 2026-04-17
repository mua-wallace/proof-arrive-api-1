import { pgTable, integer, varchar, timestamp, text, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';
import { tripExceptions } from './trip-exceptions.schema';
import { users } from './users.schema';

/**
 * Exception photos store evidence images for accident exceptions.
 * Photos are uploaded from the mobile app or dashboard file upload.
 * No GPS coordinates — only timestamp and label.
 */
export const exceptionPhotos = pgTable('exception_photos', {
  ...baseColumnsSerial,

  exceptionId: integer('exception_id').notNull().references(() => tripExceptions.id, { onDelete: 'cascade' }),

  /** Storage URL or file path */
  url: text('url').notNull(),

  /** Original filename */
  filename: varchar('filename', { length: 255 }),

  /** FRONT_DAMAGE | ROAD_SCENE | CARGO | DOCUMENTS | OTHER */
  label: varchar('label', { length: 30 }).notNull().default('OTHER'),

  /** Device clock at upload time */
  takenAt: timestamp('taken_at').notNull().defaultNow(),

  /** User who uploaded the photo */
  uploadedById: integer('uploaded_by_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
}, (table) => ({
  accountIdx: index('idx_exception_photos_account').on(table.accountId),
  exceptionIdx: index('idx_exception_photos_exception').on(table.exceptionId),
}));
