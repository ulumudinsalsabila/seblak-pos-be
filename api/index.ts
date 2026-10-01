import type { Express, Request, Response } from 'express';

let serverPromise: Promise<Express> | undefined;

async function createServer() {
  const [expressModule, nestCore, nestExpress, appModule, appConfig] =
    await Promise.all([
      import('express'),
      import('@nestjs/core'),
      import('@nestjs/platform-express'),
      import('../src/app.module'),
      import('../src/configure-app'),
    ]);
  const express = expressModule.default;
  const { NestFactory } = nestCore;
  const { ExpressAdapter } = nestExpress;
  const { AppModule } = appModule;
  const { configureApp } = appConfig;
  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bodyParser: false,
  });
  configureApp(app);
  await app.init();
  return server;
}

export default async function handler(request: Request, response: Response) {
  try {
    serverPromise ??= createServer();
    const server = await serverPromise;
    return server(request, response);
  } catch (error) {
    console.error('Nest bootstrap failed', error);
    const details =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 12),
          }
        : { name: 'UnknownError', message: 'Unknown bootstrap error' };
    return response.status(500).json({
      error: 'API_BOOTSTRAP_FAILED',
      details,
    });
  }
}
