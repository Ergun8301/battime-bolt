// Lot 10 — rafraîchissements silencieux.
//
// Les sondages (30 s, 60 s, retour sur l'onglet) relisent des données le plus
// souvent IDENTIQUES. Remplacer l'état par un nouvel objet, même égal, refait
// tous les calculs dérivés et peut faire « clignoter » l'écran. `keep()` rend
// l'ANCIEN objet quand le contenu n'a pas changé : React n'a alors rien à
// redessiner. Comparaison par contenu (JSON), Map et Set compris.
//
// Affichage seulement : aucune donnée n'est modifiée, on choisit juste quel
// objet (déjà égal) garder en mémoire.

const replacer = (_key: string, value: unknown): unknown => {
  if (value instanceof Map) return { __map: Array.from(value.entries()) };
  if (value instanceof Set) return { __set: Array.from(value.values()) };
  return value;
};

/** Vrai quand `a` et `b` ont exactement le même contenu (Map/Set compris). */
export function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') return false;
  try {
    return JSON.stringify(a, replacer) === JSON.stringify(b, replacer);
  } catch {
    return false;
  }
}

/** Garde `prev` (même objet) quand `next` a le même contenu ; sinon `next`. */
export function keep<T>(prev: T, next: T): T {
  return sameData(prev, next) ? prev : next;
}
