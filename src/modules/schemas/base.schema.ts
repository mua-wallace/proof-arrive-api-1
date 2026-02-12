import { uuid, serial, timestamp, integer } from 'drizzle-orm/pg-core';

// Base columns for UUID-based tables (with soft delete)
export const baseColumns = {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: integer('account_id').notNull(), // Multi-tenant: account ID from logged-in user
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
};

// Base columns for serial ID-based tables (without soft delete by default)
export const baseColumnsSerial = {
  id: serial('id').primaryKey(),
  accountId: integer('account_id').notNull(), // Multi-tenant: account ID from logged-in user
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
};

