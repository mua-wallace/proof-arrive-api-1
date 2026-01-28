import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@modules/schemas';
import { eq, sql, and } from 'drizzle-orm';
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
    email?: string; // Optional email field
  }): Promise<void> {
    try {
      const accidStr = String(userData.accid);
      const subidStr = String(userData.subid);
      
      // Convert accid (string) to accountId (number) for multi-tenancy
      const accountIdNum = Number(accidStr);
      
      // Check if user already exists for this accountId
      // Use sql template to explicitly cast the parameter as text for accid
      const existingUser = await this.dbConnection
        .select()
        .from(schema.users)
        .where(
          and(
            sql`${schema.users.accid} = ${accidStr}::text`,
            eq(schema.users.accountId, accountIdNum),
          ),
        )
        .limit(1);

      if (existingUser.length > 0) {
        return;
      }

      // Insert user with data from Malambi API login response
      // accountId is mandatory - derived from accid for multi-tenancy
      const userRecord = {
        accountId: accountIdNum, // Multi-tenant: account ID (derived from accid)
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
        fullname: userData.username || null, // Set fullname from username
        role: 'agent' as const, // Default role is 'agent'
        email: userData.email || null, // Email is optional
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
   * accountId is mandatory for multi-tenant isolation
   */
  async updateLastLogin(accid: string | number): Promise<void> {
    const accidStr = String(accid);
    const accountIdNum = Number(accidStr);
    
    await this.dbConnection
      .update(schema.users)
      .set({ 
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          sql`${schema.users.accid} = ${accidStr}::text`,
          eq(schema.users.accountId, accountIdNum),
        ),
      )
      .execute();
  }

  /**
   * Check if user exists in database for the given accountId
   * accountId is mandatory for multi-tenant isolation
   */
  async userExists(accid: number | string): Promise<boolean> {
    // Explicitly convert to string and ensure it's treated as a string type
    // This is critical because accid is a text column in the database
    const accidStr: string = typeof accid === 'number' ? accid.toString() : String(accid);
    const accountIdNum = Number(accidStr);
    
    // Query with account_id for multi-tenant isolation
    const user = await this.dbConnection
      .select()
      .from(schema.users)
      .where(
        and(
          sql`${schema.users.accid} = ${accidStr}::text`,
          eq(schema.users.accountId, accountIdNum),
        ),
      )
      .limit(1);

    return user.length > 0;
  }
}

