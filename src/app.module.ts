import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import appConfig from '@config/app.config';
import { DatabaseModule } from '@database/database.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { ArrivalsModule } from '@modules/arrivals/arrivals.module';
import { ExitsModule } from '@modules/exits/exits.module';
import { CentersModule } from '@modules/centers/centers.module';
import { UsersModule } from '@modules/users/users.module';
import { ReportsModule } from '@modules/reports/reports.module';
import { AuthModule } from '@modules/auth/auth.module';
import { TripsModule } from '@modules/trips/trips.module';
import { QueuesModule } from '@modules/queues/queues.module';
import { ExceptionsModule } from '@modules/exceptions/exceptions.module';
import { ThirdPartyModule } from '@integrations/third-party/third-party.module';
import { MalambiApiModule } from '@integrations/malambi-api/malambi-api.module';
import { QueueModule } from '@common/queue/queue.module';
import { MalambiAuthMiddleware } from '@common/middleware/malambi-auth.middleware';

@Module({
  imports: [
    MalambiApiModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: '.env',
      validationSchema: Joi.object({
        PORT: Joi.number().port().default(5000),
        API_PREFIX: Joi.string().default('api/v1'),
        APP_NAME: Joi.string().default('Proof Arrive API'),
        APP_DOCS: Joi.string().default('docs'),
        APP_MODE: Joi.string()
          .valid('development', 'production')
          .default('development'),
        NODE_ENV: Joi.string()
          .valid('development', 'production')
          .default('development'),
        ALLOWED_ORIGINS: Joi.string().default('http://localhost:5173'),
        DATABASE_HOST: Joi.string().default('localhost'),
        DATABASE_PORT: Joi.number().port().default(5432),
        DATABASE_USERNAME: Joi.string().default('postgres'),
        DATABASE_PASSWORD: Joi.string().default('postgres'),
        DATABASE_NAME: Joi.string().default('proof_arrive'),
        DATABASE_LOGGING: Joi.string().valid('true', 'false').default('false'),
        JWT_ACCESS_TOKEN_SECRET: Joi.string().default('your-access-token-secret-change-in-production'),
        JWT_ACCESS_TOKEN_EXPIRATION: Joi.string().default('3600000'),
        JWT_REFRESH_TOKEN_SECRET: Joi.string().default('your-refresh-token-secret-change-in-production'),
        JWT_REFRESH_TOKEN_EXPIRATION: Joi.string().default('259200000'),
        JWT_REFRESH_TOKEN_EXPIRATION_DAYS: Joi.number().default(3),
        MALAMBI_API_BASE_URL: Joi.string().uri().optional(),
        MALAMBI_API_BASE_URL_GEOZONE: Joi.string().uri().optional(),
        QR_CODE_ENCRYPTION_KEY: Joi.string().min(32).optional(),
      }),
    }),
    DatabaseModule,
    QueueModule,
    AuthModule,
    VehiclesModule,
    ArrivalsModule,
    ExitsModule,
    // IncomingModule, // Removed - incoming vehicles endpoints not useful
    CentersModule,
    UsersModule,
    ReportsModule,
    TripsModule,
    QueuesModule,
    ExceptionsModule,
    ThirdPartyModule,
  ],
  controllers: [],
  providers: [MalambiAuthMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(MalambiAuthMiddleware)
      .exclude(
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/refresh-token', method: RequestMethod.POST },
        { path: 'auth/check', method: RequestMethod.GET },
        { path: 'api/v1/auth/login', method: RequestMethod.POST },
        { path: 'api/v1/auth/check', method: RequestMethod.GET },
    
      )
      .forRoutes('*');
  }
}
