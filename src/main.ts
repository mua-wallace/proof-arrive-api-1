import { HttpAdapterHost, NestFactory, Reflector } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerCustomOptions,
  SwaggerModule,
} from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { SwaggerTheme, SwaggerThemeNameEnum } from 'swagger-themes';
import appConfig from '@config/app.config';
import { AppModule } from './app.module';
import { SentryExceptionFilter } from '@common/filters/sentry-exception.filter';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';

const MODE = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
} as const;

const logger = new Logger('Bootstrap');

async function bootstrap() {
  // Load config early
  const config = appConfig();

  // Note: Migrations are run by the Docker startup script (scripts/start-with-migrations.sh)
  // or manually before starting the application. This ensures migrations complete before
  // any module initialization (like CentersSeederService).

  const app = await NestFactory.create(AppModule);
  const httpAdapter = app.get(HttpAdapterHost);

  app.useGlobalFilters(new SentryExceptionFilter(httpAdapter));

  const theme = new SwaggerTheme();

  // Load allowed origins from AppConfig (which reads from .env)
  const allowedOrigins = config.app.allowedOrigins || ['http://localhost:5173'];

  // Enable secure CORS configuration
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cache-Control',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
  });

  // Global prefix (e.g., /api/v1)
  app.setGlobalPrefix(config.app.prefix);

  // Validation rules
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global JWT Auth Guard (all routes protected by default, use @Public() to bypass)
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new JwtAuthGuard(reflector));

  // Swagger (only in development mode)
  if (appConfig().app.mode === MODE.DEVELOPMENT) {
    const apiDescription = 
      '## Overview\n\n' +
      'The **Proof Arrive API** is a comprehensive REST API for tracking and managing vehicle logistics operations, including arrivals, exits, and inter-center transfers. The system integrates with the Malambi third-party API to synchronize user, vehicle, and center data.\n\n' +
      '## Key Features\n\n' +
      '- **Vehicle Arrival Tracking**: Record and track vehicle arrivals at centers with QR code scanning, GPS coordinates, and processing stages\n' +
      '- **Exit Management**: Track vehicle exits from centers with destination information and exit types\n' +
      '- **Incoming Vehicle Operations**: Manage vehicles in transit between centers with status tracking and arrival estimates\n' +
      '- **Processing Stages**: Track multi-stage processing workflows for arrivals (e.g., unloading, inspection, etc.)\n' +
      '- **Data Synchronization**: Automatic background job processing to sync users, vehicles, and centers from Malambi API\n' +
      '- **Audit Trail**: All records include `createdBy` fields to track which user performed each action\n\n' +
      '## Authentication\n\n' +
      'The API uses **JWT (JSON Web Token)** authentication. Most endpoints require a valid JWT access token in the Authorization header:\n\n' +
      '```\n' +
      'Authorization: Bearer <your-jwt-token>\n' +
      '```\n\n' +
      '### Authentication Flow\n\n' +
      '1. **Login** (`POST /api/v1/auth/login`): Authenticate with Malambi credentials to receive access and refresh tokens\n' +
      '2. **Access Token**: Short-lived token (default: 1 hour) used for API requests\n' +
      '3. **Refresh Token**: Long-lived token (default: 3 days) used to obtain new access tokens\n' +
      '4. **Auto-sync**: On login, user data is automatically synced to the local database via background jobs if not already present\n\n' +
      '### Public Endpoints\n\n' +
      'The following endpoints are publicly accessible (no authentication required):\n' +
      '- `POST /api/v1/auth/login` - User login\n' +
      '- `POST /api/v1/auth/refresh-token` - Refresh access token\n' +
      '- `GET /api/v1/auth/check` - Check authentication status\n\n' +
      'All other endpoints require a valid JWT token.\n\n' +
      '## Data Synchronization\n\n' +
      'The API integrates with the **Malambi** third-party system to keep data in sync:\n\n' +
      '- **Users**: Synced automatically on login via background jobs\n' +
      '- **Vehicles**: Can be synced on-demand by vehicle ID\n' +
      '- **Centers**: Can be synced on-demand by geozone ID\n\n' +
      'All sync operations run asynchronously in the background to ensure optimal API response times.\n\n' +
      '## Common Operations\n\n' +
      '### Arrival Workflow\n' +
      '1. Create arrival record when vehicle arrives at a center (`POST /api/v1/arrivals`)\n' +
      '2. Start processing stages as needed (`POST /api/v1/arrivals/:id/process`)\n' +
      '3. Update processing stage status (`PUT /api/v1/arrivals/:id/process/:stageId`)\n' +
      '4. Update arrival status (`PUT /api/v1/arrivals/:id/status`)\n\n' +
      '### Exit Workflow\n' +
      '1. Create exit record when vehicle leaves a center (`POST /api/v1/exits`)\n' +
      '2. Optionally create incoming vehicle record for inter-center transfers (`POST /api/v1/incoming`)\n' +
      '3. Update incoming vehicle status and arrival times as needed (`PUT /api/v1/incoming/:id`)\n\n' +
      '## Pagination & Filtering\n\n' +
      'Most list endpoints support:\n' +
      '- **Pagination**: `page` (default: 1) and `limit` (default: 100) query parameters\n' +
      '- **Search**: `search` and `searchBy` (comma-separated fields) query parameters\n' +
      '- **Sorting**: `sortBy` query parameter (format: `field:direction`, e.g., `createdAt:DESC`)\n' +
      '- **Relations**: `include` query parameter to load related entities (e.g., `include=vehicle,center`)\n\n' +
      '## Error Handling\n\n' +
      'The API uses standard HTTP status codes:\n' +
      '- `200` - Success\n' +
      '- `201` - Created\n' +
      '- `400` - Bad Request (validation errors)\n' +
      '- `401` - Unauthorized (invalid or missing token)\n' +
      '- `404` - Not Found\n' +
      '- `500` - Internal Server Error\n\n' +
      'All errors include descriptive messages to help identify and resolve issues.';

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(config.app.name)
        .setDescription(apiDescription)
        .addTag('Auth', 'API for authentication and authorization')
        .addTag('Users', 'API for managing users (synced from Malambi)')
        .addTag('Centers', 'API for managing centers/locations (synced from Malambi)')
        .addTag('Vehicles', 'API for managing vehicles (synced from Malambi)')
        .addTag('Arrivals', 'API for tracking vehicle arrivals at centers')
        .addTag('Exits', 'API for tracking vehicle exits from centers')
        .addTag('Incoming Vehicles', 'API for managing vehicles in transit between centers')
        .addTag('Reports', 'API for generating and managing reports')
        .addBearerAuth(
          {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            name: 'Authorization',
            description: 'Enter JWT token obtained from /api/v1/auth/login',
            in: 'header',
          },
          'bearer',
        )
        .build(),
    );

    const customOptions: SwaggerCustomOptions = {
      swaggerOptions: { persistAuthorization: true },
      customSiteTitle: config.app.name,
      customCss: theme.getBuffer(SwaggerThemeNameEnum.DARK_MONOKAI),
    };

    SwaggerModule.setup(config.app.docs, app, document, customOptions);
  } else {
    // Initialize Sentry only in production
    if (config.app.mode === MODE.PRODUCTION) {
      Sentry.init();
    }
  }

  // Start server
  await app.listen(config.app.port);
  // logger.log(`🚀 Server running on port ${config.app.port}`);
  logger.log(`📚 Swagger docs available at: http://localhost:${config.app.port}/${config.app.docs}`);
}

bootstrap().catch((error) => {
  logger.error('❌ Error starting application:', error instanceof Error ? error.stack : error);
  process.exit(1);
});
