import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ENTITES } from './entities';

/** DATABASE_URL : chaîne Neon (sslmode=require) en recette/production, Postgres local en développement. */
export function optionsBase(url = process.env.DATABASE_URL): DataSourceOptions {
  const ssl = /sslmode=require|neon\.tech/.test(url ?? '');
  return {
    type: 'postgres',
    url: url ?? 'postgres://postgres:postgres@localhost:5432/pilotage',
    ssl: ssl ? { rejectUnauthorized: true } : false,
    entities: ENTITES as any[],
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    synchronize: false,
    // Serverless (Vercel) : petit pool par instance ; utiliser la chaîne « pooled » de Neon.
    extra: { max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 3 : 10)), idleTimeoutMillis: 10_000 },
  };
}
export default new DataSource(optionsBase());
