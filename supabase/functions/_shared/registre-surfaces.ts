// Scanner de l'interface (livraison 3a-1) : lit le TEXTE de app/, components/, lib/ et hooks/ et rend les
// « clés de surface » que le test de couverture (T1) exige de rattacher à une capacité du registre.
// Contrat : docs/ia-etape3/00-conception-etape3.md §2.3, tableau « Clés de surface ».
//
// PUR : prend { chemin: texte } et rend une liste, sans lire le disque (le test et `registre-surfaces-cli.ts`
// s'en chargent). Ni Deno ni React : un test unitaire l'alimente de sources de poche. Il ne dépend que du type
// `ClicsSnapshot` du registre (effacé à l'exécution).
//
// POURQUOI un petit lexeur et pas seulement des expressions régulières : un `.rpc('x')` dans un commentaire, dans
// une chaîne ou dans un modèle de texte n'est pas un appel (c'est le piège du premier jour : un commentaire
// qui cite un RPC, et T1 réclame une capacité pour rien). `masquer` rend deux copies du fichier de MÊME longueur
// (donc mêmes positions, mêmes lignes) :
//   · `code` : les commentaires effacés, les chaînes intactes (pour LIRE un nom de RPC) ;
//   · `nu`   : les commentaires effacés ET le contenu des chaînes effacé (pour CHERCHER une forme : `.rpc(` n'y
//              apparaît que s'il s'agit d'un vrai appel).
// Limite dite : le lexeur ne comprend pas le JSX ; l'apostrophe d'un texte (`l'écran`) est traitée comme le début
// d'une chaîne qui s'arrête à la fin de la ligne, au pire elle cache du code sur la MÊME ligne. Le test sur le
// dépôt réel compare le résultat à un décompte indépendant pour que cela se voie.
import type { ClicsSnapshot } from './registre/types.ts';

// ── Résultat ────────────────────────────────────────────────────────────────

/**
 * `ancre-dynamique` : un `data-guide` / `guide=` dont la valeur est une expression (pas un texte littéral) ;
 * le scanner ne peut pas dire quelle ancre elle donnera (clé `ancre-dynamique:<fichier>:<ligne>`).
 */
export type TypeCle = 'fenetre' | 'dialogue' | 'rpc' | 'fn' | 'table' | 'ecriture' | 'ancre' | 'ancre-dynamique' | 'route';
/** L'ordre d'affichage (celui du tableau du §2.3). */
export const TYPES_CLE: readonly TypeCle[] = ['fenetre', 'dialogue', 'rpc', 'fn', 'table', 'ecriture', 'ancre', 'ancre-dynamique', 'route'];

export interface Occurrence {
  /** `rpc:set_user_role`, `table:worksites:update`, `fenetre:team-stats`… (voir §2.3). */
  cle: string;
  type: TypeCle;
  /** Chemin du fichier, avec son extension, séparateurs `/`, sans `./`. */
  fichier: string;
  /** Ligne (à partir de 1) de l'endroit qui porte la clé. */
  ligne: number;
  /** Pour une `fenetre` seulement : le chargeur qui la déclare (le §0.2 compte 22 `lazyWindow` et 7 `dynamic`). */
  via?: 'lazyWindow' | 'dynamic';
}

export interface ResultatScan {
  /** Toutes les occurrences (une clé peut en avoir plusieurs), triées par type, clé, fichier, ligne. */
  occurrences: Occurrence[];
  /**
   * Pour T10 : fichier → nombre de gestionnaires `onClick` / `onSelect` / `onSubmit` posés en JSX
   * (seuls les fichiers qui en ont au moins un).
   */
  clics: ClicsSnapshot;
  /**
   * Les `open={…}` de Dialog / AlertDialog / Sheet / Popover / DropdownMenu laissés de côté parce qu'ils sont dans un module
   * fenêtre (la fenêtre est déjà la clé `fenetre:`). Rendus pour que l'exclusion se voie : « 55 open= » du §0.2 =
   * `dialogue` + ceux-ci (hors components/ui/).
   */
  dialoguesDeFenetre: Occurrence[];
}

// ── Masquage des commentaires et des chaînes ────────────────────────────────

interface Chaine { fin: number; valeur: string; interpolee: boolean }
interface Commentaire { debut: number; fin: number; texte: string }
export interface Masque {
  code: string;
  nu: string;
  /** Décalage du guillemet ouvrant → chaîne (décalage du guillemet fermant, contenu brut, `${}` présent ou non). */
  chaines: Map<number, Chaine>;
  commentaires: Commentaire[];
}

// Après un de ces mots, un `/` ouvre une expression régulière ; après un nom ou un nombre, c'est une division.
const MOTS_AVANT_REGEX = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'delete', 'void', 'throw', 'new', 'yield', 'await', 'instanceof']);
// Après l'un de ces signes aussi. Ni `)` `]` `}` (division presque toujours), ni `<` (c'est `</div>` en JSX : le `/`
// d'une balise fermante ne doit jamais être pris pour une expression régulière qui avalerait le code de la ligne).
const SIGNES_AVANT_REGEX = '(,=:[!&|?{;+-*%^~';
const MOT = /[A-Za-z0-9_$]/;

/** Efface `texte[a..b[` sauf les fins de ligne (les numéros de ligne ne bougent pas). */
function effacer(tab: string[], a: number, b: number): void {
  for (let i = a; i < b; i++) if (tab[i] !== '\n' && tab[i] !== '\r') tab[i] = ' ';
}

export function masquer(texte: string): Masque {
  const n = texte.length;
  const code = texte.split('');
  const nu = texte.split('');
  const chaines = new Map<number, Chaine>();
  const commentaires: Commentaire[] = [];
  let i = 0;
  let dernier = '';        // dernier caractère significatif rencontré (hors espaces et commentaires)
  let dernierMot = '';     // …et le mot entier, si c'en était un
  let avantDernier = '';

  const note = (c: string, mot = '') => { avantDernier = dernier; dernier = c; dernierMot = mot; };
  const regexPermis = () => dernier === '' || SIGNES_AVANT_REGEX.includes(dernier) || (dernier === 'a' && MOTS_AVANT_REGEX.has(dernierMot))
    || (dernier === '>' && avantDernier === '=');

  /** Lit du code jusqu'à la fin du texte, ou (dans un `${…}`) jusqu'à l'accolade fermante qui n'est pas la sienne. */
  function lireCode(dansModele: boolean): void {
    let prof = 0;
    while (i < n) {
      const c = texte[i];
      if (c === ' ' || c === '\n' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '/' && texte[i + 1] === '/') {
        let j = texte.indexOf('\n', i); if (j < 0) j = n;
        commentaires.push({ debut: i, fin: j, texte: texte.slice(i, j) });
        effacer(code, i, j); effacer(nu, i, j); i = j; continue;
      }
      if (c === '/' && texte[i + 1] === '*') {
        const k = texte.indexOf('*/', i + 2); const j = k < 0 ? n : k + 2;
        commentaires.push({ debut: i, fin: j, texte: texte.slice(i, j) });
        effacer(code, i, j); effacer(nu, i, j); i = j; continue;
      }
      if (c === '/') {
        if (regexPermis()) {
          let k = i + 1; let classe = false; let trouve = false;
          while (k < n) {
            const ch = texte[k];
            if (ch === '\n') break;
            if (ch === '\\') { k += 2; continue; }
            if (ch === '[') classe = true; else if (ch === ']') classe = false;
            else if (ch === '/' && !classe) { trouve = true; break; }
            k++;
          }
          if (trouve) {
            effacer(nu, i + 1, k); k++;
            while (k < n && /[a-z]/.test(texte[k])) k++;
            i = k; note('a'); continue;
          }
        }
        note('/'); i++; continue;
      }
      if (c === '"' || c === "'") {
        let k = i + 1; let trouve = false;
        while (k < n) {
          const ch = texte[k];
          if (ch === '\\') { k += 2; continue; }
          if (ch === c) { trouve = true; break; }
          if (ch === '\n') break;          // une chaîne ne passe pas à la ligne : c'était une apostrophe de texte JSX
          k++;
        }
        if (trouve) {
          chaines.set(i, { fin: k, valeur: texte.slice(i + 1, k), interpolee: false });
          effacer(nu, i + 1, k); i = k + 1; note('a'); continue;
        }
        note(c); i++; continue;
      }
      if (c === '`') {
        const debut = i; let k = i + 1; let seg = k; let interpolee = false;
        for (;;) {
          if (k >= n) { effacer(nu, seg, n); i = n; break; }
          const ch = texte[k];
          if (ch === '\\') { k += 2; continue; }
          if (ch === '`') { effacer(nu, seg, k); i = k + 1; break; }
          if (ch === '$' && texte[k + 1] === '{') {
            interpolee = true; effacer(nu, seg, k); i = k + 2;
            const avant = [dernier, dernierMot, avantDernier]; dernier = '{'; dernierMot = '';
            lireCode(true);                // le code d'un `${…}` reste visible : c'est du vrai code
            [dernier, dernierMot, avantDernier] = avant;
            k = i + 1; seg = k; continue;  // i est sur l'accolade fermante
          }
          k++;
        }
        chaines.set(debut, { fin: Math.min(i, n) - 1, valeur: texte.slice(debut + 1, Math.min(i, n) - 1), interpolee });
        note('a'); continue;
      }
      if (c === '{') { prof++; note(c); i++; continue; }
      if (c === '}') {
        if (dansModele && prof === 0) return;
        prof--; note(c); i++; continue;
      }
      if (MOT.test(c)) {
        let k = i + 1; while (k < n && MOT.test(texte[k])) k++;
        note('a', texte.slice(i, k)); i = k; continue;
      }
      note(c); i++;
    }
  }
  lireCode(false);
  return { code: code.join(''), nu: nu.join(''), chaines, commentaires };
}

// ── Petits outils de lecture sur `nu` ───────────────────────────────────────

/** Décalage de la parenthèse / crochet / accolade qui ferme celle de `nu[i]` ; -1 si elle ne ferme jamais. */
function fermante(nu: string, i: number): number {
  const ouvre = nu[i]; const ferme = ouvre === '(' ? ')' : ouvre === '[' ? ']' : '}';
  let prof = 0;
  for (let k = i; k < nu.length; k++) {
    if (nu[k] === ouvre) prof++; else if (nu[k] === ferme && --prof === 0) return k;
  }
  return -1;
}

/** Fin du premier argument qui commence en `debut` : la première virgule ou parenthèse fermante de profondeur 0. */
function finArgument(nu: string, debut: number): number {
  let prof = 0;
  for (let i = debut; i < nu.length; i++) {
    const c = nu[i];
    if (c === '(' || c === '[' || c === '{') prof++;
    else if (c === ')' || c === ']' || c === '}') { if (prof === 0) return i; prof--; }
    else if (c === ',' && prof === 0) return i;
  }
  return nu.length;
}

function rogner(nu: string, a: number, b: number): [number, number] {
  while (a < b && /\s/.test(nu[a])) a++;
  while (b > a && /\s/.test(nu[b - 1])) b--;
  return [a, b];
}

/** Le texte de `[a, b[` s'il est UNE chaîne littérale sans `${}` ; sinon null (le nom est calculé). */
function litteralSeul(m: Masque, a: number, b: number): string | null {
  [a, b] = rogner(m.nu, a, b);
  const ch = m.chaines.get(a);
  return ch && ch.fin === b - 1 && !ch.interpolee ? ch.valeur : null;
}

/** Index de ligne (à partir de 1) d'un décalage. */
function indexLignes(texte: string): (decalage: number) => number {
  const debuts = [0];
  for (let i = 0; i < texte.length; i++) if (texte[i] === '\n') debuts.push(i + 1);
  return (decalage) => {
    let lo = 0; let hi = debuts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (debuts[mid] <= decalage) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
}

/**
 * Déclaration « // registre:tables=a,b » (ou `rpc=`, `fn=`) juste avant l'appel : la façon de déclarer les noms
 * d'un appel dynamique (`.from(variable)`) que le scanner ne peut pas lire. « Juste avant » = le dernier
 * commentaire (ou le dernier d'une suite de commentaires collés) avant l'appel, sans `;` ni ligne vide
 * entre lui et l'appel, à six lignes au plus.
 */
function declaration(m: Masque, decalage: number, genre: 'tables' | 'rpc' | 'fn'): string[] | null {
  const { commentaires, nu } = m;
  let lo = 0; let hi = commentaires.length - 1; let idx = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (commentaires[mid].fin <= decalage) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
  if (idx < 0) return null;
  const entre = nu.slice(commentaires[idx].fin, decalage);
  if (entre.includes(';') || /\n\s*\n/.test(entre) || (entre.match(/\n/g) ?? []).length > 6) return null;
  const re = new RegExp(`registre:${genre}=([A-Za-z0-9_,.\\- ]+)`);
  for (let k = idx; k >= 0; k--) {
    if (k < idx && nu.slice(commentaires[k].fin, commentaires[k + 1].debut).trim() !== '') break;
    const t = re.exec(commentaires[k].texte);
    if (t) return t[1].split(',').map((x) => x.trim()).filter(Boolean);
  }
  return null;
}

// ── Valeurs possibles d'une expression d'attribut (data-guide={…}) ──────────

/** Positions de `[a, b[` où `signe` est écrit à profondeur 0. */
function aProfondeurZero(nu: string, a: number, b: number, signe: RegExp): number[] {
  const rendu: number[] = []; let prof = 0;
  for (let i = a; i < b; i++) {
    const c = nu[i];
    if (c === '(' || c === '[' || c === '{') prof++;
    else if (c === ')' || c === ']' || c === '}') prof--;
    else if (prof === 0 && signe.test(nu.slice(i, i + 2))) rendu.push(i);
  }
  return rendu;
}

/**
 * Les « feuilles » d'une expression : les morceaux qui peuvent devenir la valeur. `c ? 'a.b' : undefined` →
 * `'a.b'` et `undefined` (la condition ne donne pas de valeur) ; `c && 'a.b'` → `'a.b'`. Chaque feuille est
 * rendue comme intervalle [a, b[ de `nu`.
 */
function feuilles(nu: string, a: number, b: number): [number, number][] {
  [a, b] = rogner(nu, a, b);
  while (nu[a] === '(' && fermante(nu, a) === b - 1) [a, b] = rogner(nu, a + 1, b - 1);
  // 1. ternaire : `?` de profondeur 0 (ni `?.` ni `??`), puis son `:`
  const qs = aProfondeurZero(nu, a, b, /^\?(?![.?])/).filter((p) => nu[p - 1] !== '?');
  if (qs.length) {
    const q = qs[0]; let imbriques = 0; let deuxPoints = -1;
    for (const p of aProfondeurZero(nu, q + 1, b, /^[?:]/)) {
      if (nu[p] === '?' && nu[p + 1] !== '.' && nu[p + 1] !== '?' && nu[p - 1] !== '?') imbriques++;
      else if (nu[p] === ':') { if (imbriques === 0) { deuxPoints = p; break; } imbriques--; }
    }
    if (deuxPoints > 0) return [...feuilles(nu, q + 1, deuxPoints), ...feuilles(nu, deuxPoints + 1, b)];
  }
  // 2. `||` et `??` : chaque côté peut être la valeur
  const ou = aProfondeurZero(nu, a, b, /^(\|\||\?\?)/);
  if (ou.length) {
    const rendu: [number, number][] = []; let debut = a;
    for (const p of ou) { rendu.push(...feuilles(nu, debut, p)); debut = p + 2; }
    return [...rendu, ...feuilles(nu, debut, b)];
  }
  // 3. `x && y` : la valeur est le dernier opérande (le reste est la condition)
  const et = aProfondeurZero(nu, a, b, /^&&/);
  if (et.length) return feuilles(nu, et[et.length - 1] + 2, b);
  return [[a, b]];
}

/** Position du mot `open` posé directement sur la balise `[debut, fin[` (profondeur d'accolades 0) ; -1 s'il n'y en a pas. */
function attributOpen(nu: string, debut: number, fin: number): number {
  let prof = 0;
  for (let k = debut; k < fin; k++) {
    if (nu[k] === '{') prof++; else if (nu[k] === '}') prof--;
    else if (prof === 0 && nu.startsWith('open', k) && /\s/.test(nu[k - 1]) && /[\s=/>]/.test(nu[k + 4] ?? '>')) return k;
  }
  return -1;
}

// ── ecriture: : quels exports d'un module de lib/ écrivent ─────────────────

interface Declaration { noms: string[]; exportee: boolean; debut: number; fin: number }

/**
 * Les déclarations de premier niveau d'un module : chacune commence à une ligne dont le premier caractère est une
 * lettre (`export`, `function`, `const`, `type`…) et va jusqu'à la suivante ; ce qui est indenté, `}` ou `)` à la
 * colonne 0 appartient à la précédente.
 */
function declarations(nu: string): Declaration[] {
  const debuts = Array.from(nu.matchAll(/^[A-Za-z@]/gm)).map((m) => m.index!);
  return debuts.map((debut, k) => {
    const t = RE_TETE_DECLARATION.exec(nu.slice(debut, debut + 200));
    const exportee = nu.startsWith('export', debut);
    const nom = t ? (t[2] || t[3] || t[4]) : undefined;
    return { noms: nom ? [nom] : exportee && t ? ['default'] : [], exportee, debut, fin: k + 1 < debuts.length ? debuts[k + 1] : nu.length };
  });
}

/**
 * Les exports dont le corps écrit (`.from(…).insert|update|delete|upsert(` ou `.rpc(`, `evenements` = leurs positions),
 * directement ou par un assistant non exporté du même fichier qu'ils appellent. Le §2.3 dit « tranche entre deux
 * export » : une fonction d'aide posée entre deux exports (ou avant le premier) serait alors comptée pour le mauvais
 * export, ou pour aucun (une constante exportée « écrirait », une vraie écriture passerait inaperçue). Ici, un export
 * écrit s'il écrit LUI-MÊME ou s'il nomme (transitivement) une déclaration du fichier qui écrit.
 */
function exportsQuiEcrivent(nu: string, evenements: number[]): { nom: string; decalage: number }[] {
  const decls = declarations(nu);
  const parNom = new Map<string, Declaration>();
  for (const d of decls) for (const nom of d.noms) parNom.set(nom, d);
  const mots = new Map<Declaration, Set<string>>();
  const motsDe = (d: Declaration) => {
    let m = mots.get(d);
    if (!m) { m = new Set(Array.from(nu.slice(d.debut, d.fin).matchAll(/[A-Za-z_$][\w$]*/g)).map((x) => x[0])); mots.set(d, m); }
    return m;
  };
  const ecrit = (d: Declaration, vus: Set<Declaration>): boolean => {
    if (evenements.some((e) => e >= d.debut && e < d.fin)) return true;
    if (vus.has(d)) return false;
    vus.add(d);
    for (const mot of motsDe(d)) {
      const autre = parNom.get(mot);
      if (autre && autre !== d && ecrit(autre, vus)) return true;
    }
    return false;
  };
  const rendu: { nom: string; decalage: number }[] = [];
  for (const d of decls) {
    if (!d.exportee || !d.noms.length || !ecrit(d, new Set())) continue;
    for (const nom of d.noms) rendu.push({ nom, decalage: d.debut });
  }
  return rendu;
}

// ── Les règles ──────────────────────────────────────────────────────────────

const RE_RPC = /\.\s*rpc\s*(?:<[^()]*>)?\s*\(/g;
const RE_FN = /\bfunctions\s*\.\s*invoke\s*(?:<[^()]*>)?\s*\(/g;
const RE_FROM = /\.\s*from\s*(?:<[^()]*>)?\s*\(/g;
const RE_OPERATION = /\s*\.\s*(insert|update|delete|upsert)\s*(?:<[^()]*>)?\s*\(/y;
// `Array.from(…)`, `Buffer.from(…)`, `supabase.storage.from('bucket')` ne sont pas des tables.
const RE_PAS_UNE_TABLE = /(?:\bArray|\bBuffer|\b(?:Uint|Int|Float)\d+Array|\bstorage)\s*$/;
const RE_FENETRE = /\b(lazyWindow|dynamic)\s*(?:<[^()]*>)?\s*\(\s*/g;
const RE_CHARGEUR_NOMME = /\b(?:const|let|var)\s+([\w$]+)\s*(?::[^=;]+)?=\s*(?:async\s*)?\(\s*\)\s*=>\s*import\s*\(\s*(?=['"`])/g;
const RE_BALISE_DIALOGUE = /<(Dialog|AlertDialog|Sheet|Popover|DropdownMenu)(?=[\s>/])/g;
const RE_ATTRIBUT_ANCRE = /(?<=\s)(data-guide|guide)=/g;
const RE_CLIC = /\bon(?:Click|Select|Submit)\s*=\s*\{/g;
const RE_TETE_DECLARATION = /^(export\s+)?(?:default\s+)?(?:declare\s+)?(?:(?:async\s+)?function\s*\*?\s*([\w$]+)?|(?:const|let|var)\s+([\w$]+)|(?:abstract\s+)?class\s+([\w$]+)?)/;

/** Un fichier de test ne fait pas partie de l'interface : jamais scanné. */
export function estFichierDeTest(chemin: string): boolean {
  return /\.(test|spec)\.[tj]sx?$/.test(chemin) || /(^|\/)__tests__\//.test(chemin) || /\.d\.ts$/.test(chemin);
}

function normaliser(chemin: string): string {
  return chemin.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
}
const sansExtension = (chemin: string) => chemin.replace(/\.[tj]sx?$/, '');

/** `app/a/(groupe)/[id]/page.tsx` → `/a/[id]` ; `app/page.tsx` → `/`. Null si ce n'est pas une page. */
export function routeDe(chemin: string): string | null {
  const m = /^app\/(?:(.*)\/)?page\.[tj]sx?$/.exec(chemin);
  if (!m) return null;
  const segments = (m[1] ?? '').split('/').filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'));
  return `/${segments.join('/')}`;
}

/** `@/components/team-stats` → `team-stats` ; un autre chemin reste tel quel (jamais d'oubli silencieux). */
function moduleDe(chemin: string): string {
  return chemin.replace(/^@\/components\//, '').replace(/\.[tj]sx?$/, '');
}

interface Fichier { chemin: string; m: Masque; ligne: (decalage: number) => number }

/**
 * Le cœur : toutes les clés de surface et le compteur de gestionnaires. `sources` = { chemin: texte } ; les fichiers de
 * test et les fichiers qui ne sont pas du TypeScript sont ignorés.
 */
export function scannerSurfaces(sources: Record<string, string>): ResultatScan {
  const occurrences: Occurrence[] = [];
  const clics: ClicsSnapshot = {};
  const fichiers: Fichier[] = [];
  for (const [brut, texte] of Object.entries(sources)) {
    const chemin = normaliser(brut);
    if (!/\.[tj]sx?$/.test(chemin) || estFichierDeTest(chemin)) continue;
    fichiers.push({ chemin, m: masquer(texte), ligne: indexLignes(texte) });
  }
  const dialoguesDeFenetre: Occurrence[] = [];
  const ajoute = (type: TypeCle, cle: string, f: Fichier, decalage: number, via?: Occurrence['via']) =>
    occurrences.push({ cle, type, fichier: f.chemin, ligne: f.ligne(decalage), ...(via ? { via } : {}) });

  // Passe 1 : les fenêtres (leurs modules sortent des « dialogues », qui sont des sous-écrans d'un autre écran).
  const modulesFenetre = new Set<string>();
  for (const f of fichiers) {
    const { nu } = f.m;
    const chargeurs = new Map<string, string>();   // `const loadX = () => import('@/components/x')`
    for (const c of nu.matchAll(RE_CHARGEUR_NOMME)) {
      const p = c.index! + c[0].length;
      const ch = f.m.chaines.get(p);
      if (ch && !ch.interpolee) chargeurs.set(c[1], ch.valeur);
    }
    for (const w of nu.matchAll(RE_FENETRE)) {
      let p = w.index! + w[0].length;
      let chemin: string | null = null;
      const direct = /^(?:async\s*)?\(\s*\)\s*=>\s*import\s*\(\s*/.exec(nu.slice(p, p + 80));
      if (direct) {
        p += direct[0].length;
        const ch = f.m.chaines.get(p);
        if (ch && !ch.interpolee) chemin = ch.valeur;
      } else {
        const nom = /^([A-Za-z_$][\w$]*)\s*[,)]/.exec(nu.slice(p, p + 80));
        if (nom && chargeurs.has(nom[1])) chemin = chargeurs.get(nom[1])!;
      }
      if (chemin === null) {
        // Un chargeur qu'on ne sait pas lire (`lazyWindow(unChargeurImporte)`, un bloc `{ return import(…) }`) : jamais
        // un oubli silencieux. Sont exclus la DÉFINITION (`function lazyWindow(`) et un `.dynamic(` d'un autre objet.
        const avant = nu.slice(Math.max(0, w.index! - 24), w.index!);
        if (!/\bfunction\s*\*?\s*$/.test(avant) && !/\.\s*$/.test(avant)) ajoute('fenetre', 'fenetre:?', f, w.index!, w[1] as 'lazyWindow' | 'dynamic');
        continue;
      }
      const module = moduleDe(chemin);
      modulesFenetre.add(module);
      ajoute('fenetre', `fenetre:${module}`, f, w.index!, w[1] as 'lazyWindow' | 'dynamic');
    }
  }

  for (const f of fichiers) {
    const { nu, code } = f.m;
    const evenementsEcriture: number[] = [];   // où ce fichier écrit (pour `ecriture:`)

    // rpc:<nom>
    for (const r of nu.matchAll(RE_RPC)) {
      const p = r.index! + r[0].length;
      const nom = litteralSeul(f.m, p, finArgument(nu, p));
      evenementsEcriture.push(r.index!);
      if (nom !== null) { ajoute('rpc', `rpc:${nom}`, f, r.index!); continue; }
      for (const n of declaration(f.m, r.index!, 'rpc') ?? ['?']) ajoute('rpc', `rpc:${n}`, f, r.index!);
    }

    // fn:<nom>
    for (const r of nu.matchAll(RE_FN)) {
      const p = r.index! + r[0].length;
      const nom = litteralSeul(f.m, p, finArgument(nu, p));
      if (nom !== null) { ajoute('fn', `fn:${nom}`, f, r.index!); continue; }
      for (const n of declaration(f.m, r.index!, 'fn') ?? ['?']) ajoute('fn', `fn:${n}`, f, r.index!);
    }

    // table:<t>:<op>
    for (const r of nu.matchAll(RE_FROM)) {
      if (RE_PAS_UNE_TABLE.test(nu.slice(Math.max(0, r.index! - 24), r.index!))) continue;
      const ouvrante = r.index! + r[0].length - 1;
      const fermee = fermante(nu, ouvrante);
      if (fermee < 0) continue;
      RE_OPERATION.lastIndex = fermee + 1;
      const op = RE_OPERATION.exec(nu);
      if (!op) continue;                            // `.from('t').select(…)` : une lecture
      evenementsEcriture.push(r.index!);
      const nom = litteralSeul(f.m, ouvrante + 1, fermee);
      if (nom !== null) { ajoute('table', `table:${nom}:${op[1]}`, f, r.index!); continue; }
      for (const t of declaration(f.m, r.index!, 'tables') ?? ['?']) ajoute('table', `table:${t}:${op[1]}`, f, r.index!);
    }

    // dialogue:<fichier>#<expr> (hors components/ui/ ; ceux d'un module fenêtre sont rendus à part)
    const module = f.chemin.startsWith('components/') ? sansExtension(f.chemin).slice('components/'.length) : null;
    if (!f.chemin.startsWith('components/ui/')) {
      const dansFenetre = module !== null && modulesFenetre.has(module);
      for (const d of nu.matchAll(RE_BALISE_DIALOGUE)) {
        const debut = d.index! + d[0].length;
        let prof = 0; let fin = -1;
        for (let k = debut; k < nu.length; k++) {
          if (nu[k] === '{') prof++; else if (nu[k] === '}') prof--;
          else if (nu[k] === '>' && prof === 0) { fin = k; break; }
        }
        if (fin < 0) continue;
        // `open` doit être un attribut de la balise elle-même, pas celui d'un composant posé dans une expression
        const pos = attributOpen(nu, debut, fin);
        let expr: string | null = null;
        if (pos >= 0) {
          const apres = pos + 4;
          if (nu[apres] === '=' && nu[apres + 1] === '{') expr = code.slice(apres + 2, fermante(nu, apres + 1)).replace(/\s+/g, ' ').trim();
          else if (nu[apres] !== '=') expr = 'true';         // `<Dialog open …>` : toujours ouverte
        }
        if (expr === null) continue;
        const cle = `dialogue:${sansExtension(f.chemin)}#${expr}`;
        if (dansFenetre) dialoguesDeFenetre.push({ cle, type: 'dialogue', fichier: f.chemin, ligne: f.ligne(d.index!) });
        else ajoute('dialogue', cle, f, d.index!);
      }
    }

    // ancre:<valeur> · ancre-dynamique:<fichier>:<ligne>
    for (const a of nu.matchAll(RE_ATTRIBUT_ANCRE)) {
      const p = a.index! + a[0].length;
      if (nu[p] === '"' || nu[p] === "'") {
        const ch = f.m.chaines.get(p);
        if (ch && ch.valeur) ajoute('ancre', `ancre:${ch.valeur}`, f, a.index!);
      } else if (nu[p] === '{') {
        const fin = fermante(nu, p);
        if (fin < 0) continue;
        let dynamique = false;
        for (const [x, y] of feuilles(nu, p + 1, fin)) {
          const ch = f.m.chaines.get(x);
          const texte = nu.slice(x, y);
          if (ch && ch.fin === y - 1 && !ch.interpolee) { if (ch.valeur) ajoute('ancre', `ancre:${ch.valeur}`, f, a.index!); }
          else if (!/^(undefined|null|false|true|)$/.test(texte)) dynamique = true;
        }
        if (dynamique) ajoute('ancre-dynamique', `ancre-dynamique:${f.chemin}:${f.ligne(a.index!)}`, f, a.index!);
      }
    }

    // route:<chemin>
    const route = routeDe(f.chemin);
    if (route !== null) ajoute('route', `route:${route}`, f, 0);

    // compteur de gestionnaires (T10)
    const nbClics = Array.from(nu.matchAll(RE_CLIC)).length;
    if (nbClics > 0) clics[f.chemin] = nbClics;

    // ecriture:<fichier>#<fn> : chaque export d'un module de lib/ dont le corps écrit ou appelle .rpc(
    if (f.chemin.startsWith('lib/') && evenementsEcriture.length) {
      for (const e of exportsQuiEcrivent(nu, evenementsEcriture)) ajoute('ecriture', `ecriture:${sansExtension(f.chemin)}#${e.nom}`, f, e.decalage);
    }
  }

  const ordre = (t: TypeCle) => TYPES_CLE.indexOf(t);
  occurrences.sort((a, b) => ordre(a.type) - ordre(b.type) || a.cle.localeCompare(b.cle) || a.fichier.localeCompare(b.fichier) || a.ligne - b.ligne);
  return { occurrences, clics, dialoguesDeFenetre };
}

// ── Lecture du résultat ─────────────────────────────────────────────────────

/** Les occurrences regroupées par clé (ordre du tri). */
export function grouperParCle(occurrences: readonly Occurrence[]): Map<string, Occurrence[]> {
  const rendu = new Map<string, Occurrence[]>();
  for (const o of occurrences) { const l = rendu.get(o.cle); if (l) l.push(o); else rendu.set(o.cle, [o]); }
  return rendu;
}

/** Combien de clés distinctes et d'occurrences par type. */
export function comptes(occurrences: readonly Occurrence[]): Record<TypeCle, { cles: number; occurrences: number }> {
  const rendu = {} as Record<TypeCle, { cles: number; occurrences: number }>;
  for (const t of TYPES_CLE) {
    const du = occurrences.filter((o) => o.type === t);
    rendu[t] = { cles: new Set(du.map((o) => o.cle)).size, occurrences: du.length };
  }
  return rendu;
}
