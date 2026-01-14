import { pgTable, integer, varchar, text, index } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';

// Centers
export const centers = pgTable('centers', {
  ...baseColumnsSerial,
  thirdPartyId: integer('third_party_id').notNull(), // id from Malambi API (e.g., 84)
  siteid: integer('siteid').notNull(), // siteid from Malambi API (e.g., 9164)
  name: varchar('name', { length: 255 }).notNull(),
  fullname: varchar('fullname', { length: 255 }),
  geozone: varchar('geozone', { length: 255 }), // geozone name (e.g., "CC Y3")
  geozoneId: integer('geozone_id'), // gzone_id from Malambi API (e.g., 3656) - Reference handled at application level
  manager: varchar('manager', { length: 255 }),
  groupid: integer('groupid'),
  groupname: varchar('groupname', { length: 255 }),
  sitetype: integer('sitetype').default(0),
  distance: integer('distance'),
  time1: varchar('time1', { length: 10 }), // e.g., "06:30"
  time2: varchar('time2', { length: 10 }), // e.g., "22:00"
  saturday: varchar('saturday', { length: 10 }), // e.g., "21:59:59"
  sunday: varchar('sunday', { length: 10 }), // e.g., "11:59:59"
  breakstart: varchar('breakstart', { length: 10 }), // e.g., "13:00"
  breakstop: varchar('breakstop', { length: 10 }), // e.g., "14:00"
  timeoutin: integer('timeoutin'),
  timeoutin_str: varchar('timeoutin_str', { length: 50 }), // e.g., "01:00"
  timeoutin_muros: integer('timeoutin_muros'),
  timeoutin_muros_str: varchar('timeoutin_muros_str', { length: 50 }), // e.g., "01:00"
}, (table) => ({
  accountIdx: index('idx_centers_account').on(table.accountId),
  thirdPartyIdx: index('idx_centers_third_party').on(table.thirdPartyId),
  siteidIdx: index('idx_centers_siteid').on(table.siteid),
  accountThirdPartyIdx: index('idx_centers_account_third_party').on(table.accountId, table.thirdPartyId), // Unique per account
  accountSiteidIdx: index('idx_centers_account_siteid').on(table.accountId, table.siteid), // Unique per account
  nameIdx: index('idx_centers_name').on(table.name),
  geozoneIdx: index('idx_centers_geozone').on(table.geozoneId),
  groupidIdx: index('idx_centers_groupid').on(table.groupid),
}));

