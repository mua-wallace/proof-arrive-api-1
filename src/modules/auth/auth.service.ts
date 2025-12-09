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
    @Inject(DATABASE_CONNECTION)
    private readonly dbConnection: PostgresJsDatabase<typeof schema>,
  ) {}

  async login(user: MalambiUser): Promise<any> {
    this.logger.debug(`Login attempt for user: accid=${user.accid}, subid=${user.subid}, type: accid=${typeof user.accid}, subid=${typeof user.subid}`);
    
    // Convert accid and subid to numbers, handling empty strings and invalid values
    const accidStr = String(user.accid || '').trim();
    const subidStr = String(user.subid || '').trim();
    
    if (!accidStr || !subidStr) {
      this.logger.error(`Missing accid or subid: accid="${accidStr}", subid="${subidStr}"`);
      throw new UnauthorizedException('Invalid user credentials: missing account information');
    }
    
    const accid = Number(accidStr);
    const subid = Number(subidStr);
    
    if (isNaN(accid) || isNaN(subid) || accid <= 0 || subid <= 0) {
      this.logger.error(`Invalid user credentials: accid="${accidStr}" (${accid}), subid="${subidStr}" (${subid})`);
      throw new UnauthorizedException('Invalid user credentials: invalid account IDs');
    }
    
    this.logger.debug(`Valid credentials: accid=${accid}, subid=${subid}`);
    
    // Check if user exists in database
    const userExists = await this.usersSyncService.userExists(accidStr);
    
    if (!userExists) {
      // User doesn't exist, trigger background sync job with full user data
      this.logger.debug(`User ${accidStr} not found in database, triggering sync job with full user data`);
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
        }
      });
    } else {
      // User exists, update lastLoginAt
      this.logger.debug(`User ${accidStr} exists, updating lastLoginAt`);
      await this.usersSyncService.updateLastLogin(accidStr);
    }
    
    const { accessToken, refreshToken } = await this.generateUserTokens(
      user.token,
      accid,
      subid,
    );

    return {
      accid: user.accid,
      subid: user.subid,
      username: user.username,
      fullName: user.username,
      company: user.company,
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

    this.logger.debug(`Generating tokens for user: accid=${accid}, subid=${subid}`);

    // ✅ Persist refresh token record
    await this.storeRefreshToken(refreshtoken, accid, subid);

    return { accessToken, refreshToken };
  }

  async storeRefreshToken(token: string, accid: number, subid: number) {
    this.logger.debug(`Storing refresh token for user: accid=${accid}, subid=${subid}`);
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

  // Verify the refresh token locally
  async refreshToken(
    credentials: Credentials,
    refreshToken: string,
  ) {
    try {
      if (!refreshToken) {
        throw new UnauthorizedException('Missing refresh token');
      }

      // Decode the refresh token to get accid, subid, refreshtoken, and token
      const decoded = this.jwtService.verify(refreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.refreshToken.secret'),
      }) as { refreshtoken: string; accid: number; subid: number; token?: string };

      // Use accid and subid from the decoded token, not from credentials
      const accid = decoded.accid;
      const subid = decoded.subid;
      const refreshtoken = decoded.refreshtoken;
      // Get Malambi token from decoded token (preferred) or from credentials
      const token = decoded.token || credentials.token || '';

      if (!accid || !subid || isNaN(accid) || isNaN(subid)) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // 2️⃣ Clean up expired refresh tokens for this user
      await this.dbConnection.delete(schema.refreshTokens).where(
        and(
          eq(schema.refreshTokens.accid, accid),
          eq(schema.refreshTokens.subid, subid),
          lt(schema.refreshTokens.expiryDate, new Date()), // only expired
        ),
      );

      // Optional: log remaining valid tokens
      const remainingTokens = await this.dbConnection
        .select()
        .from(schema.refreshTokens)
        .where(
          and(
            eq(schema.refreshTokens.accid, accid),
            eq(schema.refreshTokens.subid, subid),
          ),
        );

      this.logger.debug(`Remaining refresh tokens for accid=${accid}, subid=${subid}: ${remainingTokens.length}`);

      // 3️⃣ Find a valid refresh token
      const validTokenRecord = await this.dbConnection
        .select()
        .from(schema.refreshTokens)
        .where(
          and(
            eq(schema.refreshTokens.token, refreshtoken),
            eq(schema.refreshTokens.accid, accid),
            eq(schema.refreshTokens.subid, subid),
            gt(schema.refreshTokens.expiryDate, new Date()), // must not be expired
          ),
        )
        .limit(1);

      this.logger.debug(`Valid token record found: ${validTokenRecord.length > 0}`);

      if (!validTokenRecord || validTokenRecord.length === 0) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // 4️⃣ Generate new access/refresh tokens
      // Use the Malambi token from the decoded refresh token
      const { accessToken, refreshToken: newRefreshToken } = await this.generateUserTokens(token, accid, subid);

      return {
        success: true,
        message: 'Tokens refreshed successfully',
        accessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      this.logger.error('Refresh token error:', error instanceof Error ? error.stack : error);
      throw new UnauthorizedException('Invalid credentials');
    }
  }


  async logout(
    credentials: Credentials,
  ): Promise<{ success: boolean; message: string }> {
    const { token, accid, subid } = credentials;
    this.logger.debug(`Logging out user: accid=${accid}, subid=${subid}`);
    
    // Validate credentials
    if (!token || !accid || !subid || isNaN(accid) || isNaN(subid)) {
      this.logger.warn(`Invalid credentials for logout: token=${token ? 'present' : 'missing'}, accid=${accid}, subid=${subid}`);
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
        this.logger.debug(`Cleared refresh tokens for user: accid=${accid}, subid=${subid}`);
      } catch (dbError) {
        this.logger.error('Error clearing refresh tokens:', dbError instanceof Error ? dbError.stack : dbError);
        // Continue even if clearing tokens fails
      }
      
      if (malambiSuccess) {
        return { success: true, message: 'Logged out successfully from both systems' };
      } else {
        return { success: false, message: 'Logout failed on remote API' };
      }
    } catch (error) {
      this.logger.error('Logout error in service:', error instanceof Error ? error.stack : error);
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
