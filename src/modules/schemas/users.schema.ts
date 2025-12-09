import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';
import { baseColumns } from './base.schema';

// Users/Agents
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
  k_p: text('k_p').notNull(),
  lastLoginAt: timestamp('last_login_at'),
}, (table) => ({
  usernameIdx: index('idx_users_username').on(table.username),
  companyIdx: index('idx_users_company').on(table.company),
  accidIdx: index('idx_users_accid').on(table.accid),
  lastLoginAtIdx: index('idx_users_last_login_at').on(table.lastLoginAt),
}));

