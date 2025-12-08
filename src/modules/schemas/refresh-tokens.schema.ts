import { pgTable, uuid, integer, timestamp } from 'drizzle-orm/pg-core';

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  token: uuid('token').notNull().unique(),
  accid: integer('accid').notNull(),
  subid: integer('subid').notNull(),
  expiryDate: timestamp('expiry_date').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

