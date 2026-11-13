import { Global, Module } from '@nestjs/common';
import { EcritureService } from './ecriture.service';
import { EcritureController } from './ecriture.controller';
import { GestionController } from './gestion.controller';
import { GestionService } from './gestion.service';

@Global()
@Module({ controllers: [EcritureController, GestionController], providers: [EcritureService, GestionService], exports: [EcritureService, GestionService] })
export class EcritureModule {}
