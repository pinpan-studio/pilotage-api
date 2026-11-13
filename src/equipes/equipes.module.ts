import { Global, Module } from '@nestjs/common';
import { EquipesController, ProjetsAdminController } from './equipes.controller';
import { EquipesService } from './equipes.service';

@Global()
@Module({ controllers: [EquipesController, ProjetsAdminController], providers: [EquipesService], exports: [EquipesService] })
export class EquipesModule {}
