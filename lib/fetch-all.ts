// Lecture paginée d'une table Supabase.
//
// POURQUOI : l'API Supabase (PostgREST) plafonne le nombre de lignes renvoyées
// par requête (1000 par défaut). Au-delà, la requête RÉUSSIT et renvoie
// silencieusement un jeu tronqué — aucune erreur. Sur un export de paie, ça
// produit un document incomplet sans le moindre signal. Un client de 30 salariés
// avec 2 chantiers/jour dépasse 1300 lignes sur un mois.
//
// Robustesse : on avance de `rows.length` (et non du pas demandé) et on s'arrête
// sur une page vide. Ainsi la pagination reste correcte quelle que soit la valeur
// réelle du plafond côté serveur, même si elle est inférieure au pas demandé.

const PAGE_SIZE = 500;
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
    out.push(...rows);
    if (rows.length === 0 || out.length >= HARD_CAP) break;
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
