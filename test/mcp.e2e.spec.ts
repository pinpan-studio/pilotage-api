import request from 'supertest';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { creerApp, creerOrg, creerUtilisateur } from './outils';
import { seedCatalogue, KIT_V1 } from '../src/db/seed/catalogue';
import { ImportKitService } from '../src/import/import-kit.service';
import { MembreProjet, Projet, Historique } from '../src/db/entities';

describe('Serveur MCP (client MCP officiel)', () => {
  let app: INestApplication; let db: DataSource; let client: Client; let url: string; let jeton: string;
  const appel = async (name: string, args: Record<string, unknown> = {}) => {
    const r: any = await client.callTool({ name, arguments: args });
    return { texte: r.content.map((c: any) => c.text).join('\n') as string, erreur: !!r.isError, donnees: r.structuredContent?.donnees };
  };

  beforeAll(async () => {
    ({ app, db } = await creerApp());
    await app.listen(0);
    url = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const org = await creerOrg(db, 'principale');
    const admin = await creerUtilisateur(db, org, 'admin@exemple.ci', 'admin');
    const dev = await creerUtilisateur(db, org, 'dev@exemple.ci', 'developpeur');
    await seedCatalogue(db.manager, org.id);
    const { projet } = await app.get(ImportKitService).importerDossier({ utilisateur_id: admin.id, organisation_id: org.id, nom: 'admin', role: 'admin', auteur_type: 'humain' }, join(KIT_V1, 'projets', 'exemple-declarations'));
    await db.getRepository(MembreProjet).save({ organisation_id: org.id, projet_id: projet.id, utilisateur_id: dev.id, role: 'developpeur' });
    const cnx = (await request(url).post('/api/v1/auth/connexion').send({ email: 'admin@exemple.ci', mot_de_passe: 'mdp' })).body.jeton_acces;
    jeton = (await request(url).post('/api/v1/jetons').set('Authorization', `Bearer ${cnx}`).send({ utilisateur_id: dev.id, nom: 'test', projets: [projet.id] })).body.jeton;
    client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${jeton}` } } }));
  });
  afterAll(async () => { await client?.close(); await app.close(); });

  it('refuse sans jeton', async () => {
    await request(url).post('/mcp').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).expect(401);
  });

  it('expose les outils de la phase 1', async () => {
    const noms = (await client.listTools()).tools.map((t) => t.name);
    for (const n of ['lister_projets', 'etat_projet', 'lire_tdr', 'lister_fonctionnalites', 'lire_document', 'rechercher', 'demarrer_session', 'ajouter_note_session',
      'cloturer_session', 'maj_statut_fonctionnalite', 'ecrire_document', 'ecrire_doc_technique', 'creer_retour', 'ajouter_risque', 'ajouter_action']) expect(noms).toContain(n);
  });

  it('« donne-moi l’état du projet »', async () => {
    const r = await appel('etat_projet', { projet: 'exemple-declarations' });
    expect(r.erreur).toBe(false);
    expect(r.texte).toContain('# État du projet');
    expect(r.texte).toContain('Avancement global : 43 %');
    expect(r.donnees.retours_ouverts).toBe(2);
    expect((await appel('lister_projets')).texte).toContain('exemple-declarations');
  });

  it('« ajoute une note de session » : session, note, clôture, traçabilité agent', async () => {
    const s = await appel('demarrer_session', { projet: 'exemple-declarations', depot: 'backend' });
    const session_id = s.donnees.session_id;
    const n = await appel('ajouter_note_session', { session_id, texte: 'Accusé de réception : gabarit terminé', fonctionnalites: ['F-005'] });
    expect(n.erreur).toBe(false);
    expect((await appel('cloturer_session', { session_id, resume_md: '# Session\n- F-005 avancée' })).erreur).toBe(false);
    const r = await request(url).get('/api/v1/projets/exemple-declarations/sessions').set('Authorization', `Bearer ${jeton}`).expect(200);
    const sess = r.body.find((x: any) => x.id === session_id);
    expect(sess.notes[0].texte).toContain('gabarit');
    expect(sess.fonctionnalites).toEqual(['F-005']);
  });

  it('refuse le passage d’un document à « signe » ou « valide », et les autres restrictions dures', async () => {
    const signe = await appel('maj_statut_document', { projet: 'exemple-declarations', code: 'SFD', statut: 'signe' });
    expect(signe.erreur).toBe(true);
    expect(signe.texte).toMatch(/^Refusé : .*seul un chef de projet/);
    expect((await appel('maj_statut_document', { projet: 'exemple-declarations', code: 'SFD', statut: 'valide' })).erreur).toBe(true);
    const v = await appel('maj_statut_fonctionnalite', { projet: 'exemple-declarations', ref: 'F-003', statut: 'valide' });
    expect(v.texte).toMatch(/jamais valider/);
    // F-003 a un test en réserve : la recette est refusée.
    const rec = await appel('maj_statut_fonctionnalite', { projet: 'exemple-declarations', ref: 'F-003', statut: 'recette' });
    expect(rec.texte).toMatch(/tous les cas de test/);
    expect((await appel('ecrire_document', { projet: 'exemple-declarations', code: 'CONTRAT', contenu_md: '# x', resume_modif: 'x' })).texte).toMatch(/produit par un humain/);
    // Projet hors du jeton : introuvable.
    expect((await appel('etat_projet', { projet: 'autre' })).texte).toMatch(/^Introuvable/);
  });

  it('écritures : statut par dépôt, document versionné, doc technique, retour, risque, action', async () => {
    expect((await appel('maj_statut_fonctionnalite', { projet: 'exemple-declarations', ref: 'F-005', depot: 'backend', statut: 'developpe' })).erreur).toBe(false);
    const d = await appel('ecrire_document', { projet: 'exemple-declarations', code: 'DAT', contenu_md: '# DAT\nArchitecture.', resume_modif: 'Ajout des flux', statut: 'en_revue' });
    expect(d.donnees).toMatchObject({ version: '0.3', statut: 'en_revue' });
    const lu = await appel('lire_document', { projet: 'exemple-declarations', code: 'DAT' });
    expect(lu.texte).toContain('Architecture.');
    expect((await appel('ecrire_doc_technique', { projet: 'exemple-declarations', depot: 'backend', chemin: 'pdf.md', contenu_md: '# Génération PDF' })).donnees).toEqual({ chemin: 'backend/pdf.md', cree: true });
    expect((await appel('creer_retour', { projet: 'exemple-declarations', retour_md: 'Le bouton est mal placé', type: 'remarque', fonctionnalites: ['F-003'] })).donnees.ref).toBe('RC-005');
    expect((await appel('ajouter_risque', { projet: 'exemple-declarations', titre: 'Coupure réseau', probabilite: 3, impact: 3 })).donnees.ref).toBe('R-005');
    expect((await appel('ajouter_action', { projet: 'exemple-declarations', action: 'Relancer le client', echeance: '2026-11-20' })).donnees.ref).toBe('A-006');
    const h = await db.getRepository(Historique).findBy({ auteur_type: 'agent' });
    expect(h.length).toBeGreaterThan(5);
  });

  it('fonctionnalité interne, ADR, changelog ; origine TDR refusée à l’agent', async () => {
    expect((await appel('creer_fonctionnalite', { projet: 'exemple-declarations', titre: 'Journal d’audit', origine: 'TDR' })).texte).toMatch(/^Refusé/);
    expect((await appel('creer_fonctionnalite', { projet: 'exemple-declarations', titre: 'Journal d’audit', poids: 3, depots: ['backend'], exigences: ['EX-02'] })).donnees.ref).toBe('F-010');
    expect((await appel('ajouter_adr', { projet: 'exemple-declarations', titre: 'File locale', contexte: 'Réseau instable', decision: 'File JSONL' })).donnees.ref).toBe('ADR-002');
    expect((await appel('ajouter_entree_changelog', { projet: 'exemple-declarations', type: 'ajoute', texte: 'Journal d’audit', fonctionnalite: 'F-010' })).erreur).toBe(false);
    expect((await appel('maj_retour', { projet: 'exemple-declarations', ref: 'RC-003', statut: 'resolu', action_md: 'Limite portée à 10 Mo' })).erreur).toBe(false);
  });

  it('équipe : lister_membres ; creer_projet refusé à un développeur', async () => {
    const m = await appel('lister_membres', { projet: 'exemple-declarations' });
    expect(m.texte).toContain('dev@exemple.ci');
    expect((await appel('creer_projet', { code: 'nouveau-projet', nom: 'Nouveau' })).texte).toMatch(/^Refusé : seul un administrateur ou un chef de projet/);
  });

  it('recherche plein texte', async () => {
    const r = await appel('rechercher', { projet: 'exemple-declarations', texte: 'accusé de réception' });
    expect(r.erreur).toBe(false);
    expect(r.donnees.length).toBeGreaterThan(0);
  });
});
