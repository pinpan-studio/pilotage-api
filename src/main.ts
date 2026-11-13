import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { json } from 'express';
import { AppModule } from './app.module';
import { documentOpenApi } from './openapi';

/** Configure l'application (partagé entre le serveur classique et la fonction Vercel). */
export async function creerApplication() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.use(helmet());
  app.use(json({ limit: '5mb' }));
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api/v1', { exclude: ['mcp'] });
  app.enableCors({ origin: (process.env.WEB_ORIGIN ?? 'http://localhost:4200').split(','), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const doc = documentOpenApi(app);
  app.getHttpAdapter().get('/api/v1/openapi.json', (_req: any, res: any) => res.json(doc));
  return app;
}

if (require.main === module) {
  creerApplication().then((app) => app.listen(Number(process.env.PORT ?? 3000)));
}
