import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../modules/schemas';
import { DATABASE_CONNECTION } from './database-connection';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (configService: ConfigService) => {
        const connectionString =
          configService.get('database.url') ||
          configService.get('DATABASE_URL') ||
          configService.get('POSTGRES_URL') ||
          (() => {
            const host = configService.get('database.host') || 'localhost';
            const port = configService.get('database.port') || 5432;
            const username = configService.get('database.username') || 'postgres';
            const password = configService.get('database.password') || 'postgres';
            const database = configService.get('database.name') || 'proof_arrive';
            return `postgresql://${username}:${password}@${host}:${port}/${database}`;
          })();

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
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}

