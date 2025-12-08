import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@modules/schemas';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';

type User = typeof schema.users.$inferSelect;

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  async findByUsername(username: string): Promise<User> {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.username, username),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findById(accid: number): Promise<User> {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.accid, accid.toString()),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    // TODO: Implement actual password validation
    // For now, this is a placeholder
    // In production, compare with hashed password from database
    // Example: return await bcrypt.compare(password, user.hashedPassword);
    return true;
  }
}
