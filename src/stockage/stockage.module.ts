import { Global, Module } from '@nestjs/common';
import { FichiersController } from './fichiers.controller';
import { FichiersService } from './fichiers.service';
import { StockageService } from './stockage.service';

@Global()
@Module({ controllers: [FichiersController], providers: [StockageService, FichiersService], exports: [StockageService, FichiersService] })
export class StockageModule {}
