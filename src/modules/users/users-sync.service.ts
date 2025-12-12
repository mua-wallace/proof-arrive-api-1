import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@modules/schemas';
import { eq, sql } from 'drizzle-orm';
import { MalambiApiService } from '@integrations/malambi-api/malambi-api.service';

@Injectable()
export class UsersSyncService {
  private readonly logger = new Logger(UsersSyncService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly dbConnection: PostgresJsDatabase<typeof schema>,
    private readonly malambiApi: MalambiApiService,
  ) {}

  /**
   * Sync user from Malambi API to database
   * @param userData - Full user data from Malambi API login response
   */
  async syncUser(userData: {
    accid: string;
    subid: string;
    token: string;
    session: string;
    username: string;
    company: string;
    k_u: string;
    pid: string;
    partner: string;
    k_k: string;
    expire: string;
    k_p: string;
  }): Promise<void> {
    try {
      const accidStr = String(userData.accid);
      const subidStr = String(userData.subid);
      
      // Check if user already exists
      // Use sql template to explicitly cast the parameter as text
      const existingUser = await this.dbConnection
        .select()
        .from(schema.users)
        .where(sql`${schema.users.accid} = ${accidStr}::text`)
        .limit(1);

      if (existingUser.length > 0) {
        return;
      }

      // Insert user with data from Malambi API login response
      const userRecord = {
        accid: accidStr,
        subid: subidStr,
        token: userData.token || '',
        session: userData.session || '',
        username: userData.username || `user_${accidStr}`,
        company: userData.company || '',
        k_u: userData.k_u || '',
        pid: userData.pid || '',
        partner: userData.partner || '0',
        k_k: userData.k_k || '',
        expire: userData.expire || '0',
        k_p: userData.k_p || '',
        lastLoginAt: new Date(),
      };

      await this.dbConnection.insert(schema.users).values(userRecord).execute();
    } catch (error) {
      this.logger.error(`Error syncing user:`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Update lastLoginAt timestamp for existing user
   */
  async updateLastLogin(accid: string | number): Promise<void> {
    try {
      const accidStr = String(accid);
      
      await this.dbConnection
        .update(schema.users)
        .set({ 
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(sql`${schema.users.accid} = ${accidStr}::text`)
        .execute();
    } catch (error) {
      this.logger.error(`Error updating lastLoginAt for user ${accid}:`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Check if user exists in database
   */
  async userExists(accid: number | string): Promise<boolean> {
    // Explicitly convert to string and ensure it's treated as a string type
    // This is critical because accid is a text column in the database
    const accidStr: string = typeof accid === 'number' ? accid.toString() : String(accid);
    
    try {
      // Use sql template to explicitly cast the parameter as text
      // This ensures PostgreSQL receives it as a string, not a number
      const user = await this.dbConnection
        .select()
        .from(schema.users)
        .where(sql`${schema.users.accid} = ${accidStr}::text`)
        .limit(1);

      return user.length > 0;
    } catch (error) {
      this.logger.error(`Error checking if user exists (accid=${accidStr}):`, error instanceof Error ? error.message : error);
      throw error;
    }
  }
}

