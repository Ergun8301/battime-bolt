// Lot 7 (suite) — les guides pas à pas du BUREAU restent VRAIS : chaque bouton entouré
// existe dans le code des écrans (attribut data-guide), chaque libellé cité entre « »
// aussi, aucun geste qui AGIT sur une ligne précise n'est entouré, et l'assistant n'offre
// « Me guider pas à pas » que pour une fiche qui existe. Un bouton renommé ou une ancre
// retirée casse ce test.
//   npm run test:guides-bureau
import {
  actionPrompt, buildActionContext, findGuide, fromFunctionCall, GUIDE, guideAnswer, guideButton, guideForPrompt, guideLinks,
  handleActionLocally, type ActionContext,
} from './assistant-actions-core.ts';
import {
  ADMIN_SCREENS, ADMIN_TOURS as TOURS_ECRITES, ADMIN_TOURS_V1, adminStepsFor, findAdminTour as trouverEcrite, hasAdminTour, MENU_CIBLES, SUPPORT_TOUR, supportStepsFor,
  type AdminTour, type ConsoleKind,
} from './admin-tours.ts';
import { TOUR_LABEL, tourAction, tourIdOf } from './worker-tours.ts';
import { ASSISTANT_FUNCTIONS } from './assistant-outils.ts';
import { GUIDES_BUREAU_UI2 } from './guides-bureau-ui2.ts';
import { ADMIN_TOURS_V2, ficheV2, findAdminTourV2, OUVRIR_PLUS, REMPLACEMENTS_V2 } from './admin-tours-v2.ts';
// Les fiches que voit le patron : celles du bureau v2 depuis la bascule (ADMIN_TOURS_V2), celles d'avant sinon. Tout ce fichier les vérifie.
const ADMIN_TOURS = ADMIN_TOURS_V2;
const findAdminTour = findAdminTourV2;
if (TOURS_ECRITES !== ADMIN_TOURS_V1 || trouverEcrite('couts') !== ADMIN_TOURS_V1.find((t) => t.id === 'couts')) throw new Error('ADMIN_TOURS (admin-tours.ts) = les fiches écrites');

const ROOTS = ['app', 'components'];
// Le bureau v2 (components/design/bureau) a ses propres ancres (les mêmes valeurs, posées une 2e fois : l'écran v2 REMPLACE l'écran v1, jamais les deux à la fois).
// Le comptage des doublons se fait design par design : le code d'avant seul (sources(false), toujours joignable par `?ui=1`), puis le dossier v2 seul (test « v2 » plus bas).
const DOSSIER_V2 = 'components/design/bureau';
async function sources(v2 = GUIDES_BUREAU_UI2): Promise<Record<string, string>> {
  const all: Record<string, string> = {};
  const walk = async (dir: string) => {
    for await (const e of Deno.readDir(dir)) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory) { if (p !== DOSSIER_V2 || v2) await walk(p); }
      else if (/\.(tsx|ts)$/.test(e.name)) all[p] = await Deno.readTextFile(p);
    }
  };
  for (const r of ROOTS) await walk(r);
  return all;
}
/** Le code sans les lignes de commentaire (les commentaires expliquent justement ce que le code ne fait pas). */
const bare = (code: string) => code.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
// Même normalisation que worker-tours.test.ts et assistant-aide.test.ts.
const N = (t: string) => t.replace(/&apos;/g, "'").replace(/[’]/g, "'").replace(/&nbsp;| /g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').toLowerCase();
const quoted = (t: string) => Array.from(t.matchAll(/«\s*([^»]+?)\s*»/g)).map((m) => m[1]);
// Citations qui ne sont pas un libellé d'écran : « S-NN » est le cadre de la semaine, « Autre » une puce, « à relancer » un compteur
// écrit autrement dans le code, « Envoyer à » le début de deux libellés (« Envoyer à » + adresse du comptable, « Envoyer au comptable »).
const NOT_LABELS = new Set(['S-NN', 'Autre', 'à relancer', 'Envoyer à']);

/** Toutes les ancres posées dans le code : une valeur 'x.y' entre guillemets sur une ligne qui parle de data-guide (ou de la prop `guide=`). */
function anchors(src: Record<string, string>): Map<string, number> {
  const found = new Map<string, number>();
  for (const [file, code] of Object.entries(src)) {
    if (file === 'components/guide-tour.tsx') continue;
    for (const line of code.split('\n')) {
      if (!/data-guide|\bguide=/.test(line) || /querySelector/.test(line)) continue;
      for (const m of line.matchAll(/["'`]([a-z]+(?:-[a-z]+)*\.[a-z]+(?:-[a-z]+)*)["'`]/g)) found.set(m[1], (found.get(m[1]) ?? 0) + 1);
    }
  }
  return found;
}

// Ancres des composants PARTAGÉS avec le salarié : déjà posées par le lot précédent, réutilisées, jamais redoublées.
const SHARED = new Set(['docs.photo', 'docs.envoyer', 'reserves.valider']);
// Les ancres qui ont PLUSIEURS éléments dans le code, avec le maximum et la raison : le guide entoure le premier visible.
const DUAL: Record<string, number> = {
  'bureau-nav.salaries': 2, 'bureau-nav.clients': 2, 'bureau-nav.exporter': 2, 'bureau-nav.couts': 2, 'bureau-nav.reserves': 2,
  'bureau-nav.borne': 2, 'bureau-nav.selection': 2, 'bureau-nav.versions': 2, 'bureau-nav.assistant': 2, 'bureau-nav.reglages': 2, // barre + ligne du menu ☰ (une seule visible à la fois)
  'bureau-nav.abonner': 4,          // « S’abonner » : barre ×2 états, en-tête mobile ×2 états (exclusifs deux à deux)
  'bureau-semaine.nav': 2,          // flèches de la barre OU « Semaine suivante » de l'en-tête mobile
  'bureau-planning.nom': 2,         // nom du salarié : grille (grand écran) OU carte (mobile)
  'bureau-planning.bulle': 2,       // intervention : grille OU liste mobile
  'bureau-planning.autre': 2,       // puce « Autre » : grille OU liste mobile
  'bureau-selection.tout': 2,       // « Tout sélectionner » : semaine OU jour
  'bureau-clients.nouveau': 2, 'bureau-clients.importer': 2, 'bureau-clients.crayon': 2, // menu « Clients » OU fenêtre « Chantiers »
  'bureau-stat.relance': 2,         // compteur « à relancer » : barre OU en-tête mobile
  'bureau-stat.liste': 2,           // la liste « À relancer » : panneau du cockpit OU fenêtre mobile
  'bureau-reglages.support': 2,     // ligne « durée + Autoriser » OU « Retirer l’accès » : exclusives
  // Lot 2 « Heures et paie » du bureau (components/design/bureau/*-v2.tsx, ?ui=2) : chaque écran habillé repose le repère de l'écran d'avant, qui n'est
  // jamais monté en même temps que sa v2 (le drapeau choisit l'un OU l'autre) ; les textes des guides ne changent pas (tableau dans guides-bureau-heures-v2.md).
  'bureau-fiche.exporter': 2, 'bureau-fiche.corriger': 2, 'bureau-fiche.corriger-valider': 2,
  'bureau-export.menu': 2, 'bureau-export.comptable': 2, 'bureau-export.mois': 2, 'bureau-export.un-salarie': 2,
  'bureau-conges.liste': 2,
};
// Gestes qui AGISSENT sur UNE ligne précise d'une liste : jamais entourés (le guide mène au premier élément visible,
// le patron pourrait accepter le congé de Dupont ou renvoyer l'invitation de la mauvaise personne parce que l'anneau l'y a mené).
const AGIT_PAR_LIGNE = [
  'bureau-conges.accepter', 'bureau-stat.relancer', 'bureau-invit.retirer', 'bureau-invit.envoyer', 'bureau-reserves.lever',
  'bureau-export.rouvrir', 'bureau-export.cloture', 'bureau-versions.revenir', 'bureau-salaries.role', 'support-console.entrer',
];
// …l'ancre est alors sur la LISTE, et la phrase dit de choisir la bonne ligne.
const LISTES = ['bureau-conges.liste', 'bureau-stat.liste', 'bureau-invit.liste', 'bureau-reserves.liste', 'bureau-versions.liste', 'bureau-export.mois', 'bureau-salaries.liste'];
// 3b-0 (2026-10-15) : deux fiches de GUIDE ajoutées pour corriger les réponses fausses (« imprimer » ≠ export, « chantier terminé » ≠ archiver) : elles n'ont pas
// de parcours pas à pas (aucune ancre data-guide ne les porte encore ; en ajouter toucherait les écrans, hors de cette livraison).
const SANS_FICHE = ['position', 'sortie_oubliee', 'imprimer_planning', 'terminer_chantier']; // rien à entourer à l'écran (ou pas encore de fiche)

const BANNED = [
  'brouillon', 'statut', 'synchronis', 'synchro', 'onglet', 'interface', 'paramétr', 'session', 'serveur',
  'base de données', 'identifiant', 'modale', 'popup', 'pop-up', 'menu déroulant', 'dropdown', 'application web',
  'anneau', // mot interne du composant : le patron voit un cadre jaune
];
// Lettres accentuées comprises (\b ne les voit pas : « êtes » contiendrait « tes »).
const TUTOIEMENT = /(?<![\p{L}])(tu|ton|ta|tes|toi|touche|appuie|clique|ouvre|mets|choisis|écris|fais)(?![\p{L}])/iu;
const stepsOf = (t: AdminTour) => [...adminStepsFor(t, false), ...adminStepsFor(t, true)];
// Les cibles des fiches d'avant (bureau `?ui=1`) ET des fiches v2 : une ancre n'est inutile que si aucune des deux ne la vise.
const allCibles = () => new Set([...ADMIN_TOURS_V1, ...ADMIN_TOURS_V1.map(ficheV2)].flatMap(stepsOf).map((s) => s.cible));

Deno.test('Guides bureau : une fiche par entrée de GUIDE (sauf quatre), id stable, sans doublon', () => {
  const ids = GUIDE.map((g) => g.id);
  if (ids.length !== 52 || new Set(ids).size !== 52) throw new Error(`GUIDE : ${ids.length} entrées, ${new Set(ids).size} ids uniques (52 attendus : les ids sont figés ; 50 + imprimer_planning et terminer_chantier, 3b-0)`);
  for (const g of GUIDE) if (!/^[a-z]+(_[a-z]+)*$/.test(g.id)) throw new Error(`${g.titre} : id « ${g.id} » de forme inattendue`);
  const tours = ADMIN_TOURS.map((t) => t.id);
  if (tours.length !== 48) throw new Error(`${tours.length} fiches (48 attendues)`);
  if (new Set(tours).size !== tours.length) throw new Error(`fiches en double : ${tours.filter((x, i) => tours.indexOf(x) !== i)}`);
  for (const t of ADMIN_TOURS) if (!ids.includes(t.id)) throw new Error(`fiche « ${t.id} » : aucune entrée de GUIDE de cet id`);
  for (const g of GUIDE) {
    if (SANS_FICHE.includes(g.id)) { if (hasAdminTour(g.id)) throw new Error(`« ${g.id} » : pas de fiche prévue (rien à entourer)`); }
    else if (!hasAdminTour(g.id)) throw new Error(`« ${g.titre} » (${g.id}) : pas de guide pas à pas`);
  }
  for (const id of SANS_FICHE) if (!ids.includes(id)) throw new Error(`SANS_FICHE : « ${id} » n'est plus dans GUIDE`);
});

Deno.test('Guides bureau : la recherche d’une fiche est stricte (guide:constructor, guide:__proto__…)', () => {
  for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty', '', 'inconnu', 'Export', 'export ']) {
    if (findAdminTour(id) !== null) throw new Error(`« ${id} » ne doit mener à aucune fiche`);
  }
  if (tourIdOf('guide:') !== '') throw new Error('guide: seul donne un id vide');
  if (findAdminTour(tourIdOf('guide:')!) !== null) throw new Error('id vide ignoré');
  for (const t of ADMIN_TOURS) if (findAdminTour(t.id) !== t) throw new Error(t.id);
});

Deno.test('Guides bureau : 1 à 5 étapes sur ordinateur ET sous 1024 px, une phrase courte, simple, au vouvoiement', () => {
  for (const t of ADMIN_TOURS) {
    for (const narrow of [false, true]) {
      const steps = adminStepsFor(t, narrow);
      if (steps.length < 1 || steps.length > 5) throw new Error(`${t.id} (${narrow ? '< 1024 px' : 'ordinateur'}) : ${steps.length} étapes`);
      steps.forEach((e, i) => {
        const at = `${t.id} ${narrow ? 'mobile' : 'ordi'} étape ${i + 1}`;
        if (!e.texte.trim() || e.texte !== e.texte.trim()) throw new Error(`${at} : texte vide ou avec des espaces autour`);
        if (e.texte.length > 140) throw new Error(`${at} : ${e.texte.length} caractères (140 au plus) — ${e.texte}`);
        if (!/[.]$/.test(e.texte)) throw new Error(`${at} : la phrase doit finir par un point — ${e.texte}`);
        if (!/^[a-z]+(-[a-z]+)*\.[a-z]+(-[a-z]+)*$/.test(e.cible)) throw new Error(`${at} : cible « ${e.cible} » pas de la forme ecran.bouton`);
        if (e.ecran && !(ADMIN_SCREENS as string[]).includes(e.ecran)) throw new Error(`${at} : écran « ${e.ecran} » inconnu`);
        const low = e.texte.toLowerCase();
        for (const w of BANNED) if (low.includes(w)) throw new Error(`${at} : mot à éviter « ${w} » — ${e.texte}`);
        const tu = TUTOIEMENT.exec(e.texte);
        if (tu) throw new Error(`${at} : tutoiement ou impératif « ${tu[0]} » (vouvoiement) — ${e.texte}`);
        if (narrow && /cliqu/i.test(e.texte)) throw new Error(`${at} : « cliquez » sous 1024 px (on touche) — ${e.texte}`);
        if (!narrow && /touch|appuy/i.test(e.texte.replace(/«[^»]*»/g, ''))) throw new Error(`${at} : « touchez » à l’ordinateur (on clique) — ${e.texte}`);
      });
    }
  }
});

// « Cliquez sur A, puis sur B » dérivé donnait « Touchez A, puis sur B » : le « sur » restant est fautif en français.
const SUR_RESTANT = /touch\w*\s+(d’abord\s+)?sur\b|\b(puis|ou|et)\s+sur\b/i;
Deno.test('Guides bureau : les phrases sous 1024 px sont du bon français (pas de « touchez sur », « puis sur », « ou sur »)', () => {
  for (const t of ADMIN_TOURS) for (const e of adminStepsFor(t, true)) {
    if (SUR_RESTANT.test(e.texte)) throw new Error(`${t.id} : « sur » de trop sous 1024 px — ${e.texte}`);
  }
  for (const k of ETATS) for (const e of supportStepsFor(k, true)) {
    if (SUR_RESTANT.test(e.texte)) throw new Error(`support ${k} : « sur » de trop sous 1024 px — ${e.texte}`);
  }
  // …et le test voit le défaut (la dérivation seule des trois phrases relevées le produisait).
  for (const fautive of ['touchez la coche ✓ pour accepter ou sur la croix', 'touchez d’abord sur « Exporter »', 'Touchez « Habilitations », puis sur « Ajouter ».']) {
    if (!SUR_RESTANT.test(fautive)) throw new Error(`le contrôle ne repère pas « ${fautive} »`);
  }
});

Deno.test('Guides bureau : sous 1024 px, un libellé cité pour une ligne du menu ☰ est celui du menu ☰ (pas le « Coûts » de la barre)', async () => {
  // Le menu ☰ d'avant ET celui du bureau v2 (téléphone : flèches de la semaine, « Chiffres de la semaine »).
  const menu = N(await Deno.readTextFile('components/admin-mobile-menu.tsx') + await Deno.readTextFile('components/design/bureau/menu-mobile-v2.tsx'));
  for (const t of ADMIN_TOURS) for (const e of adminStepsFor(t, true).filter((x) => x.ecran === 'menu' && x.cible !== 'bureau-nav.menu')) {
    for (const label of quoted(e.texte)) if (!menu.includes(N(label))) throw new Error(`${t.id} : « ${label} » n’est pas dans le menu ☰ — ${e.texte}`);
  }
  if (adminStepsFor(findAdminTour('couts')!, true).some((e) => /Coûts/.test(e.texte))) throw new Error('couts : le ☰ n’a pas le libellé court « Coûts »');
});

Deno.test('Guides bureau : « Cliquez » devient « Touchez » sous 1024 px, la majuscule est gardée', () => {
  const one = (texte: string, extra: Partial<AdminTour['etapes'][0]> = {}) => adminStepsFor({ id: 'essai', etapes: [{ cible: 'x.y', texte, ...extra }] }, true)[0].texte;
  const cas: [string, string][] = [
    ['Choisissez la période, puis cliquez sur « Exporter ».', 'Choisissez la période, puis touchez « Exporter ».'],
    ['Cliquez sur la coche ✓.', 'Touchez la coche ✓.'],
    ['Cliquez dessus.', 'Touchez dessus.'],
    ['Ne cliquez pas dessus : attrapez-la.', 'Ne touchez pas dessus : attrapez-la.'],
    ['Cliquez sur « Salariés ».', 'Touchez « Salariés ».'],
  ];
  for (const [ordi, mobile] of cas) if (one(ordi) !== mobile) throw new Error(`« ${ordi} » → « ${one(ordi)} » (attendu « ${mobile} »)`);
  if (one('Cliquez sur « Clients ».', { mobile: 'Touchez « Chantiers ».' }) !== 'Touchez « Chantiers ».') throw new Error('la phrase mobile écrite prime');
  const ordi = adminStepsFor({ id: 'essai', etapes: [{ cible: 'x.y', texte: 'Cliquez sur « Clients ».', mobile: 'Touchez « Chantiers ».' }] }, false)[0].texte;
  if (ordi !== 'Cliquez sur « Clients ».') throw new Error('ordinateur : le texte tel quel');
  // Une étape propre à une mise en page n'apparaît que dans celle-là.
  const affecter = findAdminTour('affecter')!;
  if (adminStepsFor(affecter, false)[0].cible !== 'bureau-planning.case') throw new Error('affecter (ordinateur) : une case vide');
  if (adminStepsFor(affecter, true)[0].cible !== 'bureau-planning.ajouter') throw new Error('affecter (mobile) : « Ajouter un chantier »');
});

Deno.test('Guides bureau : sous 1024 px les boutons de la barre sont des lignes du menu ☰ (réglages compris)', () => {
  const debut = (id: string, narrow: boolean) => adminStepsFor(findAdminTour(id)!, narrow).map((s) => `${s.ecran ?? '-'}:${s.cible}`);
  for (const id of ['reglages', 'support', 'recap', 'caisse', 'collegues', 'abonnement']) {
    const o = debut(id, false), m = debut(id, true);
    const i = o.findIndex((x) => x.endsWith(':bureau-nav.compte'));
    if (i < 0 || o[i + 1] !== 'compte:bureau-nav.reglages') throw new Error(`${id} ordinateur : le nom de l’entreprise puis « Réglages » — ${o}`);
    const j = m.findIndex((x) => x.endsWith(':bureau-nav.reglages'));
    if (m.some((x) => x.endsWith(':bureau-nav.compte'))) throw new Error(`${id} mobile : pas de menu du compte — ${m}`);
    if (j < 1 || m[j] !== 'menu:bureau-nav.reglages' || m[j - 1] !== 'planning:bureau-nav.menu') throw new Error(`${id} mobile : « Menu » puis « Réglages » — ${m}`);
  }
  // Toute étape visant une ligne du ☰ est précédée de « Menu » (une seule fois) et préparée sur l'écran « menu ».
  for (const t of ADMIN_TOURS) {
    const m = adminStepsFor(t, true);
    const lignes = m.filter((s) => MENU_CIBLES.includes(s.cible) || (s.ecran === 'menu' && s.cible !== 'bureau-nav.menu')); // + le haut du ☰ v2 (semaine, chiffres)
    for (const s of lignes) if (s.ecran !== 'menu') throw new Error(`${t.id} : « ${s.cible} » sous 1024 px doit préparer l’écran menu`);
    const menus = m.filter((s) => s.cible === 'bureau-nav.menu');
    if (lignes.length ? menus.length !== 1 : menus.length !== 0) throw new Error(`${t.id} : ${menus.length} étape(s) « Menu » pour ${lignes.length} ligne(s) du ☰`);
    if (lignes.length && m.indexOf(menus[0]) > m.indexOf(lignes[0])) throw new Error(`${t.id} : « Menu » doit précéder la première ligne du ☰`);
    // Sur ordinateur, jamais d'étape « Menu » ni d'écran « menu ».
    const o = adminStepsFor(t, false);
    if (o.some((s) => s.cible === 'bureau-nav.menu' || s.ecran === 'menu')) throw new Error(`${t.id} : le ☰ n’existe pas à l’ordinateur`);
  }
  // « S’abonner » : sous 1024 px on vise celui de l’en-tête, pas celui du ☰.
  if (MENU_CIBLES.includes('bureau-nav.abonner')) throw new Error('abonner ne fait pas partie du ☰');
});

Deno.test('Guides bureau : « Suivant » seul mène aux Réglages (l’étape qui suit « Réglages de l’entreprise » ouvre la fenêtre)', () => {
  for (const t of ADMIN_TOURS) for (const narrow of [false, true]) {
    const e = adminStepsFor(t, narrow);
    const i = e.findIndex((s) => s.cible === 'bureau-nav.reglages');
    if (i < 0) continue;
    const suite = e[i + 1];
    if (suite && suite.ecran !== 'reglages') throw new Error(`${t.id} (${narrow ? 'mobile' : 'ordi'}) : l’étape « ${suite.cible} » après « Réglages » doit préparer l’écran reglages`);
    // Toute étape qui vise un bouton des Réglages a la fenêtre ouverte avant elle.
    e.forEach((s, j) => { if (/^bureau-reglages\./.test(s.cible) && !e.slice(0, j + 1).some((x) => x.ecran === 'reglages')) throw new Error(`${t.id} : « ${s.cible} » sans écran reglages avant`); });
  }
  // « Un seul salarié ? » remplace la fenêtre d’export d’équipe : l’étape suivante la rouvre.
  const tel = findAdminTour('telecharger')!.etapes;
  const i = tel.findIndex((s) => s.cible === 'bureau-export.un-salarie');
  const equipe = GUIDES_BUREAU_UI2 ? 'bureau-export.equipe' : 'bureau-export.menu'; // v2 : « Toute l'équipe », en haut du panneau
  if (tel[i + 1]?.cible !== equipe || tel[i + 1]?.ecran !== 'export') throw new Error('telecharger : l’étape « toute l’équipe » doit préparer l’écran export');
});

Deno.test('Guides bureau : chaque cible existe comme data-guide dans le code des écrans', async () => {
  const found = anchors(await sources());
  const missing: string[] = [];
  for (const t of ADMIN_TOURS) for (const narrow of [false, true]) adminStepsFor(t, narrow).forEach((e, i) => {
    if (!found.has(e.cible)) missing.push(`${t.id} étape ${i + 1} → data-guide="${e.cible}"`);
  });
  if (missing.length) throw new Error(`Ancres introuvables :\n${Array.from(new Set(missing)).join('\n')}`);
  for (const a of SHARED) if (!found.has(a)) throw new Error(`ancre partagée « ${a} » absente`);
});

Deno.test('Guides bureau : une ancre n’a qu’un seul élément, sauf celles prévues (DUAL), et aucune n’est inutilisée', async () => {
  const found = anchors(await sources(false));
  const doubles: string[] = [];
  for (const [k, n] of found) {
    if (!/^bureau-/.test(k)) continue;
    const max = DUAL[k] ?? 1;
    if (n > max) doubles.push(`${k} ×${n} (maximum ${max})`);
  }
  if (doubles.length) throw new Error(`Ancres en double (un seul élément par écran, ou à ajouter à DUAL avec la raison) : ${doubles.join(', ')}`);
  for (const k of Object.keys(DUAL)) if (!found.has(k)) throw new Error(`DUAL : « ${k} » n’est plus posée`);
  // …et une ancre `bureau-*` que plus aucune fiche ne vise est un reste à retirer.
  const used = allCibles();
  const orphans = Array.from(found.keys()).filter((k) => /^bureau-/.test(k) && !used.has(k)).sort();
  if (orphans.length) throw new Error(`Ancres posées mais jamais visées : ${orphans.join(', ')}`);
});

Deno.test('Guides bureau : aucun geste qui agit sur une ligne précise n’est entouré (la LISTE l’est, et la phrase le dit)', async () => {
  const src0 = await sources();
  const found = anchors(src0);
  const used = allCibles();
  for (const a of AGIT_PAR_LIGNE) {
    if (used.has(a)) throw new Error(`une fiche vise « ${a} » : geste qui agit sur UNE ligne, entourez la liste`);
    if (found.has(a)) throw new Error(`« ${a} » est posée dans le code : geste qui agit sur UNE ligne, jamais d’ancre dessus`);
  }
  for (const t of ADMIN_TOURS) for (const e of t.etapes.filter((s) => LISTES.includes(s.cible))) {
    if (!/(bonne|voulu|à côté|Repérez|Choisissez|Regardez)/.test(e.texte)) throw new Error(`${t.id} : l’étape sur la liste « ${e.cible} » doit dire de choisir la bonne ligne — ${e.texte}`);
  }
  // Le crayon est répété (un par client) : la phrase dit lequel, car l'étape suivante peut être « Archiver » ou « Supprimer ».
  for (const t of ADMIN_TOURS) for (const narrow of [false, true]) for (const e of adminStepsFor(t, narrow).filter((x) => x.cible === 'bureau-clients.crayon')) {
    if (!/(voulu|concerné)/.test(e.texte)) throw new Error(`${t.id} (${narrow ? 'mobile' : 'ordi'}) : le client n’est pas nommé « voulu » — ${e.texte}`);
  }
  // L'ancre d'une LISTE est sur UN conteneur, jamais sur chaque ligne (sinon l'anneau désigne la première demande / le premier chantier
  // avec ses boutons ✓ ✗ « Lever la réserve » dedans). Le conteneur reprend la mise en page de la fenêtre (grid gap-4) : aucun changement d'écran.
  const lignesDe = (file: string, ancre: string) => (src0[file] ?? '').split('\n').filter((l) => l.includes(`data-guide="${ancre}"`));
  for (const [file, ancre, ligne] of [['components/leave-admin-dialog.tsx', 'bureau-conges.liste', 'bt-la-row'], ['components/reserves-report.tsx', 'bureau-reserves.liste', 'bt-rr-site']]) {
    const l = lignesDe(file, ancre);
    eq(l.length, 1, `${ancre} : une seule ancre dans ${file}`);
    if (l[0].includes(ligne) || !l[0].includes('grid grid-cols-[minmax(0,1fr)] gap-4')) throw new Error(`${ancre} : sur le conteneur de la liste (div grid), pas sur une ligne « ${ligne} » — ${l[0].trim()}`);
  }
  // La caisse de congés : l'ancre est un attribut de la ligne elle-même (pas un div autour qui décale l'anneau de 4 px).
  if (/<div[^>]*data-guide="bureau-reglages\.caisse"/.test(src0['components/company-settings.tsx'])) throw new Error('bureau-reglages.caisse : pas de div autour de LeaveFundSetting');
  if (!/<div className="bt-set-sub bt-set-rem" data-guide=\{guide\}>/.test(src0['components/leave-fund-setting.tsx'])) throw new Error('LeaveFundSetting : data-guide={guide} sur sa ligne');
  // La feuille imprimée n'a aucune ancre (elle n'est pas à l'écran).
  const src = await sources();
  if (/data-guide/.test(src['components/planning-print.tsx'] ?? '')) throw new Error('planning-print.tsx : pas d’ancre sur la feuille imprimée');
  const code = src['components/admin-planning.tsx'];
  const from = code.indexOf('const renderPrintCell');
  const to = code.indexOf('const renderMonthCell', from);
  if (from < 0 || to < 0) throw new Error('renderPrintCell / renderMonthCell introuvables dans admin-planning.tsx');
  if (/data-guide/.test(code.slice(from, to))) throw new Error('renderPrintCell : pas d’ancre sur la feuille imprimée');
});

Deno.test('Guides bureau : chaque libellé cité entre « » existe dans le code des écrans', async () => {
  const src = N(Object.values(await sources()).join('\n'));
  const missing: string[] = [];
  for (const t of ADMIN_TOURS) for (const e of stepsOf(t)) for (const label of quoted(e.texte)) {
    if (NOT_LABELS.has(label)) continue;
    if (!src.includes(N(label))) missing.push(`${t.id} → « ${label} »`);
  }
  if (missing.length) throw new Error(`Libellés introuvables dans le code :\n${Array.from(new Set(missing)).join('\n')}`);
});

Deno.test('Guides bureau : verrous de sécurité sur les textes (verrouillage, absences, accès du support, glisser)', () => {
  const texte = (id: string, cible: string, narrow = false) => {
    const e = adminStepsFor(findAdminTour(id)!, narrow).find((s) => s.cible === cible);
    if (!e) throw new Error(`${id} : pas d’étape sur ${cible}`);
    return e.texte;
  };
  for (const t of ADMIN_TOURS) for (const e of t.etapes) {
    if ((e.cible === 'bureau-export.menu' || e.cible === 'bureau-export.equipe') && !/verrouill/.test(e.texte)) throw new Error(`${t.id} : l’export d’équipe verrouille les heures, la phrase doit le dire — ${e.texte}`);
    if (/Clôturer/.test(e.texte) && e.cible === 'bureau-export.mois' && !/verrouill/.test(e.texte)) throw new Error(`${t.id} : « Clôturer » verrouille, la phrase doit le dire`);
  }
  if (!/verrouill/.test(texte('cloture', 'bureau-export.mois'))) throw new Error('cloture : verrouille');
  if (!/verrouill/.test(texte('telecharger', GUIDES_BUREAU_UI2 ? 'bureau-export.equipe' : 'bureau-export.menu'))) throw new Error('telecharger : l’export d’équipe verrouille');
  if (!/sans rien verrouiller/.test(texte('telecharger', 'bureau-export.un-salarie'))) throw new Error('telecharger : « Un seul salarié ? » ne verrouille rien');
  if (!/ne verrouille rien/.test(texte('cloture_salarie', 'bureau-fiche.exporter'))) throw new Error('cloture_salarie : l’export du salarié ne verrouille rien');
  if (!/à partir/.test(texte('present', 'bureau-statut.present'))) throw new Error('present : « à partir » du jour écrit en haut');
  const sup = texte('support', 'bureau-reglages.support');
  if (!/durée/.test(sup) || !/lecture seule/.test(sup) || !/retire/.test(sup)) throw new Error(`support : durée, lecture seule, retrait — ${sup}`);
  if (!texte('deplacer', 'bureau-planning.case').includes('cadre jaune')) throw new Error('deplacer : « cadre jaune » (pas « anneau »)');
  if (!texte('deplacer', 'bureau-planning.bulle').includes('Ne cliquez pas')) throw new Error('deplacer : « Ne cliquez pas » dessus');
  if (!findAdminTour('deplacer')!.ordi) throw new Error('deplacer : ordinateur seulement');
  for (const t of ADMIN_TOURS) if (t.ordi && t.id !== 'deplacer') throw new Error(`${t.id} : seul le glisser-déposer est réservé à l’ordinateur`);
});

Deno.test('Guides bureau : le guide n’ouvre que de la navigation (aucun écran qui agit, borne jamais ouverte)', () => {
  const ecrans = new Set(ADMIN_TOURS.flatMap(stepsOf).map((s) => s.ecran).filter(Boolean));
  for (const e of ecrans) if (!(ADMIN_SCREENS as string[]).includes(e!)) throw new Error(`écran « ${e} » hors liste`);
  for (const bad of ['borne', 'kiosk', 'statistiques', 'formations', 'imports', 'impression', 'assistant', 'selection', 'selectionner', 'fiche', 'facture']) {
    if ((ADMIN_SCREENS as string[]).includes(bad)) throw new Error(`ADMIN_SCREENS ne doit pas contenir « ${bad} » (geste qui agit ou écran avec saisie)`);
  }
});

// ── Les boutons dans les réponses de l'assistant ────────────────────────────
const TODAY = '2026-09-30';
const CTX: ActionContext = {
  today: TODAY,
  salaries: [
    { id: 'u-karim', prenom: 'Karim', nom: 'Benali', role: 'worker' },
    { id: 'u-martin', prenom: 'Pierre', nom: 'Martin', role: 'worker' },
    { id: 'u-dupont', prenom: 'Pierrick', nom: 'Dupont', role: 'worker' },
  ],
  chantiers: [{ id: 'w-dupont', nom: 'Villa Dupont', ville: 'Lyon' }, { id: 'w-martin', nom: 'Bureau Martin', ville: 'Villeurbanne' }],
  planning: [], congesEnAttente: [],
};
const avec = (demande: string): ActionContext => ({ ...CTX, demande });
const actions = (r: { links: { action: string }[] }) => r.links.map((l) => l.action);
const eq = (a: unknown, b: unknown, msg: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); };

Deno.test('Guides bureau : guideLinks = raccourci d’écran puis « Me guider pas à pas » (une seule fabrique)', () => {
  if (TOUR_LABEL !== 'Me guider pas à pas') throw new Error(TOUR_LABEL);
  for (const g of GUIDE) {
    const l = guideLinks(g);
    if (hasAdminTour(g.id)) {
      eq(l.map((x) => x.action), [g.lien, `guide:${g.id}`], `${g.id} : raccourci puis guide`);
      eq(l[1], { label: 'Me guider pas à pas', action: tourAction(g.id) }, `${g.id} : libellé`);
      eq(guideButton(g), l[1], `${g.id} : le bouton`);
    } else {
      eq(l.map((x) => x.action), [g.lien], `${g.id} : le raccourci seul`);
      eq(guideButton(g), null, `${g.id} : pas de bouton`);
    }
  }
});

Deno.test('Guides bureau : voie locale — les 4 phrases du banc qui sont des « comment » gagnent le bouton, rien d’autre ne change', () => {
  const cas: [string, string[]][] = [
    ['comment je télécharge les heures du mois en excel ?', ['export', 'guide:telecharger']],
    ['à quoi sert le bouton réserves', ['reserves', 'guide:reserves']],
    ['explique moi comment déplacer une intervention', ['planning', 'guide:deplacer']],
    ['Comment je corrige le pointage d’un salarié ?', ['salaries', 'guide:corriger']],
    ['Comment j’ajoute un salarié ?', ['nouveau_salarie', 'guide:ajouter_salarie']],
  ];
  for (const [phrase, liens] of cas) eq(actions(handleActionLocally(phrase, avec(phrase))!), liens, phrase);
  // Pas une demande « comment » : la voie locale ne répond pas, et la voie modèle n'a pas de bouton.
  eq(handleActionLocally('rédige un petit message pour dire au client que le chantier est décalé à lundi', CTX), null, 'rédaction → modèle');
});

Deno.test('Guides bureau : voie modèle (faux appel « repondre ») — le guide de la fiche qui correspond, jamais celui d’une autre', () => {
  // Pour chaque fiche dont la réponse écrite se retrouve (la recherche par mots n'est pas bijective) : le bouton suit son raccourci.
  let testees = 0;
  for (const g of GUIDE) {
    const q = `comment ${g.mots[0]}`;
    const rep = guideAnswer(g);
    if (findGuide(q)?.id !== g.id || findGuide(rep)?.id !== g.id) continue;
    testees++;
    const guide = hasAdminTour(g.id) ? [`guide:${g.id}`] : [];
    eq(actions(fromFunctionCall('repondre', { reponse: rep }, avec(q))), [g.lien, ...guide], `${g.id} : sans lien du modèle`);
    eq(actions(fromFunctionCall('repondre', { reponse: rep, liens: [g.lien, 'couts'] }, avec(q))), Array.from(new Set([g.lien, ...guide, 'couts'])), `${g.id} : le bouton juste après son raccourci`);
    // Le lien du modèle est celui d'un AUTRE écran : jamais le guide d'une autre fiche.
    const autre = g.lien === 'couts' ? 'reserves' : 'couts';
    eq(actions(fromFunctionCall('repondre', { reponse: rep, liens: [autre] }, avec(q))), [autre], `${g.id} : autre écran, pas de bouton`);
  }
  if (testees < 25) throw new Error(`${testees} fiches seulement testées sur la voie modèle`);
  // Une demande de rédaction (b32) : jamais de bouton.
  const b32 = 'rédige un petit message pour dire au client que le chantier est décalé à lundi';
  eq(actions(fromFunctionCall('repondre', { reponse: 'Bonjour, le chantier est décalé à lundi.' }, avec(b32))).filter((a) => a.startsWith('guide:')), [], 'b32 : pas de guide');
  // Une question de précision, ou des données : jamais de bouton.
  eq(actions(fromFunctionCall('repondre', { reponse: 'Quel Martin ?' }, avec('mets Martin ou Karim sur le planning'))).filter((a) => a.startsWith('guide:')), [], '« Quel Martin ? »');
  eq(actions(fromFunctionCall('repondre', { reponse: 'Quel salarié ?' }, avec('comment ajouter un salarié'))).filter((a) => a.startsWith('guide:')), [], '« Quel salarié ? »');
  eq(actions(fromFunctionCall('repondre', { reponse: 'Dupont n’a pas pointé hier : 0 h sur 7 h prévues.', liens: ['salarie'], salarie_id: 'u-karim' }, avec('comment ça se fait que Dupont n’a pas pointé ?'))).filter((a) => a.startsWith('guide:')), [], 'réponse chiffrée');
  // « Je n'ai pas accès » remplacé par la fiche : le bouton suit la fiche affichée.
  const refus = fromFunctionCall('repondre', { reponse: 'Je n’ai pas accès à la création de salariés. Ajouter un salarié se fait dans Salariés.', liens: ['nouveau_salarie'] }, avec('comment j’ajoute un salarié ?'));
  if (/pas acc[eè]s/i.test(refus.answer)) throw new Error('refus non remplacé');
  eq(actions(refus), ['nouveau_salarie', 'guide:ajouter_salarie'], 'refus remplacé par la fiche');
  // Plafond : 3 liens du modèle + le bouton = 4 entrées au plus.
  const exp = GUIDE.find((g) => g.id === 'export')!;
  const tous = fromFunctionCall('repondre', { reponse: guideAnswer(exp), liens: ['export', 'couts', 'reserves', 'salaries'] }, avec('comment je fais un export des heures'));
  eq(actions(tous), ['export', 'guide:export', 'couts', 'reserves'], 'trois liens du modèle au plus, plus le bouton (qui suit son raccourci)');
  // Le modèle ne choisit jamais un guide : un lien « guide:… » venu de lui est écarté.
  eq(actions(fromFunctionCall('repondre', { reponse: 'ok', liens: ['guide:export'] }, avec('bonjour'))), [], 'lien guide du modèle écarté');
});

Deno.test('Guides bureau : les phrases avec fichier (b17, b18, b19) n’ont jamais de bouton', () => {
  for (const phrase of [
    'Classe ce document sur le chantier de Pierre-Paul Jacques à Viriat, c’est une facture payée',
    'range ça sur le chantier de viriat',
    'nouveau client, voilà son devis validé',
  ]) eq(actions(fromFunctionCall('repondre', { reponse: 'ok' }, avec(phrase))).filter((a) => a.startsWith('guide:')), [], phrase);
});

// EMPREINTE DÉCLARÉE, livraison 3b-0 (2026-10-15). Avant : 11 200 octets, SHA-256 8e2b61c3…959e6a. Après : 12 791 octets, SHA-256 308fecf4…6a3f.
// Pourquoi elle bouge, exprès : trois fiches fausses du GUIDE sont corrigées (« imprimer » ne répond plus par l'export des heures ; « chantier terminé » ne
// répond plus par « Archiver » ; la fiche « borne » dit où est le bouton et ce que fait la fenêtre) et deux fiches sont ajoutées (« Imprimer le planning »,
// « Terminer un chantier »). `[lien:…]` était DÉJÀ imprimé avant 3b-0 : il n'est pour rien dans le changement. Le prochain déplacement sera 3b-1 (variante de GUIDE
// derrière le secret) ; ce test se met alors à jour de la même façon, avec sa date, jamais en le contournant.
// EMPREINTE DÉCLARÉE, correction de relecture 3b-1 (2026-10-15). Avant : 12 791 octets, SHA-256 308fecf4…6a3f. Après : 12 778 octets, SHA-256 5766f6e9…3198.
// Pourquoi elle bouge, exprès : la PR #200 avait mis 4 étapes dans quatre fiches (archiver_client, terminer_chantier, telecharger, imprimer_planning) alors que la règle
// de assistant-aide.test.ts est « 3 étapes au plus » (et citait un libellé « Télécharger les heures » qui n'est un bouton nulle part). Les étapes sont fusionnées,
// sans perdre d'information, et le renvoi pointe le vrai bouton « Exporter ». Aucune autre fiche ne change.
// EMPREINTE DÉCLARÉE, bascule du bureau v2 (2026-10-19). Avant : 12 778 octets, SHA-256 5766f6e9…3198. Après : 12 833 octets, SHA-256 02d2bbe4…5d4f.
// Pourquoi elle bouge, exprès : le bureau v2 devient l'écran de tous ; les fiches du GUIDE qui décrivaient l'ancien écran disent où sont les boutons du nouveau
// (« Plus ⋯ » pour Coût chantiers, Réserves, Borne, Imprimer ; « Accepter » / « Refuser » pour les congés ; « Corriger » dans la ligne ; « PDF », « Excel », « CSV paie » ;
// « Salariés » → « Invitations en attente » ; Réglages par le nom de l'entreprise ; l'onglet « Gérer » pour la clôture ; les versions du planning ne sont plus affichées).
// Mêmes ids, mêmes liens, aucune fiche ajoutée ni retirée.
Deno.test('Guides bureau : la consigne envoyée au modèle porte l’empreinte déclarée (bascule du bureau v2), et ne parle pas des guides', async () => {
  const bytes = new TextEncoder().encode(guideForPrompt());
  if (bytes.length !== 12833) throw new Error(`guideForPrompt : ${bytes.length} octets (12833 attendus)`);
  const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((b) => b.toString(16).padStart(2, '0')).join('');
  eq(sha, '02d2bbe419667927f828f173b3d0a355ac8cfb4ae6a31f9aacec04b26ee25d4f', 'SHA-256 de guideForPrompt');
  const prompt = actionPrompt(CTX, '{}', guideForPrompt(), 'x');
  if (/Me guider pas à pas|guide:/.test(prompt)) throw new Error('la consigne ne doit pas contenir les guides pas à pas');
});

Deno.test('Guides bureau : une seule fabrique du bouton, et le guide ne fait rien à la place du patron', async () => {
  const core = bare(await Deno.readTextFile('supabase/functions/_shared/assistant-actions-core.ts'));
  eq((core.match(/\btourAction\(/g) ?? []).length, 1, 'tourAction( dans assistant-actions-core.ts');
  for (const f of ['supabase/functions/assistant/index.ts', 'lib/assistant.ts']) {
    const code = bare(await Deno.readTextFile(f));
    if (/\btourAction\(/.test(code)) throw new Error(`${f} : le bouton se fabrique avec guideLinks, pas à la main`);
    if (/links: \[\{ label: NAV_ACTIONS\[/.test(code)) throw new Error(`${f} : lien de guide fabriqué à la main`);
  }
  if (/links: \[\{ label: NAV_ACTIONS\[/.test(core)) throw new Error('assistant-actions-core.ts : lien de guide fabriqué à la main');
  // Le schéma de l'outil du modèle ne propose pas « guide:… ». Étape 3, 3a-2 : les déclarations ne sont plus écrites dans le source
  // d'assistant-actions-core.ts (on y lisait le texte entre `export const ASSISTANT_FUNCTIONS` et `export const ATTACHMENT_ACTIONS`) mais
  // générées depuis le registre : on lit donc les déclarations ELLES-MÊMES, celles que le modèle reçoit, et non un morceau de source.
  const declarations = JSON.stringify(ASSISTANT_FUNCTIONS);
  if (/guide:/.test(declarations)) throw new Error('le modèle ne choisit pas les guides');
  const liens = ASSISTANT_FUNCTIONS.find((f) => f.name === 'repondre')?.parameters.properties.liens as { items: { enum: string[] } } | undefined;
  if (!liens || !liens.items.enum.length || liens.items.enum.some((l) => l.startsWith('guide'))) throw new Error('les liens proposés au modèle (repondre.liens) ne contiennent aucun guide');
  // …et la liste n'est plus tenue à la main dans le cœur : assistant-actions-core.ts ne déclare plus d'outil.
  if (/export const ASSISTANT_FUNCTIONS|name: 'repondre'/.test(core)) throw new Error('assistant-actions-core.ts : les déclarations d’outils vivent au registre (registre/outils-bureau.ts)');
  // Le composant commun n'a pas bougé : aucun appel réseau, aucun clic, aucun stockage.
  const src = await sources();
  const tour = bare(src['components/guide-tour.tsx']);
  for (const bad of [/\.click\(/, /dispatchEvent/, /\bfetch\(/, /supabase/, /sendBeacon/, /XMLHttpRequest/, /localStorage/, /sessionStorage/, /indexedDB/, /\.submit\(/, /\.requestSubmit\(/]) {
    if (bad.test(tour)) throw new Error(`guide-tour.tsx ne doit pas contenir ${bad}`);
  }
  // …et le bureau ne lui fait ouvrir que de la navigation.
  const page = src['components/admin-planning.tsx'];
  const from = page.indexOf('const tourStep');
  const body = from < 0 ? '' : bare(page.slice(from, page.indexOf('const closeTour', from)));
  if (!body) throw new Error('tourStep introuvable dans components/admin-planning.tsx');
  if (!/setExportWorkerOpen\(false\)/.test(body)) throw new Error('tourStep : doit fermer « Exporter un salarié » (navigation) pour retrouver l’export d’équipe');
  if (!/mq\.addEventListener\('change', closeTour\)/.test(bare(page)) || !/mq\.removeEventListener\('change', closeTour\)/.test(bare(page))) {
    throw new Error('admin-planning.tsx : le guide doit se fermer quand la largeur franchit 1024 px (matchMedia change)');
  }
  for (const bad of [/\breset[A-Z]\w*\(/, /setKioskOpen/, /enterSelect/, /exitSelect/, /setSelectMode/, /setAssistantOpen\(true/, /supabase/, /\.click\(/, /\bfetch\(/, /functions\.invoke/, /window\.open/, /\.(insert|update|upsert|delete)\(/]) {
    if (bad.test(body)) throw new Error(`tourStep (bureau) ne doit pas appeler ${bad}`);
  }
});

// ── La console du SUPPORT BEMEXO (/support) ─────────────────────────────────
const ETATS: ConsoleKind[] = ['loading', 'signed-out', 'not-staff', 'enroll', 'challenge', 'ready', 'inside'];
const SUPPORT_FILE = 'components/support-console.tsx';

Deno.test('Guide du support : une fiche à 6 ancres, un nombre d’étapes précis par état, rien pour loading et not-staff', () => {
  const cibles = SUPPORT_TOUR.map((e) => e.cible);
  eq(new Set(cibles).size, 6, 'ancres distinctes de la fiche support');
  for (const e of SUPPORT_TOUR) {
    if (!/^support-console\.[a-z]+$/.test(e.cible)) throw new Error(`cible « ${e.cible} » de forme inattendue`);
    if (!e.etats.length) throw new Error(`${e.cible} : aucun état`);
    for (const k of e.etats) if (!ETATS.includes(k)) throw new Error(`${e.cible} : état « ${k} » inconnu`);
  }
  const n = (k: ConsoleKind, narrow = false) => supportStepsFor(k, narrow).length;
  for (const narrow of [false, true]) {
    eq([n('signed-out', narrow), n('enroll', narrow), n('challenge', narrow), n('ready', narrow), n('inside', narrow)], [1, 3, 2, 1, 1], `étapes par état (${narrow ? '< 1024 px' : 'ordinateur'})`);
    eq([n('loading', narrow), n('not-staff', narrow)], [0, 0], 'aucune étape tant qu’on ne sait pas qui est là, ni pour un compte qui n’est pas du support');
  }
  eq(supportStepsFor('enroll', false).map((s) => s.cible), ['support-console.qr', 'support-console.code', 'support-console.valider'], 'enroll : QR, champ du code, Valider');
  eq(supportStepsFor('challenge', false).map((s) => s.cible), ['support-console.code', 'support-console.valider'], 'challenge : champ du code, Valider');
});

Deno.test('Guide du support : phrases courtes, simples, au vouvoiement, « Touchez » sous 1024 px', () => {
  for (const k of ETATS) for (const narrow of [false, true]) supportStepsFor(k, narrow).forEach((e, i) => {
    const at = `support ${k} ${narrow ? 'mobile' : 'ordi'} étape ${i + 1}`;
    if (e.texte.length > 140) throw new Error(`${at} : ${e.texte.length} caractères (140 au plus) — ${e.texte}`);
    if (!/[.]$/.test(e.texte)) throw new Error(`${at} : la phrase doit finir par un point — ${e.texte}`);
    const low = e.texte.toLowerCase();
    for (const w of BANNED) if (low.includes(w)) throw new Error(`${at} : mot à éviter « ${w} » — ${e.texte}`);
    const tu = TUTOIEMENT.exec(e.texte);
    if (tu) throw new Error(`${at} : tutoiement ou impératif « ${tu[0]} » (vouvoiement) — ${e.texte}`);
    if (narrow && /cliqu/i.test(e.texte)) throw new Error(`${at} : « cliquez » sous 1024 px (on touche) — ${e.texte}`);
    if (!narrow && /touch|appuy/i.test(e.texte.replace(/«[^»]*»/g, ''))) throw new Error(`${at} : « touchez » à l’ordinateur — ${e.texte}`);
    if (/Sortir/.test(e.texte)) throw new Error(`${at} : le bouton s’appelle « Quitter », « Sortir » n’existe nulle part`);
  });
  // On ne scanne pas le QR code affiché sur l'écran qu'on tient : la phrase mobile parle de la clé (l'œil de la page).
  if (!/œil/.test(supportStepsFor('enroll', true)[0].texte) || /œil/.test(supportStepsFor('enroll', false)[0].texte)) throw new Error('enroll : la phrase mobile parle de l’œil, pas la phrase ordinateur');
  eq(supportStepsFor('inside', true)[0].texte, 'Vous êtes en lecture seule. Touchez « Quitter » quand vous avez fini.', 'inside sous 1024 px');
  eq(supportStepsFor('signed-out', true)[0].texte, 'Touchez « Se connecter » avec le compte support, puis revenez sur cette page.', 'signed-out sous 1024 px');
});

Deno.test('Guide du support : le visiteur non connecté n’apprend rien de plus que la page publique (une seule étape, « Se connecter »)', () => {
  const out = supportStepsFor('signed-out', false);
  eq(out.length, 1, 'signed-out : une étape');
  if (!out[0].texte.includes('« Se connecter »')) throw new Error(`signed-out : « Se connecter » — ${out[0].texte}`);
  for (const mot of ['QR', 'Valider', 'Entrer', 'Quitter', 'code', 'entreprise', 'authentification']) {
    if (out.map((e) => e.texte).join(' ').includes(mot)) throw new Error(`signed-out : la fiche ne doit pas parler de « ${mot} »`);
  }
  // …et les étapes qui parlent de double vérification, d'entreprises ou de lecture seule ne sont jamais dites avant.
  for (const e of SUPPORT_TOUR) if (e.etats.includes('signed-out') && e.etats.length !== 1) throw new Error(`${e.cible} : l’étape de connexion est la seule du visiteur`);
  for (const k of ['signed-out', 'loading', 'not-staff'] as ConsoleKind[]) {
    if (supportStepsFor(k, false).some((e) => /valider|entrer|quitter|qr/i.test(e.cible))) throw new Error(`${k} : aucune étape de la console vérifiée`);
  }
});

Deno.test('Guide du support : les libellés cités et les ancres existent dans support-console.tsx, « Entrer » n’est jamais entouré', async () => {
  const src = await sources();
  const code = src[SUPPORT_FILE];
  if (!code) throw new Error(`${SUPPORT_FILE} introuvable`);
  const texte = N(code);
  for (const e of SUPPORT_TOUR) for (const label of [...quoted(e.texte), ...quoted(e.mobile ?? '')]) if (!texte.includes(N(label))) throw new Error(`${e.cible} : « ${label} » absent de ${SUPPORT_FILE}`);
  for (const label of ['Se connecter', 'Valider', 'Entrer', 'Quitter']) if (!texte.includes(N(label))) throw new Error(`« ${label} » absent de ${SUPPORT_FILE}`);
  if (/Sortir/.test(code)) throw new Error('« Sortir » n’existe pas dans la console (le bouton est « Quitter »)');
  // Chaque ancre est posée, une fois — sauf la liste des entreprises : la liste OU la ligne « Aucune pour l'instant ».
  const found = anchors({ [SUPPORT_FILE]: code });
  for (const e of SUPPORT_TOUR) if (!found.has(e.cible)) throw new Error(`ancre « ${e.cible} » absente de ${SUPPORT_FILE}`);
  for (const [k, n] of found) {
    const max = k === 'support-console.entreprises' ? 2 : 1;
    if (n !== max) throw new Error(`${k} ×${n} (${max} attendu)`);
  }
  eq(Array.from(found.keys()).sort(), SUPPORT_TOUR.map((e) => e.cible).filter((c, i, a) => a.indexOf(c) === i).sort(), 'les ancres posées sont exactement celles de la fiche');
  // L'ancre « entreprises » : sur le conteneur de la liste et sur la ligne vide, jamais sur la ligne du bouton « Entrer ».
  const lignes = code.split('\n').filter((l) => l.includes('support-console.entreprises'));
  eq(lignes.length, 2, 'support-console.entreprises : deux endroits');
  if (!lignes.some((l) => /<div className="sc-list"/.test(l))) throw new Error('support-console.entreprises doit être sur <div className="sc-list">');
  if (!lignes.some((l) => /<p data-guide=[^>]*>Aucune pour/.test(l))) throw new Error('support-console.entreprises doit être aussi sur la ligne « Aucune pour l’instant »');
  for (const l of code.split('\n')) if (/support-enter|onEnter/.test(l) && /data-guide/.test(l)) throw new Error('« Entrer » ouvre l’espace d’un client : jamais d’ancre dessus');
  for (const a of AGIT_PAR_LIGNE.filter((x) => x.startsWith('support-'))) if (found.has(a)) throw new Error(`${a} : jamais posée`);
  // Un patron ou un salarié connecté voit « Accès réservé » : aucun bouton (l'état not-staff n'a pas de fiche).
  if (!/Accès réservé/.test(code)) throw new Error('« Accès réservé » (état not-staff) introuvable');
});

Deno.test('Guide du support : le bouton ne fait que lancer l’affichage (rien lu au rendu, aucune action de la console appelée)', async () => {
  const code = await Deno.readTextFile(SUPPORT_FILE);
  // Les apostrophes d'un <style> rendu côté serveur font échouer l'hydratation (erreurs 418/423/425).
  const css = /const CSS = `([\s\S]*?)`;/.exec(code)?.[1];
  if (!css) throw new Error('CSS introuvable');
  if (/['’]/.test(css)) throw new Error('le CSS de la console ne doit contenir aucune apostrophe');
  if (!/\.sc-guide\{/.test(css)) throw new Error('classe sc-guide absente du CSS');
  // Sous 480 px titre et bouton ne tiennent pas sur une ligne : le bouton prend toute la largeur sous le titre (pas seul à droite).
  if (!/@media \(max-width:480px\)\{\.sc-guide\{margin-left:0;width:100%/.test(css)) throw new Error('.sc-guide doit passer pleine largeur sous 480 px');
  const nu = bare(code);
  // matchMedia / window : seulement dans le gestionnaire du clic (la page est exportée en statique).
  const lignesWindow = nu.split('\n').filter((l) => /\bwindow\b|matchMedia|\bdocument\b/.test(l));
  eq(lignesWindow.length, 1, 'window / matchMedia / document dans support-console.tsx');
  if (!/const openTour = \(\) => setTour\(\{ kind: step\.kind, steps: supportStepsFor\(step\.kind, window\.matchMedia\('\(max-width: 1023px\)'\)\.matches\) \}\);/.test(lignesWindow[0])) throw new Error(`la largeur doit être lue dans openTour seulement — ${lignesWindow[0]}`);
  if (!/onClick=\{openTour\}/.test(nu) || !/data-testid="support-guide-open"/.test(nu)) throw new Error('bouton support-guide-open branché sur openTour');
  // openTour et le guide n'appellent jamais une action de la console.
  const guide = nu.split('\n').filter((l) => !/^\s*import /.test(l) && /openTour|setTour|GuideTour|tourSteps|supportStepsFor/.test(l)).join('\n');
  for (const bad of [/\bonLogin\(/, /\bonVerify\(/, /\bonEnter\(/, /\bonExit\(/, /\bonBack\(/, /\brefresh\(/, /\bfetch\(/, /supabase/, /\.click\(/, /localStorage|sessionStorage/]) {
    if (bad.test(guide)) throw new Error(`le guide ne doit pas appeler ${bad}`);
  }
  // Les étapes sont rangées dans l'état au clic : de nouveaux objets à chaque rendu relanceraient <GuideTour> à chaque rendu de la console.
  if (/steps=\{supportStepsFor/.test(nu)) throw new Error('GuideTour reçoit les étapes de l’état, pas un tableau neuf à chaque rendu');
  // Les états sans bouton viennent de la fiche elle-même (une seule source) : loading et not-staff n'en ont pas.
  if (!/supportStepsFor\(step\.kind, false\)\.length > 0/.test(nu)) throw new Error('le bouton n’apparaît que si la fiche a des étapes pour l’état');
  // Un changement d'état ferme le guide.
  if (!/useEffect\(\(\) => \{ setTour\(null\); \}, \[step\.kind\]\)/.test(nu)) throw new Error('un changement d’état doit fermer le guide');
  // Les pages qui montent la console (réelle et aperçu) ne sont pas touchées : la console porte tout.
  for (const f of ['app/support/page.tsx', 'app/apercu/acces-support/page.tsx']) {
    const page = await Deno.readTextFile(f);
    if (/GuideTour|supportStepsFor|data-guide/.test(page)) throw new Error(`${f} : le guide vit dans components/support-console.tsx`);
  }
});

// ── Bureau v2 : les guides v2 sont ALLUMÉS depuis la bascule (GUIDES_BUREAU_UI2 = true) ; le bureau d'avant (`?ui=1`) garde ses fiches ──────────────
Deno.test('Guides bureau v2 : allumés à la bascule, le bureau d’avant garde ses fiches, l’empreinte de la consigne ne bouge pas', () => {
  if (!GUIDES_BUREAU_UI2) throw new Error('GUIDES_BUREAU_UI2 doit être true depuis la bascule du bureau');
  eq(ADMIN_TOURS.length, ADMIN_TOURS_V1.length, 'même nombre de fiches en v1 et en v2');
  ADMIN_TOURS.forEach((t, i) => { if (t.id !== ADMIN_TOURS_V1[i].id) throw new Error(`fiche ${i} : ${t.id} ≠ ${ADMIN_TOURS_V1[i].id}`); });
  const c = findAdminTour('couts')!.etapes;
  if (c[0].cible !== OUVRIR_PLUS.cible || c[1].cible !== 'bureau-nav.couts') throw new Error('la fiche « couts » v2 passe par « Plus ⋯ »');
  if (ADMIN_TOURS_V1.find((t) => t.id === 'couts')!.etapes[0].cible !== 'bureau-nav.couts') throw new Error('la fiche « couts » d’avant est inchangée');
});

Deno.test('Guides bureau v2 : les lignes de « Plus ⋯ » sont précédées de « Plus ⋯ » à l’ordinateur, jamais sous 1 024 px', () => {
  const PLUS = ['bureau-nav.couts', 'bureau-nav.versions', 'bureau-nav.reserves', 'bureau-nav.borne'];
  for (const t of ADMIN_TOURS) {
    const ordi = adminStepsFor(t, false);
    ordi.forEach((e, i) => { if (PLUS.includes(e.cible) && ordi[i - 1]?.cible !== OUVRIR_PLUS.cible) throw new Error(`${t.id} : « ${e.cible} » doit suivre « Plus ⋯ »`); });
    for (const narrow of [true]) {
      const mob = adminStepsFor(t, narrow);
      if (mob.some((e) => e.cible === 'bureau-nav.plus')) throw new Error(`${t.id} : « Plus ⋯ » n’existe pas sous 1 024 px`);
    }
    // Tablette v2 (pas de ☰ à entourer) : mêmes étapes sans « Menu ».
    const tab = adminStepsFor(t, true, true);
    if (tab.some((e) => e.cible === 'bureau-nav.menu')) throw new Error(`${t.id} : pas d’étape « Menu » à la tablette v2`);
    for (const e of ordi) if (e.texte.length > 140) throw new Error(`${t.id} : phrase trop longue — ${e.texte}`);
  }
  for (const k of Object.keys(REMPLACEMENTS_V2)) if (!ADMIN_TOURS_V1.some((t) => t.etapes.some((e) => e.cible === k))) throw new Error(`REMPLACEMENTS_V2 : « ${k} » ne remplace rien`);
});

Deno.test('Guides bureau v2 : chaque cible des fiches v2 existe dans le bureau v2, et chaque ancre v2 est visée (le rejeu réel : scripts/tests/guides-bureau-v2.mjs)', async () => {
  const tout = await sources(true);
  const found = anchors(tout);
  const manque: string[] = [];
  for (const t of ADMIN_TOURS) for (const narrow of [false, true]) adminStepsFor(t, narrow).forEach((e, i) => { if (!found.has(e.cible)) manque.push(`${t.id} étape ${i + 1} → ${e.cible}`); });
  if (manque.length) throw new Error(`Ancres v2 introuvables :\n${manque.join('\n')}`);
  // Le dossier v2 seul : une ancre que plus aucune fiche ne vise est un reste à retirer.
  const v2 = anchors(Object.fromEntries(Object.entries(tout).filter(([f]) => f.startsWith(`${DOSSIER_V2}/`))));
  const used = allCibles();
  const orphelines = Array.from(v2.keys()).filter((k) => /^bureau-/.test(k) && !used.has(k));
  if (orphelines.length) throw new Error(`Ancres v2 posées mais jamais visées : ${orphelines.join(', ')}`);
  for (const a of ['bureau-nav.plus', 'bureau-nav.couts', 'bureau-nav.compte', 'bureau-nav.reglages', 'bureau-nav.menu', 'bureau-fiche.lignes', 'bureau-fiche.gerer',
    'bureau-docs.envoyer-client', 'bureau-export.equipe', 'bureau-export.un-salarie']) if (!v2.has(a)) throw new Error(`ancre « ${a} » absente du bureau v2`);
});
