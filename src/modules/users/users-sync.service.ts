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
      // Note: accountId can be the same for multiple users (multi-tenant)
      // Multiple users/agents can belong to the same account
      const accountIdNum = Number(accidStr);
      
      // Check if user already exists by accid AND subid (not accountId)
      // Multiple users can have the same accountId, but accid+subid combination should be unique per user
      // Use sql template to explicitly cast the parameters as text for accid and subid
      let existingUser: any[] = [];
      try {
        existingUser = await this.dbConnection
          .select()
          .from(schema.users)
          .where(
            and(
              sql`${schema.users.accid} = ${accidStr}::text`,
              sql`${schema.users.subid} = ${subidStr}::text`,
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
                sql`${schema.users.subid} = ${subidStr}::text`,
              ),
            )
            .limit(1);
        } else {
          throw error;
        }
      }

      if (existingUser.length > 0) {
        this.logger.debug(`User with accid=${accidStr} and subid=${subidStr} already exists, skipping creation`);
        return;
      }

      // Insert user with data from Malambi API login response
      // accountId is mandatory - derived from accid for multi-tenancy
      // Note: id uses subid value (not auto-generated)
      // Handle missing email/role columns gracefully by using Drizzle ORM with explicit columns
      
      // Validate and convert subid to integer for id field
      // subid from Malambi API must be a valid integer string
      const subidNum = parseInt(subidStr, 10);
      if (isNaN(subidNum) || subidNum <= 0) {
        throw new Error(`Invalid subid from Malambi API: "${subidStr}" cannot be converted to a positive integer for user id`);
      }
      
      const userRecord: any = {
        id: subidNum, // Use subid as id value (converted to integer from Malambi API)
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
          // Handle unique constraint violation (duplicate accid+subid)
          const errorCode = insertError?.code;
          const errorMessage = insertError?.message || '';
          
          // PostgreSQL unique constraint violation code
          if (errorCode === '23505' || errorMessage.includes('unique constraint') || errorMessage.includes('duplicate key') || errorMessage.includes('uq_users_accid_subid')) {
            // User already exists (accid+subid combination), skip silently (idempotent operation)
            this.logger.debug(`User with accid=${accidStr} and subid=${subidStr} already exists, skipping`);
            return;
          }
          
          // If insert still fails due to missing columns, fall back to raw SQL
          const errorMessageLower = errorMessage.toLowerCase();
          if (errorMessageLower.includes('email') || errorMessageLower.includes('role') || errorMessageLower.includes('fullname')) {
            this.logger.warn('email/role/fullname columns missing, using raw SQL insert. Run migration 0005_add_user_fields.sql');
            await this.insertUserWithRawSql(userRecord, accountIdNum);
          } else {
            throw insertError;
          }
        }
      } else {
        // Columns don't exist, use Drizzle insert without email/role/fullname
        this.logger.warn('email/role/fullname columns missing, inserting user without these fields using Drizzle. Run migration 0005_add_user_fields.sql');
        try {
          await this.insertUserWithRawSql(userRecord, accountIdNum);
        } catch (insertError: any) {
          // Handle unique constraint violation (duplicate accid+subid)
          const errorCode = insertError?.code;
          const errorMessage = insertError?.message || '';
          
          // PostgreSQL unique constraint violation code
          if (errorCode === '23505' || errorMessage.includes('unique constraint') || errorMessage.includes('duplicate key') || errorMessage.includes('uq_users_accid_subid')) {
            // User already exists (accid+subid combination), skip silently (idempotent operation)
            this.logger.debug(`User with accid=${accidStr} and subid=${subidStr} already exists, skipping`);
            return;
          }
          
          throw insertError;
        }
      }
    } catch (error) {
      this.logger.error(`Error syncing user:`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Insert user using Drizzle API (when email/role/fullname columns don't exist)
   * Checks if user exists first to avoid duplicates and errors
   */
  private async insertUserWithRawSql(userRecord: any, accountId: number): Promise<void> {
    // Note: id uses subid value (converted to integer from Malambi API)
    // Validate and convert subid to integer for id field
    const subidStr = String(userRecord.subid);
    const subidNum = parseInt(subidStr, 10);
    if (isNaN(subidNum) || subidNum <= 0) {
      throw new Error(`Invalid subid from Malambi API: "${subidStr}" cannot be converted to a positive integer for user id`);
    }
    
    // First, check if user already exists by id (which equals subid after migration 0015)
    // Or by (accid, subid) if migration 0015 hasn't run yet
    try {
      // Try checking by id first using Drizzle select API (more reliable)
      const existingById = await this.dbConnection
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, subidNum))
        .limit(1);
      
      if (existingById && existingById.length > 0) {
        this.logger.debug(`User with id=${subidNum} (subid=${userRecord.subid}) already exists, skipping`);
        return;
      }
    } catch (checkError: any) {
      // If id column doesn't exist or is wrong type, try checking by (accid, subid)
      const checkErrorMessage = checkError instanceof Error ? checkError.message : String(checkError);
      if (checkErrorMessage.includes('column') || checkErrorMessage.includes('does not exist') || checkErrorMessage.includes('data type')) {
        // Try checking by accid and subid instead using Drizzle select API
        try {
          const existingByAccidSubid = await this.dbConnection
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(
              and(
                eq(schema.users.accid, String(userRecord.accid)),
                eq(schema.users.subid, String(userRecord.subid))
              )
            )
            .limit(1);
          
          if (existingByAccidSubid && existingByAccidSubid.length > 0) {
            this.logger.debug(`User with accid=${userRecord.accid}, subid=${userRecord.subid} already exists, skipping`);
            return;
          }
        } catch (checkError2: any) {
          // If check fails, log warning but continue with insert attempt
          this.logger.warn(`Could not check for existing user: ${checkError2.message}`);
        }
      } else {
        // Some other error checking by id, log and continue
        this.logger.warn(`Error checking user existence by id: ${checkErrorMessage}`);
      }
    }
    
    // User doesn't exist, proceed with insert using Drizzle API
    // Build insert object excluding email/role/fullname columns
    const insertData: any = {
      id: subidNum,
      accountId: userRecord.accountId,
      accid: userRecord.accid,
      subid: userRecord.subid,
      token: userRecord.token || '',
      session: userRecord.session || '',
      username: userRecord.username || `user_${userRecord.accid}`,
      company: userRecord.company || '',
      k_u: userRecord.k_u || '',
      pid: userRecord.pid || '',
      partner: userRecord.partner || '0',
      k_k: userRecord.k_k || '',
      expire: userRecord.expire || '0',
      k_p: userRecord.k_p || '',
      lastLoginAt: userRecord.lastLoginAt || new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // Explicitly exclude email/role/fullname to avoid errors if columns don't exist
    // These fields are not included in insertData
    
    try {
      await this.dbConnection
        .insert(schema.users)
        .values(insertData)
        .execute();
      
      this.logger.debug(`User with id=${subidNum} (accid=${userRecord.accid}, subid=${userRecord.subid}) inserted successfully`);
    } catch (insertError: any) {
      // Extract error information - Drizzle wraps PostgreSQL errors
      const errorMessage = insertError instanceof Error ? insertError.message : String(insertError);
      const errorCode = insertError?.code || (insertError as any)?.cause?.code || (insertError as any)?.originalError?.code;
      
      // Check error message for PostgreSQL error patterns
      const errorMessageLower = errorMessage.toLowerCase();
      const isUniqueViolation = 
        errorCode === '23505' || 
        errorMessageLower.includes('unique constraint') || 
        errorMessageLower.includes('duplicate key') ||
        errorMessageLower.includes('duplicate key value') ||
        errorMessageLower.includes('violates unique constraint') ||
        errorMessageLower.includes('already exists');
      
      // If it's a unique violation, user was inserted between check and insert (race condition)
      // Or user already exists - this is fine
      if (isUniqueViolation) {
        this.logger.debug(`User with id=${subidNum} already exists (detected via error: ${errorCode || 'unknown'}), skipping`);
        return;
      }
      
      // If error is about missing columns (email/role/fullname), Drizzle tried to include them
      // This happens because Drizzle includes all schema columns even if we don't specify them
      // The migration should have run at startup, but if it hasn't, we need to wait for it or skip
      if (errorMessageLower.includes('email') || errorMessageLower.includes('role') || errorMessageLower.includes('fullname') || (errorMessageLower.includes('column') && errorMessageLower.includes('does not exist'))) {
        // Check if this is actually a unique violation wrapped in a column error
        if (isUniqueViolation) {
          this.logger.debug(`User with id=${subidNum} already exists (detected via unique violation with column error), skipping`);
          return;
        }
        
        // Missing columns detected - migration 0005 hasn't run yet
        // Since MigrationService runs migrations on startup, this shouldn't happen
        // But if it does, we'll skip the insert and log a warning
        this.logger.warn(`Insert failed due to missing columns (email/role/fullname). Migration 0005 needs to run first.`);
        this.logger.warn(`Migration 0005 should run automatically on startup via MigrationService.`);
        this.logger.warn(`If this persists, please restart the container or run: node scripts/run-migrations.js`);
        
        // Double-check if user exists (might have been inserted by another process)
        try {
          const doubleCheck = await this.dbConnection
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(eq(schema.users.id, subidNum))
            .limit(1);
          
          if (doubleCheck && doubleCheck.length > 0) {
            this.logger.debug(`User with id=${subidNum} exists (verified after column error), skipping`);
            return;
          }
        } catch (checkErr: any) {
          // Check failed - columns might not exist, so we can't query
          this.logger.debug(`Could not verify user existence: ${checkErr.message}`);
        }
        
        // Skip insert - wait for migration to complete
        // The user sync will retry on next queue processing cycle after migration runs
        this.logger.warn(`Skipping user insert. Will retry after migration 0005 completes.`);
        return;
      }
      
      // Real error - log full details and throw
      this.logger.error(`Failed to insert user. Error code: ${errorCode || 'unknown'}, Message: ${errorMessage}`, insertError instanceof Error ? insertError.stack : undefined);
      
      // Try to extract more details from nested error objects
      if ((insertError as any)?.cause) {
        this.logger.error(`Nested error cause:`, (insertError as any).cause);
      }
      if ((insertError as any)?.originalError) {
        this.logger.error(`Original error:`, (insertError as any).originalError);
      }
      
      throw insertError;
    }
  }

  /**
   * Update lastLoginAt timestamp for existing user
   * Updates by accid AND subid so we update the correct user (one user per accid+subid)
   */
  async updateLastLogin(accid: string | number, subid: string | number): Promise<void> {
    const accidStr = String(accid);
    const subidStr = String(subid);

    await this.dbConnection
      .update(schema.users)
      .set({
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          sql`${schema.users.accid} = ${accidStr}::text`,
          sql`${schema.users.subid} = ${subidStr}::text`,
        ),
      )
      .execute();
  }

  /**
   * Check if user exists in database by accid AND subid
   * Use this to decide whether to sync on login (each accid+subid is one user)
   */
  async userExistsByAccidAndSubid(accid: string | number, subid: string | number): Promise<boolean> {
    const accidStr = String(accid);
    const subidStr = String(subid);
    try {
      const user = await this.dbConnection
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          and(
            sql`${schema.users.accid} = ${accidStr}::text`,
            sql`${schema.users.subid} = ${subidStr}::text`,
          ),
        )
        .limit(1);
      return user.length > 0;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage?.toLowerCase().includes('email') || errorMessage?.toLowerCase().includes('role')) {
        const user = await this.dbConnection
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(
            and(
              sql`${schema.users.accid} = ${accidStr}::text`,
              sql`${schema.users.subid} = ${subidStr}::text`,
            ),
          )
          .limit(1);
        return user.length > 0;
      }
      throw error;
    }
  }

  /**
   * Check if user exists in database by accid
   * Note: Multiple users can have the same accountId (multi-tenant)
   * This method checks by accid only, not accountId
   */
  async userExists(accid: number | string): Promise<boolean> {
    // Explicitly convert to string and ensure it's treated as a string type
    // This is critical because accid is a text column in the database
    const accidStr: string = typeof accid === 'number' ? accid.toString() : String(accid);
    
    // Query by accid only (not accountId) - multiple users can have same accountId
    // Handle missing email/role columns gracefully
    try {
      const user = await this.dbConnection
        .select()
        .from(schema.users)
        .where(
          sql`${schema.users.accid} = ${accidStr}::text`,
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
            sql`${schema.users.accid} = ${accidStr}::text`,
          )
          .limit(1);

        return user.length > 0;
      } else {
        throw error;
      }
    }
  }
}

