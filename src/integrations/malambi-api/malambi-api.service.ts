import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { MalambiBaseApiService } from '@common/services/malambi-base-api.service';

// Temporary user type from Malambi API login response
export interface MalambiUser {
  accid: string | number;
  subid: string | number;
  token: string;
  session: string;
  username: string;
  loginusername?: string;
  company?: string;
  k_u?: string;
  pid?: string;
  partner?: string;
  k_k?: string;
  expire?: string;
  k_p?: string;
  [key: string]: any;
}

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
  async login(username: string, password: string): Promise<MalambiUser> {
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

    // Ensure accid and subid are valid
    const accid = data.accid?.toString() || '';
    const subid = data.subid?.toString() || '';
    
    if (!accid || !subid) {
      throw new UnauthorizedException('Invalid credentials: missing account information');
    }
    
    // Map API response to MalambiUser
    const user: MalambiUser = {
      accid: data.accid || accid,
      subid: data.subid || subid,
      token: data.token || '',
      session: data.session || '',
      username: data.username || username,
      loginusername: data.loginusername || username,
      company: data.company || '',
      k_u: data.k_u,
      pid: data.pid,
      partner: data.partner,
      k_k: data.k_k,
      expire: data.expire,
      k_p: data.k_p,
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
      return false;
    }
  }

  /**
   * Get centers list from Malambi API
   */
  async getCenters(
    token: string,
    accId: string,
    subId: string,
    options?: {
      limit?: number;
      regionid?: number;
      filtertype?: number;
    },
  ): Promise<{
    success: boolean;
    totalCount: number;
    rows: Array<{
      id: number;
      siteid: number;
      name: string;
      fullname?: string;
      geozone?: string;
      gzone_id?: number;
      manager?: string;
      groupid?: number;
      groupname?: string;
      sitetype?: number;
      distance?: number;
      time1?: string;
      time2?: string;
      saturday?: string;
      sunday?: string;
      breakstart?: string;
      breakstop?: string;
      timeoutin?: number;
      timeoutin_str?: string;
      timeoutin_muros?: number;
      timeoutin_muros_str?: string;
      [key: string]: any;
    }>;
  }> {
    const params = {
      plug: 'Sites',
      package: 'tripsanalyzer',
      full: '1',
      task: 'list',
      filtertype: options?.filtertype?.toString() || '1',
      limit: options?.limit?.toString() || '1000',
      regionid: options?.regionid?.toString() || '-1',
    };

    const response = await this.makeApiCall<{
      success: boolean;
      totalCount: number;
      rows: any[];
    }>(
      'GET',
      params,
      undefined,
      undefined,
      { token, accId, subId },
      { includeDc: true },
    );

    return {
      success: response.success || false,
      totalCount: response.totalCount || 0,
      rows: response.rows || [],
    };
  }

  /**
   * Get vehicle detail from Malambi API
   */
  async getVehicleDetail(
    token: string,
    accId: string,
    subId: string,
    vehicleId: string,
  ): Promise<{
    id: number;
    plate: string;
    model?: string;
    brand?: string;
    year?: number;
    tag2?: string;
    groupId?: number;
  }> {
    const data = await this.makeApiCall<any>(
      'GET',
      {
        frm: 'VehiclesSetting',
        task: 'load',
        select: 'vehicle',
        id: vehicleId,
      },
      undefined,
      undefined,
      { token, accId, subId },
    );

    if (!data) {
      throw new NotFoundException(`Vehicle not found, id: ${vehicleId}`);
    }

    return this.transformVehicleDetail(data);
  }

  /**
   * Transform vehicle detail from Malambi API response
   */
  private transformVehicleDetail(raw: any): {
    id: number;
    plate: string;
    model?: string;
    brand?: string;
    year?: number;
    tag2?: string;
    groupId?: number;
  } {
    const row = raw?.rows?.[0];
    if (!row) {
      throw new Error('Invalid vehicle data from API');
    }

    // Keep CLN, remove parentheses and trim extra spaces
    const plate = row.tag
      ?.replace(/\(.*?\)/g, '') // remove text inside parentheses
      .trim() || '';

    return {
      id: row.id,
      plate,
      model: row.model,
      brand: row.brand,
      year: row.year,
      tag2: row.tag2,
      groupId: row.groupid,
    };
  }
}
