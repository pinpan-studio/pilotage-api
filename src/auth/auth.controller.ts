import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ConnexionDto, CreerJetonDto, RafraichirDto } from './auth.dto';
import { Acteur, ActeurCourant, Public, Roles } from '../common/acteur';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('connexion') @HttpCode(200)
  connexion(@Body() dto: ConnexionDto) { return this.auth.connexion(dto.email, dto.mot_de_passe); }

  /** Pas de domaine commun entre l'API et l'interface : le jeton de rafraîchissement circule dans le corps. */
  @Public() @Post('rafraichir') @HttpCode(200)
  rafraichir(@Body() dto: RafraichirDto) { return this.auth.rafraichir(dto.jeton_rafraichissement); }

  @Public() @Post('deconnexion') @HttpCode(204)
  async deconnexion(@Body() dto: RafraichirDto) { await this.auth.deconnexion(dto.jeton_rafraichissement); }

  @ApiBearerAuth() @Get('moi')
  moi(@ActeurCourant() a: Acteur) { return a; }
}

@ApiTags('administration') @ApiBearerAuth()
@Controller('jetons')
@Roles('admin')
export class JetonsController {
  constructor(private readonly auth: AuthService) {}
  @Get() lister(@ActeurCourant() a: Acteur) { return this.auth.listerJetons(a); }
  @Post() creer(@ActeurCourant() a: Acteur, @Body() dto: CreerJetonDto) { return this.auth.creerJetonApi(a, dto); }
  @Delete(':id') @HttpCode(204)
  async revoquer(@ActeurCourant() a: Acteur, @Param('id', ParseUUIDPipe) id: string) { await this.auth.revoquerJeton(a, id); }
}
