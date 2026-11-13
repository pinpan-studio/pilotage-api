import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { diffLines } from 'diff';
import { Acteur, ActeurCourant } from '../common/acteur';
import { LectureService } from '../lecture/lecture.service';
import { introuvable } from '../common/erreurs';
import { versDocx, versPdf } from './rendu';
import { DiffDocumentDto } from './export.dto';

const LIBELLES: Record<string, string> = { a_produire: 'À produire', en_cours: 'En cours', en_revue: 'En revue', valide: 'Validé', signe: 'Signé', sans_objet: 'Sans objet' };

@ApiTags('livrables') @ApiBearerAuth()
@Controller('projets/:code/documents/:doc')
export class ExportController {
  constructor(private readonly lecture: LectureService) {}

  /** Export d'un livrable (version courante ou `version`) en Word ou PDF, avec page de garde et pagination. */
  @Get('export') @ApiQuery({ name: 'format', enum: ['docx', 'pdf'] }) @ApiQuery({ name: 'version', required: false })
  @ApiProduces('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async exporter(@ActeurCourant() a: Acteur, @Param('code') code: string, @Param('doc') doc: string, @Query('format') format: string, @Query('version') version: string | undefined, @Res() res: Response) {
    if (!['docx', 'pdf'].includes(format)) throw new BadRequestException('Invalide : format attendu « docx » ou « pdf ».');
    const [p, d] = await Promise.all([this.lecture.detail(a, code), this.lecture.document(a, code, doc, version || undefined)]);
    const v = d.version_courante;
    if (!v) throw introuvable(`contenu du document ${doc} (aucune version rédigée)`);
    const entete = { projet: p.nom, client: p.client, code: d.code, titre: d.titre, version: v.numero, statut: LIBELLES[d.statut] ?? d.statut,
      date: new Date(v.cree_le).toLocaleDateString('fr-FR'), auteur: v.auteur || undefined };
    const contenu = format === 'pdf' ? await versPdf(entete, v.contenu) : await versDocx(entete, v.contenu);
    const nom = `${p.code}-${d.code}-v${v.numero}.${format}`;
    res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(contenu);
  }

  /** Comparaison de deux versions (par défaut : l'avant-dernière et la dernière). */
  @Get('diff') @ApiQuery({ name: 'de', required: false }) @ApiQuery({ name: 'a', required: false }) @ApiOkResponse({ type: DiffDocumentDto })
  async diff(@ActeurCourant() act: Acteur, @Param('code') code: string, @Param('doc') doc: string, @Query('de') de?: string, @Query('a') vers?: string): Promise<DiffDocumentDto> {
    const d = await this.lecture.document(act, code, doc);
    const nums = d.versions.map((v) => v.numero);
    const cible = vers || nums[0]; const source = de || nums[nums.indexOf(cible) + 1];
    if (!cible || !source) throw introuvable(`deux versions à comparer pour ${doc}`);
    const [x, y] = await Promise.all([this.lecture.document(act, code, doc, source), this.lecture.document(act, code, doc, cible)]);
    const blocs = diffLines(x.version_courante!.contenu, y.version_courante!.contenu).map((c) => ({ type: (c.added ? 'ajout' : c.removed ? 'retrait' : 'commun') as 'ajout' | 'retrait' | 'commun', texte: c.value }));
    return { de: source, a: cible, ajouts: blocs.filter((b) => b.type === 'ajout').reduce((n, b) => n + b.texte.split('\n').filter(Boolean).length, 0),
      retraits: blocs.filter((b) => b.type === 'retrait').reduce((n, b) => n + b.texte.split('\n').filter(Boolean).length, 0), blocs };
  }
}
