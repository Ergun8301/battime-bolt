import { createClient } from '@supabase/supabase-js';

// Prod : valeurs lues depuis les variables d'environnement si présentes,
// sinon repli sur les valeurs actuelles (aucune régression tant que les
// variables ne sont pas définies). Pour séparer prod/staging plus tard,
// il suffira de définir NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY côté hébergeur.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdperbcquvneohotjono.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_UeU7qzDdQRwEd1qzvrH3Yw_T1Qn8YEO';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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

// Indicateur d'environnement (lecture seule — aucun effet sur la connexion).
// Vrai uniquement quand l'app est reliee a la base de PRODUCTION. Sert au
// bandeau STAGING (composant purement visuel) pour ne jamais confondre les
// environnements : si un jour une preview oublie ses variables et retombe sur
// la prod, IS_PROD_DB reste vrai (pas de faux positif) ; des qu'une base
// differente est configuree, le bandeau apparait.
export const IS_PROD_DB = supabaseUrl === 'https://sdperbcquvneohotjono.supabase.co';
