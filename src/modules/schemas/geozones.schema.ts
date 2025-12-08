import { pgTable, integer, varchar, jsonb, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';

// Geozones
export const geozones = pgTable('geozones', {
  ...baseColumnsSerial,
  name: varchar('name', { length: 255 }).notNull(),
  polygon: jsonb('polygon').notNull(),
  centerId: integer('center_id'), // Reference handled at application level to avoid circular dependency
  radiusMeters: integer('radius_meters'),
}, (table) => ({
  centerIdx: index('idx_geozones_center').on(table.centerId),
}));

