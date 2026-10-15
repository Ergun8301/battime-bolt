// OUVRIR un écran depuis l'assistant, côté navigateur (étape 3, livraison 3b-1). Contrat : docs/ia-etape3/00-conception-etape3.md §3.3 ; détail : docs/ia-etape3/04-ouvrir-n-importe-quel-ecran.md.
//
// Le serveur répond par un lien `ouvrir:<id>?k=v&k=v` (_shared/ouvrir.ts). Une PAGE (bureau : /admin, salarié : /poseur) enregistre, dans un effet, ce qu'elle sait ouvrir :
// `registerOpeners(cote, impls, options)`. Le panneau de l'assistant appelle `openLink(action)` quand on touche le bouton (ou tout seul, si le serveur a dit `auto`).
//
// CE MODULE N'IMPORTE AUCUN REGISTRE : le site est exporté en statique, tout le JavaScript d'un chunk est public (test T8). La page lui PASSE la table légère de son côté
// (`registre/ouvreurs-leger-<côté>.ts` : ids, rôles, paramètres typés, drapeaux — aucun texte). Seul `import type` ci-dessous, effacé à la compilation.
//
// QUATRE barrières, aucune ne repose sur le modèle (§3.3) : (1) la fonction du serveur est par côté ; (2) l'enum de l'outil aussi ; (3) la validation du lien, ICI ; (4) `openLink` :
// id enregistré SUR CETTE PAGE, rôle, fonction activée (`dispo`), largeur, fenêtre à saisie déjà ouverte (`occupe`, aucune saisie perdue). Un lien relu depuis l'historique d'un chat
// est une donnée non fiable : mêmes contrôles. Une valeur invalide est laissée vide, jamais devinée. Jamais d'`eval`, d'`import()` construit ni de chemin d'URL.
//
// Syntaxe de la cible navigateur (T11) : ni lookbehind, ni `.at()`, `findLast`, `Object.hasOwn`, `replaceAll`, `structuredClone`.
import type { Dispo, KindParam, OuvreurLeger } from '@/supabase/functions/_shared/registre/types';

export type StatutOuverture = 'ouvert' | 'occupe' | 'indisponible' | 'inconnu' | 'file';
/** Ce qu'une page sait faire pour un écran : poser des états (jamais enregistrer). Peut répondre `occupe`, `indisponible` ou `file` (page pas encore prête). */
export type ImplOuvreur = (p: Record<string, string>) => StatutOuverture | void;
export interface OptionsOuvreurs {
  /** La table légère du côté de la page (importée par la page, jamais par ce module). */
  table: readonly OuvreurLeger[];
  /** Le rôle de la personne connectée (`admin`, `worker`, `lead`). */
  role: string;
  /** La fonction demandée est-elle activée chez ce client (versionsOn, tracesOn, trainingsOn, kioskOn…) ? */
  dispo?: (d: Dispo) => boolean;
  /** Une fenêtre à saisie est-elle ouverte ? Alors rien ne s'ouvre par-dessus (sauf un écran `empile`) : la personne n'y perdrait pas ce qu'elle a tapé. */
  occupe?: () => boolean;
}

interface Registre { cote: string; impls: Record<string, ImplOuvreur>; opts: OptionsOuvreurs }
const registres: Registre[] = [];
/** La demande qui attend que la page soit prête : une seule, 10 secondes au plus (comme afterScanPending de la journée du salarié). */
let attente: { action: string; jusqua: number } | null = null;
export const ATTENTE_MS = 10000;

const ID = /^[a-z_]+\.[a-z_]+$/;
const CLE = /^[a-z]{1,16}$/;
const IDENT = /^[A-Za-z0-9_-]{1,64}$/;
const MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const LIEN_MAX = 200;
export const TEXTE_MAX = 80;
export const PARAMS_MAX = 8;

/** aaaa-mm-jj qui existe (calculé sans `new Date(texte)` : aucune dépendance au fuseau). */
export function dateValide(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** Une valeur du lien, revalidée ici (le serveur l'a déjà fait : on ne lui fait pas confiance). '' = invalide, laissée vide. */
function valeurValide(kind: KindParam, v: string, valeurs?: readonly string[]): string {
  switch (kind) {
    case 'salarie': case 'chantier': return IDENT.test(v) ? v : '';
    case 'date': case 'lundi': return dateValide(v) ? v : '';
    case 'mois': return MOIS.test(v) ? v : '';
    case 'heure': return HEURE.test(v) ? v : '';
    case 'enum': return valeurs && valeurs.indexOf(v) >= 0 ? v : '';
    case 'liste_dates': {
      const l = v.split(',');
      return l.length <= 31 && l.every(dateValide) ? v : '';
    }
    default: return v.replace(/[\u0000-\u001f\u007f<>`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TEXTE_MAX);
  }
}

/**
 * `ouvrir:<id>?k=v&k=v` → l'écran et ses valeurs, ou null. Seules les clés que l'écran déclare sont lues (huit au plus) ; une valeur invalide est ignorée.
 * Aucune clé n'est jamais écrite sur un objet qui hérite (`Object.create(null)`) : `__proto__` ou `constructor` ne font rien.
 */
export function lireLien(action: string, table: readonly OuvreurLeger[]): { o: OuvreurLeger; p: Record<string, string> } | null {
  if (typeof action !== 'string' || action.length > LIEN_MAX || action.indexOf('ouvrir:') !== 0) return null;
  const q = action.indexOf('?');
  const id = action.slice(7, q < 0 ? undefined : q);
  if (!ID.test(id)) return null;
  const o = table.filter((x) => x.id === id)[0];
  if (!o) return null;
  const p: Record<string, string> = Object.create(null);
  if (q >= 0) {
    const paires = action.slice(q + 1).split('&').slice(0, PARAMS_MAX);
    for (let i = 0; i < paires.length; i++) {
      const e = paires[i].indexOf('=');
      if (e < 1) continue;
      const k = paires[i].slice(0, e);
      if (!CLE.test(k) || !Object.prototype.hasOwnProperty.call(o.params, k) || Object.prototype.hasOwnProperty.call(p, k)) continue;
      let v: string;
      try { v = decodeURIComponent(paires[i].slice(e + 1)); } catch { continue; }
      const bon = valeurValide(o.params[k].kind, v, o.params[k].valeurs);
      if (bon) p[k] = bon;
    }
  }
  return { o, p };
}

/** Une seule largeur pour dire « petit écran » : 1023 px (la barre du bureau est cachée dessous). Appliquée à l'USAGE d'un ouvreur seulement. */
export function isNarrow(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(max-width: 1023px)').matches;
}

/**
 * Une page annonce ce qu'elle sait ouvrir (appelée dans un `useEffect`, le retour est le nettoyage). Les clés de `impls` sont des littéraux
 * (`'planning.semaine': (p) => …`) : le test T6 les lit. Plusieurs enregistrements peuvent coexister (la page et son parent).
 */
export function registerOpeners(cote: string, impls: Record<string, ImplOuvreur>, opts: OptionsOuvreurs): () => void {
  const r: Registre = { cote, impls, opts };
  registres.push(r);
  // Une demande en attente se rejoue dès qu'une page s'annonce (pas dans le même tour : l'effet qui enregistre doit finir).
  if (attente) setTimeout(rejouerOuvreurs, 0);
  return () => { const i = registres.indexOf(r); if (i >= 0) registres.splice(i, 1); };
}

function ouvrir(action: string, jusqua: number): StatutOuverture {
  const premier = registres[0];
  if (!premier) { attente = { action, jusqua }; return 'file'; }          // aucune page prête : la file attend
  let lu: { o: OuvreurLeger; p: Record<string, string> } | null = null;
  let reg: Registre | null = null;
  for (let i = 0; i < registres.length && !lu; i++) { const x = lireLien(action, registres[i].opts.table); if (x) { lu = x; reg = registres[i]; } }
  if (!lu || !reg) return 'inconnu';                                      // id inconnu, jamais enregistré sur CETTE page, ou autre côté
  const { o, p } = lu;
  const impl = Object.prototype.hasOwnProperty.call(reg.impls, o.id) ? reg.impls[o.id] : null;
  if (!impl || o.roles.indexOf(reg.opts.role as never) < 0) return 'inconnu';
  if (o.dispo && reg.opts.dispo && !reg.opts.dispo(o.dispo)) return 'indisponible';
  if (o.ecran === 'grand' && isNarrow()) return 'indisponible';
  if (reg.opts.occupe && reg.opts.occupe() && !o.empile) return 'occupe';
  let s: StatutOuverture | void;
  try { s = impl(p); } catch { return 'indisponible'; }
  if (s === 'file') { attente = { action, jusqua }; return 'file'; }
  return s || 'ouvert';
}

/** Ouvre l'écran d'un lien `ouvrir:…`. Ne lève jamais. Les autres actions (`couts`, `salarie:<id>`, `guide:<id>`, `ask:…`) ne passent pas ici : la page les traite comme avant. */
export function openLink(action: string): StatutOuverture {
  try {
    attente = null;
    return ouvrir(action, Date.now() + ATTENTE_MS);
  } catch {
    return 'indisponible';
  }
}

/** Rejoue la demande en attente (si elle n'a pas plus de 10 s) : une page vient de s'annoncer, ou ses données viennent d'arriver. */
export function rejouerOuvreurs(): void {
  const a = attente;
  attente = null;
  if (!a || Date.now() > a.jusqua) return;
  try { ouvrir(a.action, a.jusqua); } catch { /* rien : la personne retouche le bouton */ }
}

/** Le message à montrer quand le lien n'a rien ouvert (null = ouvert, ou en attente d'une page pas prête). */
export function messageOuverture(s: StatutOuverture): string | null {
  return s === 'occupe' ? 'Terminez ou fermez la fenêtre en cours, puis redemandez-moi.'
    : s === 'indisponible' ? 'Cet écran n’est pas disponible ici (fonction non activée chez vous, ou écran trop petit).'
    : s === 'inconnu' ? 'Je ne peux pas ouvrir cet écran depuis cette page.' : null;
}
