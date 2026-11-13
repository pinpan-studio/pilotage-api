import { Global, Module } from '@nestjs/common';
import { EcritureService } from './ecriture.service';
import { EcritureController } from './ecriture.controller';

@Global()
@Module({ controllers: [EcritureController], providers: [EcritureService], exports: [EcritureService] })
export class EcritureModule {}
