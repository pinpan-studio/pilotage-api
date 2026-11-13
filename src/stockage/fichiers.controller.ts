import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import * as E from '../db/entities';
import { Acteur, ActeurCourant } from '../common/acteur';
import { EcritureService } from '../ecriture/ecriture.service';
import { DeposerFichierDto, StatutDocumentDto, StatutDocumentResultatDto } from './fichiers.dto';
import { FichiersService, TAILLE_MAX } from './fichiers.service';

@ApiTags('fichiers') @ApiBearerAuth()
@Controller('projets/:code')
export class FichiersController {
  constructor(private readonly fichiers: FichiersService, private readonly ecriture: EcritureService) {}

  @Post('fichiers') @ApiConsumes('multipart/form-data') @ApiBody({ type: DeposerFichierDto }) @ApiCreatedResponse({ type: E.Fichier })
  @UseInterceptors(FileInterceptor('fichier', { limits: { fileSize: TAILLE_MAX } }))
  deposer(@ActeurCourant() a: Acteur, @Param('code') code: string, @Body() dto: DeposerFichierDto, @UploadedFile() f?: Express.Multer.File) {
    if (!f) throw new BadRequestException('Invalide : fichier manquant (champ « fichier »).');
    return this.fichiers.deposer(a, code, { nom: Buffer.from(f.originalname, 'latin1').toString('utf8'), type: f.mimetype, contenu: f.buffer }, dto.categorie, dto.document);
  }

  @Get('fichiers') @ApiOkResponse({ type: [E.Fichier] })
  lister(@ActeurCourant() a: Acteur, @Param('code') code: string) { return this.fichiers.lister(a, code); }

  /** Téléchargement : le stockage est privé, le contenu transite par l'API après contrôle des droits. */
  @Get('fichiers/:id/contenu') @ApiProduces('application/octet-stream') @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async contenu(@ActeurCourant() a: Acteur, @Param('code') code: string, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { fichier, contenu } = await this.fichiers.lire(a, code, id);
    res.setHeader('Content-Type', contenu.type);
    res.setHeader('Content-Length', String(contenu.taille));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fichier.nom)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    contenu.flux.pipe(res);
  }

  @Delete('fichiers/:id') @HttpCode(204)
  async supprimer(@ActeurCourant() a: Acteur, @Param('code') code: string, @Param('id', ParseUUIDPipe) id: string) { await this.fichiers.supprimer(a, code, id); }

  /** Circuit de validation d'un document : valider et signer réservés au chef de projet ; signer exige un scan. */
  @Patch('documents/:doc/statut') @ApiOkResponse({ type: StatutDocumentResultatDto })
  statut(@ActeurCourant() a: Acteur, @Param('code') code: string, @Param('doc') doc: string, @Body() dto: StatutDocumentDto) {
    return this.ecriture.majStatutDocument(a, code, doc, dto.statut);
  }
}
