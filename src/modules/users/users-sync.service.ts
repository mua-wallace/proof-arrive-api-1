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
      let existingUser: any[] = [];
      try {
        existingUser = await this.dbConnection
          .select()
          .from(schema.users)
          .where(
            and(
              sql`${schema.users.accid} = ${accidStr}::text`,
              eq(schema.users.accountId, accountIdNum),
            ),
          )
          .limit(1);
      } catch (error: any) {
        // If select fails due to missing columns (email/role), try with explicit columns
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage?.toLowerCase().includes('email') || errorMessage?.toLowerCase().includes('role')) {
          this.logger.warn('email/role columns missing, checking user existence with explicit columns');
          existingUser = await this.dbConnection
            .select({
              id: schema.users.id,
              accountId: schema.users.accountId,
              createdAt: schema.users.createdAt,
              updatedAt: schema.users.updatedAt,
              deletedAt: schema.users.deletedAt,
              kU: schema.users.k_u,
              pid: schema.users.pid,
              subid: schema.users.subid,
              partner: schema.users.partner,
              kK: schema.users.k_k,
              expire: schema.users.expire,
              token: schema.users.token,
              session: schema.users.session,
              accid: schema.users.accid,
              company: schema.users.company,
              username: schema.users.username,
              kP: schema.users.k_p,
              lastLoginAt: schema.users.lastLoginAt,
            })
            .from(schema.users)
            .where(
              and(
                sql`${schema.users.accid} = ${accidStr}::text`,
                eq(schema.users.accountId, accountIdNum),
              ),
            )
            .limit(1);
        } else {
          throw error;
        }
      }

      if (existingUser.length > 0) {
        return;
      }

      // Insert user with data from Malambi API login response
      // accountId is mandatory - derived from accid for multi-tenancy
      // Handle missing email/role columns gracefully
      const userRecord: any = {
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
        lastLoginAt: new Date(),
      };

      // Only add email/role/fullname if columns exist (migration 0005 may not have run)
      // Try inserting with all fields first, fallback to basic fields if columns don't exist
      try {
        userRecord.fullname = userData.username || null;
        userRecord.role = 'agent';
        userRecord.email = userData.email || null;
        await this.dbConnection.insert(schema.users).values(userRecord).execute();
      } catch (insertError: any) {
        const errorMessage = insertError instanceof Error ? insertError.message : String(insertError);
        const errorString = String(errorMessage).toLowerCase();
        
        // Check if error is due to missing email/role/fullname columns
        if (errorMessage?.includes('email') || errorMessage?.includes('role') || errorMessage?.includes('fullname') ||
            errorString.includes('email') || errorString.includes('role') || errorString.includes('fullname')) {
          this.logger.warn('email/role/fullname columns missing, inserting user without these fields. Run migration 0005_add_user_fields.sql');
          // Remove email/role/fullname and retry
          delete userRecord.email;
          delete userRecord.role;
          delete userRecord.fullname;
          await this.dbConnection.insert(schema.users).values(userRecord).execute();
        } else {
          throw insertError;
        }
      }
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
    // Handle missing email/role columns gracefully
    try {
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
    } catch (error: any) {
      // If select fails due to missing columns (email/role), try with explicit columns
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage?.toLowerCase().includes('email') || errorMessage?.toLowerCase().includes('role')) {
        this.logger.warn('email/role columns missing, checking user existence with explicit columns');
        const user = await this.dbConnection
          .select({
            id: schema.users.id,
            accountId: schema.users.accountId,
            createdAt: schema.users.createdAt,
            updatedAt: schema.users.updatedAt,
            deletedAt: schema.users.deletedAt,
            kU: schema.users.k_u,
            pid: schema.users.pid,
            subid: schema.users.subid,
            partner: schema.users.partner,
            kK: schema.users.k_k,
            expire: schema.users.expire,
            token: schema.users.token,
            session: schema.users.session,
            accid: schema.users.accid,
            company: schema.users.company,
            username: schema.users.username,
            kP: schema.users.k_p,
            lastLoginAt: schema.users.lastLoginAt,
          })
          .from(schema.users)
          .where(
            and(
              sql`${schema.users.accid} = ${accidStr}::text`,
              eq(schema.users.accountId, accountIdNum),
            ),
          )
          .limit(1);

        return user.length > 0;
      } else {
        throw error;
      }
    }
  }
}

