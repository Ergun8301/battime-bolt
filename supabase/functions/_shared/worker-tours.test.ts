// Lot 7 — les guides pas à pas du salarié restent VRAIS : chaque bouton entouré
// existe dans le code des écrans (attribut data-guide), chaque libellé cité entre
// « » aussi, et la fonction n'offre « Me guider pas à pas » que pour une fiche qui
// existe. Un bouton renommé ou une ancre retirée casse ce test.
//   npm run test:guides
import {
  findWorkerGuide, fromWorkerCall, handleWorkerLocally, WORKER_GUIDE, WORKER_NAV, workerGuideLink, workerGuideLinks,
  type WorkerFullReply, type WorkerLive, type WorkerSnapshot,
} from './worker-assistant-core.ts';
import { findWorkerTour, hasWorkerTour, TOUR_LABEL, tourAction, tourIdOf, WORKER_TOURS, type TourScreen } from './worker-tours.ts';
import { GUIDES_UI2 } from './guides-ui2.ts';

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
// Même normalisation et mêmes exceptions que assistant-aide.test.ts.
const N = (t: string) => t.replace(/&apos;/g, "'").replace(/[’]/g, "'").replace(/&nbsp;| /g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').toLowerCase();
const quoted = (t: string) => Array.from(t.matchAll(/«\s*([^»]+?)\s*»/g)).map((m) => m[1]);
const NOT_LABELS = new Set(['S-NN', 'Où sont mes collègues ?', 'Où est Paul demain ?', 'Autre']);

/** Toutes les ancres posées dans le code : data-guide="x", ou une valeur 'x.y' sur une ligne data-guide / MENU_GUIDE. */
function anchors(src: Record<string, string>): Map<string, number> {
  const found = new Map<string, number>();
  for (const code of Object.values(src)) {
    for (const line of code.split('\n')) {
      if (!/data-guide|MENU_GUIDE/.test(line) || /querySelector/.test(line)) continue;
      for (const m of line.matchAll(/["'`]([a-z]+(?:-[a-z]+)*\.[a-z]+(?:-[a-z]+)*)["'`]/g)) {
        // Les ancres du bureau et du support ont leur propre test (admin-tours.test.ts).
        if (/^(bureau|support)-/.test(m[1])) continue;
        found.set(m[1], (found.get(m[1]) ?? 0) + 1);
      }
    }
  }
  return found;
}

// Les ancres qui ont PLUSIEURS éléments dans le code, et pourquoi c'est voulu : le guide entoure la première visible.
const REPETEES: Record<string, string> = {
  'journee.chantier': 'cartes du jour (prévue, notée) : la première qui s’ouvre au toucher',
  'journee.copier': '« Copier la journée d’hier » (journée vide) OU « Dupliquer cette journée » : jamais les deux',
  'journee.envoyer': 'les 5 états du bouton « Envoyer ma journée » : un seul à l’écran',
  'journee.terminer': 'pointage du jour OU sortie oubliée : un seul à l’écran',
  'editeur.horaires': 'cartes « Début » et « Fin »',
  'journee.assistant': 'bouton ✦ de l’ancienne barre du bas OU du nouvel en-tête (?ui=2) : jamais les deux à l’écran',
  'entete.scanner': 'icône QR de l’ancien en-tête OU bouton QR de la nouvelle barre du bas (?ui=2) : jamais les deux',
  'semaine.jour': 'la semaine en liste (téléphone) ou en grille (large) : un seul visible',
  // Étape 6 (?ui=2) : une seule version de chaque écran est montée à la fois (le drapeau est fixe pour la session)
  'menu.compte': 'avatar de l’en-tête : bouton qui ouvre le menu déroulant d’avant OU la page « Plus » (?ui=2) : jamais les deux',
  'historique.jour': 'carte d’un jour de l’Historique : celle d’avant OU celle de la version ?ui=2 : jamais les deux',
  'conges.faire': '« Faire une demande » de « Mes congés » : la fenêtre d’avant OU la feuille du bas (?ui=2) : jamais les deux',
  'conges.type': 'choix du type de demande : la fenêtre d’avant OU la feuille du bas (?ui=2) : jamais les deux',
  'conges.envoyer': '« Envoyer la demande » : la fenêtre d’avant OU la feuille du bas (?ui=2) : jamais les deux',
  'conges.annuler': 'corbeille d’une demande en attente : la fenêtre d’avant OU la feuille du bas (?ui=2) : jamais les deux',
};

const BANNED = [
  'brouillon', 'statut', 'synchronis', 'synchro', 'cliqu', 'clic', 'onglet', 'interface', 'paramétr', 'session', 'serveur',
  'base de données', 'identifiant', 'modale', 'popup', 'pop-up', 'menu déroulant', 'dropdown', 'application web',
];
const TUTOIEMENT = /\b(tu|ton|ta|tes|toi|touche|appuie|clique|ouvre|mets|choisis|écris|fais)\b/i;
const SCREENS: TourScreen[] = ['journee', 'semaine', 'mois', 'historique', 'conges', 'infos', 'menu'];

Deno.test('Guides : chaque fiche a un id qui existe dans WORKER_GUIDE, sans doublon', () => {
  const ids = WORKER_GUIDE.map((g) => g.id);
  if (new Set(ids).size !== ids.length) throw new Error(`ids WORKER_GUIDE en double : ${ids.filter((x, i) => ids.indexOf(x) !== i)}`);
  for (const g of WORKER_GUIDE) if (!/^[a-z]+(-[a-z]+)*$/.test(g.id)) throw new Error(`${g.titre} : id « ${g.id} » pas un slug`);
  const tours = WORKER_TOURS.map((t) => t.id);
  if (new Set(tours).size !== tours.length) throw new Error(`fiches de guidage en double : ${tours.filter((x, i) => tours.indexOf(x) !== i)}`);
  for (const t of WORKER_TOURS) if (!ids.includes(t.id)) throw new Error(`guide « ${t.id} » : aucune entrée WORKER_GUIDE de cet id`);
});

Deno.test('Guides : 1 à 5 étapes, une phrase courte, simple et au vouvoiement', () => {
  for (const t of WORKER_TOURS) {
    if (t.etapes.length < 1 || t.etapes.length > 5) throw new Error(`${t.id} : ${t.etapes.length} étapes`);
    t.etapes.forEach((e, i) => {
      const at = `${t.id} étape ${i + 1}`;
      if (!e.texte.trim() || e.texte !== e.texte.trim()) throw new Error(`${at} : texte vide ou avec des espaces autour`);
      if (e.texte.length > 140) throw new Error(`${at} : ${e.texte.length} caractères (140 au plus) — ${e.texte}`);
      if (!/[.]$/.test(e.texte)) throw new Error(`${at} : la phrase doit finir par un point — ${e.texte}`);
      if (!/^[a-z]+(-[a-z]+)*\.[a-z]+(-[a-z]+)*$/.test(e.cible)) throw new Error(`${at} : cible « ${e.cible} » pas de la forme ecran.bouton`);
      if (e.ecran && !SCREENS.includes(e.ecran)) throw new Error(`${at} : écran « ${e.ecran} » (navigation seulement)`);
      const low = e.texte.toLowerCase();
      for (const w of BANNED) if (low.includes(w)) throw new Error(`${at} : mot à éviter « ${w} » — ${e.texte}`);
      const tu = TUTOIEMENT.exec(e.texte);
      if (tu) throw new Error(`${at} : tutoiement ou verbe à l’impératif « ${tu[0]} » (vouvoiement, « Touchez ») — ${e.texte}`);
    });
  }
});

Deno.test('Guides : chaque cible existe comme data-guide dans le code des écrans', async () => {
  const found = anchors(await sources());
  const missing: string[] = [];
  for (const t of WORKER_TOURS) t.etapes.forEach((e, i) => { if (!found.has(e.cible)) missing.push(`${t.id} étape ${i + 1} → data-guide="${e.cible}"`); });
  if (missing.length) throw new Error(`Ancres introuvables :\n${missing.join('\n')}`);
});

Deno.test('Guides : une ancre n’a qu’un seul élément, sauf celles prévues (REPETEES)', async () => {
  const found = anchors(await sources());
  const doubles = Array.from(found.entries()).filter(([k, n]) => n > 1 && !(k in REPETEES)).map(([k, n]) => `${k} ×${n}`);
  if (doubles.length) throw new Error(`Ancres en double (un seul élément par écran, ou à ajouter à REPETEES avec la raison) : ${doubles.join(', ')}`);
  // …et une ancre inutilisée par un guide est un reste à retirer.
  const used = new Set(WORKER_TOURS.flatMap((t) => t.etapes.map((e) => e.cible)));
  const orphans = Array.from(found.keys()).filter((k) => !used.has(k) && k !== 'journee.assistant' && !k.startsWith('menu.') && !k.startsWith('barre.')).sort();
  if (orphans.length) throw new Error(`Ancres posées mais jamais visées : ${orphans.join(', ')}`);
});

Deno.test('Guides : chaque libellé cité entre « » existe dans le code des écrans', async () => {
  const src = N(Object.values(await sources()).join('\n'));
  const missing: string[] = [];
  for (const t of WORKER_TOURS) {
    for (const e of t.etapes) for (const label of quoted(e.texte)) {
      if (NOT_LABELS.has(label)) continue;
      if (!src.includes(N(label))) missing.push(`${t.id} → « ${label} »`);
    }
  }
  if (missing.length) throw new Error(`Libellés introuvables dans le code :\n${missing.join('\n')}`);
});

Deno.test('Guides : toute fiche d’aide qui se fait sur un écran a son guide (et seulement elles)', () => {
  for (const g of WORKER_GUIDE) {
    const onScreen = !g.lien.startsWith('ask:');
    if (onScreen && !hasWorkerTour(g.id)) throw new Error(`« ${g.titre} » (${g.id}) : pas de guide pas à pas`);
    if (!onScreen && hasWorkerTour(g.id)) throw new Error(`« ${g.titre} » (${g.id}) : un guide pour une fiche sans écran à entourer`);
  }
  if (WORKER_TOURS.length < 20) throw new Error(`${WORKER_TOURS.length} guides seulement`);
});

const SNAP: WorkerSnapshot = {
  aujourdhui: '2026-09-29',
  chantiers: [{ id: 'w-dupont', nom: 'Villa Dupont', ville: 'Lyon' }, { id: 'w-martin', nom: 'Bureau Martin', ville: 'Villeurbanne' }],
  semaine: [], planning: [],
};
const LIVE: WorkerLive = { enCours: null, lignes: [] };
const guideLinks = (r: WorkerFullReply | null) => (r && r.kind === 'guide' ? r.links : null);

Deno.test('Guides : le bouton « Me guider pas à pas » vient APRÈS le raccourci, et seulement si le guide existe (voie locale)', () => {
  let reached = 0;
  for (const g of WORKER_GUIDE) {
    // Une question par mot-clé : au moins un doit mener à CETTE fiche.
    let ok = false;
    for (const mot of g.mots) {
      const q = `comment ${mot}`;
      const found = findWorkerGuide(q);
      const links = guideLinks(handleWorkerLocally(q, SNAP, LIVE));
      if (!found || !links) continue;
      // Quelle que soit la fiche trouvée, ses boutons sont ceux du helper : raccourci, puis guide si elle en a un.
      const want = [workerGuideLink(found.lien), ...(hasWorkerTour(found.id) ? [{ label: TOUR_LABEL, action: `guide:${found.id}` }] : [])];
      if (JSON.stringify(links) !== JSON.stringify(want)) throw new Error(`« ${q} » → ${JSON.stringify(links)} (attendu ${JSON.stringify(want)})`);
      if (links[0].action !== found.lien) throw new Error(`« ${q} » : le raccourci doit rester le premier bouton`);
      if (found.id === g.id) ok = true;
    }
    if (ok) reached++;
    else throw new Error(`« ${g.titre} » : aucune question par mot-clé n’aboutit à cette fiche (voie locale)`);
  }
  if (reached !== WORKER_GUIDE.length) throw new Error(`${reached}/${WORKER_GUIDE.length}`);
  // Les cas connus de la préview.
  const conge = guideLinks(handleWorkerLocally('comment je demande un congé', SNAP, LIVE))!;
  if (JSON.stringify(conge.map((l) => l.action)) !== JSON.stringify(['conges', 'guide:conge'])) throw new Error(JSON.stringify(conge));
  if (conge[1].label !== 'Me guider pas à pas') throw new Error('libellé du bouton');
  const collegues = guideLinks(handleWorkerLocally('comment ou sont les autres', SNAP, LIVE))!;
  if (collegues[0]?.action !== 'ask:Où sont mes collègues aujourd’hui ?' || collegues.length !== 1) throw new Error(`fiche « ask: » : ${JSON.stringify(collegues)}`);
});

Deno.test('Guides : voie modèle (faux appel « repondre ») — le guide de la fiche qui correspond, jamais celui d’une autre', () => {
  for (const g of WORKER_GUIDE) {
    const q = `comment ${g.mots[0]}`;
    const found = findWorkerGuide(q);
    if (!found) continue;
    const screen = found.lien.startsWith('ask:') ? null : found.lien;
    const guide = hasWorkerTour(found.id) ? [`guide:${found.id}`] : [];
    const call = (lien?: string) => (fromWorkerCall('repondre', { reponse: 'Voilà comment faire.', ...(lien ? { lien } : {}) }, { ...SNAP, demande: q }, LIVE) as { kind: string; links: { action: string }[] });
    // Sans lien donné par le modèle : la fiche qui correspond, avec son guide.
    const a = call();
    if (a.kind !== 'guide') throw new Error(`${g.id} : ${a.kind}`);
    if (JSON.stringify(a.links.map((l) => l.action)) !== JSON.stringify([found.lien, ...guide])) throw new Error(`${g.id} sans lien → ${JSON.stringify(a.links)}`);
    // Avec LE MÊME écran que la fiche : idem.
    if (screen) {
      const b = call(screen);
      if (JSON.stringify(b.links.map((l) => l.action)) !== JSON.stringify([screen, ...guide])) throw new Error(`${g.id} avec lien → ${JSON.stringify(b.links)}`);
    }
    // Avec un AUTRE écran : le lien du modèle seul, jamais le guide d'une autre fiche.
    const other = (Object.keys(WORKER_NAV) as (keyof typeof WORKER_NAV)[]).find((k) => k !== screen)!;
    const c = call(other);
    if (c.links.some((l) => l.action.startsWith('guide:'))) throw new Error(`${g.id} : guide ajouté à un autre écran (${other})`);
  }
  // Sans question reconnue : pas de fiche, donc pas de guide.
  const none = fromWorkerCall('repondre', { reponse: 'Bonjour !' }, { ...SNAP, demande: 'bonjour' }, LIVE) as { links: unknown[] };
  if (none.links.length) throw new Error('aucun lien attendu');
});

Deno.test('Guides : le helper et les actions (aller-retour, libellé)', async () => {
  if (TOUR_LABEL !== 'Me guider pas à pas') throw new Error(TOUR_LABEL);
  // BASCULE (GUIDES_UI2 = true) : `findWorkerTour` sert les guides de la v2 (chargés en différé par un import()), plus l'objet de WORKER_TOURS (la v1).
  // L'aller-retour de l'action ne change pas (même id) ; ce qui est SERVI est vérifié contre la v2 (worker-tours-v2.test.ts le prouve aussi, cible par cible).
  // Interrupteur à false : l'état d'avant, le MÊME objet que WORKER_TOURS.
  const v2 = GUIDES_UI2 ? (await import('./worker-tours-v2.ts')).WORKER_TOURS_V2 : null;
  if (v2) for (let i = 0; i < 100 && findWorkerTour(v2[0].id) !== v2[0]; i++) await new Promise((r) => setTimeout(r, 10)); // le chargement différé de worker-tours.ts
  for (const t of WORKER_TOURS) {
    if (tourIdOf(tourAction(t.id)) !== t.id) throw new Error(t.id);
    if (!v2 && findWorkerTour(t.id) !== t) throw new Error(t.id);
  }
  if (v2) for (const t of v2) {
    if (tourIdOf(tourAction(t.id)) !== t.id) throw new Error(t.id);
    if (findWorkerTour(t.id) !== t) throw new Error(`le guide servi « ${t.id} » n’est pas celui de la v2`);
  }
  if (tourIdOf('journee') !== null || tourIdOf('ask:guide:x') !== null) throw new Error('seules les actions « guide:… » sont des guides');
  const e = WORKER_GUIDE.find((g) => g.id === 'conge')!;
  if (workerGuideLinks(e).length !== 2) throw new Error('congé : raccourci + guide');
  const ask = WORKER_GUIDE.find((g) => g.lien.startsWith('ask:'))!;
  if (workerGuideLinks(ask).length !== 1) throw new Error('fiche « ask: » : le raccourci seul');
});

Deno.test('Guides : les boîtes de confirmation de « Ma journée » sont marquées (le guide se met sous elles)', async () => {
  const day = (await sources())['components/poseur-day.tsx'];
  const n = (day.match(/data-guide-confirm/g) ?? []).length;
  if (n < 5) throw new Error(`${n} boîte(s) marquée(s) data-guide-confirm dans poseur-day.tsx (5 attendues : journée déjà envoyée, horaires prévus, pause, vérification, retirer)`);
});

Deno.test('Guides : le guide ne fait rien à la place du salarié (aucun appel réseau, aucun toucher, aucune écriture)', async () => {
  const src = await sources();
  const code = src['components/guide-tour.tsx'];
  if (!code) throw new Error('components/guide-tour.tsx introuvable');
  // On regarde le CODE, pas les commentaires qui expliquent justement ce qu'il ne fait pas.
  const bare = code.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  for (const bad of [/\.click\(/, /dispatchEvent/, /\bfetch\(/, /supabase/, /sendBeacon/, /XMLHttpRequest/, /localStorage/, /sessionStorage/, /indexedDB/, /\.submit\(/, /\.requestSubmit\(/, /\.focus\(\)\s*;?\s*\.click/]) {
    if (bad.test(bare)) throw new Error(`guide-tour.tsx ne doit pas contenir ${bad}`);
  }
  // …et l'écran du salarié ne lui fait ouvrir que de la navigation.
  const page = src['app/poseur/page.tsx'];
  const from = page.indexOf('const tourStep');
  const body = page.slice(from, page.indexOf('const closeTour', from));
  if (from < 0 || !body) throw new Error('tourStep introuvable dans app/poseur/page.tsx');
  for (const bad of [/togglePush/, /photoInputRef/, /setScanOpen/, /\.click\(/, /signOut/, /supabase/]) {
    if (bad.test(body)) throw new Error(`tourStep (page du salarié) ne doit pas appeler ${bad}`);
  }
});
