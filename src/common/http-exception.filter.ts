import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const prismaCode =
      error instanceof Prisma.PrismaClientInitializationError
        ? error.errorCode
        : error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : undefined;
    const databaseUnavailable =
      prismaCode === 'P1001' || prismaCode === 'P2024';
    const status = databaseUnavailable
      ? HttpStatus.SERVICE_UNAVAILABLE
      : error instanceof HttpException
        ? error.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = error instanceof HttpException ? error.getResponse() : null;
    const body =
      typeof raw === 'object' && raw ? (raw as Record<string, unknown>) : {};
    const rawMessage =
      body.message ??
      (status < 500 && error instanceof Error
        ? error.message
        : 'Internal server error');
    const details = Array.isArray(rawMessage) ? rawMessage : [];
    const message = Array.isArray(rawMessage)
      ? 'Request validation failed'
      : databaseUnavailable
        ? 'Database is temporarily unavailable'
        : String(rawMessage);

    if (status >= 500) this.logger.error(error);

    response.status(status).json({
      statusCode: status,
      code: String(
        ((databaseUnavailable && 'DATABASE_UNAVAILABLE') || body.code) ??
          (status === 400
            ? 'VALIDATION_ERROR'
            : (HttpStatus[status] ?? 'ERROR')),
      ),
      message,
      details,
    });
  }
}
