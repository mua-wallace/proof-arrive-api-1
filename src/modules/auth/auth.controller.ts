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
  @ApiOperation({ summary: 'Login user' })
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
  @ApiOperation({ summary: 'Refresh access token' })
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
  @ApiOperation({ summary: 'Logout user' })
  async logout(
    @CurrentUserCredentials() credentials: Credentials,
  ) {
    return this.authService.logout(credentials);
  }

  @Public()
  @Get('check')
  @ApiOperation({ summary: 'Check authentication status' })
  async checkAuth(@Req() req: Request) {
    return await this.authService.checkAuthFromRequest(req);
  }

  @Get('profile')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get current user profile' })
  async profile(@Req() req: Request) {
    return req.user;
  }
}
