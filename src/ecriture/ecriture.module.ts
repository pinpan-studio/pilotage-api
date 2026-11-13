import { Global, Module } from '@nestjs/common';
import { EcritureService } from './ecriture.service';

@Global()
@Module({ providers: [EcritureService], exports: [EcritureService] })
export class EcritureModule {}
