import * as process from 'process';
import * as dotenv from 'dotenv';

dotenv.config();

export default () => ({
  app: {
    prefix: process.env.API_PREFIX || 'api/v1',
    mode: process.env.APP_MODE || 'development',
    port: parseInt(process.env.PORT || '5000', 10),
    name: process.env.APP_NAME || 'Proof Arrive API',
    docs: process.env.APP_DOCS || '/api/v1/docs',
    allowedOrigins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
      : ['http://localhost:5173'],
  },
  database: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    name: process.env.DATABASE_NAME,
    logging: process.env.DATABASE_LOGGING === 'true',
  },
  jwt: {
    accessToken: {
      secret: process.env.JWT_ACCESS_TOKEN_SECRET,
      expiration: process.env.JWT_ACCESS_TOKEN_EXPIRATION,
    },
    refreshToken: {
      secret: process.env.JWT_REFRESH_TOKEN_SECRET,
      expiration: process.env.JWT_REFRESH_TOKEN_EXPIRATION,
    },
    refreshTokenExpirationDays: parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRATION_DAYS || '3', 10),
  },
  malambi: {
    malambiBaseUrl:
      process.env.MALAMBI_API_BASE_URL,
    malambiBaseUrlGeo:
      process.env.MALAMBI_API_BASE_URL_GEOZONE,
  },
  qrCode: {
    encryptionKey: process.env.QR_CODE_ENCRYPTION_KEY,
  },
});

