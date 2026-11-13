import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Acteur, ActeurCourant, Roles } from '../common/acteur';
import { AuthService } from '../auth/auth.service';
import { SessionAuthDto } from '../auth/auth.dto';
import { EquipesService } from './equipes.service';
import * as D from './equipes.dto';

const HUMAINS = ['admin', 'chef_projet', 'developpeur', 'client_lecteur'] as const;

@ApiTags('équipes') @ApiBearerAuth()
@Controller('equipes')
@Roles(...HUMAINS)
export class EquipesController {
  constructor(private readonly s: EquipesService, private readonly auth: AuthService) {}

  @Get() @ApiOkResponse({ type: [D.EquipeDto] }) mesEquipes(@ActeurCourant() a: Acteur) { return this.s.mesEquipes(a); }
  @Post() @ApiCreatedResponse({ type: D.EquipeDto }) creer(@ActeurCourant() a: Acteur, @Body() dto: D.CreerEquipeDto) { return this.s.creerEquipe(a, dto.nom); }
  @Patch('courante') @ApiOkResponse({ type: D.EquipeDto }) maj(@ActeurCourant() a: Acteur, @Body() dto: D.MajEquipeDto) { return this.s.majEquipe(a, dto.nom); }

  /** Change d'espace de travail : nouvelle session sur le compte de la même personne dans l'autre équipe. */
  @Post('changer') @HttpCode(200) @ApiOkResponse({ type: SessionAuthDto })
  changer(@ActeurCourant() a: Acteur, @Body() dto: D.ChangerEquipeDto, @Req() req: Request) {
    return this.auth.changerEquipe(a, dto.organisation_id, { appareil: String(req.headers['user-agent'] ?? ''), ip: req.ip ?? '' });
  }

  @Get('courante/membres') @ApiOkResponse({ type: [D.MembreEquipeDto] }) membres(@ActeurCourant() a: Acteur) { return this.s.membres(a); }
  @Post('courante/membres') @ApiCreatedResponse({ type: D.InvitationDto }) inviter(@ActeurCourant() a: Acteur, @Body() dto: D.InviterDto) { return this.s.inviter(a, dto); }
  @Patch('courante/membres/:id') @ApiOkResponse({ type: D.MembreEquipeDto })
  majMembre(@ActeurCourant() a: Acteur, @Param('id', ParseUUIDPipe) id: string, @Body() dto: D.MajMembreDto) { return this.s.majMembre(a, id, dto); }
}

@ApiTags('projets') @ApiBearerAuth()
@Controller('projets')
export class ProjetsAdminController {
  constructor(private readonly s: EquipesService) {}

  @Post() @ApiCreatedResponse({ type: D.ProjetCreeDto }) creer(@ActeurCourant() a: Acteur, @Body() dto: D.CreerProjetDto) { return this.s.creerProjet(a, dto); }

  @Get(':code/membres') @ApiOkResponse({ type: [D.MembreProjetDto] }) membres(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.s.membresProjet(a, code); }
  @Put(':code/membres') @Roles(...HUMAINS) @ApiOkResponse({ type: [D.MembreProjetDto] })
  definir(@ActeurCourant() a: Acteur, @Param('code') code: string, @Body() dto: D.DefinirMembreProjetDto) { return this.s.definirMembreProjet(a, code, dto.utilisateur_id, dto.role); }
  @Delete(':code/membres/:id') @Roles(...HUMAINS) @ApiOkResponse({ type: [D.MembreProjetDto] })
  retirer(@ActeurCourant() a: Acteur, @Param('code') code: string, @Param('id', ParseUUIDPipe) id: string) { return this.s.retirerMembreProjet(a, code, id); }
}
