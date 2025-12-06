import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import appConfig from '@config/app.config';
import { DatabaseModule } from '@database/database.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { ArrivalsModule } from '@modules/arrivals/arrivals.module';
import { ExitsModule } from '@modules/exits/exits.module';
import { IncomingModule } from '@modules/incoming/incoming.module';
import { CentersModule } from '@modules/centers/centers.module';
import { UsersModule } from '@modules/users/users.module';
import { ReportsModule } from '@modules/reports/reports.module';
import { ThirdPartyModule } from '@integrations/third-party/third-party.module';

@Module({
  imports: [
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
      }),
    }),
    DatabaseModule,
    VehiclesModule,
    ArrivalsModule,
    ExitsModule,
    IncomingModule,
    CentersModule,
    UsersModule,
    ReportsModule,
    ThirdPartyModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
