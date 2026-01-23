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
   * QR code contains the vehicleId (thirdPartyId) as a string
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

      // Check if vehicle already has a QR code
      if (vehicle.qrCode) {
        // Decrypt existing QR code to generate image
        let decryptedQrCode: string;
        try {
          if (this.encryptionService.isEncrypted(vehicle.qrCode)) {
            decryptedQrCode = this.encryptionService.decrypt(vehicle.qrCode);
          } else {
            // Legacy: if QR code is not encrypted, use it as-is (backward compatibility)
            decryptedQrCode = vehicle.qrCode;
            // Re-encrypt and update for security
            const encryptedQrCode = this.encryptionService.encrypt(decryptedQrCode);
            await this.dbConnection
              .update(schema.vehicles)
              .set({
                qrCode: encryptedQrCode,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(schema.vehicles.id, vehicle.id),
                  eq(schema.vehicles.accountId, accountId),
                ),
              )
              .execute();
          }
        } catch (error) {
          this.logger.warn(`Failed to decrypt existing QR code for vehicle ${vehicleId}, regenerating...`);
          decryptedQrCode = String(vehicleId);
        }

        // Generate QR code image from decrypted value
        const qrCodeDataUrl = await QRCode.toDataURL(decryptedQrCode, {
          errorCorrectionLevel: 'M',
          width: 300,
          margin: 1,
        });
        return {
          qrCodeDataUrl,
          qrCodeString: decryptedQrCode, // Return decrypted value for API response
          vehicleId: vehicle.thirdPartyId,
        };
      }

      // Generate QR code string (contains vehicleId as string)
      const qrCodeString = String(vehicleId);
      
      // Encrypt the QR code string before storing
      const encryptedQrCode = this.encryptionService.encrypt(qrCodeString);

      // Generate QR code image as data URL (using plain text for QR code image)
      const qrCodeDataUrl = await QRCode.toDataURL(qrCodeString, {
        errorCorrectionLevel: 'M',
        width: 300,
        margin: 1,
      });

      // Update vehicle with encrypted QR code
      await this.dbConnection
        .update(schema.vehicles)
        .set({
          qrCode: encryptedQrCode, // Store encrypted version
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.vehicles.id, vehicle.id),
            eq(schema.vehicles.accountId, accountId),
          ),
        )
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
   * Validate and get vehicle information from QR code
   * Used by agents when scanning QR codes
   * @param qrCodeString - The QR code string (contains vehicleId)
   * @param accountId - The account ID for multi-tenancy
   * @returns Vehicle information
   */
  async validateQrCode(qrCodeString: string, accountId: number): Promise<{
    vehicle: typeof schema.vehicles.$inferSelect;
    vehicleId: number;
  }> {
    try {
      // Extract vehicleId from QR code string (scanned QR code contains plain text)
      const vehicleId = Number(qrCodeString);

      if (isNaN(vehicleId) || vehicleId <= 0) {
        throw new BadRequestException('Invalid QR code: vehicle ID is not valid');
      }

      // Encrypt the scanned QR code string to match against stored encrypted values
      const encryptedQrCode = this.encryptionService.encrypt(qrCodeString);

      // Find vehicle by encrypted QR code and accountId
      // Also check for legacy unencrypted QR codes (backward compatibility)
      const [vehicle] = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.accountId, accountId),
            eq(schema.vehicles.thirdPartyId, vehicleId),
            // Match either encrypted or legacy unencrypted QR code
            or(
              eq(schema.vehicles.qrCode, encryptedQrCode),
              eq(schema.vehicles.qrCode, qrCodeString), // Legacy support
            ),
          ),
        )
        .limit(1);

      if (!vehicle) {
        throw new NotFoundException(
          `Vehicle not found for QR code. The QR code may be invalid or belong to a different account.`,
        );
      }

      // If vehicle has legacy unencrypted QR code, upgrade it to encrypted
      if (vehicle.qrCode === qrCodeString && !this.encryptionService.isEncrypted(vehicle.qrCode)) {
        await this.dbConnection
          .update(schema.vehicles)
          .set({
            qrCode: encryptedQrCode,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.vehicles.id, vehicle.id),
              eq(schema.vehicles.accountId, accountId),
            ),
          )
          .execute();
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
   * This will replace the existing QR code
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

      // Generate new QR code string (contains vehicleId as string)
      const qrCodeString = String(vehicleId);
      
      // Encrypt the QR code string before storing
      const encryptedQrCode = this.encryptionService.encrypt(qrCodeString);

      // Generate QR code image as data URL (using plain text for QR code image)
      const qrCodeDataUrl = await QRCode.toDataURL(qrCodeString, {
        errorCorrectionLevel: 'M',
        width: 300,
        margin: 1,
      });

      // Update vehicle with encrypted QR code
      await this.dbConnection
        .update(schema.vehicles)
        .set({
          qrCode: encryptedQrCode, // Store encrypted version
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.vehicles.id, vehicle.id),
            eq(schema.vehicles.accountId, accountId),
          ),
        )
        .execute();

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
}
