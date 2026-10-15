// Interrupteurs de l'étape 3 de l'assistant (livraison 3b-1). Contrat : docs/ia-etape3/00-conception-etape3.md §1.3.
//
// Un secret NEUF, `AI_ETAPE3`, jamais dans AI_CONFIG : une clé inconnue dans AI_CONFIG fait basculer TOUT Gemini en formule d'essai
// (ai-provider.ts), alors qu'ici une faute de frappe ne doit éteindre que l'étape 3. Valeur : un JSON.
//
//   { "ouvrir":    { "bureau": "off", "salarie": "off" },
//     "boucle":    { "bureau": "off", "salarie": "off" },
//     "ecritures": { "bureau": "off", "salarie": "off", "modes_actuel": "*" },
//     "pilote": ["<uuid entreprise>"], "pct": 0, "outils_coupes": ["copier_intervention"] }
//
// Valeurs d'un interrupteur : `off` · `pilote` (les entreprises de la liste `pilote`) · `pct` (FNV-1a de l'identifiant de l'entreprise
// modulo 100, strictement inférieur à `pct` : stable PAR ENTREPRISE, jamais par demande) · `on`.
//
// RÈGLE D'OR : absent, illisible ou inconnu = TOUT ÉTEINT = le comportement d'avant l'étape 3, et AUCUNE fonction de ce module ne lève.
// « Inconnu » s'entend du secret entier : une clé que ce code ne connaît pas, une valeur hors liste, un `pct` hors de 0 à 100 éteignent TOUT
// (jamais la moitié d'un secret mal écrit : on ne sait pas ce que son auteur voulait allumer). `lireEtape3` dit pourquoi (le banc d'essai
// le renvoie en 400, comme `aiConfig`).
//
// Seul `ouvrir` est utilisé par la livraison 3b-1. `boucle` et `ecritures` (dont `modes_actuel`) sont ACCEPTÉS et ignorés : ils servent
// aux livraisons 3c et 3d, et un secret écrit pour elles ne doit pas éteindre `ouvrir`. `outils_coupes` (arrêt d'urgence d'un outil par son
// identifiant) agit déjà : il l'emporte sur tout (précédence §1.3 : outils_coupes > modes_actuel > mode cible).
//
// GARDE (§1.3) : tant que la provenance, l'assainissement des listes et la teinte (3d-1) ne sont pas livrés et testés, `modesActuel`
// ignore tout `modes_actuel` autre que `"*"` : LIVRAISON_COURANTE < 3d1.
//
// SERVEUR SEULEMENT (fonctions Edge, banc, tests Deno). Aucun import de Deno ni de React : l'environnement est passé en paramètre.
import { LIVRAISON_COURANTE, livraisonAtteinte } from './registre/config.ts';
import type { Cote, Livraison } from './registre/types.ts';

export const SECRET_ETAPE3 = 'AI_ETAPE3';

export type FonctionEtape3 = 'ouvrir' | 'boucle' | 'ecritures';
export type ValeurInterrupteur = 'off' | 'pilote' | 'pct' | 'on';
export type Etape3Env = { get(key: string): string | undefined };

export interface Etape3Config {
  ouvrir: Record<Cote, ValeurInterrupteur>;
  boucle: Record<Cote, ValeurInterrupteur>;
  ecritures: Record<Cote, ValeurInterrupteur>;
  /** `"*"` : tous les outils d'écriture gardent leur mode actuel ; une liste : seulement ceux-là (3d). Ignoré avant 3d-1 (garde). */
  modes_actuel: '*' | string[];
  pilote: string[];
  pct: number;
  outils_coupes: string[];
}

const VALEURS: readonly ValeurInterrupteur[] = ['off', 'pilote', 'pct', 'on'];
const FONCTIONS: readonly FonctionEtape3[] = ['ouvrir', 'boucle', 'ecritures'];
const COTES: readonly Cote[] = ['bureau', 'salarie'];
const CLES = ['ouvrir', 'boucle', 'ecritures', 'pilote', 'pct', 'outils_coupes'];

/** Tout éteint : ce que rend n'importe quel secret absent, illisible ou inconnu. */
export function toutEteint(): Etape3Config {
  return {
    ouvrir: { bureau: 'off', salarie: 'off' }, boucle: { bureau: 'off', salarie: 'off' }, ecritures: { bureau: 'off', salarie: 'off' },
    modes_actuel: '*', pilote: [], pct: 0, outils_coupes: [],
  };
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Un nom lu dans un tableau ou un objet : jamais `__proto__` (les listes du secret sont des données, pas des clés d'objet). */
const estIdentifiant = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v.trim());

/**
 * Lit le texte du secret. Pure, ne lève jamais : `{ ok: false, error }` pour tout ce qui n'est pas un secret entièrement compris.
 * Un texte vide ou absent n'est PAS une erreur (« pas de secret » = tout éteint), mais rend ok: true et le tout-éteint.
 */
export function lireEtape3(brut: unknown): { ok: true; config: Etape3Config } | { ok: false; error: string } {
  try {
    if (brut === undefined || brut === null) return { ok: true, config: toutEteint() };
    let v: unknown = brut;
    if (typeof brut === 'string') {
      if (!brut.trim()) return { ok: true, config: toutEteint() };
      try { v = JSON.parse(brut); } catch { return { ok: false, error: 'JSON illisible' }; }
    }
    if (!estObjet(v)) return { ok: false, error: 'un objet JSON est attendu' };
    for (const k of Object.keys(v)) if (!CLES.includes(k)) return { ok: false, error: `champ inconnu « ${k.slice(0, 40)} »` };
    const c = toutEteint();
    for (const f of FONCTIONS) {
      const x = v[f];
      if (x === undefined) continue;
      if (!estObjet(x)) return { ok: false, error: `« ${f} » : un objet { bureau, salarie } est attendu` };
      for (const k of Object.keys(x)) {
        if (f === 'ecritures' && k === 'modes_actuel') continue;
        if (!(COTES as readonly string[]).includes(k)) return { ok: false, error: `« ${f} » : champ inconnu « ${k.slice(0, 40)} »` };
      }
      for (const cote of COTES) {
        const val = x[cote];
        if (val === undefined) continue;
        if (typeof val !== 'string' || !(VALEURS as readonly string[]).includes(val)) return { ok: false, error: `« ${f}.${cote} » : off, pilote, pct ou on attendu` };
        c[f][cote] = val as ValeurInterrupteur;
      }
      if (f === 'ecritures' && x.modes_actuel !== undefined) {
        const m = x.modes_actuel;
        if (m === '*') c.modes_actuel = '*';
        else if (Array.isArray(m) && m.every(estIdentifiant)) c.modes_actuel = m.map((i) => String(i).trim());
        else return { ok: false, error: '« ecritures.modes_actuel » : "*" ou une liste d\'identifiants d\'outils attendu' };
      }
    }
    if (v.pilote !== undefined) {
      if (!Array.isArray(v.pilote) || !v.pilote.every(estIdentifiant)) return { ok: false, error: '« pilote » : une liste d\'identifiants d\'entreprise attendue' };
      c.pilote = v.pilote.map((i) => String(i).trim().toLowerCase());
    }
    if (v.pct !== undefined) {
      if (typeof v.pct !== 'number' || !Number.isInteger(v.pct) || v.pct < 0 || v.pct > 100) return { ok: false, error: '« pct » : un entier de 0 à 100 attendu' };
      c.pct = v.pct;
    }
    if (v.outils_coupes !== undefined) {
      if (!Array.isArray(v.outils_coupes) || !v.outils_coupes.every((i) => typeof i === 'string' && /^[a-z_]{3,40}$/.test(i))) return { ok: false, error: '« outils_coupes » : une liste de noms d\'outils attendue' };
      c.outils_coupes = v.outils_coupes.map(String);
    }
    return { ok: true, config: c };
  } catch {
    return { ok: false, error: 'secret illisible' };
  }
}

/** Le secret de l'environnement, ou tout-éteint s'il est absent, illisible, inconnu — et si l'environnement lui-même refuse la lecture. */
export function configDe(env: Etape3Env | null | undefined): Etape3Config {
  try {
    const lu = lireEtape3(env?.get(SECRET_ETAPE3));
    return lu.ok ? lu.config : toutEteint();
  } catch {
    return toutEteint();
  }
}

/**
 * FNV-1a 32 bits (offset 2166136261, nombre premier 16777619) sur les OCTETS UTF-8 du texte. Résultat entier non signé. Stable : c'est lui qui
 * décide quelle entreprise est dans `pct`, un changement d'algorithme déplacerait des clients d'un bras à l'autre.
 */
export function fnv1a(texte: string): number {
  let h = 0x811c9dc5;
  const octets = new TextEncoder().encode(texte);
  for (let i = 0; i < octets.length; i++) {
    h ^= octets[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Le « seau » 0-99 d'une entreprise : FNV-1a de son identifiant modulo 100 (jamais de l'identifiant d'une demande). */
export const seau = (companyId: string): number => fnv1a(companyId) % 100;

/**
 * L'interrupteur `fonction` est-il allumé pour ce côté et cette entreprise ? Ne lève jamais. Faux pour tout ce qui n'est pas explicitement allumé :
 * secret absent ou mal écrit, fonction ou côté inconnu, entreprise inconnue (`pilote`, `pct` ont besoin de son identifiant).
 */
export function etat(env: Etape3Env | null | undefined, fonction: FonctionEtape3, cote: Cote, companyId: string | null | undefined): boolean {
  try {
    if (!(FONCTIONS as readonly string[]).includes(fonction) || !(COTES as readonly string[]).includes(cote)) return false;
    const c = configDe(env);
    const v = c[fonction][cote];
    if (v === 'on') return true;
    const id = typeof companyId === 'string' ? companyId.trim().toLowerCase() : '';
    if (!id) return false;
    if (v === 'pilote') return c.pilote.includes(id);
    if (v === 'pct') return seau(id) < c.pct;
    return false;
  } catch {
    return false;
  }
}

/** L'outil est-il coupé en urgence (`outils_coupes`) ? Plus fort que tout interrupteur. Ne lève jamais. */
export function outilCoupe(env: Etape3Env | null | undefined, outil: string): boolean {
  try { return configDe(env).outils_coupes.includes(outil); } catch { return false; }
}

/**
 * Les outils d'écriture qui gardent leur mode actuel (carte) : `"*"` tant que la livraison 3d-1 (provenance, assainissement, teinte) n'est pas
 * en ligne, QUOI QUE dise le secret. Inutilisé par 3b-1 ; testé pour que la garde existe avant d'être nécessaire.
 */
export function modesActuel(env: Etape3Env | null | undefined, courante: Livraison = LIVRAISON_COURANTE): '*' | readonly string[] {
  try {
    if (!livraisonAtteinte('3d1', courante)) return '*';
    return configDe(env).modes_actuel;
  } catch {
    return '*';
  }
}

/** Les outils coupés en urgence (`outils_coupes`) : une liste de noms, vide sans secret ou avec un secret illisible. Ne lève jamais. */
export function outilsCoupes(env: Etape3Env | null | undefined): readonly string[] {
  try { return configDe(env).outils_coupes; } catch { return []; }
}

/**
 * Les capacités que l'écran annonce dans le corps de la requête (`caps: ['ouvrir1', …]`, précédent `multi: true`). Un ancien onglet (PWA en cache) n'en
 * envoie pas : le serveur n'émet alors aucun lien `ouvrir:` et ne propose pas `ouvrir_fenetre`. Au plus 8 mots de 2 à 12 caractères ; le reste est ignoré.
 */
export function lireCaps(brut: unknown): string[] {
  if (!Array.isArray(brut)) return [];
  const out: string[] = [];
  for (const c of brut.slice(0, 8)) if (typeof c === 'string' && /^[a-z0-9]{2,12}$/.test(c) && !out.includes(c)) out.push(c);
  return out;
}

/**
 * `ouvrir` est-il actif pour CETTE requête ? Quatre conditions, toutes nécessaires (§1.3, §3.2) : l'interrupteur est allumé pour ce côté et cette entreprise ; l'écran
 * annonce `ouvrir1` (sinon un ancien onglet recevrait un lien qu'il ne sait pas ouvrir) ; aucun fichier n'est joint (un PDF piégé ne doit rien pouvoir ouvrir) ;
 * `ouvrir_fenetre` n'est pas coupé en urgence. Ne lève jamais. UN seul endroit : les deux fonctions Edge et le banc d'essai l'appellent.
 */
export function ouvrirActif(env: Etape3Env | null | undefined, cote: Cote, companyId: string | null | undefined, caps: unknown, fichierJoint: boolean): boolean {
  try {
    return !fichierJoint && lireCaps(caps).includes('ouvrir1') && etat(env, 'ouvrir', cote, companyId) && !outilCoupe(env, 'ouvrir_fenetre');
  } catch {
    return false;
  }
}

/**
 * 3c : la BOUCLE (lectures à la demande) est-elle active pour CETTE requête ? Interrupteur `boucle` allumé pour ce côté et cette entreprise ; l'écran annonce `boucle1`
 * (= il sait afficher une carte à confirmer quand l'assistant a lu des données : un ancien onglet exécuterait une action « directe » sans clic) ; aucun fichier joint.
 * Ne lève jamais.
 */
export function boucleActive(env: Etape3Env | null | undefined, cote: Cote, companyId: string | null | undefined, caps: unknown, fichierJoint: boolean): boolean {
  try {
    return !fichierJoint && lireCaps(caps).includes('boucle1') && etat(env, 'boucle', cote, companyId);
  } catch {
    return false;
  }
}
