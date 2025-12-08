import { Injectable, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { MalambiBaseApiService } from '@common/services/malambi-base-api.service';
import * as schema from '@modules/schemas';

type User = typeof schema.users.$inferSelect;

interface LoginResponse {
  success: boolean;
  token?: string;
  session?: string;
  accid?: string;
  subid?: string;
  username?: string;
  loginusername?: string;
  k_u?: string;
  pid?: string;
  partner?: string;
  k_k?: string;
  expire?: string;
  company?: string;
  k_p?: string;
  [key: string]: any;
}

@Injectable()
export class MalambiApiService extends MalambiBaseApiService {
  constructor(
    httpService: HttpService,
    configService: ConfigService,
  ) {
    super(httpService, configService, 'malambi.malambiBaseUrl');
  }

  /**
   * Authenticate user with Malambi API
   */
  async login(username: string, password: string): Promise<User> {
    const formData = this.buildForm({
      auth_u: username,
      auth_p: password,
      code: '',
      lt: '0',
      lg: '0',
      cookie: '0',
      keepme: 'on',
    });

    const data = await this.makeApiCall<LoginResponse>(
      'POST',
      { sys: 'CheckAuth' },
      formData,
      MalambiBaseApiService.FORM_HEADERS,
    );

    if (data?.success !== true) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Map API response to User schema
    // Log the raw API response for debugging
    this.logger.debug(`Malambi API login response: accid=${data.accid} (${typeof data.accid}), subid=${data.subid} (${typeof data.subid})`);
    
    // Ensure accid and subid are valid strings (not empty)
    const accid = data.accid?.toString() || '';
    const subid = data.subid?.toString() || '';
    
    if (!accid || !subid) {
      this.logger.error(`Missing accid or subid in API response: accid="${accid}", subid="${subid}", full response:`, JSON.stringify(data, null, 2));
      throw new UnauthorizedException('Invalid credentials: missing account information');
    }
    
    const user: User = {
      id: uuidv4(),
      k_u: data.k_u || '',
      pid: data.pid || '',
      subid: subid,
      partner: data.partner || '',
      k_k: data.k_k || '',
      expire: data.expire || new Date().toISOString(),
      token: data.token || '',
      session: data.session || '',
      accid: accid,
      company: data.company || '',
      username: data.username || username,
      loginusername: data.loginusername || username,
      k_p: data.k_p || '',
      refresh_token: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    return user;
  }

  /**
   * Logout user from Malambi API
   */
  async logout(
    token: string,
    accid: number,
    subid: number,
  ): Promise<string> {
    const formData = this.buildForm({});

    const data = await this.makeApiCall<string>(
      'POST',
      { sys: 'DoLogout' },
      formData,
      MalambiBaseApiService.FORM_HEADERS,
      { token, accId: accid.toString(), subId: subid.toString() },
    );

    if (data !== 'ok\n' && data !== 'ok') {
      throw new UnauthorizedException('Logout failed');
    }

    return data;
  }

  /**
   * Check if user session is valid
   */
  async checkAuth(
    token: string,
    accId: string,
    subId: string,
  ): Promise<boolean> {
    try {
      const response = await this.makeApiCall<any[]>(
        'GET',
        { sys: 'GetLS' },
        undefined,
        undefined,
        { token, accId, subId },
      );

      return Array.isArray(response) && response[0]?.[0] === 1;
    } catch (error) {
      this.logger.error(
        `Session validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      return false;
    }
  }
}
