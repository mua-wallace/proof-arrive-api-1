import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { PaginateQuery, PaginateResult } from '@common/interfaces';
import * as schema from '@modules/schemas';

type User = typeof schema.users.$inferSelect;

@Controller('users')
@ApiTags('Users')
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('create')
  @ApiBody({
    type: CreateUserDto,
  })
  @ApiOperation({
    summary: 'Allows addition of a new user with specified details',
  })
  async create(
    @Body() userDto: CreateUserDto,
    @CurrentUser() currentUser: any,
  ): Promise<User> {
    return this.usersService.create({
      userDto,
      userId: currentUser?.accid || currentUser?.id,
    });
  }

  @Post('filter')
  @ApiOperation({
    summary: 'List all users in the system with filtering and pagination',
  })
  @ApiBody({
    type: Object,
    required: false,
    description: 'Filter conditions (optional)',
  })
  async findAllWithFilter(
    @Body() filter: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('searchBy') searchBy?: string,
    @Query('sortBy') sortBy?: string,
  ): Promise<PaginateResult<User>> {
    const query: PaginateQuery = {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      searchBy: searchBy ? searchBy.split(',') : undefined,
      sortBy: sortBy
        ? (sortBy.split(',').map((s) => {
            const [field, direction] = s.split(':');
            return [field, (direction || 'ASC').toUpperCase()] as [string, 'ASC' | 'DESC'];
          }) as [string, 'ASC' | 'DESC'][])
        : undefined,
    };

    // If filter is provided, we can add it to options
    const options = filter && Object.keys(filter).length > 0 ? { where: filter } : undefined;

    return this.usersService.findAll(query, options);
  }

  @Get('details/:userId')
  @ApiOperation({
    summary: 'Provides access to view the details of a specific user',
  })
  async findOneById(@Param('userId') userId: string): Promise<User> {
    return this.usersService.findOneById(userId);
  }

  @Put(':userId')
  @ApiBody({
    type: UpdateUserDto,
  })
  @ApiOperation({
    summary: 'Enables updating details of an existing user',
  })
  async update(
    @Param('userId') userId: string,
    @Body() updateData: UpdateUserDto,
    @CurrentUser() currentUser: any,
  ): Promise<User> {
    return this.usersService.update(userId, {
      updateData,
      userId: currentUser?.accid || currentUser?.id,
    });
  }

  @Delete(':userId')
  @ApiOperation({
    summary: 'Removes a user from the system',
  })
  async remove(@Param('userId') userId: string): Promise<User> {
    return this.usersService.remove(userId);
  }
}

