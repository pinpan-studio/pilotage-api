import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { documentOpenApi } from './openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1', { exclude: ['mcp'] });
  app.enableCors({ origin: (process.env.WEB_ORIGIN ?? 'http://localhost:4200').split(','), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const doc = documentOpenApi(app);
  app.getHttpAdapter().get('/api/v1/openapi.json', (_req: any, res: any) => res.json(doc));
  await app.listen(Number(process.env.PORT ?? 3000));
}
bootstrap();
