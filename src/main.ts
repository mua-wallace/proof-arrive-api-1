import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import {
  DocumentBuilder,
  SwaggerCustomOptions,
  SwaggerModule,
} from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { SwaggerTheme, SwaggerThemeNameEnum } from 'swagger-themes';
import cookieParser from 'cookie-parser';
import appConfig from '@config/app.config';
import { AppModule } from './app.module';
import { SentryExceptionFilter } from '@common/filters/sentry-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const httpAdapter = app.get(HttpAdapterHost);
  const config = appConfig();

  app.use(cookieParser());
  app.useGlobalFilters(new SentryExceptionFilter(httpAdapter));

  const theme = new SwaggerTheme();

  // Load allowed origins from AppConfig (which reads from .env)
  const allowedOrigins = config.app.allowedOrigins || ['http://localhost:5173'];

  console.log('✅ Allowed Origins:', allowedOrigins);

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

  // Swagger (only in development or production mode)
  if (config.app.mode === 'development' || config.app.mode === 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(config.app.name)
        .setDescription(`Documentation for ${config.app.name}`)
        .addBearerAuth()
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
    if (config.app.mode === 'production') {
      Sentry.init();
    }
  }

  // Start server
  await app.listen(config.app.port);
  console.log(`🚀 Server running on port ${config.app.port}`);
}

void bootstrap();
