import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@modules/schemas';
import { eq, and, or } from 'drizzle-orm';
import * as QRCode from 'qrcode';
import { EncryptionService } from '@common/services/encryption.service';

@Injectable()
export class QrCodeService {
  private readonly logger = new Logger(QrCodeService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly dbConnection: PostgresJsDatabase<typeof schema>,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Generate QR code for a vehicle
   * QR code is stored in qr_codes table (1:1 with vehicle)
   * @param vehicleId - The vehicle's thirdPartyId
   * @param accountId - The account ID for multi-tenancy
   * @returns QR code data URL (base64 image) and the QR code string
   */
  async generateQrCode(vehicleId: number, accountId: number): Promise<{
    qrCodeDataUrl: string;
    qrCodeString: string;
    vehicleId: number;
  }> {
    try {
      // Find vehicle and verify it belongs to the account
      const [vehicle] = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.thirdPartyId, vehicleId),
            eq(schema.vehicles.accountId, accountId),
          ),
        )
        .limit(1);

      if (!vehicle) {
        throw new NotFoundException(`Vehicle with ID ${vehicleId} not found for this account`);
      }

      // Check if vehicle already has a QR code in qr_codes table
      const [existingQr] = await this.dbConnection
        .select()
        .from(schema.qrCodes)
        .where(
          and(
            eq(schema.qrCodes.vehicleThirdPartyId, vehicle.thirdPartyId),
            eq(schema.qrCodes.accountId, accountId),
          ),
        )
        .limit(1);

      if (existingQr) {
        // Decrypt existing QR code to generate image
        let decryptedQrCode: string;
        try {
          if (this.encryptionService.isEncrypted(existingQr.qrCode)) {
            decryptedQrCode = this.encryptionService.decrypt(existingQr.qrCode);
          } else {
            decryptedQrCode = existingQr.qrCode;
            // Re-encrypt and update for security
            const encryptedQrCode = this.encryptionService.encrypt(decryptedQrCode);
            await this.dbConnection
              .update(schema.qrCodes)
              .set({
                qrCode: encryptedQrCode,
                updatedAt: new Date(),
              })
              .where(eq(schema.qrCodes.id, existingQr.id))
              .execute();
          }
        } catch (error) {
          this.logger.warn(`Failed to decrypt existing QR code for vehicle ${vehicleId}, regenerating stored value...`);
          decryptedQrCode = String(vehicleId);
          // Re-encrypt and update so future requests succeed (e.g. after encryption key change)
          const encryptedQrCode = this.encryptionService.encrypt(decryptedQrCode);
          await this.dbConnection
            .update(schema.qrCodes)
            .set({
              qrCode: encryptedQrCode,
              updatedAt: new Date(),
            })
            .where(eq(schema.qrCodes.id, existingQr.id))
            .execute();
        }

        const qrCodeDataUrl = await QRCode.toDataURL(decryptedQrCode, {
          errorCorrectionLevel: 'M',
          width: 300,
          margin: 1,
        });
        return {
          qrCodeDataUrl,
          qrCodeString: decryptedQrCode,
          vehicleId: vehicle.thirdPartyId,
        };
      }

      // Generate QR code string and store in qr_codes table
      const qrCodeString = String(vehicleId);
      const encryptedQrCode = this.encryptionService.encrypt(qrCodeString);

      const qrCodeDataUrl = await QRCode.toDataURL(qrCodeString, {
        errorCorrectionLevel: 'M',
        width: 300,
        margin: 1,
      });

      await this.dbConnection
        .insert(schema.qrCodes)
        .values({
          accountId,
          vehicleThirdPartyId: vehicle.thirdPartyId,
          qrCode: encryptedQrCode,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();

      this.logger.log(`Generated QR code for vehicle ${vehicleId} (accountId: ${accountId})`);

      return {
        qrCodeDataUrl,
        qrCodeString,
        vehicleId: vehicle.thirdPartyId,
      };
    } catch (error) {
      this.logger.error(
        `Error generating QR code for vehicle ${vehicleId}:`,
        error instanceof Error ? error.stack : error,
      );
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException(
        `Failed to generate QR code: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get QR code for a vehicle by vehicleId (thirdPartyId), with vehicle details.
   * Generates and stores the QR code if it does not exist yet.
   * @param vehicleId - The vehicle's thirdPartyId
   * @param accountId - The account ID for multi-tenancy
   * @returns QR code data URL, string, vehicleId, and full vehicle details
   */
  async getQrCodeByVehicleId(
    vehicleId: number,
    accountId: number,
  ): Promise<{
    vehicle: typeof schema.vehicles.$inferSelect;
    qrCodeDataUrl: string;
    qrCodeString: string;
    vehicleId: number;
  }> {
    const result = await this.generateQrCode(vehicleId, accountId);
    const [vehicle] = await this.dbConnection
      .select()
      .from(schema.vehicles)
      .where(
        and(
          eq(schema.vehicles.thirdPartyId, vehicleId),
          eq(schema.vehicles.accountId, accountId),
        ),
      )
      .limit(1);

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${vehicleId} not found for this account`);
    }

    return {
      vehicle,
      qrCodeDataUrl: result.qrCodeDataUrl,
      qrCodeString: result.qrCodeString,
      vehicleId: result.vehicleId,
    };
  }

  /**
   * Validate and get vehicle information from QR code
   * Looks up qr_codes table by qrCode value and accountId, then returns the linked vehicle
   * @param qrCodeString - The QR code string (contains vehicleId)
   * @param accountId - The account ID for multi-tenancy
   * @returns Vehicle information
   */
  async validateQrCode(qrCodeString: string, accountId: number): Promise<{
    vehicle: typeof schema.vehicles.$inferSelect;
    vehicleId: number;
  }> {
    try {
      const vehicleIdFromQr = Number(qrCodeString);
      if (isNaN(vehicleIdFromQr) || vehicleIdFromQr <= 0) {
        throw new BadRequestException('Invalid QR code: vehicle ID is not valid');
      }

      let qrRow: typeof schema.qrCodes.$inferSelect | undefined;

      // Optimization: Since QR codes are String(vehicleId), try to find by vehicleThirdPartyId first
      // This avoids decrypting all QR codes for the account
      const [potentialQrRow] = await this.dbConnection
        .select()
        .from(schema.qrCodes)
        .where(
          and(
            eq(schema.qrCodes.vehicleThirdPartyId, vehicleIdFromQr),
            eq(schema.qrCodes.accountId, accountId),
          ),
        )
        .limit(1);

      if (potentialQrRow) {
        // Verify by decrypting and comparing
        try {
          let decrypted: string;
          if (this.encryptionService.isEncrypted(potentialQrRow.qrCode)) {
            decrypted = this.encryptionService.decrypt(potentialQrRow.qrCode);
          } else {
            decrypted = potentialQrRow.qrCode;
          }

          if (decrypted === qrCodeString) {
            qrRow = potentialQrRow;
          }
        } catch (error) {
          this.logger.warn(
            `Failed to decrypt QR code ${potentialQrRow.id} for vehicle ${vehicleIdFromQr}:`,
            error instanceof Error ? error.message : 'Unknown error',
          );
        }
      }

      // Fallback: If not found by vehicleThirdPartyId, search all QR codes for this account
      // This handles edge cases where QR code format might differ
      if (!qrRow) {
        const qrCodes = await this.dbConnection
          .select()
          .from(schema.qrCodes)
          .where(eq(schema.qrCodes.accountId, accountId));

        // Try to find matching QR code by decrypting stored values
        for (const qr of qrCodes) {
          try {
            let decrypted: string;
            if (this.encryptionService.isEncrypted(qr.qrCode)) {
              decrypted = this.encryptionService.decrypt(qr.qrCode);
            } else {
              // Legacy unencrypted QR code
              decrypted = qr.qrCode;
            }

            // Compare decrypted value with input
            if (decrypted === qrCodeString) {
              qrRow = qr;
              break;
            }
          } catch (error) {
            // Skip QR codes that fail to decrypt (might be corrupted or from different encryption key)
            this.logger.warn(
              `Failed to decrypt QR code ${qr.id} for account ${accountId}:`,
              error instanceof Error ? error.message : 'Unknown error',
            );
            continue;
          }
        }

        // Also check plain text match (for legacy unencrypted QR codes)
        if (!qrRow) {
          const plainTextMatch = qrCodes.find((qr) => qr.qrCode === qrCodeString);
          if (plainTextMatch) {
            qrRow = plainTextMatch;
          }
        }
      }

      if (!qrRow) {
        throw new NotFoundException(
          `QR code not found. The QR code may be invalid or belong to a different account.`,
        );
      }

      // Upgrade legacy unencrypted QR code to encrypted
      if (!this.encryptionService.isEncrypted(qrRow.qrCode)) {
        const encryptedQrCode = this.encryptionService.encrypt(qrCodeString);
        await this.dbConnection
          .update(schema.qrCodes)
          .set({
            qrCode: encryptedQrCode,
            updatedAt: new Date(),
          })
          .where(eq(schema.qrCodes.id, qrRow.id))
          .execute();
      }

      // Get vehicle by qr_codes.vehicleThirdPartyId (references vehicles.thirdPartyId)
      const [vehicle] = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.thirdPartyId, qrRow.vehicleThirdPartyId),
            eq(schema.vehicles.accountId, accountId),
          ),
        )
        .limit(1);

      if (!vehicle) {
        throw new NotFoundException(
          `Vehicle not found for QR code. The QR code may be invalid or belong to a different account.`,
        );
      }

      return {
        vehicle,
        vehicleId: vehicle.thirdPartyId,
      };
    } catch (error) {
      this.logger.error(
        `Error validating QR code:`,
        error instanceof Error ? error.stack : error,
      );
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Failed to validate QR code: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Regenerate QR code for a vehicle (admin/manager only)
   * Updates or inserts the row in qr_codes table
   * @param vehicleId - The vehicle's thirdPartyId
   * @param accountId - The account ID for multi-tenancy
   * @returns QR code data URL and the QR code string
   */
  async regenerateQrCode(vehicleId: number, accountId: number): Promise<{
    qrCodeDataUrl: string;
    qrCodeString: string;
    vehicleId: number;
  }> {
    try {
      const [vehicle] = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.thirdPartyId, vehicleId),
            eq(schema.vehicles.accountId, accountId),
          ),
        )
        .limit(1);

      if (!vehicle) {
        throw new NotFoundException(`Vehicle with ID ${vehicleId} not found for this account`);
      }

      const qrCodeString = String(vehicleId);
      const encryptedQrCode = this.encryptionService.encrypt(qrCodeString);

      const qrCodeDataUrl = await QRCode.toDataURL(qrCodeString, {
        errorCorrectionLevel: 'M',
        width: 300,
        margin: 1,
      });

      const [existingQr] = await this.dbConnection
        .select()
        .from(schema.qrCodes)
        .where(
          and(
            eq(schema.qrCodes.vehicleThirdPartyId, vehicle.thirdPartyId),
            eq(schema.qrCodes.accountId, accountId),
          ),
        )
        .limit(1);

      if (existingQr) {
        await this.dbConnection
          .update(schema.qrCodes)
          .set({
            qrCode: encryptedQrCode,
            updatedAt: new Date(),
          })
          .where(eq(schema.qrCodes.id, existingQr.id))
          .execute();
      } else {
        await this.dbConnection
          .insert(schema.qrCodes)
          .values({
            accountId,
            vehicleThirdPartyId: vehicle.thirdPartyId,
            qrCode: encryptedQrCode,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .execute();
      }

      this.logger.log(`Regenerated QR code for vehicle ${vehicleId} (accountId: ${accountId})`);

      return {
        qrCodeDataUrl,
        qrCodeString,
        vehicleId: vehicle.thirdPartyId,
      };
    } catch (error) {
      this.logger.error(
        `Error regenerating QR code for vehicle ${vehicleId}:`,
        error instanceof Error ? error.stack : error,
      );
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException(
        `Failed to regenerate QR code: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Bulk generate QR codes for multiple vehicles
   * @param vehicleIds - Array of vehicle thirdPartyIds
   * @param accountId - The account ID for multi-tenancy
   * @returns Results with success, failed, and skipped counts
   */
  async bulkGenerateQrCodes(
    vehicleIds: number[],
    accountId: number,
  ): Promise<{
    success: Array<{
      vehicleId: number;
      qrCodeDataUrl: string;
      qrCodeString: string;
    }>;
    failed: Array<{
      vehicleId: number;
      error: string;
    }>;
    skipped: Array<{
      vehicleId: number;
      reason: string;
    }>;
    summary: {
      total: number;
      successCount: number;
      failedCount: number;
      skippedCount: number;
    };
  }> {
    const results = {
      success: [] as Array<{
        vehicleId: number;
        qrCodeDataUrl: string;
        qrCodeString: string;
      }>,
      failed: [] as Array<{
        vehicleId: number;
        error: string;
      }>,
      skipped: [] as Array<{
        vehicleId: number;
        reason: string;
      }>,
    };

    if (!vehicleIds || vehicleIds.length === 0) {
      throw new BadRequestException('At least one vehicle ID is required');
    }

    // Validate all vehicle IDs are numbers
    const validVehicleIds = vehicleIds.filter((id) => {
      const numId = Number(id);
      return !isNaN(numId) && numId > 0;
    });

    if (validVehicleIds.length === 0) {
      throw new BadRequestException('No valid vehicle IDs provided');
    }

    // Process each vehicle ID
    for (const vehicleId of validVehicleIds) {
      try {
        // Check if vehicle exists
        const [vehicle] = await this.dbConnection
          .select()
          .from(schema.vehicles)
          .where(
            and(
              eq(schema.vehicles.thirdPartyId, vehicleId),
              eq(schema.vehicles.accountId, accountId),
            ),
          )
          .limit(1);

        if (!vehicle) {
          results.skipped.push({
            vehicleId,
            reason: `Vehicle with ID ${vehicleId} not found for this account`,
          });
          continue;
        }

        // Check if QR code already exists
        const [existingQr] = await this.dbConnection
          .select()
          .from(schema.qrCodes)
          .where(
            and(
              eq(schema.qrCodes.vehicleThirdPartyId, vehicle.thirdPartyId),
              eq(schema.qrCodes.accountId, accountId),
            ),
          )
          .limit(1);

        if (existingQr) {
          // Decrypt and return existing QR code
          let decryptedQrCode: string;
          try {
            if (this.encryptionService.isEncrypted(existingQr.qrCode)) {
              decryptedQrCode = this.encryptionService.decrypt(existingQr.qrCode);
            } else {
              decryptedQrCode = existingQr.qrCode;
              // Re-encrypt and update for security
              const encryptedQrCode = this.encryptionService.encrypt(decryptedQrCode);
              await this.dbConnection
                .update(schema.qrCodes)
                .set({
                  qrCode: encryptedQrCode,
                  updatedAt: new Date(),
                })
                .where(eq(schema.qrCodes.id, existingQr.id))
                .execute();
            }
          } catch (error) {
            this.logger.warn(`Failed to decrypt existing QR code for vehicle ${vehicleId}, regenerating...`);
            decryptedQrCode = String(vehicleId);
            const encryptedQrCode = this.encryptionService.encrypt(decryptedQrCode);
            await this.dbConnection
              .update(schema.qrCodes)
              .set({
                qrCode: encryptedQrCode,
                updatedAt: new Date(),
              })
              .where(eq(schema.qrCodes.id, existingQr.id))
              .execute();
          }

          const qrCodeDataUrl = await QRCode.toDataURL(decryptedQrCode, {
            errorCorrectionLevel: 'M',
            width: 300,
            margin: 1,
          });

          results.success.push({
            vehicleId: vehicle.thirdPartyId,
            qrCodeDataUrl,
            qrCodeString: decryptedQrCode,
          });
          continue;
        }

        // Generate new QR code
        const qrCodeString = String(vehicleId);
        const encryptedQrCode = this.encryptionService.encrypt(qrCodeString);

        const qrCodeDataUrl = await QRCode.toDataURL(qrCodeString, {
          errorCorrectionLevel: 'M',
          width: 300,
          margin: 1,
        });

        await this.dbConnection
          .insert(schema.qrCodes)
          .values({
            accountId,
            vehicleThirdPartyId: vehicle.thirdPartyId,
            qrCode: encryptedQrCode,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .execute();

        this.logger.log(`Generated QR code for vehicle ${vehicleId} (accountId: ${accountId})`);

        results.success.push({
          vehicleId: vehicle.thirdPartyId,
          qrCodeDataUrl,
          qrCodeString,
        });
      } catch (error) {
        this.logger.error(
          `Error generating QR code for vehicle ${vehicleId}:`,
          error instanceof Error ? error.stack : error,
        );
        results.failed.push({
          vehicleId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      ...results,
      summary: {
        total: validVehicleIds.length,
        successCount: results.success.length,
        failedCount: results.failed.length,
        skippedCount: results.skipped.length,
      },
    };
  }

  /**
   * Delete QR code for a vehicle
   * @param vehicleId - The vehicle's thirdPartyId
   * @param accountId - The account ID for multi-tenancy
   * @returns The deleted QR code record
   */
  async deleteQrCode(vehicleId: number, accountId: number): Promise<typeof schema.qrCodes.$inferSelect> {
    try {
      // Find vehicle and verify it belongs to the account
      const [vehicle] = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.thirdPartyId, vehicleId),
            eq(schema.vehicles.accountId, accountId),
          ),
        )
        .limit(1);

      if (!vehicle) {
        throw new NotFoundException(`Vehicle with ID ${vehicleId} not found for this account`);
      }

      // Find QR code
      const [qrCode] = await this.dbConnection
        .select()
        .from(schema.qrCodes)
        .where(
          and(
            eq(schema.qrCodes.vehicleThirdPartyId, vehicle.thirdPartyId),
            eq(schema.qrCodes.accountId, accountId),
          ),
        )
        .limit(1);

      if (!qrCode) {
        throw new NotFoundException(`QR code not found for vehicle with ID ${vehicleId}`);
      }

      // Delete the QR code
      await this.dbConnection
        .delete(schema.qrCodes)
        .where(eq(schema.qrCodes.id, qrCode.id))
        .execute();

      this.logger.log(`Deleted QR code for vehicle ${vehicleId} (accountId: ${accountId})`);

      return qrCode;
    } catch (error) {
      this.logger.error(
        `Error deleting QR code for vehicle ${vehicleId}:`,
        error instanceof Error ? error.stack : error,
      );
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException(
        `Failed to delete QR code: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
