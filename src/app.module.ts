import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { optionsBase } from './db/data-source';
import { SanteController } from './sante.controller';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { IndicateursModule } from './indicateurs/indicateurs.module';
import { ImportModule } from './import/import.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: () => ({ ...optionsBase(), migrationsRun: process.env.MIGRATIONS_AU_DEMARRAGE === '1' }) }),
    AuthModule,
    CommonModule,
    IndicateursModule,
    ImportModule,
  ],
  controllers: [SanteController],
})
export class AppModule {}
