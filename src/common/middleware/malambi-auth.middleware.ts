import {
  Injectable,
  Logger,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import { MalambiApiService } from '@integrations/malambi-api/malambi-api.service';

@Injectable()
export class MalambiAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(MalambiAuthMiddleware.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly malambiApi: MalambiApiService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Skip middleware for public routes
    const publicRoutes = [
      '/auth/login',
      '/auth/refresh-token',
      '/auth/check',
      '/docs',
      '/docs-json',
    ];
    
    // Check if the path (with or without prefix) matches a public route
    const path = req.path;
    // Remove API prefix if present (e.g., /api/v1/auth/check -> /auth/check)
    let normalizedPath = path;
    if (path.startsWith('/api/v')) {
      // Remove /api/v1, /api/v2, etc.
      normalizedPath = path.replace(/^\/api\/v\d+/, '');
    } else if (path.startsWith('/api/')) {
      // Remove /api
      normalizedPath = path.replace(/^\/api/, '');
    }
    // Ensure it starts with /
    if (!normalizedPath.startsWith('/')) {
      normalizedPath = `/${normalizedPath}`;
    }
    
    const isPublicRoute = publicRoutes.some(
      (route) => {
        // Check exact matches
        if (path === route || normalizedPath === route) {
          return true;
        }
        // Check if path ends with the route (handles /api/v1/auth/check -> /auth/check)
        if (path.endsWith(route) || normalizedPath.endsWith(route)) {
          return true;
        }
        // Check if route is contained in path (more lenient matching)
        if (path.includes(route) || normalizedPath.includes(route)) {
          return true;
        }
        return false;
      },
    );

    if (isPublicRoute) {
      return next();
    }

    let accessToken: string | undefined;

    // Get token from Authorization header (Bearer token only)
    const authHeader = req.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      accessToken = authHeader.slice(7);
    }

    if (!accessToken) {
      this.logger.warn(`Missing access token for path: ${req.path}`);
      throw new UnauthorizedException(
        'Unauthorized, Please make sure you are logged in correctly',
      );
    }

    try {
      const decoded = this.jwtService.verify(accessToken, {
        secret: this.configService.getOrThrow<string>('jwt.accessToken.secret'),
      }) as { token: string; accid: number; subid: number; session?: string; iat?: number; exp?: number };

      // Malambi credentials are inside token
      const { session, token, accid, subid } = decoded;

      const valid = await this.malambiApi.checkAuth(token, accid.toString(), subid.toString());

      if (!valid) {
        throw new UnauthorizedException(
          'Unauthorized, Please make sure you are logged in correctly',
        );
      }

      // Ensure accid and subid are numbers
      const numericAccid = typeof accid === 'number' ? accid : Number(accid);
      const numericSubid = typeof subid === 'number' ? subid : Number(subid);

      if (isNaN(numericAccid) || isNaN(numericSubid)) {
        this.logger.error(`Invalid accid or subid in decoded token: accid=${accid} (${typeof accid}), subid=${subid} (${typeof subid})`);
        throw new UnauthorizedException(
          'Unauthorized, Please make sure you are logged in correctly',
        );
      }

      (req as any).user = {
        acc_id: numericAccid,
        acc_token: token,
        acc_sid: numericSubid,
        session: session || '',
      };

      this.logger.debug(`Set req.user for path ${req.path}:`, {
        acc_id: numericAccid,
        acc_sid: numericSubid,
        acc_token: token ? `${token.substring(0, 10)}...` : 'missing',
        session: session || 'missing',
      });

      next();
    } catch {
      throw new UnauthorizedException(
        'Unauthorized, Please make sure you are logged in correctly',
      );
    }
  }
}

