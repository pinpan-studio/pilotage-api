import { Body, Controller, Delete, HttpCode, Param, Patch, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
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

  @Put('tdr') @ApiOkResponse({ type: D.TdrDto })
  ecrireTdr(@ActeurCourant() a: Acteur, @Param('code') c: string, @Body() d: D.TdrDto) { return this.g.ecrireTdr(a, c, d.contenu); }
  @Patch('revision-perimetre') @ApiOkResponse({ type: D.RevisionResultatDto })
  revision(@ActeurCourant() a: Acteur, @Param('code') c: string, @Body() d: D.RevisionPerimetreDto) { return this.g.revisionPerimetre(a, c, d.ouverte); }

  @Post('parties-prenantes') @ApiCreatedResponse({ type: E.PartiePrenante })
  creerPp(@ActeurCourant() a: Acteur, @Param('code') c: string, @Body() d: D.PartiePrenanteDto) { return this.g.creerPartiePrenante(a, c, d); }
  @Patch('parties-prenantes/:id') @ApiOkResponse({ type: E.PartiePrenante })
  majPp(@ActeurCourant() a: Acteur, @Param('code') c: string, @Param('id') id: string, @Body() d: D.ModifierPartiePrenanteDto) { return this.g.majPartiePrenante(a, c, id, d); }

  @Patch('adr/:ref/statut') @ApiOkResponse({ type: E.Adr })
  statutAdr(@ActeurCourant() a: Acteur, @Param('code') c: string, @Param('ref') r: string, @Body() d: D.StatutAdrDto) { return this.g.statutAdr(a, c, r, d.statut); }

  /** Suppression logique (historisée), réservée aux humains ; fonctionnalités, exigences, jalons, changements, ADR : chef de projet. */
  @Delete(GestionService.TYPES_SUPPRIMABLES.map((t) => `${t}/:cle`)) @HttpCode(204)
  async supprimer(@ActeurCourant() a: Acteur, @Param('code') c: string, @Param('cle') k: string, @Req() req: Request) {
    const segs = req.path.split('/'); await this.g.supprimer(a, c, decodeURIComponent(segs[segs.length - 2]), k);
  }
}

/** Catalogue documentaire de l'équipe (administrateur). */
@ApiTags('saisie') @ApiBearerAuth()
@Controller()
export class CatalogueAdminController {
  constructor(private readonly g: GestionService) {}
  @Patch('catalogue/:code') @ApiOkResponse({ type: E.TypeDocument })
  majType(@ActeurCourant() a: Acteur, @Param('code') c: string, @Body() d: D.TypeDocumentMajDto) { return this.g.majTypeDocument(a, c, d); }
  @Put('modeles/:code') @ApiOkResponse({ type: E.ModeleDocument })
  modele(@ActeurCourant() a: Acteur, @Param('code') c: string, @Body() d: D.ModeleDto) { return this.g.ecrireModele(a, c, d.contenu); }
}
