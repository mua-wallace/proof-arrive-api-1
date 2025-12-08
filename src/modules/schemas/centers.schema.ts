import { pgTable, integer, varchar, text, boolean, decimal, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';

// Centers
export const centers = pgTable('centers', {
  ...baseColumnsSerial,
  name: varchar('name', { length: 255 }).notNull().unique(),
  address: text('address'),
  latitude: decimal('latitude', { precision: 10, scale: 8 }),
  longitude: decimal('longitude', { precision: 11, scale: 8 }),
  geozoneId: integer('geozone_id'), // Reference handled at application level to avoid circular dependency
  isActive: boolean('is_active').default(true),
}, (table) => ({
  geozoneIdx: index('idx_centers_geozone').on(table.geozoneId),
}));

