import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error: string | undefined;

    if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'object' && response !== null) {
        // If response has a message array, use it
        if ('message' in response) {
          message = (response as any).message;
        }
        if ('error' in response) {
          error = (response as any).error;
        }
      } else if (typeof response === 'string') {
        message = response;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (httpStatus >= 500) {
      Sentry.captureException(exception);
    }

    const responseBody = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path: ctx.getRequest().originalUrl || ctx.getRequest().url,
      message,
      error,
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}

