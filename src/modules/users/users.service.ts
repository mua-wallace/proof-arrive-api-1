import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import * as schema from '@modules/schemas';
import { BaseService } from '@common/services/base.service';
import { PaginateQuery, PaginateResult, BaseEntity } from '@common/interfaces';
import { CreateUserDto, UpdateUserDto } from './dto';

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

  async create(
    data: { userDto: CreateUserDto; userId?: string } | any,
  ): Promise<User> {
    const { userDto, userId } = data;

    // Check if user with accid already exists
    const existingUser = await this.findOneBy({ accid: userDto.accid } as any);
    if (existingUser) {
      throw new NotFoundException(`User with accid ${userDto.accid} already exists`);
    }

    return super.create({
      ...userDto,
      // Set default values for required fields if not provided
      k_u: userDto.k_u || '',
      pid: userDto.pid || '',
      k_k: userDto.k_k || '',
      k_p: userDto.k_p || '',
      token: userDto.token || '',
      session: userDto.session || '',
      expire: userDto.expire || '0',
    } as any);
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

  async update(
    id: string,
    data: { updateData: UpdateUserDto; userId?: string } | any,
  ): Promise<User> {
    // Check if user exists
    await this.findOneById(id);

    const { updateData, userId } = data;
    return super.update(id, updateData as any);
  }

  async remove(id: string): Promise<User> {
    return super.remove(id);
  }
}
