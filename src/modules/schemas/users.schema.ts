import { pgTable, text, timestamp, varchar, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';

// User roles enum
export type UserRole = 'agent' | 'admin' | 'manager';

// Users/Agents
// id column uses subid value from Malambi API (not auto-generated)
// subid from Malambi must be a valid integer string that gets converted to integer for id
export const users = pgTable('users', {
  id: integer('id').primaryKey().notNull(), // Uses subid value from Malambi API (converted to integer, not auto-generated)
  accountId: integer('account_id').notNull(), // Multi-tenant: account ID from logged-in user
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
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
  accidSubidUnique: uniqueIndex('uq_users_accid_subid').on(table.accid, table.subid), // Unique accid+subid combination per user
}));

