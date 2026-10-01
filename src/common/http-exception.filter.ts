import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      error instanceof HttpException
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
      : String(rawMessage);

    response.status(status).json({
      statusCode: status,
      code: String(
        body.code ??
          (status === 400
            ? 'VALIDATION_ERROR'
            : (HttpStatus[status] ?? 'ERROR')),
      ),
      message,
      details,
    });
  }
}
