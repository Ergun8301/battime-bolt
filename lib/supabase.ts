import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sdperbcquvneohotjono.supabase.co';
const supabaseAnonKey = 'sb_publishable_UeU7qzDdQRwEd1qzvrH3Yw_T1Qn8YEO';

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
