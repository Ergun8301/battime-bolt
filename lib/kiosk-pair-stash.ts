// Lot 11 — mémoire du QR de la tablette, le temps de se connecter au bureau.
//
// Le QR d'une tablette ouvre /admin#borne=<identifiant de demande>. Le patron
// qui scanne avec l'appareil photo arrive le plus souvent DÉCONNECTÉ dans le
// navigateur de son téléphone : /admin le renvoie vers /connexion, qui ne
// connaît pas ce fragment. On le garde donc ici (sessionStorage : propre à
// l'onglet, il s'efface avec lui), et la fenêtre « Associer cette tablette ? »
// le reprend une fois connecté.
//
// SANS AUCUN IMPORT : le layout du bureau importe ce fichier, il ne doit pas
// embarquer les règles de la fonction `kiosk`. L'expression ci-dessous est donc
// une copie de PAIR_FRAGMENT_RE (supabase/functions/_shared/kiosk-pair.ts) ; un
// test (npm run test:appairage) vérifie qu'elles restent identiques.
//
// Le fragment est retiré de la barre d'adresse DÈS la lecture (historique,
// captures d'écran, référent). Tout accès au stockage est protégé : navigation
// privée = pas de mémoire, la fenêtre ne s'ouvre pas et le patron rescanne.

export const PAIR_STASH_KEY = 'bx_borne_req';
/** Même durée que la vie d'une demande côté serveur (10 min). */
export const PAIR_STASH_TTL_MS = 10 * 60 * 1000;
export const PAIR_STASH_RE = /^#borne=([A-Za-z0-9_-]{60})$/;

/** Si l'adresse porte `#borne=<identifiant>` : le garde, puis retire le fragment de la barre d'adresse. */
export function stashPairRequestFromHash(): void {
  try {
    const m = PAIR_STASH_RE.exec(window.location.hash);
    if (!m) return;
    window.sessionStorage.setItem(PAIR_STASH_KEY, JSON.stringify({ rid: m[1], at: Date.now() }));
    // `history` est typé à la main : le test Deno qui compare l'expression lit ce fichier sans les types du navigateur.
    const h = (window as unknown as { history: { state: unknown; replaceState(state: unknown, title: string, url: string): void } }).history;
    h.replaceState(h.state, '', window.location.pathname + window.location.search);
  } catch { /* stockage indisponible : pas de mémoire, le patron rescanne */ }
}

/** L'identifiant gardé s'il a moins de 10 min, sinon `null` (et la clé périmée est nettoyée). */
export function peekPairRequest(): string | null {
  try {
    const raw = window.sessionStorage.getItem(PAIR_STASH_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { rid?: unknown; at?: unknown };
    if (typeof s.rid === 'string' && typeof s.at === 'number' && /^[A-Za-z0-9_-]{60}$/.test(s.rid) && Date.now() - s.at < PAIR_STASH_TTL_MS) return s.rid;
    window.sessionStorage.removeItem(PAIR_STASH_KEY);
    return null;
  } catch { return null; }
}

export function clearPairRequest(): void {
  try { window.sessionStorage.removeItem(PAIR_STASH_KEY); } catch { /* rien à nettoyer */ }
}
