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
      let existingUser;
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
        // Fallback if account_id column doesn't exist
        if (error?.code === '42703' && error?.message?.includes('account_id')) {
          this.logger.warn(
            `account_id column not found, falling back to accid-only check (accid=${accidStr}). ` +
            `Run migrations to add account_id column for multi-tenant support.`
          );
          existingUser = await this.dbConnection
            .select()
            .from(schema.users)
            .where(sql`${schema.users.accid} = ${accidStr}::text`)
            .limit(1);
        } else {
          throw error;
        }
      }

      if (existingUser.length > 0) {
        return;
      }

      // Insert user with data from Malambi API login response
      // Try with accountId first, fallback without it if column doesn't exist
      const userRecord: any = {
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

      // Try inserting with accountId first
      try {
        userRecord.accountId = accountIdNum; // Multi-tenant: account ID (derived from accid)
        await this.dbConnection.insert(schema.users).values(userRecord).execute();
      } catch (insertError: any) {
        // If account_id column doesn't exist, try without it
        const insertErrorCode = insertError?.code;
        const insertErrorMessage = insertError instanceof Error ? insertError.message : String(insertError);
        const insertErrorString = String(insertError).toLowerCase();
        
        const isAccountIdInsertError = 
          (insertErrorCode === '42703') ||
          insertErrorMessage?.toLowerCase().includes('account_id') ||
          insertErrorString.includes('account_id') ||
          (insertErrorMessage?.includes('column') && insertErrorMessage?.includes('account_id'));
        
        if (isAccountIdInsertError) {
          this.logger.warn(
            `account_id column not found, inserting user without accountId (accid=${accidStr}). ` +
            `Run migrations to add account_id column for multi-tenant support.`
          );
          delete userRecord.accountId;
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
   * Falls back to accid-only query if account_id column doesn't exist
   */
  async updateLastLogin(accid: string | number): Promise<void> {
    const accidStr = String(accid);
    const accountIdNum = Number(accidStr);
    
    try {
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
    } catch (error: any) {
      // Check if error is due to missing account_id column
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
          `account_id column not found, falling back to accid-only update (accid=${accidStr}). ` +
          `Run migrations to add account_id column for multi-tenant support.`
        );
        
        // Fallback: update by accid only (backward compatibility)
        await this.dbConnection
          .update(schema.users)
          .set({ 
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          })
          .where(sql`${schema.users.accid} = ${accidStr}::text`)
          .execute();
        
        return;
      }
      
      // For other errors, log and rethrow
      this.logger.error(`Error updating lastLoginAt for user ${accid}:`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Check if user exists in database for the given accountId
   * Falls back to accid-only query if account_id column doesn't exist (for backward compatibility)
   */
  async userExists(accid: number | string): Promise<boolean> {
    // Explicitly convert to string and ensure it's treated as a string type
    // This is critical because accid is a text column in the database
    const accidStr: string = typeof accid === 'number' ? accid.toString() : String(accid);
    const accountIdNum = Number(accidStr);
    
    try {
      // Try query with account_id first (for multi-tenant isolation)
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
      // Check if error is due to missing account_id column
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
          `account_id column not found, falling back to accid-only query (accid=${accidStr}). ` +
          `Run migrations to add account_id column for multi-tenant support.`
        );
        
        // Fallback: query by accid only (backward compatibility)
        try {
          const user = await this.dbConnection
            .select()
            .from(schema.users)
            .where(sql`${schema.users.accid} = ${accidStr}::text`)
            .limit(1);
          
          return user.length > 0;
        } catch (fallbackError: any) {
          this.logger.error(`Fallback query also failed (accid=${accidStr}):`, fallbackError?.message);
          throw fallbackError;
        }
      }
      
      // For other errors, log details and rethrow
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorDetail = error?.detail;
      
      this.logger.error(`Error checking if user exists (accid=${accidStr}):`);
      this.logger.error(`  Message: ${errorMessage}`);
      if (errorCode) this.logger.error(`  Code: ${errorCode}`);
      if (errorDetail) this.logger.error(`  Detail: ${errorDetail}`);
      if (errorStack) this.logger.error(`  Stack: ${errorStack}`);
      
      throw error;
    }
  }
}

