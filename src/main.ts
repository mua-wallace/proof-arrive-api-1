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
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(config.app.name)
        .setDescription(`Documentation for ${config.app.name}`)
        .addTag('Vehicles', 'API for managing vehicles')
        .addTag('Arrivals', 'API for tracking vehicle arrivals')
        .addTag('Exits', 'API for tracking vehicle exits')
        .addTag('Incoming', 'API for managing incoming operations')
        .addTag('Centers', 'API for managing centers/locations')
        .addTag('Users', 'API for managing users')
        .addTag('Reports', 'API for generating and managing reports')
        .addTag('Auth', 'API for authentication and authorization')
        .addBearerAuth(
          {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            name: 'Authorization',
            description: 'Enter JWT token',
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
  logger.log(`🚀 Server running on port ${config.app.port}`);
  logger.log(`📚 Swagger docs available at: http://localhost:${config.app.port}/${config.app.docs}`);
}

bootstrap().catch((error) => {
  logger.error('❌ Error starting application:', error instanceof Error ? error.stack : error);
  process.exit(1);
});
