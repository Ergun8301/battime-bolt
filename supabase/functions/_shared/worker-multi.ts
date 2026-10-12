// Salarié, profil « long » : UNE fiche récapitulative pour plusieurs actions
// (les heures avec TOUS les créneaux et la pause, un nouveau chantier à créer, le
// panier, une réserve, un congé, l'envoi de la journée), construite à partir des
// appels de fonction du modèle (au plus 4) puis CORRIGÉE EN CODE.
//
// Le modèle se trompe de façon répétable (mesuré) : il compte la pause deux
// fois, fusionne « 8h-12h puis 13h-17h » en 8h-17h, laisse une ligne « nouveau »
// sans chantier, remplit au hasard un créneau sans nom depuis le planning. Chaque
// défaut a sa règle déterministe ci-dessous, et son test.
//
// RIEN n'est écrit ici ni à l'écran avant « Tout confirmer » : la fiche dit ce
// qui sera fait, dans l'ordre (chantier → heures → panier → réserve → congé →
// envoi). Le chantier n'est créé qu'à la confirmation.
//
// Sans réseau, sans base, sans API Deno : importé par le serveur ET par le navigateur.
// RÈGLE NAVIGATEUR : aucune assertion arrière (Safari < 16.4), ni .at() ni structuredClone.
// Aucun console.* : les arguments du modèle contiennent des noms et adresses de particuliers.
import { overlapMinutes, pauseAsks } from './day-hours.ts';
import { addDaysIso, parseDateFr } from './fr-langue.ts';
import { plagesDuTexte, profilSaisie, type PlageTexte } from './saisie-profil.ts';
import {
  checkDraft, checkWorkerAction, fillUnsaid, fromWorkerCall, norm, parseTime, prepareWorkerAction, resolveWorksite, shiftMinutes, toMin, workerActionMode,
  type Draft, type DraftLine, type NewWorksite, type WorkerAction, type WorkerFullReply, type WorkerLive, type WorkerSnapshot,
} from './worker-assistant-core.ts';

export type { NewWorksite } from './worker-assistant-core.ts';

/** Un élément de la fiche, dans l'ORDRE d'exécution. `id` = 'i0', 'i1'… */
export type MultiItem =
  | { id: string; kind: 'chantier'; nouveau_chantier: NewWorksite; manque: ('ville' | 'nom')[]; depend: [] }
  | { id: string; kind: 'heures'; draft: Draft; depend: [] }
  | {
    id: string; kind: 'action'; action: WorkerAction; depend: string[];
    /** Réserve (signaler/lever) posée sur une ligne de LA FICHE : visée par chantier, recalculée au clic. */
    cible?: { chantier_id: string | null; nouveau: boolean; nom: string };
    /** Avertissements NON bloquants (ex. envoi : « Plus de 6 h d’affilée sans pause… »). */
    avertissements?: string[];
    /** Envoi seulement : lignes déjà notées aujourd'hui qui partiront AVEC la fiche (sendWorkerDay envoie tout le jour). */
    deja_notees?: { chantier: string; debut: string; fin: string }[];
  };
export interface MultiIgnore { name: string; label: string; raison: string }
export interface WorkerMultiReply {
  kind: 'multi';
  /** Toujours en français. */
  answer: string;
  /** Date de la fiche d'heures, sinon aujourd'hui. */
  date: string;
  /** snapshot.aujourdhui (le client compare à today() au clic). */
  aujourdhui: string;
  /** 1 à 4 éléments (≤ 4 appels du modèle). */
  items: MultiItem[];
  /** Appels laissés de côté, avec la raison (affichés dans la fiche). */
  ignores: MultiIgnore[];
  /** Familles demandées dans la phrase et ABSENTES de la fiche : « Panier repas », « Envoi de la journée »… Jamais bloquant. */
  non_prepare: string[];
  /** Vrai si le modèle de secours a répondu OU si `non_prepare` n'est pas vide OU si des appels ont été écartés. */
  incertain?: true;
  /** Lignes DÉJÀ notées aujourd'hui : le client y recalcule les chevauchements à chaque modification. */
  deja_notees: { debut: string; fin: string; chantier: string; envoyee: boolean }[];
  /** Texte d'un `repondre` joint aux actions (dans la langue du salarié), ≤ 500 car. */
  note?: string;
  links?: { label: string; action: string }[];
}
/** Réponse legacy d'un appel isolé du profil long : `fromWorkerCall` tel quel, plus `confirmer: true` si l'action s'exécuterait toute seule au montage. */
export type LongLegacy = WorkerFullReply & { confirmer?: true };

export const MULTI_ANSWER = 'Vérifiez la fiche, puis « Tout confirmer » : rien n’est enregistré avant.';
/** Rangs d'ordre : chantier 0, heures 1, panier 2, réserve 3, congé 4, envoi 5. */
export const MULTI_ORDRE = ['chantier', 'heures', 'panier_repas', 'signaler_reserve', 'reserve_corrigee', 'demander_conge', 'envoyer_journee'] as const;
/** Liste blanche DURE des annexes : le serveur n'émet que ces types, et l'exécuteur du client REFUSE tout autre (aucun effacement, retrait ni copie ne se glisse dans « Tout confirmer »). */
export const MULTI_AUTORISES = ['panier_repas', 'signaler_reserve', 'reserve_corrigee', 'demander_conge', 'envoyer_journee'] as const;

const MAX_ITEMS = 4;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const validIso = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso; };
const pad2 = (n: number) => String(n).padStart(2, '0');
const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v) ?? 'null');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

// ── Dates ───────────────────────────────────────────────────────────────────
/**
 * Date non ISO rendue par le modèle, en turc : bugün (aujourd'hui), dün (hier), evvelsi gün / önceki gün (avant-hier),
 * yarın (demain), jj.mm.aaaa et jj.mm (année courante). Le reste → '' (le modèle lit les autres mots turcs de dates).
 */
export function parseDateTr(raw: string, today: string): string {
  const n = norm(String(raw ?? '')).trim();
  if (/(^|[^a-z])bugun(?![a-z])/.test(n)) return today;
  if (/(^|[^a-z])(?:evvelsi|onceki)\s+gun(?![a-z])/.test(n)) return addDaysIso(today, -2);
  if (/(^|[^a-z])dun(?![a-z])/.test(n)) return addDaysIso(today, -1);
  if (/(^|[^a-z])yarin(?![a-z])/.test(n)) return addDaysIso(today, 1);
  const m = /(^|[^\d])(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?(?!\d)/.exec(n);
  if (!m) return '';
  const out = `${m[4] ?? today.slice(0, 4)}-${pad2(Number(m[3]))}-${pad2(Number(m[2]))}`;
  return validIso(out) ? out : '';
}

/** La date d'une fiche : ISO telle quelle ; vide → aujourd'hui ; sinon français puis turc ; illisible → aujourd'hui ET signalé (jamais un repli silencieux). */
function lireDate(raw: unknown, today: string): { date: string; illisible: boolean } {
  if (raw === undefined || raw === null || raw === '') return { date: today, illisible: false };
  const s = String(raw).trim();
  if (ISO.test(s)) return { date: s, illisible: false };
  const d = parseDateFr(s, today) || parseDateTr(s, today);
  return d ? { date: d, illisible: false } : { date: today, illisible: true };
}

// ── Le chantier à créer ─────────────────────────────────────────────────────
/** Retours à la ligne, tabulations et caractères de contrôle → espace ; espaces réduits ; longueur bornée. */
const nettoyer = (v: unknown, max: number) => String(v ?? '').replace(/[\x00-\x1f\x7f-\x9f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
const CIVILITE = /^(?:monsieur|madame|mademoiselle|mme|mlle|mr|m\.|bay|bayan)\s+/i;
const PETITS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'sur', 'sous', 'aux', 'au', 'd', 'l']);
/** Tout en minuscules (dicté) → majuscule initiale de chaque mot (séparateurs espace, tiret, apostrophe) ; sinon tel quel (« Ayşe Kaya » intact). */
function capitaliser(t: string): string {
  if (!t || t !== t.toLocaleLowerCase('fr-FR') || !/\p{L}/u.test(t)) return t;
  let i = 0;
  return t.split(/(\s+|-|['’])/).map((w) => {
    if (!w || /^(\s+|-|['’])$/.test(w)) return w;
    const premier = i++ === 0;
    return !premier && PETITS.has(w) ? w : w.charAt(0).toLocaleUpperCase('fr-FR') + w.slice(1);
  }).join('');
}
const CP5 = /(^|[^\d])(\d{5})(?!\d)/;
const sansCode = (t: string, code: string) => t.replace(code, ' ').replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '');

/**
 * Le bloc « nouveau chantier » proprement écrit (jamais `cleanTitle` : il supprime le mot « ben », « Ben Martin » deviendrait
 * « Martin »). Le code postal dit dans la ville ou l'adresse (« Montagna 01250 ») est extrait ; un code qui n'a pas 5 chiffres
 * n'est JAMAIS écrit comme code postal : il est recopié à la fin de l'adresse. `reutilise_id` et `inutilise` ne sont jamais lus
 * du modèle. Rappelée par le client juste avant tout insert (champs édités à la main compris).
 */
export function cleanNewWorksite(raw: unknown): NewWorksite {
  const r = obj(raw);
  let nom = nettoyer(r.nom, 80);
  while (CIVILITE.test(nom)) nom = nom.replace(CIVILITE, '');
  nom = capitaliser(nom.replace(/[\s.,;:!?]+$/, '').trim());
  let ville = nettoyer(r.ville, 60).replace(/^(?:à|a)\s+(?=\S)/, '');
  let adresse = nettoyer(r.adresse, 120).replace(/[\s,;:]+$/, '');
  let cp = nettoyer(r.code_postal, 10);
  if (cp && !/^\d{5}$/.test(cp)) {
    const m = CP5.exec(cp);
    if (m) cp = m[2];
    else { adresse = adresse ? `${adresse}, ${cp}` : cp; cp = ''; }
  }
  if (!cp) {
    const mv = CP5.exec(ville);
    if (mv) { cp = mv[2]; ville = sansCode(ville, cp); }
  }
  if (!cp) {
    const ma = CP5.exec(adresse);
    if (ma) { cp = ma[2]; adresse = sansCode(adresse, cp); }
  }
  const description = nettoyer(r.description, 200).replace(/[\s.。]+$/, '');
  return { nom, adresse: adresse.slice(0, 120), code_postal: cp, ville: capitaliser(ville.replace(/[\s.,;:]+$/, '')).slice(0, 60), description };
}

const MOTS_VIDES = new Set(['monsieur', 'madame', 'mme', 'mr', 'bay', 'bayan', 'chez', 'le', 'la', 'les', 'de', 'du', 'des', 'et', 'sarl', 'sas', 'ets']);
const motsNom = (s: string) => Array.from(new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !MOTS_VIDES.has(w)))).sort().join(' ');
const cleVille = (s: string) => norm(s).replace(/\([^)]*\)/g, ' ').replace(/\d+/g, ' ').replace(/[^a-z]+/g, ' ').trim();

/**
 * Même chantier ? Les mots du nom (civilités et mots vides retirés), dans n'importe quel ordre, ET la ville (sans chiffres ni
 * parenthèses), non vide. « Dupont Pierrick » = « Pierrick Dupont » ; « Montagna » = « Montagna (01) » = « Montagna 01250 » ;
 * « Pierrick Dupont » ≠ « Villa Dupont ». Serveur ET client.
 */
export function memeChantier(a: { nom: string; ville?: string | null }, b: { nom: string; ville?: string | null }): boolean {
  const na = motsNom(a.nom), nb = motsNom(b.nom);
  const va = cleVille(a.ville ?? ''), vb = cleVille(b.ville ?? '');
  return !!na && na === nb && !!va && va === vb;
}

// ── Contrôle d'une fiche (serveur ET carte, recalculé à chaque modification) ─
export type DejaNotee = WorkerMultiReply['deja_notees'][number];

function dejaNoteesErreurs(lines: DraftLine[], dejaNotees: DejaNotee[]): string[] {
  const out = new Set<string>();
  for (const l of lines) {
    for (const d of dejaNotees) {
      if (overlapMinutes({ start: l.start, end: l.end }, { start: d.debut, end: d.fin }) > 0) {
        out.add(`${d.envoyee ? 'Déjà envoyé' : 'Déjà noté'} aujourd'hui : ${d.debut}–${d.fin} (${d.chantier}). Retirez ce créneau ou corrigez-le dans « Ma journée ».`);
      }
    }
  }
  return Array.from(out);
}

/**
 * Les erreurs BLOQUANTES d'une fiche d'heures : horaire illisible, incohérent, pause plus longue que le créneau, chevauchements
 * (mêmes textes que `checkDraft`), puis, pour aujourd'hui, les créneaux qui chevauchent une ligne déjà notée, puis la date hors période.
 */
export function verifierFiche(date: string, lines: DraftLine[], aujourdhui: string, dejaNotees: DejaNotee[]): string[] {
  if (!lines.length) return [];
  const ck = checkDraft(date, lines, { aujourdhui, chantiers: [], semaine: [], planning: [] });
  const horsPeriode = ck.errors.filter((e) => e.startsWith('Date hors période'));
  const autres = ck.errors.filter((e) => !e.startsWith('Date hors période'));
  return [...autres, ...(date === aujourdhui ? dejaNoteesErreurs(ck.lines, dejaNotees) : []), ...horsPeriode];
}

// ── 6.1 / 6.2 : créneaux et pause ───────────────────────────────────────────
interface Brute { chantier: string; debut: string; fin: string; pause: number }

function lignesBrutes(args: Record<string, unknown>): Brute[] {
  const l = Array.isArray(args.lignes) ? args.lignes : [];
  return l.slice(0, 6).map((x) => {
    const r = obj(x);
    const debut = String(r.debut ?? ''), fin = String(r.fin ?? '');
    return { chantier: nettoyer(r.chantier, 80), debut: parseTime(debut) ?? debut, fin: parseTime(fin) ?? fin, pause: Math.max(0, Number(r.pause) || 0) };
  });
}

/**
 * (b) Le modèle fusionne « de 8h à midi, puis de 13h à 17h » en 08:00-17:00 : une ligne qui commence à une plage dite et finit à
 * une plage dite suivante est redécoupée en UNE LIGNE PAR PLAGE de la phrase. Le surplus de pause (au-delà des trous) va sur la
 * première pièce (visible, jamais perdu en silence). Pas de redécoupage si la phrase n'a qu'une plage ou si les plages ne
 * recouvrent pas exactement la ligne.
 */
function decouper(lines: Brute[], plages: PlageTexte[]): Brute[] {
  if (plages.length < 2) return lines;
  const out: Brute[] = [];
  for (const L of lines) {
    const a = plages.findIndex((p) => p.start === L.debut);
    let b = -1;
    for (let j = a + 1; a >= 0 && j < plages.length; j++) {
      if (toMin(plages[j].start) <= toMin(plages[j - 1].end)) break; // consécutives, ordonnées, séparées d'un trou > 0
      if (plages[j].end === L.fin) { b = j; break; }
    }
    if (a < 0 || b < 0) { out.push(L); continue; }
    let trous = 0;
    for (let k = a + 1; k <= b; k++) trous += toMin(plages[k].start) - toMin(plages[k - 1].end);
    const surplus = Math.max(0, L.pause - trous);
    for (let k = a; k <= b; k++) out.push({ chantier: L.chantier, debut: plages[k].start, fin: plages[k].end, pause: k === a ? surplus : 0 });
  }
  return out;
}

/**
 * (a) La pause n'est JAMAIS comptée deux fois (D5) : le trou entre deux créneaux EST la pause. Si un créneau porte une pause qui
 * égale (±10 min) le trou qui le sépare de son voisin, elle est mise à 0. Renvoie la plus grande pause absorbée.
 */
function absorberPause(lines: Brute[]): number {
  const ok = (l: Brute) => HHMM.test(l.debut) && HHMM.test(l.fin);
  const ord = lines.filter(ok).sort((x, y) => toMin(x.debut) - toMin(y.debut));
  let absorbee = 0;
  for (let i = 1; i < ord.length; i++) {
    const cur = ord[i - 1], next = ord[i];
    const trou = toMin(next.debut) - (toMin(cur.debut) + shiftMinutes(cur.debut, cur.fin));
    if (trou <= 0 || trou > 240) continue;
    for (const l of [cur, next]) {
      if (l.pause > 0 && Math.abs(l.pause - trou) <= 10) { absorbee = Math.max(absorbee, l.pause); l.pause = 0; }
    }
  }
  return absorbee;
}

/** La durée de pause DITE (« pause d'1h », « 45 minutes de pause », « une demi-heure de pause », « bir saat mola »), en minutes. */
function dureePauseDite(text: string): number | null {
  const n = norm(text);
  const MOT = String.raw`(?:pause|coupure|dejeuner|mola)`;
  const duree = (h: string | undefined, mm: string | undefined, unite: string) => (/^(?:h|heures?)$/.test(unite) ? Number(h) * 60 + Number(mm || 0) : Number(h));
  const avant = new RegExp(`${MOT}\\s+(?:de\\s+|d')?(\\d{1,3})\\s*(h|heures?|min\\w*|dakika)\\s*(\\d{2})?`).exec(n);
  if (avant) return duree(avant[1], avant[3], avant[2]);
  const apres = new RegExp(`(\\d{1,3})\\s*(h|heures?|min\\w*|dakika)\\s*(\\d{2})?\\s+(?:de\\s+)?${MOT}`).exec(n);
  if (apres) return duree(apres[1], apres[3], apres[2]);
  if (/demi[- ]?heure|yarim saat/.test(n)) return 30;
  if (/\b(?:une|1|bir)\s+(?:heure|saat)\b|\bd'une heure\b/.test(n)) return 60;
  return null;
}

/** La ligne qui SUIT l'écart dit « pause » : UNE seule, l'écart le plus proche de la durée dite (±10 min), sinon le plus long. */
function marquerPause(lines: DraftLine[], text: string, absorbee: number): void {
  if (!/\b(?:pause|coupure|dejeuner|mola)\b/.test(norm(text))) return;
  const trous: { i: number; trou: number }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const trou = toMin(lines[i].start) - (toMin(lines[i - 1].start) + shiftMinutes(lines[i - 1].start, lines[i - 1].end));
    if (trou > 0 && trou <= 240) trous.push({ i, trou });
  }
  if (!trous.length) return;
  const dite = absorbee || dureePauseDite(text);
  const proche = dite ? trous.filter((t) => Math.abs(t.trou - dite) <= 10).sort((x, y) => Math.abs(x.trou - dite) - Math.abs(y.trou - dite))[0] : undefined;
  const choix = proche ?? trous.slice().sort((x, y) => y.trou - x.trou)[0];
  lines[choix.i].gap_before = 'pause';
}

// ── 6.3 : rattachement au nouveau chantier ──────────────────────────────────
const NOUVEAU_LISTE = new Set(['nouveau', 'nouvelle', 'nouveau chantier', 'le nouveau chantier', 'nouveau client', 'nouvelle cliente', 'ce chantier', 'chez le client',
  'le client', 'chez la cliente', 'new', 'yeni', 'yeni santiye']);
const STOP_NOM = new Set(['le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'a', 'au', 'aux', 'sur', 'chez', 'chantier', 'et', 'puis', 'en']);
const motsChantier = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP_NOM.has(w));
const texteChantier = (s: string) => norm(s).replace(/[.,;:!?"«»]+/g, ' ').replace(/\s+/g, ' ').trim();

type Classe = 'nouveau' | 'choisir' | 'existant' | 'non_apparie';
interface Classee { classe: Classe; id?: string; a_choisir?: { existant: string; nouveau: string } }

/**
 * Classe une ligne AVANT tout `resolveWorksite` (qui rendrait « Villa Dupont » pour « Pierrick Dupont ») :
 * NOUVEAU (« nouveau », le nom du client, la ville), À CHOISIR (« Dupont » seul quand « Pierrick Dupont » est à créer ET que
 * « Villa Dupont » existe), EXISTANT, ou NON APPARIÉ.
 */
function classer(chantier: string, nc: NewWorksite | null, reuseId: string | undefined, snapshot: WorkerSnapshot): Classee {
  const t = texteChantier(chantier);
  const existe = snapshot.chantiers.some((c) => norm(c.nom) === t);
  if (NOUVEAU_LISTE.has(t) && !existe) return { classe: 'nouveau' };
  if (nc?.nom) {
    const N = texteChantier(nc.nom), nw = motsChantier(N), mt = motsChantier(t);
    if (t && (t === N || (nw.length >= 2 && mt.filter((w) => nw.includes(w)).length >= 2) || (nc.ville && t === texteChantier(nc.ville)))) return { classe: 'nouveau' };
    const id = resolveWorksite(chantier, snapshot.chantiers);
    // Un seul mot, et c'est un morceau du nom du nouveau client : on ne devine pas lequel des deux est visé.
    if (id && id !== reuseId && mt.length > 0 && mt.every((w) => nw.includes(w))) {
      return { classe: 'choisir', a_choisir: { existant: snapshot.chantiers.find((c) => c.id === id)?.nom ?? '', nouveau: nc.nom } };
    }
    if (id) return { classe: 'existant', id };
    return { classe: 'non_apparie' };
  }
  const id = resolveWorksite(chantier, snapshot.chantiers);
  return id ? { classe: 'existant', id } : { classe: 'non_apparie' };
}

/** Les infos obligatoires que la fiche réclame, le nom d'abord (le code postal est facultatif ; un chantier réutilisé n'a besoin de rien). */
const champsManquants = (b: NewWorksite): ('ville' | 'nom')[] => (b.reutilise_id ? [] : [...(b.nom ? [] : ['nom' as const]), ...(b.ville ? [] : ['ville' as const])]);
const memeNom = (a: string, b: string) => !!a && !!b && motsNom(a) === motsNom(b);
const BLOC_VIDE: NewWorksite = { nom: '', adresse: '', code_postal: '', ville: '', description: '' };
const blocDit = (nc: NewWorksite) => !!(nc.nom || nc.adresse || nc.code_postal || nc.ville || nc.description);

// ── 6.0 : le pipeline des heures ────────────────────────────────────────────
/**
 * Les arguments de declarer_heures (profil long) → une fiche d'heures contrôlée : date lisible, un créneau par plage dite, pause
 * jamais doublée, nouveau chantier rattaché (ou réutilisé s'il existe déjà), aucun créneau rempli au hasard. Les mêmes contrôles
 * que le lecteur local (`checkDraft`), plus les lignes déjà notées aujourd'hui.
 */
export function normaliserHeures(args: Record<string, unknown>, text: string, snapshot: WorkerSnapshot, live: WorkerLive): Draft {
  const { date, illisible } = lireDate(args.date, snapshot.aujourdhui);
  const brutes = decouper(lignesBrutes(args), plagesDuTexte(text));
  const absorbee = absorberPause(brutes);

  // Le bloc « nouveau chantier » et sa réutilisation éventuelle.
  const nc = cleanNewWorksite(args.nouveau_chantier);
  const existant = nc.nom && nc.ville ? snapshot.chantiers.find((c) => memeChantier(nc, c)) : undefined;
  const classees = brutes.map((l) => classer(l.chantier, nc.nom ? nc : null, existant?.id, snapshot));
  if (nc.nom) {
    const U = classees.filter((c) => c.classe === 'non_apparie');
    const aucunExistant = !classees.some((c) => c.classe === 'existant');
    // Le nouveau chantier est le seul lieu de la journée, ou la seule ligne sans chantier ; sinon le salarié choisit (jamais « Autre »).
    for (const c of U) c.classe = aucunExistant || U.length === 1 ? 'nouveau' : 'choisir';
  }

  const lines: DraftLine[] = brutes.map((l, i) => {
    const c = classees[i];
    const base = { start: l.debut, end: l.fin, break_minutes: l.pause, key: `L${i}` };
    if (c.classe === 'nouveau') {
      return existant ? { ...base, worksite_id: existant.id, worksite_text: existant.nom }
        : { ...base, worksite_id: null, worksite_text: nc.nom, nouveau: true as const };
    }
    if (c.classe === 'choisir') return { ...base, worksite_id: null, worksite_text: '', ...(c.a_choisir ? { a_choisir: c.a_choisir } : {}) };
    // Comme sanitizeWorkerAi : le chantier dit, sinon le planning (seulement quand aucun nouveau chantier n'est dit).
    return { ...fillUnsaid({ worksite_id: c.id ?? null, worksite_text: l.chantier, start: l.debut, end: l.fin, break_minutes: l.pause }, date, snapshot), key: base.key };
  });

  const d = checkDraft(date, lines, snapshot);
  const deja = live.lignes.map((l) => ({ debut: l.debut, fin: l.fin, chantier: l.chantier, envoyee: l.envoyee }));
  const errors = [...(illisible ? ['Date illisible : vérifiez le jour.'] : []), ...(lines.length ? verifierFiche(date, lines, snapshot.aujourdhui, deja) : d.errors)];
  marquerPause(d.lines, text, absorbee);

  const rattachees = d.lines.filter((l) => l.nouveau || (existant && l.worksite_id === existant.id)).length;
  const draft: Draft = { date, lines: d.lines, errors };
  if (blocDit(nc) || d.lines.some((l) => l.nouveau)) {
    const bloc: NewWorksite = d.lines.some((l) => l.nouveau) && !blocDit(nc) ? { ...BLOC_VIDE } : nc;
    if (existant && rattachees) bloc.reutilise_id = existant.id;
    const sansLigne = !d.lines.some((l) => l.nouveau) && !(existant && rattachees);
    if (bloc.nom && sansLigne) bloc.inutilise = true;
    draft.nouveau_chantier = bloc;
    const manque = sansLigne ? [] : champsManquants(bloc);
    if (manque.length) draft.manque = manque;
  }
  return draft;
}

// ── 6.5 : les appels du modèle → la fiche ───────────────────────────────────
const SUPPRESSIONS = ['effacer_heures', 'annuler_conge', 'modifier_conge', 'retirer_photo', 'retirer_reserve'];
const AUTRES = ['modifier_heures', 'copier_journee', 'terminer_pointage', 'ranger_photo', 'email_client', 'planning_collegues'];
const ANNEXES = ['panier_repas', 'signaler_reserve', 'reserve_corrigee', 'demander_conge', 'envoyer_journee'];
const LIBELLES: Record<string, string> = {
  effacer_heures: 'Effacer des heures', annuler_conge: 'Annuler un congé', modifier_conge: 'Changer un congé', retirer_photo: 'Retirer une photo',
  retirer_reserve: 'Retirer une réserve', modifier_heures: 'Modifier une ligne', copier_journee: 'Copier une journée', terminer_pointage: 'Terminer le pointage',
  ranger_photo: 'Ranger un fichier', email_client: 'Mémoriser l’email d’un client', planning_collegues: 'Planning des collègues', declarer_heures: 'Heures d’un autre jour',
  panier_repas: 'Panier repas', signaler_reserve: 'Réserve', reserve_corrigee: 'Lever la réserve', envoyer_journee: 'Envoyer la journée', demander_conge: 'Congé',
  nouveau_chantier: 'Nouveau chantier', autres_actions: 'Autres actions',
};
/** Indice lexical obligatoire pour une annexe : une consigne cachée dans un nom de chantier (injecté dans la consigne de tous les salariés) ne déclenche rien. */
const INDICE: Record<string, RegExp> = {
  panier_repas: /panier|sepet|yemek/,
  signaler_reserve: /reserv|fissure|malfacon|catlak|defaut|probleme|souci|casse|fuite|humidite|infiltration/,
  reserve_corrigee: /reserv|rezerv|leve|regle|corrig|duzelt/,
  demander_conge: /conge|vacances|malad|rtt|izin|rapor|hasta|absen|tatil|repos/,
  envoyer_journee: /envoi|envoy|valide|transmet|gonder/,
};
const RANG: Record<string, number> = { chantier: 0, heures: 1, panier_repas: 2, signaler_reserve: 3, reserve_corrigee: 3, demander_conge: 4, envoyer_journee: 5 };
const JOUR_SEUL = ['panier_repas', 'signaler_reserve', 'reserve_corrigee', 'envoyer_journee'];
/** Famille demandée dans la phrase (profilSaisie) → noms d'appels qui la couvrent, et libellé. */
const FAMILLES: Record<string, { noms: string[]; libelle: string }> = {
  panier: { noms: ['panier_repas'], libelle: 'Panier repas' },
  reserve: { noms: ['signaler_reserve', 'reserve_corrigee'], libelle: 'Réserve' },
  conge: { noms: ['demander_conge'], libelle: 'Congé' },
  envoi: { noms: ['envoyer_journee'], libelle: 'Envoi de la journée' },
  nouveau_chantier: { noms: ['nouveau_chantier'], libelle: 'Nouveau chantier' },
  copie: { noms: ['copier_journee'], libelle: 'Copie d’une journée' },
  heures: { noms: ['declarer_heures'], libelle: 'Heures' },
};

interface Appel { name: string; args: Record<string, unknown> }

/** Fusionne les champs vides de `b` dans `a` (premier appel gagnant). */
const completer = (a: NewWorksite, b: NewWorksite): NewWorksite => ({
  nom: a.nom || b.nom, adresse: a.adresse || b.adresse, code_postal: a.code_postal || b.code_postal, ville: a.ville || b.ville, description: a.description || b.description,
});

/** Une ligne virtuelle par créneau de la fiche : les annexes (panier, réserve, envoi) sont préparées comme si les heures étaient déjà notées. */
function lignesVirtuelles(draft: Draft, snapshot: WorkerSnapshot): WorkerLive['lignes'] {
  const bloc = draft.nouveau_chantier;
  return draft.lines.map((l) => ({
    id: `draft:${l.key}`,
    chantier: l.worksite_id ? snapshot.chantiers.find((c) => c.id === l.worksite_id)?.nom ?? 'Chantier' : l.nouveau ? (bloc?.nom || 'Nouveau chantier') : 'Chantier à choisir',
    chantier_id: l.worksite_id, debut: l.start, fin: l.end, envoyee: false, panier: false, reserve: false, corrigee: false,
  }));
}

/** Pose la ligne de la fiche visée par une réserve : par CHANTIER (la ligne qui commence le plus tard), jamais par rang. */
function viserReserve(a: WorkerAction, args: Record<string, unknown>, snapshot: WorkerSnapshot, live: WorkerLive, nouveauIds: Set<string>): { action: WorkerAction; cible?: { chantier_id: string | null; nouveau: boolean; nom: string } } {
  if (a.draft.type !== 'signaler_reserve') return { action: a };
  let draft = a.draft;
  if (!draft.entry_id) {
    const t = nettoyer(args.chantier, 80);
    const cand = t ? live.lignes.filter((l) => norm(l.chantier).includes(norm(t)) || norm(t).includes(norm(l.chantier))) : live.lignes;
    const cle = (l: WorkerLive['lignes'][number]) => l.chantier_id ?? `~${norm(l.chantier)}`;
    if (cand.length && cand.every((l) => cle(l) === cle(cand[0]))) {
      const derniere = cand.slice().sort((x, y) => toMin(y.debut) - toMin(x.debut))[0];
      draft = { ...draft, entry_id: derniere.id };
    }
  }
  const visee = draft.entry_id ? live.lignes.find((l) => l.id === draft.entry_id) : undefined;
  const action: WorkerAction = draft === a.draft ? a : { draft, problems: checkWorkerAction(draft, snapshot, live) };
  if (!visee || !visee.id.startsWith('draft:')) return { action };
  return { action, cible: { chantier_id: visee.chantier_id ?? null, nouveau: nouveauIds.has(visee.id), nom: visee.chantier } };
}

type SansId<T> = T extends unknown ? Omit<T, 'id'> : never;
interface Piece { rang: number; item: SansId<MultiItem> }

/**
 * Les appels du modèle (au plus 4) → la réponse du profil long : une fiche `multi` dès qu'il y a quelque chose à ÉCRIRE (même
 * un seul élément : rien ne part sans « Tout confirmer »), sinon la réponse habituelle (`repondre`, planning des collègues,
 * suppression avec sa propre confirmation). Ce qui est laissé de côté est DIT (`ignores`, `non_prepare`), jamais perdu en silence.
 */
export function buildLongReply(calls: Appel[], text: string, snapshot: WorkerSnapshot, live: WorkerLive, opts: { secours?: boolean; rognes?: number } = {}): WorkerFullReply | WorkerMultiReply | LongLegacy {
  // 1. Doublons exacts, puis le plafond (au cas où l'appelant en donnerait plus que 4).
  const vus = new Set<string>();
  const tous = calls.filter((c) => { const k = `${c.name}|${stable(c.args)}`; return vus.has(k) ? false : (vus.add(k), true); });
  const uniq = tous.slice(0, MAX_ITEMS);
  const rognes = (opts.rognes ?? 0) + (tous.length - uniq.length);
  if (!uniq.length) return { kind: 'answer', answer: 'Je n’ai pas compris. Reformulez.' };

  const n = norm(text);
  const today = snapshot.aujourdhui;
  const ignores: MultiIgnore[] = [];
  const ignorer = (name: string, raison: string) => ignores.push({ name, label: LIBELLES[name] ?? name, raison });

  // 2. Partition.
  const H = uniq.filter((c) => c.name === 'declarer_heures');
  const NC = uniq.filter((c) => c.name === 'nouveau_chantier');
  const REP = uniq.filter((c) => c.name === 'repondre');
  const SUPP = uniq.filter((c) => SUPPRESSIONS.includes(c.name));
  const AUT = uniq.filter((c) => AUTRES.includes(c.name));
  const ANN = uniq.filter((c) => ANNEXES.includes(c.name));

  // 3. Rien à écrire : la réponse habituelle du PREMIER appel, sa propre confirmation comprise.
  if (!H.length && !NC.length && !ANN.length) {
    const r = fromWorkerCall(uniq[0].name, uniq[0].args, snapshot, live) as LongLegacy;
    // Un geste « direct » (modifier une ligne, copier une journée, terminer le pointage) ne s'exécute jamais tout seul ici.
    return r.kind === 'action' && workerActionMode(r.action.draft) === 'direct' ? { ...r, confirmer: true } : r;
  }
  // 4. Une suppression ou un « autre » mêlé à d'autres appels : jamais dans « Tout confirmer ».
  for (const c of SUPP) ignorer(c.name, 'Effacer ou annuler se demande à part, avec sa propre confirmation.');
  for (const c of AUT) ignorer(c.name, 'À demander séparément.');

  // 8. Un `repondre` joint aux actions devient la note (dans la langue du salarié).
  let note: string | undefined;
  let links: { label: string; action: string }[] | undefined;
  if (REP.length) {
    const r = fromWorkerCall('repondre', REP[0].args, snapshot, live);
    if (r.kind === 'guide') { note = r.answer.slice(0, 500); if (r.links.length) links = r.links; }
  }

  const pieces: Piece[] = [];
  let heures: Draft | null = null;

  // 5. Un seul declarer_heures par jour : même date → lignes fusionnées ; autre jour → laissé de côté.
  if (H.length) {
    const jour = lireDate(H[0].args.date, today).date;
    let args: Record<string, unknown> = { ...H[0].args, lignes: Array.isArray(H[0].args.lignes) ? [...H[0].args.lignes as unknown[]] : [] };
    for (const h of H.slice(1)) {
      if (lireDate(h.args.date, today).date !== jour) { ignorer('declarer_heures', 'Une seule journée à la fois : redemandez l’autre jour séparément.'); continue; }
      args = {
        ...args, lignes: [...args.lignes as unknown[], ...(Array.isArray(h.args.lignes) ? h.args.lignes as unknown[] : [])],
        nouveau_chantier: completer(cleanNewWorksite(args.nouveau_chantier), cleanNewWorksite(h.args.nouveau_chantier)),
      };
    }
    // 6. nouveau_chantier autonome : fusionné dans les heures si une ligne l'attend (même nom, « nouveau »…).
    const restes: Appel[] = [];
    for (const c of NC) {
      const nc = cleanNewWorksite(c.args);
      const bloc = cleanNewWorksite(args.nouveau_chantier);
      const lignes = lignesBrutes(args);
      const vise = lignes.some((l) => classer(l.chantier, nc, undefined, snapshot).classe === 'nouveau');
      if (vise && (!bloc.nom || memeNom(bloc.nom, nc.nom))) args = { ...args, nouveau_chantier: completer(bloc, nc) };
      else restes.push(c);
    }
    NC.splice(0, NC.length, ...restes);
    heures = normaliserHeures(args, text, snapshot, live);
    pieces.push({ rang: RANG.heures, item: { kind: 'heures', draft: heures, depend: [] } });
  }

  // 6 (suite). nouveau_chantier SEUL : un élément « chantier » (même bloc, mêmes contrôles).
  for (const c of NC) {
    const nc = cleanNewWorksite(c.args);
    const existant = nc.nom && nc.ville ? snapshot.chantiers.find((x) => memeChantier(nc, x)) : undefined;
    if (existant) nc.reutilise_id = existant.id;
    pieces.push({ rang: RANG.chantier, item: { kind: 'chantier', nouveau_chantier: nc, manque: champsManquants(nc), depend: [] } });
  }

  // Un bloc « nouveau chantier » sans aucun créneau ne disparaît pas en silence.
  if (heures?.nouveau_chantier?.inutilise) ignorer('nouveau_chantier', 'Aucun créneau n’est sur ce chantier : il ne sera pas créé.');

  // 7. Annexes en double.
  const annexes: Appel[] = [];
  let reserveVue = false, corrigeeVue = false;
  for (const c of ANN) {
    if (c.name === 'panier_repas') { const i = annexes.findIndex((x) => x.name === c.name); if (i >= 0) annexes.splice(i, 1); annexes.push(c); continue; }
    if (c.name === 'envoyer_journee' && annexes.some((x) => x.name === c.name)) continue;
    if (c.name === 'signaler_reserve' || c.name === 'reserve_corrigee') {
      const dejaVue = c.name === 'signaler_reserve' ? reserveVue : corrigeeVue;
      if (dejaVue) { ignorer(c.name, 'Une seule réserve à la fois.'); continue; }
      if (c.name === 'signaler_reserve') reserveVue = true; else corrigeeVue = true;
    }
    annexes.push(c);
  }

  // 9 / 10 / 11. Les annexes, préparées sur les lignes de la fiche.
  const dateFiche = heures?.date ?? today;
  const virtuelles = heures && dateFiche === today ? lignesVirtuelles(heures, snapshot) : [];
  const liveApres: WorkerLive = { ...live, lignes: [...live.lignes, ...virtuelles] };
  const nouveauIds = new Set(heures ? heures.lines.filter((l) => l.nouveau).map((l) => `draft:${l.key}`) : []);
  for (const c of annexes) {
    if (!INDICE[c.name]?.test(n)) { ignorer(c.name, 'Non demandé dans votre message.'); continue; }
    if (JOUR_SEUL.includes(c.name) && heures && dateFiche !== today) { ignorer(c.name, 'Le panier, la réserve et l’envoi ne concernent que la journée d’aujourd’hui.'); continue; }
    const args = c.name === 'demander_conge' ? dateConge(c.args, today) : c.args;
    const prep = prepareWorkerAction(c.name, args, snapshot, liveApres);
    if (!prep) { ignorer(c.name, 'Non compris : redemandez-le.'); continue; }
    const { action, cible } = viserReserve(prep, args, snapshot, liveApres, nouveauIds);
    const item: SansId<Extract<MultiItem, { kind: 'action' }>> = { kind: 'action', action, depend: [], ...(cible ? { cible } : {}) };
    if (action.draft.type === 'envoyer_journee') {
      // sendWorkerDay envoie TOUT le jour : les lignes déjà notées partent avec la fiche, et la règle des 6 h s'applique à l'ensemble.
      const deja = live.lignes.filter((l) => !l.envoyee);
      item.deja_notees = deja.map((l) => ({ chantier: l.chantier, debut: l.debut, fin: l.fin }));
      const creneaux = [...(heures && dateFiche === today ? heures.lines.map((l) => ({ id: `draft:${l.key}`, start: l.start, end: l.end, editable: true, break_minutes: l.break_minutes })) : []),
        ...deja.map((l) => ({ id: l.id, start: l.debut, end: l.fin, editable: true, break_minutes: 0 }))];
      if (pauseAsks(creneaux).length) item.avertissements = ['Plus de 6 h d’affilée sans pause : l’envoi sera refusé. Ajoutez la pause, ou envoyez la journée depuis « Ma journée ».'];
    }
    pieces.push({ rang: RANG[c.name], item });
  }

  // 15. Pas d'élément : on le dit en une phrase (jamais une fiche vide).
  if (!pieces.length) return { kind: 'answer', answer: ignores.map((i) => `${i.label} : ${i.raison}`).join(' ').slice(0, 500) || 'Je n’ai pas compris. Reformulez.' };

  // 13. L'ordre (chantier → heures → panier → réserve → congé → envoi) et les dépendances.
  const tries = pieces.map((p, i) => ({ p, i })).sort((x, y) => x.p.rang - y.p.rang || x.i - y.i).map((x) => x.p);
  const items = tries.map((p, k) => ({ ...p.item, id: `i${k}` }) as MultiItem);
  const idHeures = items.find((it) => it.kind === 'heures')?.id;
  const typeDe = (it: MultiItem) => (it.kind === 'action' ? it.action.draft.type : it.kind);
  for (const it of items) {
    if (it.kind !== 'action') continue;
    const t = it.action.draft.type;
    if (t === 'panier_repas' || t === 'signaler_reserve' || t === 'reserve_corrigee') it.depend = idHeures ? [idHeures] : [];
    else if (t === 'envoyer_journee') it.depend = items.filter((x) => x !== it && ['heures', 'panier_repas', 'signaler_reserve', 'reserve_corrigee'].includes(typeDe(x))).map((x) => x.id);
  }

  // 14. Appels écartés par le plafond.
  if (rognes > 0) ignorer('autres_actions', rognes > 1 ? `${rognes} actions de plus n’ont pas été préparées : redemandez-les séparément.` : '1 action de plus n’a pas été préparée : redemandez-la séparément.');

  // 6.6. Contrôle croisé : rien ne disparaît sans un mot.
  const couverts = new Set<string>([...items.map(typeDe), ...ignores.map((i) => i.name)]);
  if (items.some((it) => it.kind === 'heures')) couverts.add('declarer_heures');
  if (items.some((it) => it.kind === 'chantier' || (it.kind === 'heures' && it.draft.nouveau_chantier))) couverts.add('nouveau_chantier');
  const non_prepare = profilSaisie(text).familles.map((f) => FAMILLES[f]).filter((f) => f && !f.noms.some((nom) => couverts.has(nom))).map((f) => f.libelle);

  const reply: WorkerMultiReply = {
    kind: 'multi', answer: MULTI_ANSWER, date: dateFiche, aujourdhui: today, items, ignores, non_prepare,
    deja_notees: live.lignes.map((l) => ({ debut: l.debut, fin: l.fin, chantier: l.chantier, envoyee: l.envoyee })),
    ...(note ? { note } : {}), ...(links ? { links } : {}),
    ...(opts.secours || non_prepare.length || rognes > 0 ? { incertain: true as const } : {}),
  };
  return reply;
}

/** Dates d'une demande de congé en turc (« yarın », « 12.10.2026 ») : seulement si le modèle n'a pas rendu une date ISO. */
function dateConge(args: Record<string, unknown>, today: string): Record<string, unknown> {
  const out = { ...args };
  for (const k of ['du', 'au']) {
    const v = out[k];
    if (typeof v === 'string' && v && !ISO.test(v.trim())) { const d = parseDateFr(v, today) || parseDateTr(v, today); if (d) out[k] = d; }
  }
  return out;
}
