import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as E from '../db/entities';
import { OAuthService } from './oauth.service';
import { OAuthConsentementController, OAuthPublicController } from './oauth.controller';

@Module({ imports: [TypeOrmModule.forFeature([E.OAuthClient, E.OAuthCode, E.OAuthRafraichissement, E.JetonApi, E.Utilisateur])], controllers: [OAuthPublicController, OAuthConsentementController], providers: [OAuthService] })
export class OAuthModule {}
