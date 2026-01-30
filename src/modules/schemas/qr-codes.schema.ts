import { pgTable, integer, varchar, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { baseColumnsSerial } from './base.schema';

// QR codes: one per vehicle, one vehicle per QR code (1:1). References vehicle by thirdPartyId.
export const qrCodes = pgTable(
  'qr_codes',
  {
    ...baseColumnsSerial,
    vehicleThirdPartyId: integer('vehicle_third_party_id').notNull(), // References vehicles.thirdPartyId (join via accountId + vehicleThirdPartyId)
    qrCode: varchar('qr_code', { length: 500 }).notNull(),
  },
  (table) => ({
    accountIdx: index('idx_qr_codes_account').on(table.accountId),
    vehicleThirdPartyIdx: index('idx_qr_codes_vehicle_third_party').on(table.vehicleThirdPartyId),
    accountVehicleThirdPartyUnique: uniqueIndex('uq_qr_codes_account_vehicle_third_party').on(
      table.accountId,
      table.vehicleThirdPartyId,
    ), // One QR code per vehicle (per account)
    accountQrCodeUnique: uniqueIndex('uq_qr_codes_account_qr_code').on(table.accountId, table.qrCode), // One qrCode value per account
  }),
);
