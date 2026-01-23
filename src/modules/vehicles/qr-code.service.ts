import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@modules/schemas';
import { eq, and } from 'drizzle-orm';
import * as QRCode from 'qrcode';

@Injectable()
export class QrCodeService {
  private readonly logger = new Logger(QrCodeService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly dbConnection: PostgresJsDatabase<typeof schema>,
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
        // Return existing QR code
        const qrCodeDataUrl = await QRCode.toDataURL(vehicle.qrCode, {
          errorCorrectionLevel: 'M',
          width: 300,
          margin: 1,
        });
        return {
          qrCodeDataUrl,
          qrCodeString: vehicle.qrCode,
          vehicleId: vehicle.thirdPartyId,
        };
      }

      // Generate QR code string (contains vehicleId as string)
      const qrCodeString = String(vehicleId);

      // Generate QR code image as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(qrCodeString, {
        errorCorrectionLevel: 'M',
        width: 300,
        margin: 1,
      });

      // Update vehicle with QR code
      await this.dbConnection
        .update(schema.vehicles)
        .set({
          qrCode: qrCodeString,
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
      // Extract vehicleId from QR code string
      const vehicleId = Number(qrCodeString);

      if (isNaN(vehicleId) || vehicleId <= 0) {
        throw new BadRequestException('Invalid QR code: vehicle ID is not valid');
      }

      // Find vehicle by QR code and accountId
      const [vehicle] = await this.dbConnection
        .select()
        .from(schema.vehicles)
        .where(
          and(
            eq(schema.vehicles.qrCode, qrCodeString),
            eq(schema.vehicles.accountId, accountId),
            eq(schema.vehicles.thirdPartyId, vehicleId), // Double-check vehicleId matches
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

      // Generate QR code image as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(qrCodeString, {
        errorCorrectionLevel: 'M',
        width: 300,
        margin: 1,
      });

      // Update vehicle with new QR code
      await this.dbConnection
        .update(schema.vehicles)
        .set({
          qrCode: qrCodeString,
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
