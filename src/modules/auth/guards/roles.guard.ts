import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@modules/schemas';
import { eq, and, sql } from 'drizzle-orm';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(DATABASE_CONNECTION)
    private readonly dbConnection: PostgresJsDatabase<typeof schema>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No roles required, allow access
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Extract accid and subid from request user (handle both JWT and middleware structures)
    let accid: number;
    let subid: number;

    if (user.accid !== undefined && user.subid !== undefined) {
      // JWT payload structure
      accid = typeof user.accid === 'number' ? user.accid : Number(user.accid);
      subid = typeof user.subid === 'number' ? user.subid : Number(user.subid);
    } else if (user.acc_id !== undefined && user.acc_sid !== undefined) {
      // Middleware structure
      accid = typeof user.acc_id === 'number' ? user.acc_id : Number(user.acc_id);
      subid = typeof user.acc_sid === 'number' ? user.acc_sid : Number(user.acc_sid);
    } else {
      throw new ForbiddenException('Invalid user credentials structure');
    }

    if (isNaN(accid) || isNaN(subid)) {
      throw new ForbiddenException('Invalid account IDs');
    }

    // Get user from database to check role
    try {
      const accidStr = String(accid);
      const subidStr = String(subid);
      const accountIdNum = Number(accidStr);

      const [dbUser] = await this.dbConnection
        .select()
        .from(schema.users)
        .where(
          and(
            sql`${schema.users.accid} = ${accidStr}::text`,
            sql`${schema.users.subid} = ${subidStr}::text`,
            eq(schema.users.accountId, accountIdNum),
            sql`${schema.users.deletedAt} IS NULL`,
          ),
        )
        .limit(1);

      if (!dbUser) {
        throw new ForbiddenException('User not found');
      }

      // Check if user has one of the required roles
      if (!requiredRoles.includes(dbUser.role)) {
        throw new ForbiddenException(
          `Access denied. Required roles: ${requiredRoles.join(', ')}. Your role: ${dbUser.role}`,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException('Failed to verify user role');
    }
  }
}
