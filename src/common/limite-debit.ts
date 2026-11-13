import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';

/**
 * Limitation de débit simple (fenêtre glissante d'une minute, en mémoire) pour /mcp et /api/v1/journal.
 * Clé : empreinte de l'en-tête Authorization (sinon adresse IP). Suffisant pour une seule instance.
 */
@Injectable()
export class LimiteDebitMiddleware implements NestMiddleware {
  private readonly compteurs = new Map<string, number[]>();
  private readonly max = Number(process.env.LIMITE_REQUETES_MINUTE ?? 600);

  use(req: Request, _res: Response, next: NextFunction) {
    const auth = req.headers.authorization ?? '';
    const cle = auth ? createHash('sha256').update(auth).digest('hex').slice(0, 16) : `ip:${req.ip}`;
    const maintenant = Date.now();
    const l = (this.compteurs.get(cle) ?? []).filter((t) => maintenant - t < 60_000);
    if (l.length >= this.max) throw new HttpException('Trop de requêtes : réessayez dans une minute.', HttpStatus.TOO_MANY_REQUESTS);
    l.push(maintenant);
    this.compteurs.set(cle, l);
    if (this.compteurs.size > 10_000) this.compteurs.clear();
    next();
  }
}
