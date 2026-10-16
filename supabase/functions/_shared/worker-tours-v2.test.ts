// Étape 9 — les guides du NOUVEAU design (?ui=2) sont prêts, vrais et ÉTEINTS.
//   · l'interrupteur GUIDES_UI2 vaut false : ce que la v1 reçoit n'a pas bougé (mêmes objets, mêmes textes) ;
//   · chaque cible de la variante v2 existe dans le code, sur le chemin v2 (preuve par cible) ;
//   · chaque phrase existe en français ET en turc, jamais vide, avec les règles de worker-tours.test.ts ;
//   · chaque fiche d'aide a sa version v2 (français + turc) dont les libellés « » existent dans le code.
//   npm run test:guides
import { WORKER_GUIDE } from './worker-assistant-core.ts';
import { findWorkerTour, WORKER_TOURS, type TourScreen } from './worker-tours.ts';
import { GUIDES_UI2, texteEtape, WORKER_GUIDE_V2, WORKER_TOURS_V2 } from './worker-tours-v2.ts';

const ROOTS = ['app', 'components'];
async function sources(): Promise<Record<string, string>> {
  const all: Record<string, string> = {};
  const walk = async (dir: string) => {
    for await (const e of Deno.readDir(dir)) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory) await walk(p);
      else if (/\.(tsx|ts)$/.test(e.name)) all[p] = await Deno.readTextFile(p);
    }
  };
  for (const r of ROOTS) await walk(r);
  return all;
}
const N = (t: string) => t.replace(/&apos;/g, "'").replace(/[’]/g, "'").replace(/&nbsp;| /g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').toLowerCase();
const quoted = (t: string) => Array.from(t.matchAll(/«\s*([^»]+?)\s*»/g)).map((m) => m[1]);
const NOT_LABELS = new Set(['S-NN', 'Où sont mes collègues ?', 'Où est Paul demain ?', 'Autre']);
const SCREENS: TourScreen[] = ['journee', 'semaine', 'mois', 'historique', 'conges', 'infos', 'menu'];
const BANNED = [
  'brouillon', 'statut', 'synchronis', 'synchro', 'cliqu', 'clic', 'onglet', 'interface', 'paramétr', 'session', 'serveur',
  'base de données', 'identifiant', 'modale', 'popup', 'pop-up', 'menu déroulant', 'dropdown', 'application web',
];
const TUTOIEMENT = /\b(tu|ton|ta|tes|toi|touche|appuie|clique|ouvre|mets|choisis|écris|fais)\b/i;
// Ce que la v2 ne dit plus (c'était vrai seulement dans l'ancienne interface).
const SEULEMENT_V1 = ['icône du scanner', '✨', 'Menu (', '→ « Ma semaine', 'Touchez « Ma semaine » (ou'];

function ancres(src: Record<string, string>): Set<string> {
  const found = new Set<string>();
  for (const code of Object.values(src)) {
    for (const line of code.split('\n')) {
      if (!/data-guide|MENU_GUIDE|guide:/.test(line) || /querySelector/.test(line)) continue;
      for (const m of line.matchAll(/["'`]([a-z]+(?:-[a-z]+)*\.[a-z]+(?:-[a-z]+)*)["'`]/g)) if (!/^(bureau|support)-/.test(m[1])) found.add(m[1]);
    }
  }
  return found;
}

/**
 * La preuve, cible par cible, que l'ancre est posée sur le chemin de la v2 (`?ui=2`).
 * [fichier, marqueur?] : la cible doit être citée (data-guide / guide:) dans le fichier, APRÈS le marqueur s'il y en a un
 * (le marqueur ouvre la branche v2 du fichier). Une cible absente de cette table fait échouer le test : on l'audite à la main.
 */
const PREUVES: Record<string, [string, string?]> = {
  'menu.compte': ['app/poseur/page.tsx', 'aria-haspopup="menu"'],         // l'avatar v2 : ouvre la page « Plus »
  'menu.conges': ['app/poseur/page.tsx', "id: 'conges'"],                  // ligne de la page « Plus »
  'menu.semaine': ['app/poseur/page.tsx'],             // MENU_GUIDE (vérifié plus bas : la page « Plus » l'utilise)
  'menu.historique': ['app/poseur/page.tsx'],
  'menu.photo': ['app/poseur/page.tsx', "id: 'photo'"],
  'menu.infos': ['app/poseur/page.tsx', "id: 'infos'"],
  'menu.notifications': ['app/poseur/page.tsx', "id: 'notifications'"],
  'entete.scanner': ['components/poseur-day.tsx', 'ui2 && onScan'],        // le bouton « QR » de la barre du bas
  'journee.plus': ['components/poseur-day.tsx'],
  'journee.envoyer': ['components/poseur-day.tsx'],
  'journee.chantier': ['components/poseur-day.tsx'],
  'journee.copier': ['components/poseur-day.tsx'],
  'journee.trou': ['components/poseur-day.tsx'],
  'journee.sortie-oubliee': ['components/poseur-day.tsx'],
  'journee.panier': ['components/poseur-day.tsx', 'dz-compteur-panier'],   // la tuile « Panier » de la carte « Total aujourd'hui »
  'journee.terminer': ['components/live-timer.tsx', 'ui2 ?'],
  'editeur.reserve': ['components/poseur-day.tsx'], 'editeur.note': ['components/poseur-day.tsx'], 'editeur.documents': ['components/poseur-day.tsx'],
  'editeur.ok': ['components/poseur-day.tsx'], 'editeur.horaires': ['components/poseur-day.tsx'], 'editeur.chantier': ['components/poseur-day.tsx'],
  'editeur.autre': ['components/poseur-day.tsx'], 'editeur.ajouter-chantier': ['components/poseur-day.tsx'], 'editeur.retirer': ['components/poseur-day.tsx'],
  'confirmer.retirer': ['components/poseur-day.tsx'], 'copier.valider': ['components/poseur-day.tsx'],
  'docs.photo': ['components/chantier-documents.tsx'], 'docs.envoyer': ['components/chantier-documents.tsx'],
  'reserves.bandeau': ['components/worker-reserves.tsx'], 'reserves.lever': ['components/worker-reserves.tsx'], 'reserves.valider': ['components/reserve-lift-form.tsx'],
  'semaine.jour': ['components/poseur-week.tsx', 'if (ui2) {'],
  'historique.jour': ['components/poseur-history.tsx', 'if (ui2) {'],
  'conges.faire': ['components/leave-request-dialog.tsx', 'if (ui2) {'], 'conges.type': ['components/leave-request-dialog.tsx', 'if (ui2) {'],
  'conges.envoyer': ['components/leave-request-dialog.tsx', 'if (ui2) {'], 'conges.annuler': ['components/leave-request-dialog.tsx', 'if (ui2) {'],
  'infos.fermer': ['app/poseur/page.tsx', 'infoOpen && ('],
  // « Mon équipe » : en v2 la page est ouverte par le guide lui-même (tourStep) ; la feuille d'heures est celle d'avant (team-day.tsx).
  'equipe.jour': ['components/team-day.tsx'], 'equipe.salarie': ['components/team-day.tsx'], 'equipe.corriger': ['components/team-day.tsx'],
  'equipe.ajouter': ['components/team-day.tsx'], 'equipe.ok': ['components/team-day.tsx'],
};

Deno.test('Guides v2 : éteints par défaut — la v1 reçoit exactement ce qu’elle recevait (et, une fois allumés, la v2 reçoit la v2)', async () => {
  if (GUIDES_UI2) {
    // APRÈS LA BASCULE (étape 11) : les guides et les fiches servis sont ceux de la v2 (chargés en différé côté navigateur).
    await new Promise((r) => setTimeout(r, 20));
    for (const t of WORKER_TOURS_V2) if (findWorkerTour(t.id) !== t) throw new Error(`GUIDES_UI2 est à true mais le guide « ${t.id} » servi n’est pas celui de la v2`);
    for (const g of WORKER_GUIDE) if (JSON.stringify(g.etapes) !== JSON.stringify(WORKER_GUIDE_V2.find((x) => x.id === g.id)!.etapes)) throw new Error(`fiche ${g.id} : pas la v2`);
    return;
  }
  // Avant la bascule : les guides servis sont ceux de la v1 (les mêmes objets), sans texte turc.
  for (const t of WORKER_TOURS) if (findWorkerTour(t.id) !== t) throw new Error(`guide « ${t.id} » : pas l’objet de la v1`);
  if (WORKER_TOURS.some((t) => t.etapes.some((e) => 'texteTr' in e))) throw new Error('un guide de la v1 porte du texte v2');
  // Les textes d'avant, quelques repères (le détail est gelé par worker-tours.test.ts et etape3-eteint.test.ts).
  const conge = WORKER_GUIDE.find((g) => g.id === 'conge')!;
  if (conge.etapes[0] !== 'Menu (votre nom en haut à droite) → « Mes congés ».') throw new Error(`fiche congé : ${conge.etapes[0]}`);
  const assistant = WORKER_GUIDE.find((g) => g.id === 'assistant')!;
  if (assistant.etapes[0] !== 'Bouton ✨ de la barre du bas.') throw new Error(`fiche assistant : ${assistant.etapes[0]}`);
  if (findWorkerTour('pointer')!.etapes[0].texte !== 'En arrivant, touchez l’icône du scanner, en haut, et visez le QR code de la tablette.') throw new Error('guide pointer');
});

Deno.test('Guides v2 : un guide par fiche d’aide qui se fait sur un écran, mêmes id, 1 à 5 étapes', () => {
  const surEcran = WORKER_GUIDE.filter((g) => !g.lien.startsWith('ask:')).map((g) => g.id).sort();
  const v2 = WORKER_TOURS_V2.map((t) => t.id);
  if (new Set(v2).size !== v2.length) throw new Error('guides v2 en double');
  if (JSON.stringify([...v2].sort()) !== JSON.stringify(surEcran)) throw new Error(`guides v2 ≠ fiches sur écran : ${v2.sort()} / ${surEcran}`);
  for (const t of WORKER_TOURS_V2) if (t.etapes.length < 1 || t.etapes.length > 5) throw new Error(`${t.id} : ${t.etapes.length} étapes`);
});

Deno.test('Guides v2 : chaque étape a un texte français ET turc, sans vide, aux mêmes règles que la v1', () => {
  for (const t of WORKER_TOURS_V2) {
    t.etapes.forEach((e, i) => {
      const at = `${t.id} étape ${i + 1}`;
      for (const [langue, txt] of [['fr', e.texte], ['tr', e.texteTr]] as const) {
        if (!txt || !txt.trim() || txt !== txt.trim()) throw new Error(`${at} : texte ${langue} vide ou avec des espaces autour`);
        if (!/[.]$/.test(txt)) throw new Error(`${at} : la phrase ${langue} doit finir par un point — ${txt}`);
      }
      if (e.texte.length > 140) throw new Error(`${at} : ${e.texte.length} caractères en français (140 au plus) — ${e.texte}`);
      if (e.texteTr.length > 170) throw new Error(`${at} : ${e.texteTr.length} caractères en turc (170 au plus) — ${e.texteTr}`);
      if (e.texteTr === e.texte) throw new Error(`${at} : le turc est identique au français`);
      if (texteEtape(e, 'tr') !== e.texteTr || texteEtape(e, 'fr') !== e.texte) throw new Error(`${at} : texteEtape`);
      if (!/^[a-z]+(-[a-z]+)*\.[a-z]+(-[a-z]+)*$/.test(e.cible)) throw new Error(`${at} : cible « ${e.cible} » pas de la forme ecran.bouton`);
      if (e.ecran && !SCREENS.includes(e.ecran)) throw new Error(`${at} : écran « ${e.ecran} » (navigation seulement)`);
      const low = e.texte.toLowerCase();
      for (const w of BANNED) if (low.includes(w)) throw new Error(`${at} : mot à éviter « ${w} » — ${e.texte}`);
      const tu = TUTOIEMENT.exec(e.texte);
      if (tu) throw new Error(`${at} : tutoiement ou impératif « ${tu[0]} » — ${e.texte}`);
      for (const v1 of SEULEMENT_V1) if (e.texte.includes(v1)) throw new Error(`${at} : « ${v1} » n’est vrai qu’en v1 — ${e.texte}`);
      // Les libellés cités entre « » sont les mêmes dans les deux langues (ce sont les boutons de l'écran, en français).
      const fr = quoted(e.texte).filter((l) => !NOT_LABELS.has(l)).sort(), tr = quoted(e.texteTr).filter((l) => !NOT_LABELS.has(l)).sort();
      if (JSON.stringify(fr) !== JSON.stringify(tr)) throw new Error(`${at} : libellés « » différents entre français ${JSON.stringify(fr)} et turc ${JSON.stringify(tr)}`);
    });
  }
});

Deno.test('Guides v2 : chaque cible existe dans le code ET sur le chemin de la v2 (preuve par cible)', async () => {
  const src = await sources();
  const found = ancres(src);
  const problemes: string[] = [];
  const cibles = new Set(WORKER_TOURS_V2.flatMap((t) => t.etapes.map((e) => e.cible)));
  for (const c of cibles) {
    if (!found.has(c)) { problemes.push(`${c} : ancre introuvable dans le code`); continue; }
    const preuve = PREUVES[c];
    if (!preuve) { problemes.push(`${c} : pas de preuve v2 dans PREUVES (à auditer)`); continue; }
    const [fichier, marqueur] = preuve;
    const code = src[fichier];
    if (!code) { problemes.push(`${c} : fichier ${fichier} introuvable`); continue; }
    const depuis = marqueur ? code.indexOf(marqueur) : 0;
    if (depuis < 0) { problemes.push(`${c} : marqueur « ${marqueur} » introuvable dans ${fichier}`); continue; }
    const apres = code.slice(depuis);
    const cite = new RegExp(`['"\`]${c.replace('.', '\\.')}['"\`]`).test(apres);
    if (!cite) problemes.push(`${c} : non citée dans ${fichier} après « ${marqueur ?? 'début'} »`);
  }
  for (const k of Object.keys(PREUVES)) if (!cibles.has(k)) problemes.push(`${k} : preuve sans étape (à retirer de PREUVES)`);
  if (problemes.length) throw new Error(`Cibles v2 à revoir :\n${problemes.join('\n')}`);
  // « Mon équipe » : sans l'ouverture de la page par le guide, la cible n'existerait pas à l'écran en v2.
  const page = src['app/poseur/page.tsx'];
  if (!/ui2Ref\.current && s\.cible\.startsWith\('equipe\.'\)/.test(page)) throw new Error('tourStep n’ouvre plus la page « Mon équipe » en ?ui=2');
  if (!src['components/design/salarie/page-equipe.tsx'].includes('<TeamDay')) throw new Error('page-equipe.tsx ne monte plus TeamDay');
  if (!/<Dialog[^>]*>/.test(src['components/leave-request-dialog.tsx'])) throw new Error('leave-request-dialog.tsx');
});

Deno.test('Guides v2 : chaque libellé cité entre « » existe dans le code des écrans', async () => {
  const code = N(Object.values(await sources()).join('\n'));
  const manque: string[] = [];
  for (const t of WORKER_TOURS_V2) for (const e of t.etapes) for (const l of quoted(e.texte)) {
    if (!NOT_LABELS.has(l) && !code.includes(N(l))) manque.push(`${t.id} → « ${l} »`);
  }
  for (const g of WORKER_GUIDE_V2) for (const ph of g.etapes) for (const l of quoted(ph)) {
    if (!NOT_LABELS.has(l) && !code.includes(N(l))) manque.push(`fiche ${g.id} → « ${l} »`);
  }
  if (manque.length) throw new Error(`Libellés introuvables dans le code :\n${manque.join('\n')}`);
});

Deno.test('Guides v2 : chaque fiche d’aide de l’Assistant a sa version v2, en français ET en turc, sans vide', () => {
  const ids = WORKER_GUIDE.map((g) => g.id).sort();
  const v2 = WORKER_GUIDE_V2.map((g) => g.id);
  if (new Set(v2).size !== v2.length) throw new Error('fiches v2 en double');
  if (JSON.stringify([...v2].sort()) !== JSON.stringify(ids)) throw new Error(`fiches v2 ≠ WORKER_GUIDE : ${[...v2].sort()} / ${ids}`);
  for (const g of WORKER_GUIDE_V2) {
    if (!g.titreTr.trim()) throw new Error(`${g.id} : titre turc vide`);
    if (g.etapes.length < 1 || g.etapes.length !== g.etapesTr.length) throw new Error(`${g.id} : ${g.etapes.length} étapes françaises pour ${g.etapesTr.length} turques`);
    g.etapes.forEach((e, i) => {
      if (!e.trim() || !g.etapesTr[i].trim()) throw new Error(`${g.id} étape ${i + 1} : vide`);
      const fr = quoted(e).filter((l) => !NOT_LABELS.has(l)).sort(), tr = quoted(g.etapesTr[i]).filter((l) => !NOT_LABELS.has(l)).sort();
      if (JSON.stringify(fr) !== JSON.stringify(tr)) throw new Error(`${g.id} étape ${i + 1} : libellés « » différents ${JSON.stringify(fr)} / ${JSON.stringify(tr)}`);
    });
    // Une fiche v2 ne parle plus de l'ancienne interface.
    for (const e of g.etapes) for (const v1 of ['✨', 'Menu (', 'Menu →', 'icône scanner']) if (e.includes(v1)) throw new Error(`${g.id} : « ${v1} » n’est vrai qu’en v1 — ${e}`);
  }
});
