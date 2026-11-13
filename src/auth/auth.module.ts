import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JetonApi, JetonRafraichissement, Utilisateur } from '../db/entities';
import { AuthController, CompteController, ConfigController, JetonsController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService, VERIFICATEUR_GOOGLE, VerificateurGoogleOfficiel } from './auth.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Utilisateur, JetonApi, JetonRafraichissement]),
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || (process.env.NODE_ENV === 'production' && secret.length < 32)) throw new Error('JWT_SECRET manquant ou trop court.');
        return { secret, signOptions: { expiresIn: '15m' } };
      },
    }),
  ],
  controllers: [AuthController, JetonsController, CompteController, ConfigController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }, { provide: VERIFICATEUR_GOOGLE, useClass: VerificateurGoogleOfficiel }],
  exports: [AuthService],
})
export class AuthModule {}
