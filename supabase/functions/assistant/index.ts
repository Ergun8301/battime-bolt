// Edge Function : assistant — l'Assistant BEMEXO du bureau (lot 3).
//
// DÉPLOIEMENT : `supabase functions deploy assistant` (JWT vérifié).
// Secrets : GEMINI_API_KEY, AI_MODEL (facultatif), ASSISTANT_DAILY_LIMIT
// (facultatif, 50 par défaut : questions par entreprise et par jour).
//
// GARANTIES :
//   - LECTURE SEULE : les données sont lues avec le JETON DU PATRON (ses droits,
//     sa RLS), puis résumées en un instantané ; aucune écriture n'est possible.
//   - JAMAIS de données de paie brutes : l'instantané n'en contient pas.
//   - RIEN N'EST STOCKÉ hormis un compteur par jour (quota) ; aucune question,
//     réponse ou donnée n'est écrite dans les logs.
//   - Réservé à un ADMIN actif d'une entreprise dont `ai_enabled` est vrai.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractJson } from '../_shared/ai-provider.ts';
import {
  ASSISTANT_SCHEMA, DEFAULT_DAILY_LIMIT, MAX_QUESTION_CHARS, assistantPrompt, buildSnapshot, previousDay,
  sanitizeAnswer, type RawData,
} from '../_shared/assistant-core.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

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
    if (!(co as { ai_enabled?: boolean } | null)?.ai_enabled) return json({ error: 'Assistant non activé' }, 403);

    const body = await req.json().catch(() => ({})) as { question?: string };
    const question = String(body.question ?? '').trim().slice(0, MAX_QUESTION_CHARS);
    if (!question) return json({ error: 'Posez une question.' }, 400);
    if (!Deno.env.get('GEMINI_API_KEY')) return json({ unavailable: true, answer: 'L’assistant est indisponible pour le moment.', links: [] });

    // Quota AVANT l'appel au modèle.
    const limit = Number(Deno.env.get('ASSISTANT_DAILY_LIMIT')) || DEFAULT_DAILY_LIMIT;
    const { data: used, error: qErr } = await admin.rpc('assistant_consume', { p_company: me.company_id, p_limit: limit });
    if (qErr) return json({ error: 'Assistant indisponible.' }, 500);
    if (used == null) {
      return json({ quota: true, answer: `Limite de ${limit} questions par jour atteinte pour votre entreprise. Revenez demain.`, links: [] });
    }

    // Lecture AVEC LE JETON DU PATRON : ses droits, rien de plus.
    const db = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const today = parisToday();
    const hier = previousDay(today);
    const cid = me.company_id as string;
    const [workers, sites, all, month, entries, planY, planT, sessions, leaves] = await Promise.all([
      db.from('users').select('id, company_id, first_name, last_name, role, is_active').eq('company_id', cid),
      db.from('worksites').select('id, company_id, client_name, city, budget_hours, budget_amount').eq('company_id', cid).eq('is_active', true),
      db.rpc('my_worksite_labour', { p_from: null, p_to: null }),
      db.rpc('my_worksite_labour', { p_from: `${today.slice(0, 7)}-01`, p_to: today }),
      db.from('time_entries').select('user_id, company_id').eq('company_id', cid).eq('work_date', hier),
      db.from('planning').select('user_id, company_id, worksite_id, absence_type').eq('company_id', cid).eq('work_date', hier),
      db.from('planning').select('user_id, company_id, worksite_id, absence_type').eq('company_id', cid).eq('work_date', today),
      db.from('active_sessions').select('user_id, company_id, worksite_id, started_at').eq('company_id', cid),
      db.from('leave_requests').select('user_id, company_id, type, start_date, end_date').eq('company_id', cid).eq('status', 'pending'),
    ]);
    const raw: RawData = {
      companyId: cid, today,
      workers: (workers.data ?? []) as RawData['workers'],
      worksites: (sites.data ?? []) as RawData['worksites'],
      labourAll: (all.data ?? []) as RawData['labourAll'],
      labourMonth: (month.data ?? []) as RawData['labourMonth'],
      entriesYesterday: (entries.data ?? []) as RawData['entriesYesterday'],
      planningYesterday: (planY.data ?? []) as RawData['planningYesterday'],
      planningToday: (planT.data ?? []) as RawData['planningToday'],
      activeSessions: (sessions.data ?? []) as RawData['activeSessions'],
      pendingLeaves: (leaves.data ?? []) as RawData['pendingLeaves'],
    };
    const snapshot = buildSnapshot(raw);

    const r = await extractJson({ prompt: assistantPrompt(snapshot, question), schema: ASSISTANT_SCHEMA }, Deno.env);
    if (!r.ok) return json({ unavailable: true, answer: 'L’assistant n’a pas pu répondre. Réessayez dans un instant.', links: [] });
    return json({ ...sanitizeAnswer(r.data, snapshot), remaining: Math.max(0, limit - Number(used)) });
  } catch {
    console.error('[assistant] erreur interne');
    return json({ error: 'Erreur serveur' }, 500);
  }
});
