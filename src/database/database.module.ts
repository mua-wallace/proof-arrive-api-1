import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@modules/schemas';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { MigrationService } from './migration.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    MigrationService,
    {
      provide: DATABASE_CONNECTION,
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get('database');
        const { host, port, username, password, name } = dbConfig;
        const connectionString = `postgresql://${username}:${password}@${host}:${port}/${name}`;

        const client = postgres(connectionString, {
          max: 10,
        });

        return drizzle(client, {
          schema: {
            ...schema,
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [DATABASE_CONNECTION, MigrationService],
})
export class DatabaseModule {}

