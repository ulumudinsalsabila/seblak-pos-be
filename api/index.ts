import express, { Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

let serverPromise: Promise<express.Express> | undefined;

async function createServer() {
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
        ? { name: error.name, message: error.message }
        : { name: 'UnknownError', message: 'Unknown bootstrap error' };
    return response.status(500).json({
      error: 'API_BOOTSTRAP_FAILED',
      details,
    });
  }
}
