import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { TokenPayload } from '../interfaces/token-payload.interface';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private readonly configService: ConfigService,
  ) {
    const secret = configService.getOrThrow<string>('jwt.refreshToken.secret');
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: TokenPayload): Promise<any> {
    const { accid, subid } = payload;
    return { accid, subid, refreshtoken: payload.refreshtoken };
  }
}

