import * as process from 'process';
import * as dotenv from 'dotenv';

dotenv.config();

export default () => ({
  app: {
    prefix: process.env.API_PREFIX || 'api/v1',
    malambiBaseUrl:
      process.env.MALAMBI_API_BASE_URL || 'https://malambi.net/Helper',
    malambiBaseUrlGeo:
      process.env.MALAMBI_API_BASE_URL_GEOZONE ||
      'https://fm7.malambi.net/Helper',
    mode: process.env.APP_MODE || 'development',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.APP_PORT || process.env.PORT || '5000', 10),
    name: process.env.APP_NAME || 'Malambi API',
    allowedOrigins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
      : ['http://localhost:5173'],
    docs: process.env.APP_DOCS || 'docs',
  },
  jwt: {
    accessToken: {
      secret: process.env.JWT_ACCESS_TOKEN_SECRET,
      expiration: process.env.JWT_ACCESS_TOKEN_EXPIRATION_MS,
    },
    refreshToken: {
      secret: process.env.JWT_REFRESH_TOKEN_SECRET,
      expiration: process.env.JWT_REFRESH_TOKEN_EXPIRATION_DAYS,
    },
    refreshTokenExpirationDays: process.env.REFRESH_TOKEN_EXPIRATION_DAYS || 3,
  },
  database: {
    url: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    name: process.env.DATABASE_NAME || 'proof_arrive',
    logging: process.env.DATABASE_LOGGING === 'true',
  },
});

