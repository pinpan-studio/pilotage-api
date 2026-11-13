import { Controller, Get, Param, Query, Post, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiQuery, ApiTags, ApiCreatedResponse } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, isAbsolute } from 'node:path';
import AdmZip from 'adm-zip';
import * as E from '../db/entities';
import { Acteur, ActeurCourant, Roles } from '../common/acteur';
import { LectureService } from './lecture.service';
import { referentiels } from './referentiels';
import { ImportKitService } from '../import/import-kit.service';
import * as V from './vues.dto';
import { CampagneDetailDto, CatalogueDto, DocTechniqueDto, RetourDetailDto, TexteDto } from './lecture.dto';

@ApiTags('référentiels') @ApiBearerAuth()
@Controller()
export class ReferentielsController {
  constructor(private readonly l: LectureService) {}

  @Get('referentiels') @ApiOkResponse({ type: V.ReferentielsDto })
  async referentiels(@ActeurCourant() a: Acteur) { return referentiels(await this.l.phases(a.organisation_id)); }

  @Get('catalogue') @ApiOkResponse({ type: () => CatalogueDto })
  catalogue(@ActeurCourant() a: Acteur) { return this.l.catalogue(a); }

  @Get('modeles/:code') @ApiOkResponse({ type: E.ModeleDocument })
  modele(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.modele(a, code); }
}


@ApiTags('projets') @ApiBearerAuth()
@Controller('projets')
export class ProjetsController {
  constructor(private readonly l: LectureService) {}

  @Get() @ApiOkResponse({ type: [V.ProjetResumeDto], description: 'Portefeuille : projets accessibles et indicateurs clés.' })
  portefeuille(@ActeurCourant() a: Acteur) { return this.l.portefeuille(a); }

  @Get(':code') @ApiOkResponse({ type: V.ProjetDetailDto })
  detail(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.detail(a, code); }

  @Get(':code/tdr') @ApiOkResponse({ type: TexteDto })
  tdr(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.tdr(a, code); }

  @Get(':code/indicateurs') @ApiOkResponse({ type: V.IndicateursDto })
  @ApiQuery({ name: 'date', required: false, description: 'Date de calcul AAAA-MM-JJ (défaut : aujourd’hui, Africa/Abidjan).' })
  indicateurs(@ActeurCourant() a: Acteur, @Param('code') code: string, @Query('date') date?: string) {
    return this.l.indicateurs(a, code, /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date : undefined);
  }

  @Get(':code/alertes') @ApiOkResponse({ type: [V.AlerteDto] })
  async alertes(@ActeurCourant() a: Acteur, @Param('code') code: string) { return (await this.l.indicateurs(a, code)).alertes; }

  @Get(':code/fonctionnalites') @ApiOkResponse({ type: [V.FonctionnaliteDto] })
  @ApiQuery({ name: 'statut', required: false }) @ApiQuery({ name: 'depot', required: false }) @ApiQuery({ name: 'lot', required: false })
  fonctionnalites(@ActeurCourant() a: Acteur, @Param('code') code: string, @Query('statut') statut?: string, @Query('depot') depot?: string, @Query('lot') lot?: string) {
    return this.l.fonctionnalites(a, code, { statut, depot, lot });
  }

  @Get(':code/fonctionnalites/:ref') @ApiOkResponse({ type: V.FonctionnaliteDetailDto })
  fonctionnalite(@ActeurCourant() a: Acteur, @Param('code') code: string, @Param('ref') ref: string) { return this.l.fonctionnalite(a, code, ref); }

  @Get(':code/tracabilite') @ApiOkResponse({ type: V.TracabiliteDto })
  tracabilite(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.tracabilite(a, code); }

  @Get(':code/exigences') @ApiOkResponse({ type: [E.Exigence] })
  exigences(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.registre(a, code, E.Exigence, { ordre: 'ASC', ref: 'ASC' }); }

  @Get(':code/cas-test') @ApiOkResponse({ type: [E.CasTest] })
  casTest(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.registre(a, code, E.CasTest, { ordre: 'ASC', ref: 'ASC' }); }

  @Get(':code/campagnes') @ApiOkResponse({ type: [E.Campagne] })
  campagnes(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.registre(a, code, E.Campagne, { date: 'ASC', ref: 'ASC' }); }

  @Get(':code/campagnes/:ref') @ApiOkResponse({ type: CampagneDetailDto })
  campagne(@ActeurCourant() a: Acteur, @Param('code') code: string, @Param('ref') ref: string) { return this.l.campagne(a, code, ref); }

  @Get(':code/retours') @ApiOkResponse({ type: [E.RetourClient] })
  retours(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.registre(a, code, E.RetourClient, { date: 'DESC', ref: 'ASC' }); }

  @Get(':code/retours/:ref') @ApiOkResponse({ type: RetourDetailDto })
  retour(@ActeurCourant() a: Acteur, @Param('code') code: string, @Param('ref') ref: string) { return this.l.retour(a, code, ref); }

  @Get(':code/documents') @ApiOkResponse({ type: [V.DocumentDto] })
  @ApiQuery({ name: 'phase', required: false }) @ApiQuery({ name: 'statut', required: false })
  documents(@ActeurCourant() a: Acteur, @Param('code') code: string, @Query('phase') phase?: string, @Query('statut') statut?: string) {
    return this.l.documents(a, code, { phase, statut });
  }

  @Get(':code/documents/:doc') @ApiOkResponse({ type: V.DocumentDetailDto })
  @ApiQuery({ name: 'version', required: false })
  document(@ActeurCourant() a: Acteur, @Param('code') code: string, @Param('doc') doc: string, @Query('version') version?: string) {
    return this.l.document(a, code, doc, version);
  }

  @Get(':code/jalons') @ApiOkResponse({ type: [E.Jalon] })
  jalons(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.registre(a, code, E.Jalon, { ordre: 'ASC' }); }

  @Get(':code/risques') @ApiOkResponse({ type: [E.Risque] })
  risques(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.registre(a, code, E.Risque, { ref: 'ASC' }); }

  @Get(':code/actions') @ApiOkResponse({ type: [E.Action] })
  actions(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.registre(a, code, E.Action, { ref: 'ASC' }); }

  @Get(':code/changements') @ApiOkResponse({ type: [E.Changement] })
  changements(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.registre(a, code, E.Changement, { ref: 'ASC' }); }

  @Get(':code/reunions') @ApiOkResponse({ type: [E.Reunion] })
  reunions(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.registre(a, code, E.Reunion, { date: 'DESC' }); }

  @Get(':code/parties-prenantes') @ApiOkResponse({ type: [E.PartiePrenante] })
  partiesPrenantes(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.registre(a, code, E.PartiePrenante, { cree_le: 'ASC' }); }

  @Get(':code/adr') @ApiOkResponse({ type: [E.Adr] })
  adr(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.registre(a, code, E.Adr, { ref: 'ASC' }); }

  @Get(':code/changelog') @ApiOkResponse({ type: [E.ChangelogEntree] })
  changelog(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.registre(a, code, E.ChangelogEntree, { ordre: 'ASC' }); }

  @Get(':code/doc-technique') @ApiOkResponse({ type: [DocTechniqueDto] })
  @ApiQuery({ name: 'depot', required: false }) @ApiQuery({ name: 'chemin', required: false })
  docTechnique(@ActeurCourant() a: Acteur, @Param('code') code: string, @Query('depot') depot?: string, @Query('chemin') chemin?: string) {
    return this.l.docTechnique(a, code, { depot, chemin });
  }

  @Get(':code/sessions') @ApiOkResponse({ type: [V.SessionDto] })
  sessions(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.l.sessions(a, code); }

  @Get(':code/journal') @ApiOkResponse({ type: V.PageEvenementsDto })
  @ApiQuery({ name: 'depot', required: false }) @ApiQuery({ name: 'auteur', required: false }) @ApiQuery({ name: 'evt', required: false })
  @ApiQuery({ name: 'fonctionnalite', required: false }) @ApiQuery({ name: 'depuis', required: false }) @ApiQuery({ name: 'jusqua', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number }) @ApiQuery({ name: 'par_page', required: false, type: Number })
  journal(@ActeurCourant() a: Acteur, @Param('code') code: string, @Query() q: Record<string, string>) {
    return this.l.journal(a, code, { ...q, page: Number(q.page) || 1, par_page: Number(q.par_page) || 50 });
  }
}


@ApiTags('administration') @ApiBearerAuth()
@Controller('import')
export class ImportController {
  constructor(private readonly imp: ImportKitService) {}

  /** Importe une archive .zip d'un dossier projets/<code> du kit v1. */
  @Post('kit-v1') @Roles('admin')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { archive: { type: 'string', format: 'binary' } }, required: ['archive'] } })
  @ApiCreatedResponse({ type: V.ImportBilanDto })
  @UseInterceptors(FileInterceptor('archive', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async importer(@ActeurCourant() a: Acteur, @UploadedFile() f?: Express.Multer.File) {
    if (!f) throw new BadRequestException('Invalide : archive .zip manquante (champ « archive »).');
    const tmp = mkdtempSync(join(tmpdir(), 'import-kit-'));
    try {
      let zip: AdmZip;
      try { zip = new AdmZip(f.buffer); } catch { throw new BadRequestException('Invalide : le fichier n’est pas une archive .zip lisible.'); }
      for (const e of zip.getEntries()) {
        const rel = normalize(e.entryName);
        if (isAbsolute(rel) || rel.startsWith('..') || e.isDirectory) continue; // protection « zip slip »
        mkdirSync(dirname(join(tmp, rel)), { recursive: true });
        writeFileSync(join(tmp, rel), e.getData());
      }
      const dir = trouverProjet(tmp);
      if (!dir) throw new BadRequestException('Invalide : aucun projet.yaml trouvé dans l’archive.');
      return await this.imp.importerDossier(a, dir);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

function trouverProjet(dir: string, profondeur = 0): string | null {
  if (existsSync(join(dir, 'projet.yaml'))) return dir;
  if (profondeur > 3) return null;
  for (const n of readdirSync(dir)) {
    const c = join(dir, n);
    if (statSync(c).isDirectory() && !n.startsWith('.')) { const r = trouverProjet(c, profondeur + 1); if (r) return r; }
  }
  return null;
}
