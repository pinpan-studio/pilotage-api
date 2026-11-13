import request from 'supertest';
import { createHash, randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { creerApp, creerOrg, creerProjet, creerUtilisateur } from './outils';

/** OAuth 2.1 du MCP (connecteurs ChatGPT / claude.ai) : découverte, enregistrement, code + PKCE, MCP, rafraîchissement, révocation. */
describe('OAuth du serveur MCP', () => {
  let app: INestApplication; let db: DataSource; let http: any; let ctx: any;
  const REDIR = 'https://claude.ai/api/mcp/auth_callback';
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  beforeAll(async () => {
    ({ app, db } = await creerApp()); http = app.getHttpServer();
    const org = await creerOrg(db, 'o');
    const dev = await creerUtilisateur(db, org, 'dev@o.ci', 'developpeur');
    await creerUtilisateur(db, org, 'lect@o.ci', 'client_lecteur');
    const p = await creerProjet(db, org, 'proj', [[dev, 'developpeur']]);
    ctx = { dev, p };
  });
  afterAll(() => app.close());
  const cnx = async (email: string) => (await request(http).post('/api/v1/auth/connexion').send({ email, mot_de_passe: 'mdp' })).body.jeton_acces;
  const mcp = (jeton?: string) => { const r = request(http).post('/mcp').set('Accept', 'application/json, text/event-stream').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' }); return jeton ? r.set('Authorization', `Bearer ${jeton}`) : r; };

  it('découverte : 401 du MCP avec resource_metadata, puis métadonnées', async () => {
    const r = await mcp().expect(401);
    expect(r.headers['www-authenticate']).toMatch(/^Bearer resource_metadata="http:\/\/127\.0\.0\.1:\d+\/\.well-known\/oauth-protected-resource"$/);
    const pr = await request(http).get('/.well-known/oauth-protected-resource').expect(200);
    expect(pr.body.resource).toMatch(/\/mcp$/);
    await request(http).get('/.well-known/oauth-protected-resource/mcp').expect(200);
    const as = await request(http).get('/.well-known/oauth-authorization-server').expect(200);
    expect(as.body).toMatchObject({ code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] });
    expect(as.body.registration_endpoint).toMatch(/\/oauth\/register$/);
  });

  it('parcours complet : enregistrement, consentement, jeton, appel MCP, rafraîchissement, révocation', async () => {
    await request(http).post('/oauth/register').send({ client_name: 'x', redirect_uris: ['javascript:alert(1)'] }).expect(400);
    const reg = await request(http).post('/oauth/register').send({ client_name: 'Claude', redirect_uris: [REDIR] }).expect(201);
    const client_id = reg.body.client_id;
    const az = await request(http).get('/oauth/authorize').query({ response_type: 'code', client_id, redirect_uri: REDIR, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz' }).expect(302);
    expect(az.headers.location).toMatch(/\/autoriser\?client_id=/);
    await request(http).get('/oauth/authorize').query({ response_type: 'code', client_id, redirect_uri: 'https://pirate.example/cb', code_challenge: challenge }).expect(400);
    const jwtDev = await cnx('dev@o.ci');
    expect((await request(http).get(`/api/v1/oauth/clients/${client_id}`).set('Authorization', `Bearer ${jwtDev}`).expect(200)).body.nom).toBe('Claude');
    await request(http).post('/api/v1/oauth/approuver').set('Authorization', `Bearer ${jwtDev}`).send({ client_id, redirect_uri: REDIR, code_challenge: challenge, role: 'admin' }).expect(400);
    const ap = await request(http).post('/api/v1/oauth/approuver').set('Authorization', `Bearer ${jwtDev}`).send({ client_id, redirect_uri: REDIR, code_challenge: challenge, state: 'xyz', role: 'developpeur' }).expect(200);
    const u = new URL(ap.body.redirection); expect(u.searchParams.get('state')).toBe('xyz');
    const code = u.searchParams.get('code')!;
    await request(http).post('/oauth/token').type('form').send({ grant_type: 'authorization_code', code, redirect_uri: REDIR, client_id, code_verifier: 'mauvais' }).expect(400);
    // Le code est consommé même après un échec (anti-rejeu) : on refait un consentement.
    const ap2 = await request(http).post('/api/v1/oauth/approuver').set('Authorization', `Bearer ${jwtDev}`).send({ client_id, redirect_uri: REDIR, code_challenge: challenge, role: 'developpeur' }).expect(200);
    const code2 = new URL(ap2.body.redirection).searchParams.get('code')!;
    const t = await request(http).post('/oauth/token').type('form').send({ grant_type: 'authorization_code', code: code2, redirect_uri: REDIR, client_id, code_verifier: verifier }).expect(200);
    expect(t.body).toMatchObject({ token_type: 'Bearer', scope: 'developpeur' }); expect(t.body.access_token).toMatch(/^plt_/);
    await request(http).post('/oauth/token').type('form').send({ grant_type: 'authorization_code', code: code2, redirect_uri: REDIR, client_id, code_verifier: verifier }).expect(400);
    const outils = await mcp(t.body.access_token).expect(200);
    expect(JSON.stringify(outils.body)).toContain('etat_projet');
    const moi = await request(http).get('/api/v1/auth/moi').set('Authorization', `Bearer ${t.body.access_token}`).expect(200);
    expect(moi.body).toMatchObject({ role: 'developpeur', auteur_type: 'agent' });
    // Rafraîchissement avec rotation : l'ancien jeton d'accès est révoqué.
    const t2 = await request(http).post('/oauth/token').send({ grant_type: 'refresh_token', refresh_token: t.body.refresh_token, client_id }).expect(200);
    await mcp(t.body.access_token).expect(401);
    await mcp(t2.body.access_token).expect(200);
    await request(http).post('/oauth/token').send({ grant_type: 'refresh_token', refresh_token: t.body.refresh_token }).expect(400);
    // Révocation depuis Pilotage : plus d'accès, et le rafraîchissement est refusé.
    await db.query(`UPDATE jeton_api SET revoque_le = now() WHERE nom = 'OAuth · Claude' AND revoque_le IS NULL`);
    await mcp(t2.body.access_token).expect(401);
    await request(http).post('/oauth/token').send({ grant_type: 'refresh_token', refresh_token: t2.body.refresh_token }).expect(400);
  });

  it('un lecteur peut autoriser un accès en lecture, pas « agent »', async () => {
    const reg = await request(http).post('/oauth/register').send({ client_name: 'ChatGPT', redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'] }).expect(201);
    const j = await cnx('lect@o.ci');
    const b = { client_id: reg.body.client_id, redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect', code_challenge: challenge };
    await request(http).post('/api/v1/oauth/approuver').set('Authorization', `Bearer ${j}`).send({ ...b, role: 'agent' }).expect(400);
    await request(http).post('/api/v1/oauth/approuver').set('Authorization', `Bearer ${j}`).send({ ...b, role: 'client_lecteur' }).expect(200);
    const ref = await request(http).post('/api/v1/oauth/refuser').set('Authorization', `Bearer ${j}`).send({ ...b, state: 's' }).expect(200);
    expect(ref.body.redirection).toContain('error=access_denied');
  });
});
