import { Body, Controller, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import * as E from '../db/entities';
import { Acteur, ActeurCourant } from '../common/acteur';
import { EcritureService } from './ecriture.service';
import { GestionService } from './gestion.service';
import * as D from './gestion.dto';

/** Saisie complète depuis l'interface (phase 2) : cadrage, fonctionnalités, recette, registres, comptes rendus, documents. */
@ApiTags('saisie') @ApiBearerAuth()
@Controller('projets/:code')
export class GestionController {
  constructor(private readonly e: EcritureService, private readonly g: GestionService) {}

  @Post('fonctionnalites') @ApiCreatedResponse({ type: E.Fonctionnalite })
  creerFonctionnalite(@ActeurCourant() a: Acteur, @Param('code') c: string, @Body() d: D.CreerFonctionnaliteDto) { return this.e.creerFonctionnalite(a, c, d); }
  @Patch('fonctionnalites/:ref') @ApiOkResponse({ type: E.Fonctionnalite })
  majFonctionnalite(@ActeurCourant() a: Acteur, @Param('code') c: string, @Param('ref') r: string, @Body() d: D.ModifierFonctionnaliteDto) { return this.g.majFonctionnalite(a, c, r, d); }

  @Post('exigences') @ApiCreatedResponse({ type: E.Exigence })
  creerExigence(@ActeurCourant() a: Acteur, @Param('code') c: string, @Body() d: D.ExigenceDto) { return this.g.creerExigence(a, c, d); }
  @Patch('exigences/:ref') @ApiOkResponse({ type: E.Exigence })
  majExigence(@ActeurCourant() a: Acteur, @Param('code') c: string, @Param('ref') r: string, @Body() d: D.ModifierExigenceDto) { return this.g.majExigence(a, c, r, d); }

  @Post('jalons') @ApiCreatedResponse({ type: E.Jalon })
  creerJalon(@ActeurCourant() a: Acteur, @Param('code') c: string, @Body() d: D.JalonDto) { return this.g.creerJalon(a, c, d); }
  @Patch('jalons/:ref') @ApiOkResponse({ type: E.Jalon })
  majJalon(@ActeurCourant() a: Acteur, @Param('code') c: string, @Param('ref') r: string, @Body() d: D.ModifierJalonDto) { return this.g.majJalon(a, c, r, d); }

  @Post('risques') @ApiCreatedResponse({ type: E.Risque })
  creerRisque(@ActeurCourant() a: Acteur, @Param('code') c: string, @Body() d: D.RisqueDto) { return this.e.ajouterRisque(a, c, d); }
  @Patch('risques/:ref') @ApiOkResponse({ type: E.Risque })
  majRisque(@ActeurCourant() a: Acteur, @Param('code') c: string, @Param('ref') r: string, @Body() d: D.ModifierRisqueDto) { return this.g.majRisque(a, c, r, d); }

  @Post('retours') @ApiCreatedResponse({ type: E.RetourClient })
  creerRetour(@ActeurCourant() a: Acteur, @Param('code') c: string, @Body() d: D.RetourDto) { return this.e.creerRetour(a, c, d); }
  @Patch('retours/:ref') @ApiOkResponse({ type: E.RetourClient })
  majRetour(@ActeurCourant() a: Acteur, @Param('code') c: string, @Param('ref') r: string, @Body() d: D.ModifierRetourDto) { return this.g.majRetour(a, c, r, d); }

  @Post('changements') @ApiCreatedResponse({ type: E.Changement })
  proposerChangement(@ActeurCourant() a: Acteur, @Param('code') c: string, @Body() d: D.ChangementDto) { return this.e.proposerChangement(a, c, d); }
  @Patch('changements/:ref/decision') @ApiOkResponse({ type: E.Changement })
  decider(@ActeurCourant() a: Acteur, @Param('code') c: string, @Param('ref') r: string, @Body() d: D.DecisionChangementDto) { return this.g.deciderChangement(a, c, r, d); }

  @Post('cas-test') @ApiCreatedResponse({ type: E.CasTest })
  creerCasTest(@ActeurCourant() a: Acteur, @Param('code') c: string, @Body() d: D.CasTestDto) { return this.e.creerCasTest(a, c, d); }
  @Put('campagnes/:ref/resultats') @ApiOkResponse({ type: D.BilanCampagneDto })
  resultats(@ActeurCourant() a: Acteur, @Param('code') c: string, @Param('ref') r: string, @Body() d: D.ResultatsCampagneDto) { return this.e.enregistrerResultats(a, c, { ...d, campagne: r }); }

  @Post('reunions') @ApiCreatedResponse({ type: D.CompteRenduCreeDto })
  compteRendu(@ActeurCourant() a: Acteur, @Param('code') c: string, @Body() d: D.CompteRenduDto) { return this.e.creerCompteRendu(a, c, d); }

  @Put('documents/:doc/contenu') @ApiOkResponse({ type: Object })
  ecrireDocument(@ActeurCourant() a: Acteur, @Param('code') c: string, @Param('doc') doc: string, @Body() d: D.ContenuDocumentDto) {
    return this.e.ecrireDocument(a, c, doc, d.contenu_md, d.resume_modif, { statut: d.statut });
  }
}
