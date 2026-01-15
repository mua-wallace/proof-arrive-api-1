import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { DatabaseModule } from '@database/database.module';
import { MalambiApiModule } from '@integrations/malambi-api/malambi-api.module';
import { QueueModule } from '@common/queue/queue.module';
import { UsersModule } from '@modules/users/users.module';
import { CentersModule } from '@modules/centers/centers.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    MalambiApiModule,
    PassportModule,
    JwtModule,
    DatabaseModule,
    QueueModule,
    UsersModule,
    CentersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy, JwtRefreshStrategy, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
