import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { HttpExceptionFilter } from './common/http-exception.filter';

function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, '');
}

export function getAllowedOrigins(
  env: Partial<
    Pick<NodeJS.ProcessEnv, 'CORS_ORIGINS' | 'FRONTEND_URL'>
  > = process.env,
) {
  const configured = [env.CORS_ORIGINS, env.FRONTEND_URL]
    .filter(Boolean)
    .join(',');
  const values = configured || 'http://localhost:3000';

  return [...new Set(values.split(',').map(normalizeOrigin).filter(Boolean))];
}

export function configureApp(app: INestApplication) {
  const allowedOrigins = new Set(getAllowedOrigins());

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(normalizeOrigin(origin))) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  return app;
}
