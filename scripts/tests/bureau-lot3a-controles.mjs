// Contrôles du LOT 3 A du bureau (dossier designer-bureau : CL01 à CL18, EQ01 à EQ19, XM01 à XM04, XM15, XM16), mesurés sur le build, en /admin?ui=2.
//   npm run build && node scripts/tests/bureau-lot3a-controles.mjs out [dossier-images] [port]
// Base SIMULÉE de bureau-sim.mjs (8 salariés, 8 clients, réserves, invitations, documents ; jeudi 15 octobre 2026, horloge figée ; aucune vraie base,
// aucun e-mail). Pour chaque fenêtre : elle s'ouvre (rôle dialog / alertdialog, titre), se ferme par ✕ et par Échap ; ses gestes principaux appellent
// les MÊMES écritures qu'avant (journal des requêtes simulées) ; états vides et erreurs ; aucun défilement horizontal à 390, 834 et 1440 px.
import fs from 'node:fs'; import path from 'node:path';
import { demarrer } from './bureau-sim.mjs';
const [,, OUT = 'out', SH = '', PORT = '4461'] = process.argv;
if (SH) fs.mkdirSync(SH, { recursive: true });
let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const sim = await demarrer({ out: OUT, port: Number(PORT) });
const ATT = '.dzp-table .dzp-bulle, .dzp-m-carte';
const pause = (page, ms = 450) => page.waitForTimeout(ms);
const fenetre = (page) => page.locator('[role="dialog"].dz-l3-coque, [role="alertdialog"].dz-l3-coque').last();
const titre = async (page) => {
  const t = fenetre(page).locator('.dz-hb-titre').first();
  return (await t.count()) ? (await t.innerText({ timeout: 2000 }).catch(() => '')).trim() : ''; // sans fenêtre : '' tout de suite (pas 30 s d'attente)
};
const largeurPage = (page) => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
/** Débordement horizontal DANS une fenêtre (contenu plus large que la fenêtre). */
const deborde = (page) => page.evaluate(() => {
  const f = [...document.querySelectorAll('.dz-l3-coque')].pop(); if (!f) return -1;
  const corps = f.querySelector('.dz-hb-corps'); const r = f.getBoundingClientRect();
  return Math.max(corps ? corps.scrollWidth - corps.clientWidth : 0, Math.round(r.right - innerWidth), Math.round(-r.left));
});
/** « Envoyer par e-mail » : la fonction send-staff-email répond comme en production (état du jour : 12 envois sur 50, une adresse manquante). */
const emailPret = (page) => page.route('**/functions/v1/send-staff-email', async (r) => {
  const body = JSON.parse(r.request().postData() || '{}');
  if (body.action === 'etat') {
    const workers = sim.D.users.filter((u) => u.role !== 'admin').map((u) => ({ id: u.id, has_email: u.id !== 'u-dina', invalid_email: false, unsubscribed: {} }));
    return r.fulfill({ json: { available: true, workers, used: 12, remaining: 38, cap: 50 } });
  }
  return r.fulfill({ json: { results: [] } });
});
const image = async (page, nom) => { if (SH) await page.screenshot({ path: path.join(SH, `${nom}.png`) }); };
/** Les écritures et appels de fonctions (RPC, fonctions edge) faits pendant `geste`. */
async function appels(geste) {
  const w0 = sim.log.writes.length; const r0 = sim.log.requetes.length;
  await geste();
  return [...sim.log.writes.slice(w0).map((w) => `${w.m} ${w.t}`), ...sim.log.requetes.slice(r0).filter((r) => /\/rpc\/|\/functions\//.test(r))];
}

/** Ouvre une fenêtre, vérifie titre + débordement, la ferme par ✕ puis (rouverte) par Échap. */
async function cycle(page, nom, ouvrir, attendu, { largeur = 1440, capture = nom, echap = true, echapSeul = false } = {}) {
  await ouvrir(); await pause(page, 700);
  const t = await titre(page);
  check(t.includes(attendu), `${nom} (${largeur}) : s'ouvre, titre « ${t} »`);
  const d = await deborde(page);
  check(d >= 0 && d <= 1, `${nom} (${largeur}) : aucun défilement horizontal dans la fenêtre (${d} px), page ${await largeurPage(page)} px`);
  await image(page, capture);
  if (echapSeul) { // fenêtre qui ne se rouvre pas dans la base simulée (fonction absente : l'entrée du menu disparaît, comme avant)
    check((await fenetre(page).locator('.dz-hb-fermer').count()) === 1, `${nom} (${largeur}) : bouton ✕ présent`);
    await page.keyboard.press('Escape'); await pause(page);
    check(!(await titre(page)).includes(attendu), `${nom} (${largeur}) : se ferme par Échap`);
    return;
  }
  await fenetre(page).locator('.dz-hb-fermer').first().click(); await pause(page);
  check(!(await titre(page)).includes(attendu), `${nom} (${largeur}) : se ferme par ✕`);
  if (echap) {
    await ouvrir(); await pause(page, 600);
    await page.keyboard.press('Escape'); await pause(page);
    check(!(await titre(page)).includes(attendu), `${nom} (${largeur}) : se ferme par Échap`);
  }
}

// Intégration bureau v2 (planning 1a / 2a / 2b) : Réserves, Coût chantiers, Borne… sont dans « Plus ⋯ » à l'ordinateur et à la tablette, et le menu ☰ du
// téléphone est le rond de l'en-tête 2b. Ouvre le point d'entrée existant (barre, « Plus ⋯ » ou ☰) avant de cliquer la ligne voulue.
const ouvrirEntree = async (page, sel) => {
  if (!(await page.locator(`${sel}:visible`).count())) {
    const rond = page.locator('button[aria-label="Menu"]:visible');
    if (await rond.count()) await rond.first().click(); else await page.locator('[data-guide="bureau-nav.plus"]:visible').first().click();
    await page.waitForTimeout(500);
  }
  // Tablette : Clients et Salariés de « Plus ⋯ » (groupe dzp-menu__tablette) n'ont que leur data-testid.
  const alt = { '[data-guide="bureau-nav.clients"]': '[data-testid=menu-clients]', '[data-guide="bureau-nav.salaries"]': '[data-testid=menu-salaries]' }[sel];
  const cible = alt && !(await page.locator(`${sel}:visible`).count()) ? alt : sel;
  await page.locator(`${cible}:visible`).first().click();
};

// ═════════════════════ Ordinateur 1440 × 900 ═════════════════════
{
  sim.reinitialiser();
  const { page, ctx, erreurs } = await sim.page({ ui: 2, largeur: 1440, hauteur: 900, attente: ATT });
  page.on('dialog', (d) => d.accept()); // window.confirm d'avant (suppression d'un document) : accepté
  const nav = (g) => ({ click: () => ouvrirEntree(page, `[data-guide="bureau-nav.${g}"]`) });

  // ── Salariés (EQ01) ──
  await cycle(page, 'EQ01 Salariés', () => nav('salaries').click(), 'Salariés', { capture: 'EQ01-salaries-1440' });
  await nav('salaries').click(); await pause(page, 700);
  const lignes = await fenetre(page).locator('.dz-l3-ligne').count();
  check(lignes >= 9, `EQ01 : ${lignes} lignes (bureau + 8 salariés)`);
  const texte = await fenetre(page).innerText();
  check(/CHEF/.test(texte) && /jours? en attente/.test(texte) && /Un seul accès bureau/.test(texte), 'EQ01 : badges CHEF, « jours en attente », « Un seul accès bureau »');
  check(await fenetre(page).getByRole('button', { name: 'Retirer' }).isDisabled(), 'EQ08 : « Retirer » le dernier accès bureau est refusé (désactivé)');
  // Recherche sans résultat (état vide)
  await fenetre(page).locator('[data-testid=salaries-recherche]').fill('Zorro'); await pause(page);
  check(/Aucun salarié « Zorro »/.test(await fenetre(page).innerText()), 'EQ01 : recherche sans résultat → état vide');
  await fenetre(page).locator('[data-testid=salaries-recherche]').fill(''); await pause(page);
  // EQ07 : changer le rôle → fenêtre, puis la même écriture (setUserRole → PATCH users ou RPC)
  await fenetre(page).locator('select.dz-l3-select').first().selectOption('lead'); await pause(page, 600);
  check((await titre(page)).startsWith('Passer Alex chef'), `EQ07 : « ${await titre(page)} »`);
  await image(page, 'EQ07-role-1440');
  const roleW = await appels(async () => { await page.locator('[data-testid=role-ask-oui]').click(); await pause(page, 900); });
  check(roleW.some((w) => /rpc\/set_user_role/.test(w)), `EQ07 : même écriture que l'ancien sélecteur, sans reposer la question (${roleW.join(', ') || 'aucune'})`);
  // EQ04 : invitations en attente
  await fenetre(page).locator('[data-testid=inv-toggle]').click(); await pause(page, 900);
  check((await titre(page)) === 'Invitations en attente', 'EQ04 : « Invitations en attente » s\'ouvre');
  const rows = await page.locator('[data-testid=inv-row]').count();
  check(rows === 2, `EQ04 : ${rows} invitations (Nina, Omar)`);
  await image(page, 'EQ04-invitations-1440');
  // EQ06 : supprimer une invitation → fenêtre de question (au lieu de window.confirm)
  await page.locator('[data-testid=inv-remove]').first().click(); await pause(page, 600);
  check(/Supprimer l’invitation de Nina/.test(await titre(page)), `EQ06 : « ${await titre(page)} »`);
  await image(page, 'EQ06-supprimer-invitation-1440');
  await page.keyboard.press('Escape'); await pause(page);
  check((await titre(page)) === 'Invitations en attente', 'EQ06 : Échap ferme la question, la liste reste');
  await page.keyboard.press('Escape'); await pause(page);
  await page.keyboard.press('Escape'); await pause(page);

  // ── Nouveau salarié (EQ02) ──
  await cycle(page, 'EQ02 Nouveau salarié', async () => { await nav('salaries').click(); await pause(page, 500); await fenetre(page).locator('[data-guide="bureau-salaries.nouveau"]').click(); }, 'Nouveau salarié', { echap: false, capture: 'EQ02-nouveau-salarie-1440' });
  await nav('salaries').click(); await pause(page, 500); await fenetre(page).locator('[data-guide="bureau-salaries.nouveau"]').click(); await pause(page, 600);
  await page.getByLabel('Prénom *', { exact: true }).fill('Inès'); await page.getByLabel('Nom *', { exact: true }).fill('Prototype'); await page.getByLabel('Email *', { exact: true }).fill('ines.prototype@exemple'); await page.getByLabel('Téléphone').click(); await pause(page);
  check(/Adresse incomplète/.test(await fenetre(page).innerText()) && await page.locator('[data-guide="bureau-salaries.envoyer"]').isDisabled(), 'EQ02 : e-mail invalide → message sous le champ, bouton désactivé');
  await image(page, 'EQ02-email-invalide-1440');
  await page.getByLabel('Email *', { exact: true }).fill('ines@exemple.fr'); await pause(page);
  const w2 = await appels(async () => { await page.locator('[data-guide="bureau-salaries.envoyer"]').click(); await pause(page, 1200); });
  check(w2.some((w) => /invite-worker/.test(w)), `EQ02 : « Envoyer l’invitation » appelle invite-worker (${w2.join(', ')})`);

  // ── Importer des salariés (EQ03) ──
  await cycle(page, 'EQ03 Importer des salariés', async () => { await nav('salaries').click(); await pause(page, 500); await fenetre(page).locator('[data-guide="bureau-salaries.importer"]').click(); }, 'Importer des salariés', { capture: 'EQ03-import-salaries-1440', echap: false });

  // ── Fiche salarié · Gérer (EQ09 à EQ13) ──
  const ouvrirFiche = async () => { await nav('salaries').click(); await pause(page, 500); await fenetre(page).getByRole('button', { name: /Gabriel Témoin/ }).click(); };
  await cycle(page, 'EQ09 Fiche salarié · Gérer', ouvrirFiche, 'Gabriel Témoin', { capture: 'EQ09-fiche-gerer-1440' });
  await ouvrirFiche(); await pause(page, 900);
  check(await page.getByRole('tab', { name: 'Gérer' }).getAttribute('aria-selected') === 'true', 'EQ09 : onglets Gérer | Feuille d’heures');
  const a9 = sim.log.writes.length;
  await fenetre(page).getByLabel('Téléphone').fill('06 00 00 00 07');
  await page.locator('[data-guide="bureau-fiche.enregistrer"]').click(); await pause(page, 900);
  check(sim.log.writes.slice(a9).some((w) => /user_payroll|users/.test(w.t)), `EQ09 : Enregistrer → mêmes écritures (${sim.log.writes.slice(a9).map((w) => `${w.m} ${w.t}`).join(', ')})`);
  // EQ12 : Archiver (heures non clôturées) → question
  await page.locator('[data-testid=worker-archive]').click(); await pause(page, 700);
  const tArch = await titre(page);
  check(/Archiver Gabriel/.test(tArch) || tArch.includes('Gabriel'), `EQ12 : « ${tArch} »`);
  await image(page, 'EQ12-archiver-1440');
  await page.keyboard.press('Escape'); await pause(page);
  // EQ10 : clôturer les heures
  const clot = page.locator('[data-testid=closure-open]');
  if (await clot.count()) {
    await clot.click(); await pause(page, 900);
    check(/Clôturer les heures de Gabriel/.test(await titre(page)), `EQ10 : « ${await titre(page)} »`);
    await image(page, 'EQ10-cloturer-1440');
    await page.keyboard.press('Escape'); await pause(page);
  } else console.log('       info : « Clôturer jusqu’au… » absent (table user_closures non lisible dans la base simulée)');
  // EQ13 : coût réel (si l'IA est active pour l'entreprise)
  const cr = page.locator('[data-testid=real-cost]');
  if (await cr.count()) {
    await cr.click(); await pause(page, 700);
    check(/Coût réel|chiffres/i.test(await titre(page)), `EQ13 : « ${await titre(page)} » (panneau au-dessus de la fiche)`);
    await image(page, 'EQ13-cout-reel-1440');
    await page.keyboard.press('Escape'); await pause(page);
  } else console.log('       info : ligne « Coût réel » absente (IA inactive)');
  // Onglet Feuille d'heures (lot 2) puis retour
  await page.getByRole('tab', { name: 'Feuille d’heures' }).click(); await pause(page, 900);
  check(await page.locator('[data-testid="fiche-gerer-v2"]').count() === 0, 'EQ09 : l’onglet « Feuille d’heures » ouvre la feuille du lot 2');
  await page.keyboard.press('Escape'); await pause(page);

  // ── Réserves (CL16 à CL18) ──
  await cycle(page, 'CL16 Réserves', () => nav('reserves').click(), 'Réserves', { capture: 'CL16-reserves-1440' });
  await nav('reserves').click(); await pause(page, 900);
  const nRes = await page.locator('[data-testid=rr-open-card]').count();
  check(nRes === 3, `CL16 : ${nRes} réserves à traiter (Alex, Camille, Hugo)`);
  await page.locator('[data-testid=rr-lever]').first().click(); await pause(page, 600);
  check((await titre(page)) === 'Lever la réserve', 'CL17 : « Lever la réserve » s\'ouvre en fenêtre');
  await image(page, 'CL17-lever-1440');
  await page.getByLabel('Note (facultatif)').fill('Joint refait le 15/10');
  const w17 = await appels(async () => { await page.locator('[data-testid=reserve-lift-submit]').click(); await pause(page, 1200); });
  check(w17.some((w) => /time_entries|lift|reserve/.test(w)), `CL17 : « Lever la réserve » → même écriture que la liste d'avant (${w17.join(', ')})`);
  await page.locator('[data-testid=rr-tab-done]').click(); await pause(page, 600);
  const nDone = await page.locator('[data-testid=rr-done-card]').count();
  check(nDone >= 1, `CL18 : onglet « Levées » (${nDone})`);
  if (nDone) {
    await page.locator('[data-testid=rr-rouvrir]').first().click(); await pause(page, 600);
    check((await titre(page)) === 'Rouvrir la réserve ?', 'CL18 : « Rouvrir… » demande d’abord');
    await image(page, 'CL18-rouvrir-1440');
    await page.keyboard.press('Escape'); await pause(page);
  }
  await page.keyboard.press('Escape'); await pause(page);

  // ── Clients : tiroir (planning v2b) → fiche (CL05, CL07) ──
  const ouvrirClient = async () => { await nav('clients').click(); await pause(page, 500); await page.locator('[data-guide="bureau-clients.crayon"]').nth(1).click(); };
  await nav('clients').click(); await pause(page, 500);
  const nomAttendu = ((await page.locator('[data-guide="bureau-clients.crayon"]').nth(1).getAttribute('aria-label')) || '').replace('Modifier la fiche de ', '');
  await page.locator('.dzp-fond-menu').click(); await pause(page, 300);
  await cycle(page, 'CL05 Fiche client', ouvrirClient, nomAttendu, { capture: 'CL05-fiche-client-1440' });
  await ouvrirClient(); await pause(page, 800);
  const nomClient = await titre(page);
  check(nomClient.length > 2 && /FICHE CLIENT/i.test(await fenetre(page).innerText()), `CL05 : fiche « ${nomClient} »`);
  const a5 = sim.log.writes.length;
  await page.locator('[data-guide="bureau-clients.enregistrer"]').click(); await pause(page, 900);
  check(sim.log.writes.slice(a5).some((w) => /worksites/.test(w.t)), `CL05 : Enregistrer → updateWorksite (${sim.log.writes.slice(a5).map((w) => `${w.m} ${w.t}`).join(', ')})`);
  await page.locator('[data-guide="bureau-clients.archiver"]').click(); await pause(page, 600);
  check(/^Archiver /.test(await titre(page)), `CL07 : « ${await titre(page)} »`);
  await image(page, 'CL07-archiver-client-1440');
  await page.keyboard.press('Escape'); await pause(page);
  // Documents (CL10 à CL13)
  await page.locator('[data-testid=fiche-client-documents]').click(); await pause(page, 1200);
  check(/Documents du chantier/i.test(await fenetre(page).innerText()), `CL10 : Documents du chantier « ${await titre(page)} »`);
  await image(page, 'CL10-documents-1440');
  await page.locator('[data-testid=doc-tab-files]').click(); await pause(page, 500);
  await image(page, 'CL11-fichiers-1440');
  // CL13 : fichier trop lourd (16 Mo) → refus dans le panneau
  await page.locator('[data-testid=doc-file-input]').setInputFiles({ name: 'Plan-complet.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(16 * 1024 * 1024 + 10) }); await pause(page, 600);
  check(/Fichier refusé/.test(await fenetre(page).innerText()) && /15 Mo/.test(await fenetre(page).innerText()), 'CL13 : fichier trop lourd → « Fichier refusé » dans le panneau');
  await image(page, 'CL13-refus-1440');
  await page.locator('[data-testid=doc-envoyer]').click(); await pause(page, 600);
  check((await titre(page)) === 'Envoyer au client', 'CL12 : « Envoyer au client » s\'ouvre en fenêtre');
  await image(page, 'CL12-envoyer-1440');
  await page.keyboard.press('Escape'); await pause(page);
  await page.keyboard.press('Escape'); await pause(page);
  await page.keyboard.press('Escape'); await pause(page);

  // ── Nouveau client (CL03, CL04) ──
  const ouvrirNC = async () => { await nav('clients').click(); await pause(page, 500); await page.locator('[data-guide="bureau-clients.nouveau"]').first().click(); };
  await cycle(page, 'CL03 Nouveau client', ouvrirNC, 'Nouveau client', { capture: 'CL03-nouveau-client-1440' });
  await ouvrirNC(); await pause(page, 600);
  await page.getByLabel('Nom du client *').click(); await page.getByLabel('Type de produit').click(); await pause(page);
  check(/Indiquez le nom du client/.test(await fenetre(page).innerText()) && await page.locator('[data-guide="bureau-clients.creer"]').isDisabled(), 'CL04 : nom manquant → message, « Créer le client » désactivé');
  await image(page, 'CL04-nom-manquant-1440');
  await page.getByLabel('Nom du client *').fill('Pergola Est');
  const a3 = sim.log.writes.length;
  await page.locator('[data-guide="bureau-clients.creer"]').click(); await pause(page, 1000);
  check(sim.log.writes.slice(a3).some((w) => w.m === 'POST' && /worksites/.test(w.t)), 'CL03 : « Créer le client » → createWorksite (POST worksites)');

  // ── Importer des clients (CL08, CL09) ──
  const ouvrirImp = async () => { await nav('clients').click(); await pause(page, 500); await page.locator('[data-guide="bureau-clients.importer"]').first().click(); };
  await cycle(page, 'CL08 Importer des clients', ouvrirImp, 'Importer des clients', { capture: 'CL08-import-clients-1440' });
  await ouvrirImp(); await pause(page, 600);
  const csv = 'Nom du client;Ville\nAtelier Neuf;Bron\nVilla Exemple;Lyon\n;Caluire\n';
  await page.locator('[data-testid=import-depot] input[type=file]').setInputFiles({ name: 'clients-octobre.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }); await pause(page, 900);
  const tImp = await fenetre(page).innerText();
  check(/À CRÉER/.test(tImp) && /DÉJÀ PRÉSENT/.test(tImp) && /NOM MANQUANT/.test(tImp) && /Importer 1 client/.test(tImp), 'CL09 : aperçu (à créer, déjà présent, nom manquant) et « Importer 1 client »');
  await image(page, 'CL09-apercu-1440');
  const a8 = sim.log.writes.length;
  await page.locator('[data-testid=import-go]').click(); await pause(page, 1000);
  check(sim.log.writes.slice(a8).some((w) => w.m === 'POST' && /worksites/.test(w.t)), 'CL09 : « Importer » → même écriture (POST worksites)');
  await page.keyboard.press('Escape'); await pause(page);

  // ── Formations (EQ15) et e-mail (EQ18) : Plus ⋯ ──
  await emailPret(page);
  const plus = async (id) => { await page.locator('[data-testid=bar-plus]').click(); await pause(page, 300); await page.locator(`[data-testid=${id}]`).click(); };
  if (await page.locator('[data-testid=bar-plus]').count()) {
    await page.locator('[data-testid=bar-plus]').click(); await pause(page, 300);
    const aFo = await page.locator('[data-testid=menu-trainings]').count(); const aEm = await page.locator('[data-testid=menu-email]').count();
    await page.locator('.dzp-fond-menu').first().click(); await pause(page, 300);
    if (aFo) await cycle(page, 'EQ15 Formations', () => plus('menu-trainings'), 'Formations', { capture: 'EQ15-formations-1440' });
    else console.log('       info : Formations absent du menu (fonction non détectée dans la base simulée)');
    if (aEm) await cycle(page, 'EQ18 Envoyer par e-mail', () => plus('menu-email'), 'Envoyer par e-mail', { capture: 'EQ18-email-1440' });
    if (aEm) {
      await plus('menu-email'); await pause(page, 900);
      check(/Destinataires|Qui reçoit/.test(await fenetre(page).innerText()) && /12 e-mails aujourd’hui sur 50/.test(await fenetre(page).innerText()), 'EQ18 : destinataires, compteur du jour (12 sur 50)');
      check(/Pas d’adresse e-mail/.test(await fenetre(page).innerText()), 'EQ18 : un destinataire non sélectionnable dit pourquoi');
      await page.locator('[data-testid=em-mode-message]').click(); await page.locator('[data-testid=em-text]').fill('Dépôt fermé vendredi après-midi. Récupérez le matériel avant 12 h.');
      await page.locator('[data-testid=em-all] input').check(); await pause(page);
      await page.locator('[data-testid=em-continue]').click(); await pause(page, 600);
      check(await page.locator('[data-testid=em-confirm]').count() === 1, 'EQ19 : « Envoyer N e-mails ? » demande avant d’envoyer');
      await page.locator('[data-testid=em-confirm]').scrollIntoViewIfNeeded(); await image(page, 'EQ19-confirmer-1440');
      await page.keyboard.press('Escape'); await pause(page);
    }
    else console.log('       info : « Envoyer par e-mail » absent du menu (fonction non détectée dans la base simulée)');
  }
  check(erreurs.length === 0, `aucune erreur de page (${erreurs.join(' | ') || '—'})`);
  await ctx.close();
}

// ═════════════════════ Erreur de lecture : Réserves illisibles ═════════════════════
{
  sim.reinitialiser();
  const { page, ctx } = await sim.page({ ui: 2, largeur: 1440, hauteur: 900, attente: ATT });
  await page.route('**/rest/v1/time_entries?*reception=eq.avec*', (r) => r.fulfill({ status: 500, json: { message: 'panne' } }));
  await ouvrirEntree(page, '[data-guide="bureau-nav.reserves"]'); await pause(page, 1200);
  check(/Réserves illisibles/.test(await fenetre(page).innerText()), 'CL16 erreur : « Réserves illisibles pour le moment » dans le panneau (pas une liste vide)');
  await image(page, 'CL16-erreur-1440');
  sim.D.time_entries = sim.D.time_entries.filter((e) => e.reception !== 'avec');
  await page.unroute('**/rest/v1/time_entries?*reception=eq.avec*');
  await fenetre(page).getByRole('button', { name: 'Réessayer' }).click(); await pause(page, 1200);
  check(/Aucune réserve à traiter/.test(await fenetre(page).innerText()), 'CL16 vide : « Aucune réserve à traiter. »');
  await ctx.close();
}

// ═════════════════════ Téléphone 390 et tablette 834 ═════════════════════
for (const [largeur, hauteur] of [[390, 844], [834, 1112]]) {
  sim.reinitialiser();
  const { page, ctx, erreurs } = await sim.page({ ui: 2, largeur, hauteur, hasTouch: true, attente: '.dzp-m-carte:visible, .dzp-table [data-testid=bubble]:visible' });
  await emailPret(page);
  const menu = (g) => ouvrirEntree(page, g);
  const s = largeur === 390 ? '390' : '834';
  // Intégration bureau v2 : « Chantiers » en page (XM01, XM02) est l'écran du TÉLÉPHONE ; depuis le planning 2b, la tablette 834 garde la grille et le tiroir
  // « Clients » de l'ordinateur (CL01, CL02 : planning, hors lot 3 A) : XM01 / XM02 ne se contrôlent qu'au téléphone.
  if (await page.locator('button[aria-label="Menu"]:visible').count()) {
    await cycle(page, 'XM01 Chantiers', () => menu('[data-guide="bureau-nav.clients"]'), 'Chantiers', { largeur, capture: `XM01-chantiers-${s}` });
    await menu('[data-guide="bureau-nav.clients"]'); await pause(page, 700);
    await page.locator('[data-guide="bureau-clients.crayon"]').locator('visible=true').nth(1).click(); await pause(page, 800);
    check(/FICHE CLIENT/i.test(await fenetre(page).innerText()), `XM02 (${largeur}) : fiche client en page`);
    check((await deborde(page)) <= 1, `XM02 (${largeur}) : aucun défilement horizontal`);
    await image(page, `XM02-fiche-client-${s}`);
    await page.keyboard.press('Escape'); await pause(page);
  } else console.log(`·  XM01 / XM02 (${largeur}) : tablette = tiroir Clients de l'ordinateur (planning 2a), écran téléphone non monté`);
  await cycle(page, 'XM03 Salariés', () => menu('[data-guide="bureau-nav.salaries"]'), 'Salariés', { largeur, capture: `XM03-salaries-${s}` });
  await cycle(page, 'XM04 Réserves', () => menu('[data-guide="bureau-nav.reserves"]'), 'Réserves', { largeur, capture: `XM04-reserves-${s}` });
  {
    // Téléphone : menu ☰ (mm-*) ; tablette du planning 2a : « Plus ⋯ » (menu-*).
    const tel = (await page.locator('button[aria-label="Menu"]:visible').count()) > 0;
    const [selFo, selEm] = tel ? ['[data-testid=mm-trainings]', '[data-testid=mm-email]'] : ['[data-testid=menu-trainings]', '[data-testid=menu-email]'];
    await page.locator(tel ? 'button[aria-label="Menu"]:visible' : '[data-guide="bureau-nav.plus"]:visible').first().click(); await pause(page, 500);
    const fo = await page.locator(selFo).count(); const em = await page.locator(selEm).count();
    await page.keyboard.press('Escape'); await pause(page);
    if (await page.locator('[data-testid=menu-plus]:visible').count()) { await page.mouse.click(5, largeur > 500 ? 600 : 400); await pause(page); }
    if (fo) await cycle(page, 'XM15 Formations', () => menu(selFo), 'Formations', { largeur, capture: `XM15-formations-${s}` });
    if (em) await cycle(page, 'XM16 Envoyer par e-mail', () => menu(selEm), 'Envoyer par e-mail', { largeur, capture: `XM16-email-${s}` });
  }
  check((await largeurPage(page)) <= largeur, `${largeur} px : page de ${await largeurPage(page)} px, aucun défilement horizontal`);
  check(erreurs.length === 0, `${largeur} px : aucune erreur de page (${erreurs.join(' | ') || '—'})`);
  await ctx.close();
}

await sim.fermer();
console.log(`\n${ok} ✅ / ${ko} ❌`);
process.exit(ko ? 1 : 0);
