import { defineConfig } from 'drizzle-kit';
import appConfig from '@config/app.config';

const config = appConfig();

export default defineConfig({
  schema: './src/modules/schemas/**/*.ts',
  out: './src/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: config.database.host || 'localhost',
    port: config.database.port || 5432,
    user: config.database.username || 'postgres',
    password: config.database.password || 'postgres',
    database: config.database.name || 'proof_arrive',
    ssl: false,
  },
});
