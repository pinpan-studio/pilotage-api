// Protection du tableau de bord par identifiant / mot de passe (Basic Auth).
// À configurer dans Vercel > Project > Settings > Environment Variables :
//   PILOTAGE_UTILISATEUR   ex. "equipe"
//   PILOTAGE_MOT_DE_PASSE  un mot de passe long
// Si les variables ne sont pas définies, l'accès est REFUSÉ (sécurité par défaut).
import { next } from '@vercel/functions';

export const config = {
  matcher: '/:path*',
};

function refuser(message) {
  return new Response(message, {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Pilotage", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

// Comparaison en temps constant pour éviter les attaques temporelles.
function egal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default function middleware(request) {
  const utilisateur = process.env.PILOTAGE_UTILISATEUR;
  const motDePasse = process.env.PILOTAGE_MOT_DE_PASSE;
  if (!utilisateur || !motDePasse) {
    return refuser('Tableau de bord non configuré : définir PILOTAGE_UTILISATEUR et PILOTAGE_MOT_DE_PASSE dans Vercel.');
  }

  const entete = request.headers.get('authorization') || '';
  if (entete.startsWith('Basic ')) {
    let decode = '';
    try {
      decode = atob(entete.slice(6));
    } catch {
      return refuser('Authentification invalide.');
    }
    const i = decode.indexOf(':');
    const u = decode.slice(0, i);
    const p = decode.slice(i + 1);
    if (i > 0 && egal(u, utilisateur) && egal(p, motDePasse)) {
      return next({ headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store' } });
    }
  }
  return refuser('Authentification requise.');
}
