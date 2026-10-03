// Edge Function : payslip-read — lit les QUATRE chiffres utiles d'un bulletin.
//
// DÉPLOIEMENT : `supabase functions deploy payslip-read` (JWT vérifié : il faut
// être connecté). Secrets : GEMINI_API_KEY, AI_MODEL (facultatif).
//
// CE QUE LA FONCTION NE FAIT PAS, ET C'EST TOUT L'INTÉRÊT :
//   - elle n'ENREGISTRE rien : ni le fichier, ni les chiffres. Le bulletin est
//     lu en mémoire, envoyé au modèle, puis oublié. Les chiffres reviennent à
//     l'écran de validation ; seul l'admin, en cliquant « Valider », les écrit
//     (table `payslip_figures`, protégée par la RLS) ;
//   - elle ne JOURNALISE aucun contenu de bulletin ;
//   - elle ne demande au modèle que mois, brut, total employeur, heures payées.
//
// Réservée à un ADMIN actif d'une entreprise dont `ai_enabled` est vrai.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractJson } from '../_shared/ai-provider.ts';
import { PAYSLIP_PROMPT, PAYSLIP_SCHEMA, sanitizeExtraction } from '../_shared/payslip-core.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

const MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_BYTES = 10 * 1024 * 1024;
const UNAVAILABLE = 'Lecture automatique indisponible, saisissez les chiffres.';

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
    if (!user) return json({ error: 'Non authentifié' }, 401);
    const { data: me } = await admin.from('users').select('company_id, role, is_active').eq('id', user.id).maybeSingle();
    if (!me || me.role !== 'admin' || me.is_active === false || !me.company_id) return json({ error: 'Réservé au bureau' }, 403);
    const { data: co } = await admin.from('companies').select('ai_enabled').eq('id', me.company_id).maybeSingle();
    if (!(co as { ai_enabled?: boolean } | null)?.ai_enabled) return json({ error: 'Fonction non activée' }, 403);

    const body = await req.json().catch(() => ({})) as { file_base64?: string; mime?: string };
    const mime = String(body.mime ?? '').toLowerCase();
    const b64 = String(body.file_base64 ?? '');
    if (!MIMES.has(mime)) return json({ error: 'Déposez un PDF ou une photo (JPEG, PNG).' }, 400);
    if (!b64 || b64.length * 0.75 > MAX_BYTES) return json({ error: 'Fichier trop lourd (10 Mo maximum).' }, 413);

    const r = await extractJson({ prompt: PAYSLIP_PROMPT, schema: PAYSLIP_SCHEMA, file: { mime, base64: b64 } }, Deno.env);
    if (!r.ok) {
      return json({
        available: false,
        message: r.reason === 'not_configured' ? UNAVAILABLE : 'Lecture impossible pour ce document. Saisissez les chiffres.',
      });
    }
    const { figures, doubts } = sanitizeExtraction(r.data);
    return json({ available: true, figures, doubts });
  } catch {
    // Volontairement sans détail : l'erreur pourrait contenir un extrait du document.
    console.error('[payslip-read] erreur interne');
    return json({ error: 'Erreur serveur' }, 500);
  }
});
