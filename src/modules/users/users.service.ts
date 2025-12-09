import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import * as schema from '@modules/schemas';
import { BaseService } from '@common/services/base.service';
import { PaginateQuery, PaginateResult, BaseEntity } from '@common/interfaces';

type User = typeof schema.users.$inferSelect & BaseEntity;

@Injectable()
export class UsersService extends BaseService<User> {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    db: any, // BaseService expects DrizzleDatabase type
  ) {
    super(db, schema.users);
  }

  async findAll(
    query: PaginateQuery = {},
    options?: any,
  ): Promise<PaginateResult<User>> {
    return super.findAll(query, options);
  }

  async findOneById(id: string): Promise<User> {
    const user = await super.findOneById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findOneBy(requestData: any): Promise<User> {
    const user = await super.findOneBy(requestData);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByUsername(username: string): Promise<User> {
    const user = await this.findOneBy({ username } as any);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByAccid(accid: string): Promise<User> {
    const user = await this.findOneBy({ accid } as any);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async remove(id: string): Promise<User> {
    return super.remove(id);
  }
}
