import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
