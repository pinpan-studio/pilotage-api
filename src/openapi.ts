import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { VERSION_API } from './sante.controller';

export function documentOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('API Pilotage')
    .setDescription("API REST de l'application Pilotage (suivi des projets de développement). Tous les indicateurs et alertes sont calculés par l'API.")
    .setVersion(VERSION_API)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT ou jeton d’API (plt_…)' })
    .build();
  const doc = SwaggerModule.createDocument(app, config, { operationIdFactory: (ctrl, methode) => `${ctrl.replace(/Controller$/, '')}_${methode}` });
  doc.security = [{ bearer: [] }];
  return doc;
}

/** npm run openapi : écrit openapi/openapi.json sans se connecter à la base. */
async function generer() {
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule, { logger: ['error'], abortOnError: false });
  app.setGlobalPrefix('api/v1');
  const doc = documentOpenApi(app);
  const dir = join(__dirname, '..', 'openapi');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'openapi.json'), JSON.stringify(doc, null, 2) + '\n');
  console.log(`openapi/openapi.json : ${Object.keys(doc.paths).length} chemins, ${Object.keys(doc.components?.schemas ?? {}).length} schémas.`);
  await app.close();
}
if (require.main === module) generer().catch((e) => { console.error(e); process.exit(1); });
