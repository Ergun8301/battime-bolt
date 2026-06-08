import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sdperbcquvneohotjono.supabase.co';
const supabaseAnonKey = 'sb_publishable_UeU7qzDdQRwEd1qzvrH3Yw_T1Qn8YEO';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
