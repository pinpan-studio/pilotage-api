import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembreProjet, Projet } from '../db/entities';
import { AccesService } from './acces.service';
import { HistoriqueService } from './historique.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Projet, MembreProjet])],
  providers: [AccesService, HistoriqueService],
  exports: [AccesService, HistoriqueService],
})
export class CommonModule {}
