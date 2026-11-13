import type { IncomingMessage, ServerResponse } from 'node:http';
import { creerApplication } from './main';

/**
 * Point d'entrée de la fonction Vercel : l'application Nest est créée une seule fois par
 * instance puis réutilisée entre les appels (démarrage à froid uniquement au premier appel).
 */
let gestionnaire: Promise<(req: IncomingMessage, res: ServerResponse) => void> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  gestionnaire ??= creerApplication().then(async (app) => { await app.init(); return app.getHttpAdapter().getInstance(); });
  try {
    (await gestionnaire)(req, res);
  } catch (e) {
    gestionnaire = null;
    res.statusCode = 500;
    res.end(JSON.stringify({ message: 'Erreur de démarrage de l’API.' }));
    console.error(e);
  }
}
