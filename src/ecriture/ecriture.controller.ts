import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import * as E from '../db/entities';
import { Acteur, ActeurCourant } from '../common/acteur';
import { EcritureService } from './ecriture.service';
import { CreerTacheDto, ModifierTacheDto, StatutFonctionnaliteDto, StatutFonctionnaliteResultatDto } from './ecriture.dto';

/** Écritures de l'interface : suivi des tâches (plan d'actions) et statuts des fonctionnalités (kanban). */
@ApiTags('projets') @ApiBearerAuth()
@Controller('projets/:code')
export class EcritureController {
  constructor(private readonly e: EcritureService) {}

  @Post('actions') @ApiCreatedResponse({ type: E.Action })
  creerTache(@ActeurCourant() a: Acteur, @Param('code') code: string, @Body() dto: CreerTacheDto) {
    return this.e.ajouterAction(a, code, { ...dto, origine_type: 'interface' });
  }

  @Patch('actions/:ref') @ApiOkResponse({ type: E.Action })
  modifierTache(@ActeurCourant() a: Acteur, @Param('code') code: string, @Param('ref') ref: string, @Body() dto: ModifierTacheDto) {
    return this.e.modifierAction(a, code, ref, dto);
  }

  @Patch('fonctionnalites/:ref/statut') @ApiOkResponse({ type: StatutFonctionnaliteResultatDto })
  statutFonctionnalite(@ActeurCourant() a: Acteur, @Param('code') code: string, @Param('ref') ref: string, @Body() dto: StatutFonctionnaliteDto) {
    return this.e.majStatutFonctionnalite(a, code, ref, dto.statut, { depot: dto.depot, notes: dto.notes });
  }
}
