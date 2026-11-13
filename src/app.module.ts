import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { optionsBase } from './db/data-source';
import { SanteController } from './sante.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: () => ({ ...optionsBase(), migrationsRun: process.env.MIGRATIONS_AU_DEMARRAGE === '1' }) }),
  ],
  controllers: [SanteController],
})
export class AppModule {}
