// Lecture paginée d'une table Supabase.
//
// POURQUOI : l'API Supabase (PostgREST) plafonne le nombre de lignes renvoyées
// par requête (1000 par défaut). Au-delà, la requête RÉUSSIT et renvoie
// silencieusement un jeu tronqué — aucune erreur. Sur un export de paie, ça
// produit un document incomplet sans le moindre signal. Un client de 30 salariés
// avec 2 chantiers/jour dépasse 1300 lignes sur un mois.
//
// Robustesse : on avance de `rows.length` (et non du pas demandé). On s'arrête
// dès qu'une page revient plus courte que le pas demandé (lot 29 : plus de page
// vide en plus, une requête de moins pour les petites tables). Un plafond serveur
// réglé SOUS le pas demandé ferait croire à une fin : le test de prudence plus bas
// redemande une page quand la taille reçue ressemble à un plafond.

export const MAX_ROWS_ASSUMED = 1000; // plafond par défaut de PostgREST ; PAGE_SIZE doit rester en dessous
export const PAGE_SIZE = 500;
const HARD_CAP = 100_000; // garde-fou : jamais de boucle infinie

type PagedResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * @param build reçoit les bornes (incluses) et renvoie la requête Supabase correspondante
 * @returns toutes les lignes, dans l'ordre renvoyé par le serveur
 */
export async function fetchAllPaged<T>(
  build: (from: number, to: number) => PromiseLike<PagedResult<T>>,
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await build(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data || [];
    // Garde-fou : plus de lignes que demandé = le `range` a été ignoré, la pagination n'est pas fiable.
    if (rows.length > PAGE_SIZE) throw new Error('fetchAllPaged : le serveur a renvoyé plus de lignes que demandé (range ignoré ?)');
    out.push(...rows);
    // Page courte = fin. EXCEPTION prudente : une page courte dont la taille est un multiple de 50
    // ressemble à un plafond serveur réglé plus bas que PAGE_SIZE (100, 200, 250…) : on en redemande
    // une (au pire une requête de plus, jamais d'export tronqué en silence).
    const lookCapped = rows.length > 0 && rows.length < PAGE_SIZE && rows.length % 50 === 0;
    if ((rows.length < PAGE_SIZE && !lookCapped) || out.length >= HARD_CAP) break;
    offset += rows.length;
  }
  return out;
}

/** Découpe un tableau en lots (filtres `.in(...)` : une liste trop longue fait exploser l'URL). */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
