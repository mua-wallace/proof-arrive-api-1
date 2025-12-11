import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { CurrentUserCredentials } from './decorators/current-user-credentials.decorator';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginRequest } from './dto/login-request.dto';
import { RefreshTokenRequest } from './dto/refresh-token.dto';
import * as schema from '@modules/schemas';
import { Credentials } from '@common/interfaces';
import { Public } from './decorators/public.decorator';

// Temporary user type from Malambi API login response
interface MalambiUser {
  accid: string | number;
  subid: string | number;
  token: string;
  session: string;
  username: string;
  loginusername?: string;
  company?: string;
  [key: string]: any;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @UseGuards(LocalAuthGuard)
  @ApiOperation({
    summary: 'Login user',
    description: 'Authenticates a user with Malambi credentials and returns JWT access and refresh tokens. If the user does not exist in the local database, a background sync job is triggered to fetch and save their data.',
  })
  @ApiBody({ type: LoginRequest })
  async login(
    @Body() loginDto: LoginRequest,
    @CurrentUser() user: MalambiUser,
  ) {
    this.logger.log(`User ${user.username} is attempting to log in`);
    return this.authService.login(user);
  }

  @Public()
  @Post('refresh-token')
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Generates a new access token using a valid refresh token. The refresh token must not be expired and must exist in the database.',
  })
  @ApiBody({ type: RefreshTokenRequest })
  async refresh(
    @Body() body: RefreshTokenRequest,
  ) {
    // Refresh token JWT contains all needed info (token, accid, subid)
    // Credentials are optional and only used as fallback
    const credentials: Credentials = {
      token: body.acc_token || '',
      accid: body.acc_id ? Number(body.acc_id) : 0,
      subid: body.acc_sid ? Number(body.acc_sid) : 0,
    };
    
    return this.authService.refreshToken(
      credentials,
      body.refreshToken,
    );
  }

  @Post('logout')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Logout user',
    description: 'Invalidates the current refresh token, effectively logging out the user. The access token will remain valid until it expires, but the refresh token cannot be used to obtain new access tokens.',
  })
  async logout(
    @CurrentUserCredentials() credentials: Credentials,
  ) {
    return this.authService.logout(credentials);
  }

  @Public()
  @Get('check')
  @ApiOperation({
    summary: 'Check authentication status',
    description: 'Public endpoint that checks if the provided JWT token (if any) is valid and returns the authentication status. Does not require authentication.',
  })
  async checkAuth(@Req() req: Request) {
    return await this.authService.checkAuthFromRequest(req);
  }

  @Get('profile')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Retrieves the profile information of the currently authenticated user from the request object. Requires a valid JWT access token.',
  })
  async profile(@Req() req: Request) {
    return req.user;
  }
}
