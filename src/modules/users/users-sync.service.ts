import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@modules/schemas';
import { eq } from 'drizzle-orm';
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
   */
  async syncUser(accid: number | string, subid: number | string): Promise<void> {
    try {
      const accidStr = String(accid);
      const subidStr = String(subid);
      
      this.logger.debug(`Syncing user: accid=${accidStr}, subid=${subidStr}`);

      // Check if user already exists
      const existingUser = await this.dbConnection
        .select()
        .from(schema.users)
        .where(eq(schema.users.accid, accidStr))
        .limit(1);

      if (existingUser.length > 0) {
        this.logger.debug(`User ${accidStr} already exists, skipping sync`);
        return;
      }

      // Fetch user data from Malambi API
      // Note: You'll need to implement getUserInfo in MalambiApiService
      // For now, we'll create a basic user record
      const userData = {
        k_u: '',
        pid: '',
        subid: subidStr,
        partner: '0',
        k_k: '',
        expire: '-1',
        token: '',
        session: '',
        accid: accidStr,
        company: '',
        username: `user_${accidStr}`,
        loginusername: `user_${accidStr}`,
        k_p: '',
        refresh_token: null,
      };

      await this.dbConnection.insert(schema.users).values(userData).execute();

      this.logger.log(`User ${accidStr} synced successfully`);
    } catch (error) {
      this.logger.error(`Error syncing user ${accid}:`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Check if user exists in database
   */
  async userExists(accid: number | string): Promise<boolean> {
    const accidStr = String(accid);
    const user = await this.dbConnection
      .select()
      .from(schema.users)
      .where(eq(schema.users.accid, accidStr))
      .limit(1);

    return user.length > 0;
  }
}

