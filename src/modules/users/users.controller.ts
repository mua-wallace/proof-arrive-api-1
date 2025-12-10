import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ApiQuery, ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { PaginateQuery, PaginateResult } from '@common/interfaces';
import { FilterUsersDto } from './dto/filter-users.dto';
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
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term' })
  @ApiQuery({ name: 'searchBy', required: false, type: String, description: 'Comma-separated fields to search in' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Comma-separated sort fields (format: field:direction)' })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (arrivals, exits)' })
  async findAllWithFilter(
    @Query() filterDto: FilterUsersDto,
    @Query('include') include?: string,
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
      include: include ? include.split(',') : undefined,
    };

    return this.usersService.findAll(query, options);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get current authenticated user details',
  })
  async getMe(
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<User> {
    return this.usersService.findByAccidAndSubid(
      String(credentials.accid),
      String(credentials.subid),
    );
  }

  @Get('details/:id')
  @ApiOperation({
    summary: 'Get user details by ID (UUID)',
  })
  @ApiQuery({ name: 'include', required: false, type: String, description: 'Comma-separated relations to include (arrivals, exits)' })
  async findOneById(
    @Param('id') id: string,
    @Query('include') include?: string,
  ): Promise<User> {
    const options = {
      include: include ? include.split(',') : undefined,
    };
    return this.usersService.findOneById(id, options);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Removes a user from the system by ID (UUID)',
  })
  async remove(@Param('id') id: string): Promise<User> {
    return this.usersService.remove(id);
  }
}

