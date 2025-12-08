import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { baseColumns } from './base.schema';

export const users = pgTable('users', {
  ...baseColumns,
  k_u: text('k_u').notNull(),
  pid: text('pid').notNull(),
  subid: text('subid').notNull(),
  partner: text('partner').notNull(),
  k_k: text('k_k').notNull(),
  expire: text('expire').notNull(),
  token: text('token').notNull(),
  session: text('session').notNull(),
  accid: text('accid').notNull(),
  company: text('company').notNull(),
  username: text('username').notNull(),
  loginusername: text('loginusername').notNull(),
  k_p: text('k_p').notNull(),
  refresh_token: text('refresh_token'),
});

