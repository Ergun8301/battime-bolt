import { createClient } from '@supabase/supabase-js';

// Prod : valeurs lues depuis les variables d'environnement si présentes,
// sinon repli sur les valeurs actuelles (aucune régression tant que les
// variables ne sont pas définies). Pour séparer prod/staging plus tard,
// il suffira de définir NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY côté hébergeur.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdperbcquvneohotjono.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_UeU7qzDdQRwEd1qzvrH3Yw_T1Qn8YEO';

// Lot 3 — d'où vient une écriture, pour les traces (« Interventions supprimées
// ou décalées », supabase/migrations/20261011120000_lot3_traces_suppressions.sql).
// Pendant une action de l'assistant (withOrigin('assistant', …)), chaque appel
// à l'API de données (/rest/v1/) porte l'en-tête `x-bemexo-origine`, lu par la
// base. Hors de là : aucun en-tête, requêtes identiques à avant. Jamais sur
// l'authentification, le stockage ni les fonctions.
export type WriteOrigin = 'assistant';
let currentOrigin: WriteOrigin | null = null;
export async function withOrigin<T>(origin: WriteOrigin, run: () => Promise<T>): Promise<T> {
  const prev = currentOrigin;
  currentOrigin = origin;
  try { return await run(); } finally { currentOrigin = prev; }
}
const originFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!currentOrigin || !url.includes('/rest/v1/')) return fetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set('x-bemexo-origine', currentOrigin);
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: originFetch },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // B2 fix: keep this FALSE. When true, the GoTrue client auto-consumes the
    // URL hash (access_token / type=invite|recovery) on load, racing — and
    // usually winning against — our manual handler in /connexion. The invited
    // worker then never reaches the "create password" screen. We parse the hash
    // ourselves so the invitation/recovery flow is deterministic.
    detectSessionInUrl: false,
  },
});
