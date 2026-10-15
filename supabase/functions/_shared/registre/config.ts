// Registre : réglages communs (livraison en cours, échéance des dettes, plafond de dettes).
// TypeScript pur : aucun import de Deno ni de React. Contrat : conception étape 3 §2.3.
import type { Cote, DettesMax, FichierDettes, Livraison } from './types.ts';

/**
 * La livraison de l'étape 3 actuellement mise en ligne. Les tests s'en servent
 * pour savoir ce qui est DÛ : un outil de livraison ≤ celle-ci doit avoir son
 * cas d'évaluation (T7), une dette assignée à une livraison ≤ celle-ci est une
 * erreur (T9).
 *
 * Constante simple pour 3a-1, écrite à la main. Elle sera CALCULÉE plus tard
 * d'après les interrupteurs réellement présents dans `etape3-config.ts` (et
 * vérifiée par le job de déploiement) : à la main, on oublierait de la monter, ou
 * on la monterait avant que l'interrupteur existe, et les tests exigeraient ou
 * laisseraient passer ce qui ne devrait pas l'être.
 */
export const LIVRAISON_COURANTE: Livraison = '3a';

/**
 * Dernier jour autorisé pour une `dette.avant` (AAAA-MM-JJ, T3) : juin 2027 est
 * la fin réaliste de 3d (§6.2). Une dette qui irait plus loin n'est plus une dette
 * mais un renoncement, qui doit devenir une capacité `humain` avec sa raison.
 */
export const HORIZON_DETTES = '2027-06-30';

/** Les livraisons dans l'ordre où elles se mettent en ligne (celui du type `Livraison`). */
export const ORDRE_LIVRAISONS: readonly Livraison[] = ['3a', '3b', '3c', '3d1', '3d2', '3d3', '3d4', '3d5', '3d6'];

/**
 * `livraison` est-elle déjà en ligne (≤ la courante) ? Un seul comparateur pour
 * T3, T7 et T9 : chacun le réécrivant, l'un compterait '3d1' avant '3c'.
 */
export function livraisonAtteinte(livraison: Livraison, courante: Livraison = LIVRAISON_COURANTE): boolean {
  return ORDRE_LIVRAISONS.indexOf(livraison) <= ORDRE_LIVRAISONS.indexOf(courante);
}

// ── Plafond de dettes ───────────────────────────────────────────────────────

const COMPTEURS: (keyof DettesMax)[] = ['dette', 'ecart', 'interne', 'ecritures_non_assistees'];

/**
 * Lit le texte de `dettes.json`. Pur et strict : un fichier généré qui a un champ
 * en moins ou négatif doit faire ÉCHOUER le test, jamais se lire comme « 0 » (un
 * plafond à 0 silencieux bloquerait tout, un plafond manquant laisserait tout passer).
 */
export function lireDettes(texte: string): Readonly<DettesMax> {
  let brut: unknown;
  try { brut = JSON.parse(texte); } catch { throw new Error('dettes.json : JSON illisible'); }
  const max = (brut as Partial<FichierDettes> | null)?.max as Partial<Record<keyof DettesMax, unknown>> | undefined;
  if (!max || typeof max !== 'object') throw new Error('dettes.json : champ « max » absent');
  const lu = {} as DettesMax;
  for (const c of COMPTEURS) {
    const v = max[c];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new Error(`dettes.json : « max.${c} » doit être un entier ≥ 0`);
    lu[c] = v;
  }
  return Object.freeze(lu);
}

let plafond: Readonly<DettesMax> | null = null;

/**
 * Le plafond de `dettes.json` (fichier GÉNÉRÉ à partir du registre, comparé à
 * l'égalité par T9). Lu au premier appel et non à l'import : les fonctions Edge
 * importent `index.ts` sans jamais en avoir besoin, et ne doivent ni lire un
 * fichier ni exiger la permission de lecture pour cela. Sous Deno (les tests) ;
 * ailleurs, passer le texte à `lireDettes`.
 */
export function dettesMax(): Readonly<DettesMax> {
  if (plafond) return plafond;
  const deno = (globalThis as { Deno?: { readTextFileSync(chemin: URL): string } }).Deno;
  if (!deno) throw new Error('dettes.json se lit sous Deno ; ailleurs, utiliser lireDettes(texte)');
  plafond = lireDettes(deno.readTextFileSync(new URL('./dettes.json', import.meta.url)));
  return plafond;
}

// ── Ce que le registre ne peut pas déduire des outils (3a-2) ────────────────

/**
 * Types d'action qui existent encore dans le code d'un côté mais n'ont plus d'OUTIL (le modèle ne les appelle pas), et que les
 * listes générées doivent pourtant garder pour que le comportement soit celui d'avant. Seul cas : `annuler_pointage` du salarié,
 * désactivé au lot 12 (NO_CANCEL_ANSWER) ; son exécuteur et son type de retrait restent dans le code, sans outil.
 */
export const TYPES_SANS_OUTIL: Readonly<Record<Cote, { retrait: readonly string[] }>> = {
  bureau: { retrait: [] },
  salarie: { retrait: ['annuler_pointage'] },
};

/**
 * Les domaines de tool-domains.ts, dans l'ordre où ce fichier les déclare (celui de `Object.keys(OFFICE_DOMAINS)`). Le champ
 * `domaines` d'un outil en cite plusieurs dans cet ordre (T5 le vérifie) ; les listes `tools` générées s'écrivent dans le même ordre.
 * Les mots qui déclenchent un domaine (les expressions régulières) restent écrits à la main dans tool-domains.ts.
 */
export const DOMAINES_ORDRE: Readonly<Record<Cote, readonly string[]>> = {
  bureau: ['planning', 'heures', 'salaries', 'chantiers', 'documents', 'reglages'],
  salarie: ['heures', 'conges', 'chantier', 'collegues'],
};
