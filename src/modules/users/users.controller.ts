import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Patch,
  Body,
} from '@nestjs/common';
import { ApiQuery, ApiOperation, ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { PaginateQuery, PaginateResult } from '@common/interfaces';
import { FilterUsersDto, UpdateUserDto } from './dto';
import { CurrentUserCredentials } from '@modules/auth/decorators/current-user-credentials.decorator';
import { Credentials } from '@common/interfaces';
import * as schema from '@modules/schemas';

type User = typeof schema.users.$inferSelect;

@Controller('users')
@ApiTags('Users')
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List all users in the system with filtering and pagination',
    description: 'Retrieves a paginated list of users synced from the Malambi API for the logged-in user\'s account. Supports filtering, searching, sorting, and optional relation loading (arrivals, exits).',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term' })
  @ApiQuery({ name: 'searchBy', required: false, type: String, description: 'Comma-separated fields to search in' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Comma-separated sort fields (format: field:direction)' })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (arrivals, exits)' })
  async findAllWithFilter(
    @Query() filterDto: FilterUsersDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<PaginateResult<User>> {
    const query: PaginateQuery = {
      page: filterDto.page ?? 1,
      limit: filterDto.limit ?? 100,
      search: filterDto.search,
      searchBy: filterDto.searchBy ? filterDto.searchBy.split(',') : undefined,
      sortBy: filterDto.sortBy
        ? (filterDto.sortBy.split(',').map((s) => {
            const [field, direction] = s.split(':');
            return [field, (direction || 'ASC').toUpperCase()] as [string, 'ASC' | 'DESC'];
          }) as [string, 'ASC' | 'DESC'][])
        : undefined,
    };

    const options = {
      include: filterDto.include ? filterDto.include.split(',') : undefined,
      accountId: Number(credentials.accid), // Multi-tenant: filter by account ID
    };

    return this.usersService.findAll(query, options);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get current authenticated user details',
    description: 'Retrieves the details of the currently authenticated user based on their JWT token credentials (accid and subid).',
  })
  async getMe(
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<User> {
    return this.usersService.findByAccidAndSubid(
      String(credentials.accid),
      String(credentials.subid),
      Number(credentials.accid), // Multi-tenant: filter by account ID
    );
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update current authenticated user information',
    description: 'Updates the information (email, role, fullname) of the currently authenticated user based on their JWT token credentials.',
  })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async updateMe(
    @Body() updateDto: UpdateUserDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<User> {
    // Get current user to find their ID
    const currentUser = await this.usersService.findByAccidAndSubid(
      String(credentials.accid),
      String(credentials.subid),
      Number(credentials.accid),
    );
    
    return this.usersService.update(
      currentUser.id,
      updateDto,
      Number(credentials.accid),
    );
  }

  @Get('details/:id')
  @ApiOperation({
    summary: 'Get user details by ID (UUID)',
    description: 'Retrieves detailed information about a specific user by their internal UUID for the logged-in user\'s account. Supports optional relation loading (arrivals, exits).',
  })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (arrivals, exits)' })
  async findOneById(
    @Param('id') id: string,
    @Query('include') include?: string,
    @CurrentUserCredentials() credentials?: Credentials,
  ): Promise<User> {
    const options = {
      include: include ? include.split(',') : undefined,
      accountId: credentials ? Number(credentials.accid) : undefined, // Multi-tenant: filter by account ID
    };
    return this.usersService.findOneById(id, options);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update user information',
    description: 'Updates user information (email, role, fullname) for a specific user by their internal UUID. Only users from the logged-in user\'s account can be updated.',
  })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateUserDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<User> {
    return this.usersService.update(id, updateDto, Number(credentials.accid));
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Removes a user from the system by ID (UUID)',
    description: 'Permanently removes a user from the database by their internal UUID. This is a soft delete operation that sets the deletedAt timestamp.',
  })
  async remove(@Param('id') id: string): Promise<User> {
    return this.usersService.remove(id);
  }
}

