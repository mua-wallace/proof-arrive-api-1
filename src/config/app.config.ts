import * as process from 'process';
import * as dotenv from 'dotenv';

dotenv.config();

export default () => ({
  app: {
    prefix: process.env.API_PREFIX || 'api/v1',
    
    mode: process.env.APP_MODE || 'development',
    port: parseInt(process.env.PORT || '5000', 10),
    name: process.env.APP_NAME || 'Proof Arrive API',
    docs: process.env.APP_DOCS || 'docs',
  },
  database: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    name: process.env.DATABASE_NAME,
    logging: process.env.DATABASE_LOGGING === 'true',
  },
});

