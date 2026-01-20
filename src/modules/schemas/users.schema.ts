import { pgTable, text, timestamp, varchar, index } from 'drizzle-orm/pg-core';
import { baseColumns } from './base.schema';

// User roles enum
export type UserRole = 'agent' | 'admin' | 'manager';

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
  email: varchar('email', { length: 255 }),
  role: varchar('role', { length: 20 }).notNull().default('agent'), // 'agent', 'admin', 'manager'
  fullname: varchar('fullname', { length: 255 }),
  lastLoginAt: timestamp('last_login_at'),
}, (table) => ({
  accountIdx: index('idx_users_account').on(table.accountId),
  usernameIdx: index('idx_users_username').on(table.username),
  companyIdx: index('idx_users_company').on(table.company),
  accidIdx: index('idx_users_accid').on(table.accid),
  emailIdx: index('idx_users_email').on(table.email),
  roleIdx: index('idx_users_role').on(table.role),
  lastLoginAtIdx: index('idx_users_last_login_at').on(table.lastLoginAt),
  accountAccidIdx: index('idx_users_account_accid').on(table.accountId, table.accid), // Composite index for accountId + accid queries
}));

