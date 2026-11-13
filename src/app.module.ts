import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { optionsBase } from './db/data-source';
import { SanteController } from './sante.controller';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { IndicateursModule } from './indicateurs/indicateurs.module';
import { ImportModule } from './import/import.module';
import { LectureModule } from './lecture/lecture.module';
import { EcritureModule } from './ecriture/ecriture.module';
import { McpModule } from './mcp/mcp.module';
import { JournalModule } from './journal/journal.module';
import { StockageModule } from './stockage/stockage.module';
import { EquipesModule } from './equipes/equipes.module';
import { ExportModule } from './export/export.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: () => ({ ...optionsBase(), migrationsRun: process.env.MIGRATIONS_AU_DEMARRAGE === '1', manualInitialization: process.env.OPENAPI_SEULEMENT === '1' }) }),
    AuthModule,
    ExportModule,
    CommonModule,
    IndicateursModule,
    ImportModule,
    LectureModule,
    EcritureModule,
    McpModule,
    JournalModule,
    StockageModule,
    EquipesModule,
  ],
  controllers: [SanteController],
})
export class AppModule {}
