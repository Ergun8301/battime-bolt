// Edge Function : payslip-read — lit les QUATRE chiffres utiles d'un bulletin.
//
// DÉPLOIEMENT : `supabase functions deploy payslip-read` (JWT vérifié : il faut
// être connecté), APRÈS la migration 20261012090000_lot6_couche_ia_v2.sql.
// Secrets : AI_CONFIG (formule, modèles — Gemini ou Claude —, plafonds), AI_API_KEY (clé Gemini ; repli :
// GEMINI_API_KEY) et ANTHROPIC_API_KEY (clé Claude), voir _shared/ai-provider.ts ; PAYSLIP_DAILY_LIMIT
// (facultatif, 100 par défaut : lectures par entreprise et par jour).
// AI_MODEL n’est plus lu : la lecture d'un bulletin utilise le modèle « documents ».
//
// Lot 6 : PLUS DE CLÉ DE SERVICE. Qui appelle, son entreprise, ai_enabled, le
// quota de lectures et le plafond global viennent de public.assistant_context
// (côté « bulletin »), appelée avec SON jeton. Le corps { statut: true } rend
// seulement la formule (lue par le support BEMEXO, jamais affichée aux patrons
// ni aux salariés), sans rien compter ni appeler le modèle.
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
import { aiDisponible, extractJson, formuleNom, PAUSE_MESSAGE, plafondProjet } from '../_shared/ai-provider.ts';
import { loadAssistantContext } from '../_shared/assistant-context.ts';
import { PAYSLIP_PROMPT, PAYSLIP_SCHEMA, payslipReply } from '../_shared/payslip-core.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
// Lot 6 : la formule active part avec chaque réponse (interne : l'écran du support seul la montre).
const FORMULE = formuleNom(Deno.env);
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify({ ...body, formule: FORMULE }), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

const MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_BYTES = 10 * 1024 * 1024;
const UNAVAILABLE = 'Lecture automatique indisponible, saisissez les chiffres.';
const DEFAULT_DAILY_LIMIT = 100;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Non authentifié' }, 401);
    const body = await req.json().catch(() => ({})) as { file_base64?: string; mime?: string; statut?: boolean };
    // Lot 6 : à l'ouverture de l'écran, la formule seulement (rien n'est compté, aucun modèle appelé).
    if (body.statut === true) return json({ formule: FORMULE });
    const mime = String(body.mime ?? '').toLowerCase();
    const b64 = String(body.file_base64 ?? '');
    if (!MIMES.has(mime)) return json({ error: 'Déposez un PDF ou une photo (JPEG, PNG).' }, 400);
    if (!b64 || b64.length * 0.75 > MAX_BYTES) return json({ error: 'Fichier trop lourd (10 Mo maximum).' }, 413);

    if (!aiDisponible(Deno.env, 'documents')) return json({ available: false, message: UNAVAILABLE });

    // Qui appelle, avec SON jeton (bureau actif, ai_enabled), quota de lectures et plafond global.
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const limit = Number(Deno.env.get('PAYSLIP_DAILY_LIMIT')) || DEFAULT_DAILY_LIMIT;
    const me = await loadAssistantContext(db, 'bulletin', { limit, tier: 'documents', globalLimit: plafondProjet(Deno.env, 'documents') });
    if (!me.ok) {
      switch (me.raison) {
        case 'non_connecte': return json({ error: 'Non authentifié' }, 401);
        case 'non_autorise': return json({ error: 'Réservé au bureau' }, 403);
        case 'ia_coupee': return json({ error: 'Fonction non activée' }, 403);
        case 'quota': return json({ available: false, message: `Limite de ${me.limite ?? limit} lectures de bulletin par jour atteinte. Saisissez les chiffres.` });
        case 'pause': return json({ available: false, message: `${PAUSE_MESSAGE} Saisissez les chiffres.` });
        default: return json({ error: 'Erreur serveur' }, 500);
      }
    }

    // Lot 6 : modèle « documents » (lecture d'un bulletin), UN appel, secours après erreur.
    const r = await extractJson({ prompt: PAYSLIP_PROMPT, schema: PAYSLIP_SCHEMA, file: { mime, base64: b64 }, tier: 'documents' }, Deno.env);
    if (!r.ok) {
      return json({
        available: false,
        message: r.reason === 'not_configured' ? UNAVAILABLE : 'Lecture impossible pour ce document. Saisissez les chiffres.',
      });
    }
    // Lu par le modèle de secours (plus léger) : les quatre chiffres sont « à vérifier » à l'écran.
    return json(payslipReply(r));
  } catch {
    // Volontairement sans détail : l'erreur pourrait contenir un extrait du document.
    console.error('[payslip-read] erreur interne');
    return json({ error: 'Erreur serveur' }, 500);
  }
});
