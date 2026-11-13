import { Global, Module } from '@nestjs/common';
import { IndicateursService } from './indicateurs.service';

@Global()
@Module({ providers: [IndicateursService], exports: [IndicateursService] })
export class IndicateursModule {}
