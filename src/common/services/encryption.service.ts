import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly saltLength = 64;
  private readonly tagLength = 16;
  private readonly encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    // Get encryption key from environment variable
    const envKey = this.configService.get<string>('QR_CODE_ENCRYPTION_KEY') || 
                   process.env.QR_CODE_ENCRYPTION_KEY;
    
    if (!envKey) {
      this.logger.warn(
        'QR_CODE_ENCRYPTION_KEY not set in environment variables. Using default key (NOT SECURE FOR PRODUCTION).',
      );
      // Default key for development only - MUST be changed in production
      this.encryptionKey = crypto.scryptSync('default-dev-key-change-in-production', 'salt', this.keyLength);
    } else {
      // Derive key from environment variable using scrypt
      this.encryptionKey = crypto.scryptSync(envKey, 'qr-code-salt', this.keyLength);
    }
  }

  /**
   * Encrypt a string value
   * @param plaintext - The value to encrypt
   * @returns Encrypted string (base64 encoded: iv:tag:encryptedData)
   */
  encrypt(plaintext: string): string {
    try {
      // Generate random IV for each encryption
      const iv = crypto.randomBytes(this.ivLength);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
      
      // Encrypt the data
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      // Get authentication tag
      const tag = cipher.getAuthTag();
      
      // Combine IV, tag, and encrypted data (all base64 encoded)
      // Format: iv:tag:encryptedData
      return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;
    } catch (error) {
      this.logger.error('Encryption failed:', error instanceof Error ? error.stack : error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt an encrypted string
   * @param encryptedData - The encrypted string (format: iv:tag:encryptedData)
   * @returns Decrypted plaintext string
   */
  decrypt(encryptedData: string): string {
    try {
      // Split the encrypted data
      const parts = encryptedData.split(':');
      
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }
      
      const [ivBase64, tagBase64, encrypted] = parts;
      
      // Decode from base64
      const iv = Buffer.from(ivBase64, 'base64');
      const tag = Buffer.from(tagBase64, 'base64');
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      decipher.setAuthTag(tag);
      
      // Decrypt the data
      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error('Decryption failed:', error instanceof Error ? error.stack : error);
      throw new Error('Failed to decrypt data. The encrypted data may be invalid or corrupted.');
    }
  }

  /**
   * Check if a string is encrypted (has the expected format)
   * @param data - The string to check
   * @returns true if the string appears to be encrypted
   */
  isEncrypted(data: string): boolean {
    // Encrypted data should have format: iv:tag:encryptedData (3 parts separated by :)
    const parts = data.split(':');
    return parts.length === 3 && parts.every(part => {
      try {
        Buffer.from(part, 'base64');
        return true;
      } catch {
        return false;
      }
    });
  }
}
