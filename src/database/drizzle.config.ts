import { defineConfig } from 'drizzle-kit';

// Try to load config from app.config, fallback to environment variables for production
let dbConfig: {
  host: string;
  port: number;
  username: string;
  password: string;
  name: string;
};

try {
  // Try to import config (works in development/build stage)
  const appConfig = require('@config/app.config').default;
  const config = appConfig();
  dbConfig = {
    host: config.database.host,
    port: config.database.port,
    username: config.database.username,
    password: config.database.password,
    name: config.database.name,
  };
} catch (error) {
  // Fallback to environment variables (works in production)
  dbConfig = {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    name: process.env.DATABASE_NAME || 'proof_arrive',
  };
}

export default defineConfig({
  schema: './src/modules/schemas/**/*.ts',
  out: './src/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.name,
    ssl: false,
  },
});
