import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { creerApp, creerOrg, creerUtilisateur } from './outils';
import { seedCatalogue } from '../src/db/seed/catalogue';

/** Phase 2 : saisie complète depuis l'interface, avec les droits de chaque rôle. */
describe('Saisie complète (REST) et droits', () => {
  let app: INestApplication; let db: DataSource; let http: any;
  let chef: string; let dev: string; let lecteur: string; let agent: string;
  const P = '/api/v1/projets/saisie';
  const cnx = async (email: string) => (await request(http).post('/api/v1/auth/connexion').send({ email, mot_de_passe: 'mdp' })).body.jeton_acces;
  const req = (j: string) => ({ post: (u: string, b: any) => request(http).post(P + u).set('Authorization', `Bearer ${j}`).send(b),
    patch: (u: string, b: any) => request(http).patch(P + u).set('Authorization', `Bearer ${j}`).send(b),
    put: (u: string, b: any) => request(http).put(P + u).set('Authorization', `Bearer ${j}`).send(b),
    get: (u: string) => request(http).get(P + u).set('Authorization', `Bearer ${j}`) });

  beforeAll(async () => {
    ({ app, db } = await creerApp()); http = app.getHttpServer();
    const org = await creerOrg(db, 's'); await seedCatalogue(db.manager, org.id);
    const uChef = await creerUtilisateur(db, org, 'chef@s.ci', 'chef_projet');
    const uDev = await creerUtilisateur(db, org, 'dev@s.ci', 'developpeur');
    const uLect = await creerUtilisateur(db, org, 'lect@s.ci', 'client_lecteur');
    chef = await cnx('chef@s.ci'); dev = await cnx('dev@s.ci'); lecteur = await cnx('lect@s.ci');
    await request(http).post('/api/v1/projets').set('Authorization', `Bearer ${chef}`).send({ code: 'saisie', nom: 'Projet saisie', depots: [{ nom: 'api' }, { nom: 'web' }] }).expect(201);
    for (const [u, role] of [[uDev, 'developpeur'], [uLect, 'client_lecteur']] as const)
      await request(http).put(`${P}/membres`).set('Authorization', `Bearer ${chef}`).send({ utilisateur_id: u.id, role }).expect((r) => expect(r.status).toBeLessThan(300));
    const uAdmin = await creerUtilisateur(db, org, 'admin@s.ci', 'admin');
    agent = (await request(http).post('/api/v1/jetons').set('Authorization', `Bearer ${await cnx('admin@s.ci')}`).send({ utilisateur_id: uDev.id, nom: 'agent' })).body.jeton;
    expect(uAdmin).toBeTruthy();
  });
  afterAll(() => app.close());

  it('cadrage : exigences réservées au chef de projet humain', async () => {
    const e = await req(chef).post('/exigences', { titre: 'Saisir une demande', priorite: 'must', section_tdr: '3.1' }).expect(201);
    expect(e.body.ref).toBe('EX-01');
    await req(dev).post('/exigences', { titre: 'Interdit' }).expect(403);
    await req(agent).post('/exigences', { titre: 'Interdit' }).expect(403);
    await req(chef).patch('/exigences/EX-01', { priorite: 'should' }).expect(200);
  });

  it('fonctionnalités : création avec description, modification, traçabilité, statut', async () => {
    const f = await req(dev).post('/fonctionnalites', { titre: 'Formulaire de demande', lot: 'Lot 1', poids: 5, depots: ['api', 'web'], exigences: ['EX-01'], description: '## Critères\n- champs obligatoires' }).expect(201);
    expect(f.body.ref).toBe('F-001');
    await req(dev).patch('/fonctionnalites/F-001', { poids: 4 }).expect(400);
    await req(dev).patch('/fonctionnalites/F-001', { titre: 'Formulaire de demande de congé', depots: ['api'] }).expect(200);
    const d = await req(dev).get('/fonctionnalites/F-001').expect(200);
    expect(d.body).toMatchObject({ titre: 'Formulaire de demande de congé', description: expect.stringContaining('Critères'), exigences: ['EX-01'] });
    expect(d.body.depots.map((x: any) => x.depot)).toEqual(['api']);
    await req(lecteur).post('/fonctionnalites', { titre: 'Interdit' }).expect(403);
  });

  it('recette : cas de test, campagne client saisie par un humain, passage en recette', async () => {
    const t = await req(dev).post('/cas-test', { titre: 'Demande valide', fonctionnalite: 'F-001', etapes: ['Remplir', 'Envoyer'], attendu: 'Demande créée' }).expect(201);
    await request(http).patch(`${P}/fonctionnalites/F-001/statut`).set('Authorization', `Bearer ${dev}`).send({ statut: 'recette' }).expect(403);
    const r = await req(chef).put('/campagnes/R1/resultats', { titre: 'Recette client', type: 'client', resultats: [{ cas_test: t.body.ref, resultat: 'ok' }] }).expect(200);
    expect(r.body.bilan.ok).toBe(1);
    await req(agent).put('/campagnes/R1/resultats', { resultats: [{ cas_test: t.body.ref, resultat: 'ko' }] }).expect(403);
    await request(http).patch(`${P}/fonctionnalites/F-001/statut`).set('Authorization', `Bearer ${dev}`).send({ statut: 'recette' }).expect(200);
    await request(http).patch(`${P}/fonctionnalites/F-001/statut`).set('Authorization', `Bearer ${dev}`).send({ statut: 'valide' }).expect(403);
    await request(http).patch(`${P}/fonctionnalites/F-001/statut`).set('Authorization', `Bearer ${chef}`).send({ statut: 'valide' }).expect(200);
  });

  it('registres : retour, risque, jalon, changement et décision du chef', async () => {
    const rc = await req(dev).post('/retours', { retour_md: 'Ajouter la demi-journée', type: 'evolution', fonctionnalites: ['F-001'] }).expect(201);
    const m = await req(dev).patch(`/retours/${rc.body.ref}`, { statut: 'resolu', analyse: 'Pertinent', action: 'Ajouté' }).expect(200);
    expect(m.body.date_resolution).toBeTruthy();
    const rq = await req(dev).post('/risques', { titre: 'Retard', probabilite: 3, impact: 3 }).expect(201);
    await req(dev).patch(`/risques/${rq.body.ref}`, { statut: 'clos', impact: 2 }).expect(200);
    await req(dev).patch(`/risques/${rq.body.ref}`, { impact: 9 }).expect(400);
    const j = await req(chef).post('/jalons', { nom: 'Recette Lot 1', date_prevue: '2027-01-15', documents: ['PV-RECETTE'] }).expect(201);
    expect(j.body.ref).toBe('J1');
    await req(dev).patch('/jalons/J1', { date_reelle: '2027-01-14' }).expect(200);
    expect((await req(dev).get('/jalons').expect(200)).body[0]).toMatchObject({ ref: 'J1' });
    const dc = await req(dev).post('/changements', { titre: 'Export Excel', fonctionnalites: ['F-001'] }).expect(201);
    await req(dev).patch(`/changements/${dc.body.ref}/decision`, { decision: 'accepte' }).expect(403);
    await req(agent).patch(`/changements/${dc.body.ref}/decision`, { decision: 'accepte' }).expect(403);
    const ok = await req(chef).patch(`/changements/${dc.body.ref}/decision`, { decision: 'accepte', avenant: 'Avenant n°1' }).expect(200);
    expect(ok.body).toMatchObject({ decision: 'accepte', avenant: 'Avenant n°1' });
    expect(ok.body.date_decision).toBeTruthy();
    // Une fonctionnalité peut alors être créée depuis cette demande acceptée.
    await req(agent).post('/fonctionnalites', { titre: 'Export Excel', origine: dc.body.ref }).expect(201);
  });

  it('compte rendu transactionnel et nouvelle version d’un document', async () => {
    const cr = await req(chef).post('/reunions', { date: '2026-11-20', type: 'comite', contenu_md: '# COPIL', decisions: ['Go Lot 1'],
      actions: [{ action: 'Envoyer le planning', echeance: '2026-11-27' }], risques: [{ titre: 'Disponibilité RH', probabilite: 2, impact: 2 }] }).expect(201);
    expect(cr.body.actions).toHaveLength(1);
    const v = await req(dev).put('/documents/SFD/contenu', { contenu_md: '# SFD', resume_modif: 'Première version', statut: 'en_revue' }).expect(200);
    expect(v.body).toBeTruthy();
    const docs = (await req(dev).get('/documents').expect(200)).body;
    expect(JSON.stringify(docs)).toContain('en_revue');
    await request(http).patch(`${P}/documents/SFD/statut`).set('Authorization', `Bearer ${dev}`).send({ statut: 'valide' }).expect(403);
    await request(http).patch(`${P}/documents/SFD/statut`).set('Authorization', `Bearer ${chef}`).send({ statut: 'valide' }).expect(200);
    expect((await req(dev).get('/documents/SFD').expect(200)).body.date_validation).toBeTruthy();
    const v2 = await req(dev).put('/documents/SFD/contenu', { contenu_md: '# SFD v2', resume_modif: 'Correction' }).expect(200);
    expect(v2.body).toMatchObject({ statut: 'en_revue', repasse_en_revue: true });
    expect((await req(dev).get('/documents/SFD').expect(200)).body.date_validation).toBeNull();
    await req(lecteur).put('/documents/SFD/contenu', { contenu_md: 'x', resume_modif: 'Interdit' }).expect(403);
  });

  it('export DOCX / PDF d’un livrable et comparaison de versions', async () => {
    const md = "# Spécifications\n\n## Règles métier\n\nUn **déclarant** peut *saisir* une déclaration — délai : `30 j`.\n\n- Étape 1\n- Étape 2\n  - sous-étape\n\n1. Premier\n2. Second\n\n| Rôle | Droits |\n|---|---|\n| Chef | Valide |\n| Lecteur | Lit |\n\n```ts\nconst x = 1;\n```\n\n> Remarque importante\n\n---\n\nFin → suite œuvre €";
    await req(dev).put('/documents/DAT/contenu', { contenu_md: '# DAT\n\nPremière version.', resume_modif: 'Initiale' }).expect(200);
    await req(dev).put('/documents/DAT/contenu', { contenu_md: md, resume_modif: 'Complète' }).expect(200);
    const bin = (r: any, cb: any) => { const c: Buffer[] = []; r.on('data', (d: Buffer) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); };
    const docx = await request(http).get(`${P}/documents/DAT/export?format=docx`).set('Authorization', `Bearer ${lecteur}`).buffer(true).parse(bin).expect(200);
    expect(docx.headers['content-disposition']).toContain('saisie-DAT-v');
    const AdmZip = require('adm-zip');
    const xml = new AdmZip(docx.body).readAsText('word/document.xml');
    for (const t of ['Spécifications', 'Règles métier', 'déclarant', 'Chef', 'const x = 1;', 'Remarque importante', 'sous-étape']) expect(xml).toContain(t);
    const pdf = await request(http).get(`${P}/documents/DAT/export?format=pdf`).set('Authorization', `Bearer ${lecteur}`).buffer(true).parse(bin).expect(200);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.body.length).toBeGreaterThan(2000);
    const ancienne = await request(http).get(`${P}/documents/DAT/export?format=pdf&version=0.1`).set('Authorization', `Bearer ${dev}`).buffer(true).parse(bin);
    expect([200, 404]).toContain(ancienne.status);
    await request(http).get(`${P}/documents/DAT/export?format=odt`).set('Authorization', `Bearer ${dev}`).expect(400);
    await request(http).get(`${P}/documents/MCD/export?format=pdf`).set('Authorization', `Bearer ${dev}`).expect(404);
    const d = await req(lecteur).get('/documents/DAT/diff').expect(200);
    expect(d.body.ajouts).toBeGreaterThan(5); expect(d.body.retraits).toBe(2);
    expect(d.body.blocs.some((b: any) => b.type === 'retrait' && b.texte.includes('Première version'))).toBe(true);
  });

  it('portail client : le lecteur dépose un retour, rien d’autre ; traçabilité', async () => {
    const r = await req(lecteur).post('/retours', { retour_md: 'Le bouton Envoyer est peu visible', type: 'remarque', fonctionnalites: ['F-001'] }).expect(201);
    expect(r.body).toMatchObject({ source: 'portail client', statut: 'nouveau' });
    await req(lecteur).patch(`/retours/${r.body.ref}`, { statut: 'resolu' }).expect(403);
    await req(lecteur).post('/risques', { titre: 'Interdit', probabilite: 1, impact: 1 }).expect(403);
    const t = (await req(lecteur).get('/tracabilite').expect(200)).body;
    expect(t.synthese.total).toBe(1);
    expect(t.exigences[0]).toMatchObject({ ref: 'EX-01', etat: 'recettee' });
    expect(t.exigences[0].fonctionnalites[0]).toMatchObject({ ref: 'F-001' });
    expect(t.exigences[0].fonctionnalites[0].retours.map((x: any) => x.ref)).toContain(r.body.ref);
    expect(t.hors_tdr.map((f: any) => f.ref)).toContain('F-002');
  });

  it('notifications « à traiter » selon le rôle', async () => {
    await req(dev).post('/changements', { titre: 'Mode sombre' }).expect(201);
    await req(dev).put('/documents/MCD/contenu', { contenu_md: '# MCD', resume_modif: 'Initiale', statut: 'en_revue' }).expect(200);
    const n = (j: string) => request(http).get('/api/v1/notifications').set('Authorization', `Bearer ${j}`).expect(200).then((r) => r.body);
    const chef_ = await n(chef); const dev_ = await n(dev);
    const types = (l: any[]) => new Set(l.map((x) => x.type));
    expect(types(chef_)).toEqual(expect.objectContaining({}));
    expect([...types(chef_)]).toEqual(expect.arrayContaining(['changement_a_decider', 'document_en_revue', 'retour_nouveau']));
    expect([...types(dev_)]).toContain('retour_nouveau');
    expect([...types(dev_)]).not.toContain('changement_a_decider');
    expect(await n(lecteur)).toEqual([]);
    expect(chef_[0].priorite).toBe('haute');
    expect(chef_.find((x: any) => x.type === 'document_en_revue').lien).toBe('/projets/saisie/livrables/MCD');
  });
});
