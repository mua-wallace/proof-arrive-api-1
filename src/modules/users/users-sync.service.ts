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
      // Handle missing email/role columns gracefully by using Drizzle ORM with explicit columns
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

      // Check if email/role/fullname columns exist by attempting a select first
      // If they don't exist, use Drizzle insert without these fields
      let hasEmailRoleColumns = false;
      try {
        // Try to select email column to check if it exists
        await this.dbConnection
          .select({ email: schema.users.email })
          .from(schema.users)
          .limit(0);
        hasEmailRoleColumns = true;
      } catch (checkError: any) {
        const errorMessage = checkError instanceof Error ? checkError.message : String(checkError);
        if (errorMessage?.toLowerCase().includes('email') || errorMessage?.toLowerCase().includes('role')) {
          hasEmailRoleColumns = false;
        } else {
          // Some other error, assume columns exist and let insert fail if needed
          hasEmailRoleColumns = true;
        }
      }

      if (hasEmailRoleColumns) {
        // Columns exist, use normal Drizzle insert with all fields
        try {
          userRecord.fullname = userData.username || null;
          userRecord.role = 'agent';
          userRecord.email = userData.email || null;
          await this.dbConnection.insert(schema.users).values(userRecord).execute();
        } catch (insertError: any) {
          // If insert still fails, fall back to raw SQL
          const errorMessage = insertError instanceof Error ? insertError.message : String(insertError);
          if (errorMessage?.toLowerCase().includes('email') || errorMessage?.toLowerCase().includes('role') || errorMessage?.toLowerCase().includes('fullname')) {
            this.logger.warn('email/role/fullname columns missing, using raw SQL insert. Run migration 0005_add_user_fields.sql');
            await this.insertUserWithRawSql(userRecord, accountIdNum);
          } else {
            throw insertError;
          }
        }
      } else {
        // Columns don't exist, use Drizzle insert without email/role/fullname
        this.logger.warn('email/role/fullname columns missing, inserting user without these fields using Drizzle. Run migration 0005_add_user_fields.sql');
        await this.insertUserWithRawSql(userRecord, accountIdNum);
      }
    } catch (error) {
      this.logger.error(`Error syncing user:`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Insert user using Drizzle ORM (when email/role/fullname columns don't exist)
   */
  private async insertUserWithRawSql(userRecord: any, accountId: number): Promise<void> {
    // Build insert object with only columns that exist (excluding email, role, fullname)
    const insertData: any = {};
    
    // Map userRecord fields to schema columns, excluding email/role/fullname
    if (userRecord.accountId !== undefined) insertData.accountId = userRecord.accountId;
    if (userRecord.accid !== undefined) insertData.accid = userRecord.accid;
    if (userRecord.subid !== undefined) insertData.subid = userRecord.subid;
    if (userRecord.token !== undefined) insertData.token = userRecord.token;
    if (userRecord.session !== undefined) insertData.session = userRecord.session;
    if (userRecord.username !== undefined) insertData.username = userRecord.username;
    if (userRecord.company !== undefined) insertData.company = userRecord.company;
    if (userRecord.k_u !== undefined) insertData.k_u = userRecord.k_u;
    if (userRecord.pid !== undefined) insertData.pid = userRecord.pid;
    if (userRecord.partner !== undefined) insertData.partner = userRecord.partner;
    if (userRecord.k_k !== undefined) insertData.k_k = userRecord.k_k;
    if (userRecord.expire !== undefined) insertData.expire = userRecord.expire;
    if (userRecord.k_p !== undefined) insertData.k_p = userRecord.k_p;
    if (userRecord.lastLoginAt !== undefined) insertData.lastLoginAt = userRecord.lastLoginAt;
    
    // Use Drizzle's insert with explicit column selection
    // Build select object to only include columns that exist
    const insertValues: any = {};
    
    // Add columns that definitely exist (base columns)
    if (schema.users.accountId && insertData.accountId !== undefined) {
      insertValues.accountId = insertData.accountId;
    }
    if (schema.users.accid && insertData.accid !== undefined) {
      insertValues.accid = insertData.accid;
    }
    if (schema.users.subid && insertData.subid !== undefined) {
      insertValues.subid = insertData.subid;
    }
    if (schema.users.token && insertData.token !== undefined) {
      insertValues.token = insertData.token;
    }
    if (schema.users.session && insertData.session !== undefined) {
      insertValues.session = insertData.session;
    }
    if (schema.users.username && insertData.username !== undefined) {
      insertValues.username = insertData.username;
    }
    if (schema.users.company && insertData.company !== undefined) {
      insertValues.company = insertData.company;
    }
    if (schema.users.k_u && insertData.k_u !== undefined) {
      insertValues.k_u = insertData.k_u;
    }
    if (schema.users.pid && insertData.pid !== undefined) {
      insertValues.pid = insertData.pid;
    }
    if (schema.users.partner && insertData.partner !== undefined) {
      insertValues.partner = insertData.partner;
    }
    if (schema.users.k_k && insertData.k_k !== undefined) {
      insertValues.k_k = insertData.k_k;
    }
    if (schema.users.expire && insertData.expire !== undefined) {
      insertValues.expire = insertData.expire;
    }
    if (schema.users.k_p && insertData.k_p !== undefined) {
      insertValues.k_p = insertData.k_p;
    }
    if (schema.users.lastLoginAt && insertData.lastLoginAt !== undefined) {
      insertValues.lastLoginAt = insertData.lastLoginAt;
    }
    
    // Use Drizzle insert - it will handle missing columns gracefully
    await this.dbConnection.insert(schema.users).values(insertValues).execute();
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

