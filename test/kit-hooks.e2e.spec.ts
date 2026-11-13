import request from 'supertest';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { creerApp, creerOrg, creerUtilisateur } from './outils';
import { seedCatalogue, KIT_V1 } from '../src/db/seed/catalogue';
import { ImportKitService } from '../src/import/import-kit.service';
import { MembreProjet } from '../src/db/entities';

const HOOK = join(__dirname, '..', 'claude-kit', 'hooks', 'pilotage.mjs');
const INSTALLEUR = join(__dirname, '..', 'claude-kit', 'installer.mjs');

describe('Kit Claude Code v2 : hooks, file d’attente hors ligne, installeur', () => {
  let app: INestApplication; let db: DataSource; let url: string; let jeton: string; let projetId: string;
  let repo: string; let local: string;
  const HORS_LIGNE = 'http://127.0.0.1:9'; // port fermé : connexion refusée
  // Asynchrone : l'API tourne dans ce même processus et doit pouvoir répondre pendant le hook.
  const hook = (evt: string, entree: object, api: string) => new Promise<string>((ok, ko) => {
    const p = execFile('node', [HOOK, evt], { encoding: 'utf8', env: { ...process.env, PILOTAGE_TOKEN: jeton, PILOTAGE_API: api, PILOTAGE_DOSSIER: local, CLAUDE_PROJECT_DIR: repo } },
      (err, stdout) => (err ? ko(err) : ok(stdout)));
    p.stdin!.end(JSON.stringify(entree));
  });
  const nbEnBase = async () => Number((await db.query('SELECT count(*) n FROM evenement_journal WHERE projet_id = $1 AND session_externe = $2', [projetId, 'sess-hor']))[0].n);
  const file = () => (existsSync(join(local, 'file-attente.jsonl')) ? readFileSync(join(local, 'file-attente.jsonl'), 'utf8').split('\n').filter(Boolean) : []);

  beforeAll(async () => {
    ({ app, db } = await creerApp());
    await app.listen(0);
    url = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const org = await creerOrg(db, 'principale');
    const admin = await creerUtilisateur(db, org, 'admin@exemple.ci', 'admin');
    const dev = await creerUtilisateur(db, org, 'dev@exemple.ci', 'developpeur');
    await seedCatalogue(db.manager, org.id);
    const { projet } = await app.get(ImportKitService).importerDossier({ utilisateur_id: admin.id, organisation_id: org.id, nom: 'admin', role: 'admin', auteur_type: 'humain' }, join(KIT_V1, 'projets', 'exemple-declarations'));
    projetId = projet.id;
    await db.getRepository(MembreProjet).save({ organisation_id: org.id, projet_id: projet.id, utilisateur_id: dev.id, role: 'developpeur' });
    const cnx = (await request(url).post('/api/v1/auth/connexion').send({ email: 'admin@exemple.ci', mot_de_passe: 'mdp' })).body.jeton_acces;
    jeton = (await request(url).post('/api/v1/jetons').set('Authorization', `Bearer ${cnx}`).send({ utilisateur_id: dev.id, nom: 'poste', projets: [projet.id] })).body.jeton;

    repo = mkdtempSync(join(tmpdir(), 'depot-'));
    local = mkdtempSync(join(tmpdir(), 'pilotage-local-'));
    execFileSync('git', ['init', '-q', repo]);
    execFileSync('node', [INSTALLEUR, '--repo', repo, '--api', url, '--projet', 'exemple-declarations', '--depot', 'backend'], { encoding: 'utf8' });
  });
  afterAll(() => app.close());

  it('installeur : hooks, agent, commandes, CLAUDE.md, .mcp.json sans jeton', () => {
    const settings = JSON.parse(readFileSync(join(repo, '.claude', 'settings.json'), 'utf8'));
    expect(Object.keys(settings.hooks)).toEqual(['SessionStart', 'PostToolUse', 'Stop']);
    const mcp = readFileSync(join(repo, '.mcp.json'), 'utf8');
    expect(JSON.parse(mcp).mcpServers.pilotage).toEqual({ type: 'http', url: `${url}/mcp`, headers: { Authorization: 'Bearer ${PILOTAGE_TOKEN}' } });
    expect(mcp).not.toContain('plt_');
    expect(existsSync(join(repo, '.claude', 'agents', 'documentaliste.md'))).toBe(true);
    expect(existsSync(join(repo, '.claude', 'commands', 'fin-session.md'))).toBe(true);
    expect(readFileSync(join(repo, 'CLAUDE.md'), 'utf8')).toContain('<!-- pilotage:debut');
    // Réinstallation idempotente.
    execFileSync('node', [INSTALLEUR, '--repo', repo], { encoding: 'utf8' });
    expect(JSON.parse(readFileSync(join(repo, '.claude', 'settings.json'), 'utf8')).hooks.PostToolUse).toHaveLength(1);
  });

  it('critère phase 1 : réseau coupé, 10 modifications, réseau rétabli → 10 événements, aucun doublon', async () => {
    for (let i = 0; i < 10; i++) await hook('journal', { session_id: 'sess-hors-ligne', tool_name: 'Edit', tool_input: { file_path: join(repo, `src/f${i}.ts`) } }, HORS_LIGNE);
    expect(file()).toHaveLength(10);
    expect(await nbEnBase()).toBe(0);

    // Réseau rétabli : le prochain appel réussi vide la file.
    expect(await hook('envoyer', {}, url)).toContain('10 événement(s) envoyé(s)');
    expect(file()).toHaveLength(0);
    expect(await nbEnBase()).toBe(10);

    // Renvoi des mêmes événements (accusé de réception perdu) : toujours 10.
    const ev = await db.query('SELECT cle_idempotence FROM evenement_journal WHERE session_externe = $1', ['sess-hor']);
    for (const e of ev) appendFileSync(join(local, 'file-attente.jsonl'), JSON.stringify({ cle_idempotence: e.cle_idempotence, projet: 'exemple-declarations', depot: 'backend', ts: new Date().toISOString(), evt: 'modification' }) + '\n');
    await hook('envoyer', {}, url);
    expect(await nbEnBase()).toBe(10);
  });

  it('masque les secrets et rattache les fonctionnalités', async () => {
    await hook('journal', { session_id: 'sess-secret', tool_name: 'Bash', tool_input: { command: 'curl -H "Authorization: Bearer abc123" https://x.ci --token=SECRET99 [F-003]' } }, url);
    const [e] = await db.query("SELECT commande, fonctionnalites FROM evenement_journal WHERE session_externe = 'sess-sec'");
    expect(e.commande).not.toContain('SECRET99');
    expect(e.commande).not.toContain('abc123');
    expect(e.fonctionnalites).toEqual(['F-003']);
  });

  it('début de session : état injecté, session créée ; hors ligne → cache', async () => {
    const t = await hook('debut-session', { session_id: 'sess-debut' }, url);
    expect(t).toContain('[Pilotage] Ce dépôt est le dépôt « backend »');
    expect(t).toMatch(/Session Pilotage : [0-9a-f-]{36}/);
    expect(t).toContain('# État du projet');
    const h = await hook('debut-session', { session_id: 'sess-debut-2' }, HORS_LIGNE);
    expect(h).toContain('HORS LIGNE');
    expect(h).toContain('# État du projet');
  });

  it('fin de tour : rappel du documentaliste une seule fois après 8 modifications', async () => {
    await hook('debut-session', { session_id: 'sess-stop' }, url); // seuil_rappel_doc = 8 depuis l'API
    for (let i = 0; i < 8; i++) await hook('journal', { session_id: 'sess-stop', tool_name: 'Edit', tool_input: { file_path: join(repo, 'a.ts') } }, HORS_LIGNE);
    const r = JSON.parse(await hook('fin-tour', { session_id: 'sess-stop' }, HORS_LIGNE));
    expect(r.decision).toBe('block');
    expect(r.reason).toContain('documentaliste');
    expect(await hook('fin-tour', { session_id: 'sess-stop' }, HORS_LIGNE)).toBe('');
  });

  it('ne bloque jamais : sans configuration ni jeton, sortie silencieuse', () => {
    const vide = mkdtempSync(join(tmpdir(), 'vide-'));
    expect(execFileSync('node', [HOOK, 'journal'], { input: '{}', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: vide, PILOTAGE_DOSSIER: local } })).toBe('');
  });
});
