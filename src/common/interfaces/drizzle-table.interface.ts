import { PgTable, PgColumn } from 'drizzle-orm/pg-core';

export interface TableWithBaseColumns extends PgTable {
  id: PgColumn;
  createdAt: PgColumn;
  updatedAt: PgColumn;
  deletedAt: PgColumn;
}

