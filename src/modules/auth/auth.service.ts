import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as schema from '@modules/schemas';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { v4 as uuidv4 } from 'uuid';
import { and, eq, gt, lt } from 'drizzle-orm';
import { MalambiApiService } from '@integrations/malambi-api/malambi-api.service';
import { Credentials } from '@common/interfaces';
import { QueueService } from '@common/queue/queue.service';
import { UsersSyncService } from '@modules/users/users-sync.service';
import { CentersSeederService } from '@modules/centers/centers-seeder.service';

// Temporary user type from Malambi API login response
interface MalambiUser {
  accid: string | number;
  subid: string | number;
  token: string;
  session: string;
  username: string;
  loginusername?: string;
  company?: string;
  [key: string]: any;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly malambiApi: MalambiApiService,
    private readonly queueService: QueueService,
    private readonly usersSyncService: UsersSyncService,
    private readonly centersSeederService: CentersSeederService,
    @Inject(DATABASE_CONNECTION)
    private readonly dbConnection: PostgresJsDatabase<typeof schema>,
  ) {}

  async login(user: MalambiUser): Promise<any> {
    // Convert accid and subid to numbers, handling empty strings and invalid values
    const accidStr = String(user.accid || '').trim();
    const subidStr = String(user.subid || '').trim();
    
    if (!accidStr || !subidStr) {
      throw new UnauthorizedException('Invalid user credentials: missing account information');
    }
    
    const accid = Number(accidStr);
    const subid = Number(subidStr);
    
    if (isNaN(accid) || isNaN(subid) || accid <= 0 || subid <= 0) {
      throw new UnauthorizedException('Invalid user credentials: invalid account IDs');
    }
    
    // Check if user exists in database
    // Wrap in try-catch to handle database schema issues gracefully
    let userExists = false;
    try {
      userExists = await this.usersSyncService.userExists(accidStr);
    } catch (error: any) {
      // If userExists fails due to missing account_id column, assume user doesn't exist
      // This allows the login flow to continue and create the user
      const errorCode = error?.code;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorString = String(error).toLowerCase();
      
      // Check multiple patterns for "column does not exist" error
      const isAccountIdError = 
        (errorCode === '42703') || // PostgreSQL error code for undefined column
        errorMessage?.toLowerCase().includes('account_id') ||
        errorString.includes('account_id') ||
        (errorMessage?.includes('column') && errorMessage?.includes('account_id')) ||
        (errorString.includes('column') && errorString.includes('account_id'));
      
      if (isAccountIdError) {
        this.logger.warn(
          `account_id column missing during userExists check (accid=${accidStr}). ` +
          `Assuming user doesn't exist and will be created. Run migrations to add account_id column.`
        );
        userExists = false; // Assume user doesn't exist, will be created
      } else {
        // For other errors, log and rethrow
        this.logger.error(`Error checking if user exists (accid=${accidStr}):`, error);
        throw error;
      }
    }
    
    if (!userExists) {
      // User doesn't exist, trigger background sync job with full user data
      // Center seeding will happen automatically in the queue processor after user sync
      await this.queueService.add('user-sync', 'sync-user', { 
        userData: {
          accid: accidStr,
          subid: subidStr,
          token: user.token,
          session: user.session,
          username: user.username,
          company: user.company || '',
          k_u: user.k_u || '',
          pid: user.pid || '',
          partner: user.partner || '0',
          k_k: user.k_k || '',
          expire: user.expire || '0',
          k_p: user.k_p || '',
          email: user.email, // Optional email from Malambi API
        }
      });
    } else {
      // User exists, update lastLoginAt
      try {
        await this.usersSyncService.updateLastLogin(accidStr);
      } catch (error: any) {
        // Log but don't fail login if updateLastLogin fails
        const errorCode = error?.code;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorString = String(error).toLowerCase();
        
        // Check multiple patterns for "column does not exist" error
        const isAccountIdError = 
          (errorCode === '42703') ||
          errorMessage?.toLowerCase().includes('account_id') ||
          errorString.includes('account_id') ||
          (errorMessage?.includes('column') && errorMessage?.includes('account_id')) ||
          (errorString.includes('column') && errorString.includes('account_id'));
        
        if (isAccountIdError) {
          this.logger.warn(
            `account_id column missing during updateLastLogin (accid=${accidStr}). ` +
            `Login will continue but lastLoginAt won't be updated. Run migrations to add account_id column.`
          );
        } else {
          this.logger.error(`Error updating lastLoginAt (accid=${accidStr}):`, error);
          // Don't throw - allow login to continue
        }
      }
      
      // Ensure default centers exist for this account (non-blocking, runs in background)
      // This handles cases where centers weren't seeded before (e.g., existing users)
      this.centersSeederService.seedDefaultCentersForAccount(accid).catch((error) => {
        this.logger.error(
          `Error seeding default centers for accountId ${accid} during login:`,
          error instanceof Error ? error.stack : error,
        );
      });
    }
    
    const { accessToken, refreshToken } = await this.generateUserTokens(
      user.token,
      
      accid,
      subid,
    );

    return {
      accid: accidStr,
      subid: subidStr,
      token: user.token,
      session: user.session,
      username: user.username,
      company: user.company || '',
      k_u: user.k_u || '',
      pid: user.pid || '',
      partner: user.partner || '0',
      k_k: user.k_k || '',
      expire: user.expire || '0',
      k_p: user.k_p || '',
      accessToken,
      refreshToken,
    };
  }

  async generateUserTokens(
    token: string,
    accid: number,
    subid: number,
  ) {
    const refreshtoken = uuidv4();
    const expirationAccessTokenMs = Number(
      this.configService.get('jwt.accessToken.expiration'),
    );
    const expirationRefreshTokenMs = Number(
      this.configService.get('jwt.refreshToken.expiration'),
    );

    // ✅ Embed accid/subid into refresh token payload
    const accessToken = this.jwtService.sign(
      { token, accid, subid },
      {
        secret: this.configService.getOrThrow<string>('jwt.accessToken.secret'),
        expiresIn: `${expirationAccessTokenMs}ms`,
      },
    );

    const refreshToken = this.jwtService.sign(
      { refreshtoken, accid, subid, token }, // Include token for refresh
      {
        secret: this.configService.getOrThrow<string>('jwt.refreshToken.secret'),
        expiresIn: `${expirationRefreshTokenMs}ms`,
      },
    );

    // ✅ Persist refresh token record
    await this.storeRefreshToken(refreshtoken, accid, subid);

    return { accessToken, refreshToken };
  }

  async storeRefreshToken(token: string, accid: number, subid: number) {
    // calc expiry date, 3 days from now
    try {
      const expirationRefreshTokenDays = Number(
        this.configService.get('jwt.refreshTokenExpirationDays'),
      );
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + expirationRefreshTokenDays);

      await this.dbConnection
        .insert(schema.refreshTokens)
        .values({
          token,
          accid,
          subid,
          expiryDate,
        })
        .execute();
    } catch (error) {
      this.logger.error('Error storing refresh token:', error instanceof Error ? error.stack : error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(
        `Failed to create refresh token: ${errorMessage}`,
      );
    }
  }

  /**
   * Refresh access token using a valid refresh token
   * Implements token rotation: invalidates the old refresh token and issues a new one
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    try {
      // 1. Verify and decode the refresh token JWT
      const decoded = this.jwtService.verify(refreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.refreshToken.secret'),
      }) as { refreshtoken: string; accid: number; subid: number; token?: string };

      const { refreshtoken, accid, subid, token } = decoded;

      // Validate decoded payload
      if (!accid || !subid || isNaN(accid) || isNaN(subid) || !refreshtoken) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // Malambi token is required for access token to work with middleware
      if (!token) {
        throw new UnauthorizedException('Malambi token missing from refresh token');
      }

      // 2. Verify the refresh token exists in database and is not expired
      const [tokenRecord] = await this.dbConnection
        .select()
        .from(schema.refreshTokens)
        .where(
          and(
            eq(schema.refreshTokens.token, refreshtoken),
            eq(schema.refreshTokens.accid, accid),
            eq(schema.refreshTokens.subid, subid),
            gt(schema.refreshTokens.expiryDate, new Date()),
          ),
        )
        .limit(1);

      if (!tokenRecord) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // 3. Invalidate the old refresh token (token rotation for security)
      await this.dbConnection
        .delete(schema.refreshTokens)
        .where(eq(schema.refreshTokens.token, refreshtoken));

      // 4. Clean up any expired tokens for this user (housekeeping)
      await this.dbConnection
        .delete(schema.refreshTokens)
        .where(
          and(
            eq(schema.refreshTokens.accid, accid),
            eq(schema.refreshTokens.subid, subid),
            lt(schema.refreshTokens.expiryDate, new Date()),
          ),
        );

      // 5. Generate new access and refresh tokens
      // Use the Malambi token from the decoded refresh token
      const { accessToken, refreshToken: newRefreshToken } = await this.generateUserTokens(
        token,
        accid,
        subid,
      );

      return {
        accessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error('Refresh token error:', error instanceof Error ? error.stack : error);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }


  async logout(
    credentials: Credentials,
  ): Promise<{ success: boolean; message: string }> {
    const { token, accid, subid } = credentials;
    
    // Validate credentials
    if (!token || !accid || !subid || isNaN(accid) || isNaN(subid)) {
      return { success: false, message: 'Invalid user credentials' };
    }
    
    try {
      // 1. Logout from Malambi API
      const result = await this.malambiApi.logout(token, accid, subid);
      const malambiSuccess = (result || '').toString().trim().toLowerCase() === 'ok';
      
      // 2. Invalidate all refresh tokens for this user in our database
      try {
        await this.dbConnection
          .delete(schema.refreshTokens)
          .where(
            and(
              eq(schema.refreshTokens.accid, accid),
              eq(schema.refreshTokens.subid, subid),
            ),
          );
      } catch (dbError) {
        // Continue even if clearing tokens fails
      }
      
      if (malambiSuccess) {
        return { success: true, message: 'Logged out successfully from both systems' };
      } else {
        return { success: false, message: 'Logout failed on remote API' };
      }
    } catch (error) {
      // Even if Malambi logout fails, try to clear our refresh tokens
      try {
        await this.dbConnection
          .delete(schema.refreshTokens)
          .where(
            and(
              eq(schema.refreshTokens.accid, accid),
              eq(schema.refreshTokens.subid, subid),
            ),
          );
      } catch (dbError) {
        // Ignore if clearing tokens fails
      }
      return { success: false, message: 'Logout failed due to server error' };
    }
  }

  async checkAuthFromRequest(req: Request): Promise<{ success: true } | never> {
    const authHeader = req.headers['authorization'];
    if (
      !authHeader ||
      typeof authHeader !== 'string' ||
      !authHeader.startsWith('Bearer ')
    ) {
      throw new UnauthorizedException(
        'Unauthorized, Please make sure you are logged in correctly',
      );
    }

    const accessToken = authHeader.slice(7);

    try {
      // Verify JWT token - if valid, user is authenticated
      // No need to check with Malambi API every time
      const decoded = this.jwtService.verify(accessToken, {
        secret: this.configService.getOrThrow<string>('jwt.accessToken.secret'),
      }) as { token: string; accid: number; subid: number };

      // Token is valid, user is authenticated
      return { success: true };
    } catch (err) {
      throw new UnauthorizedException(
        'Unauthorized, Please make sure you are logged in correctly',
      );
    }
  }
}
