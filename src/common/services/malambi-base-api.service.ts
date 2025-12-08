import {
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';

export abstract class MalambiBaseApiService {
  protected readonly logger = new Logger(this.constructor.name);
  protected readonly baseUrl: string;

  protected static readonly FORM_HEADERS: Readonly<Record<string, string>> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  } as const;

  protected constructor(
    protected readonly httpService: HttpService,
    protected readonly configService: ConfigService,
    baseUrlKeyOrLiteral: string = 'malambi.malambiBaseUrl',
    isLiteral = false,
  ) {
    const value = isLiteral
      ? baseUrlKeyOrLiteral
      : this.configService.get<string>(baseUrlKeyOrLiteral);
    if (!value)
      throw new Error(
        `BaseApiService: base URL not configured at key "${baseUrlKeyOrLiteral}"`,
      );
    this.baseUrl = value;
  }

  /**
   * Build query params with optional _dc (cache-busting).
   */
  protected buildParams(
    params: Record<string, any>,
    auth?: { token: string; accId: string; subId: string },
    options?: { includeDc?: boolean },
  ): Record<string, any> {
    return {
      ...params,
      ...(options?.includeDc !== false && { _dc: Date.now() }),
      ...(auth && {
        acc_token: auth.token,
        acc_id: auth.accId,
        acc_sid: auth.subId,
      }),
    };
  }

  /**
   * Universal API call handler for Malambi endpoints.
   */
  protected async makeApiCall<T = any>(
    method: 'GET' | 'POST',
    params: Record<string, any>,
    formData?: URLSearchParams,
    headers?: Record<string, string>,
    auth?: { token: string; accId: string; subId: string },
    options?: { includeDc?: boolean },
  ): Promise<T> {
    try {
      if (auth && (!auth.token || !auth.accId || !auth.subId)) {
        throw new UnauthorizedException(
          'Unauthorized, Please make sure you are logged in correctly',
        );
      }

      const fullParams = this.buildParams(params, auth, options);

      const axiosConfig: AxiosRequestConfig = {
        baseURL: this.baseUrl,
        params: fullParams,
        headers: {
          Accept: 'application/json, text/plain, */*',
          ...headers,
        },
      };

      const response = await firstValueFrom(
        method === 'POST'
          ? this.httpService.post<T>('', formData, axiosConfig)
          : this.httpService.get<T>('', axiosConfig),
      );

      return response.data as T;
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Unknown error';
      this.logger.error(
        `API call error [${params.sys || params.frm || params.app}]: ${errorMessage}`,
        err.stack,
      );
      
      // Check if it's an HTTP error response
      if (err.response) {
        const status = err.response.status;
        const message = err.response.data?.message || errorMessage;
        
        if (status === 401 || status === 403) {
          throw new UnauthorizedException(
            message || 'Unauthorized, Please make sure you are logged in correctly',
          );
        }
        
        // For other HTTP errors, throw with appropriate status
        throw new InternalServerErrorException(message);
      }
      
      // For non-HTTP errors (network errors, etc.), check error message
      if (err.message?.includes('Unauthorized') || err.message?.includes('401')) {
        throw new UnauthorizedException(
          errorMessage || 'Unauthorized, Please make sure you are logged in correctly',
        );
      }
      
      // For other errors, throw InternalServerErrorException
      throw new InternalServerErrorException(errorMessage);
    }
  }

  protected buildForm(
    data: Record<string, string | number | boolean | undefined>,
  ): URLSearchParams {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      form.set(k, typeof v === 'boolean' ? (v ? 'on' : 'off') : String(v));
    }
    return form;
  }
}

