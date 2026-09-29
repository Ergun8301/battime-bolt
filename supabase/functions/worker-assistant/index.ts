// Edge Function : worker-assistant — l'Assistant BEMEXO du SALARIÉ (lot 4).
//
// DÉPLOIEMENT : `supabase functions deploy worker-assistant` (JWT vérifié).
// Secrets : GEMINI_API_KEY, AI_MODEL (facultatif), WORKER_ASSISTANT_DAILY_LIMIT
// (facultatif, 20 par défaut : demandes par salarié et par jour).
//
// CE QU'ELLE FAIT : transformer une phrase en BROUILLON de pointage, préparer
// une demande de congé, un début/fin de pointage ou une réserve (lot 3 bis),
// guider dans l'appli, ou répondre sur SES heures / SON planning. Elle n'écrit JAMAIS
// un pointage : c'est l'écran qui enregistre, après confirmation, par le même
// chemin que la saisie manuelle.
// CE QU'ELLE NE FAIT PAS : lire les données d'un collègue (jeton du salarié +
// filtre sur son id), parler de coût, stocker ou journaliser le contenu.
//
// Lot 7 : tous les boutons de « Ma journée » ; « Où sont mes collègues ? » par
// la fonction limitée `colleagues_planning` (prénom, chantier, horaires ; rien
// d'autre ; réglage de l'entreprise) ; `question` s'il manque une info ; modèle
// fort (AI_ACTION_MODEL) pour les actions.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { callFunction, readAttachment } from '../_shared/ai-provider.ts';
import {
  buildWorkerSnapshot, DEFAULT_WORKER_DAILY_LIMIT, formatColleagues, fromWorkerCall, handleWorkerLocally, looksLikeAction, mondayOf,
  WORKER_FUNCTIONS, workerFunctionPrompt, workerQuestionFor, type ColleagueRow, type WorkerFullReply, type WorkerLive, type WorkerRaw,
} from '../_shared/worker-assistant-core.ts';

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
const plusDays = (iso: string, d: number) => { const x = new Date(`${iso}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
    if (!user) return json({ error: 'Non authentifié' }, 401);
    const { data: me } = await admin.from('users').select('company_id, role, is_active').eq('id', user.id).maybeSingle();
    if (!me || me.is_active === false || !me.company_id || !['worker', 'lead'].includes(me.role)) return json({ error: 'Réservé aux salariés' }, 403);
    const { data: co } = await admin.from('companies').select('ai_enabled').eq('id', me.company_id).maybeSingle();
    if (!(co as { ai_enabled?: boolean } | null)?.ai_enabled) return json({ error: 'Assistant non activé' }, 403);

    const body = await req.json().catch(() => ({})) as { text?: string; file?: unknown };
    const text = String(body.text ?? '').trim().slice(0, 500);
    if (!text) return json({ error: 'Écrivez ou dictez vos heures.' }, 400);
    // 📎 Photo ou PDF : lu par le modèle, jamais journalisé ni stocké ici.
    const att = readAttachment(body.file);
    if (!att.ok) return json({ error: att.error }, 400);

    const limit = Number(Deno.env.get('WORKER_ASSISTANT_DAILY_LIMIT')) || DEFAULT_WORKER_DAILY_LIMIT;
    const { data: used, error: qErr } = await admin.rpc('worker_assistant_consume', { p_user: user.id, p_limit: limit });
    if (qErr) return json({ error: 'Assistant indisponible.' }, 500);
    if (used == null) return json({ kind: 'answer', notice: true, answer: `Limite de ${limit} demandes par jour atteinte. Utilisez la saisie habituelle.` });

    // Lecture AVEC LE JETON DU SALARIÉ, filtrée sur SON id.
    const db = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const today = parisToday();
    const [sites, entries, plan, sess, todayRows, yRows] = await Promise.all([
      db.from('worksites').select('id, company_id, client_name, city').eq('company_id', me.company_id).eq('is_active', true).order('client_name'),
      db.from('time_entries').select('user_id, work_date, start_time, end_time, break_minutes, status').eq('user_id', user.id).gte('work_date', mondayOf(today)).lte('work_date', today),
      db.from('planning').select('user_id, work_date, estimated_start, estimated_end, absence_type, worksite_id').eq('user_id', user.id).gte('work_date', plusDays(today, -2)).lte('work_date', plusDays(today, 1)),
      db.from('active_sessions').select('worksite_id, started_at').eq('user_id', user.id).maybeSingle(),
      db.from('time_entries').select('id, start_time, end_time, status, worksite_id, meal_allowance, reception, reserve_fixed_at').eq('user_id', user.id).eq('work_date', today).neq('status', 'cancelled').order('start_time'),
      db.from('time_entries').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('work_date', plusDays(today, -1)).neq('status', 'cancelled'),
    ]);
    const snapshot = buildWorkerSnapshot({
      userId: user.id, companyId: me.company_id, today,
      worksites: (sites.data ?? []) as WorkerRaw['worksites'],
      entries: (entries.data ?? []) as WorkerRaw['entries'],
      planning: (plan.data ?? []) as WorkerRaw['planning'],
    });
    const remaining = Math.max(0, limit - Number(used));
    // Lot 3 bis : ce qu'il faut pour préparer un pointage ou une réserve (SES lignes).
    const siteName = (id: string | null) => snapshot.chantiers.find((c) => c.id === id)?.nom ?? 'Chantier';
    const s0 = sess.data as { worksite_id: string; started_at: string } | null;
    const live: WorkerLive = {
      enCours: s0 ? { chantier_id: s0.worksite_id, chantier: siteName(s0.worksite_id), depuis: s0.started_at } : null,
      lignes: ((todayRows.data ?? []) as { id: string; start_time: string; end_time: string; status: string; worksite_id: string | null; meal_allowance: boolean | null; reception: string | null; reserve_fixed_at: string | null }[])
        .map((e) => ({
          id: e.id, chantier: siteName(e.worksite_id), chantier_id: e.worksite_id, debut: e.start_time.slice(0, 5), fin: e.end_time.slice(0, 5), envoyee: e.status === 'submitted',
          panier: !!e.meal_allowance, reserve: e.reception === 'avec', corrigee: !!e.reserve_fixed_at,
        })),
      hier: yRows.count ?? 0,
    };
    // Réponse : l'action (et la question s'il manque une info), ou le planning des collègues.
    const send = async (r: WorkerFullReply) => {
      if (r.kind === 'collegues') {
        const { data, error } = await db.rpc('colleagues_planning', { p_from: r.date, p_to: r.date });
        const answer = error ? 'Le planning des collègues n’est pas disponible.'
          : !data || !(data as unknown[]).length ? 'Le bureau n’a pas partagé le planning des collègues, ou personne n’est prévu ce jour-là.'
          : formatColleagues(data as ColleagueRow[], r.qui, r.date, today);
        return json({ kind: 'answer', answer, chantiers: snapshot.chantiers, remaining });
      }
      const question = r.kind === 'action' ? workerQuestionFor(r.action.draft, r.action.problems, snapshot) : null;
      return json({ ...r, ...(question ? { question } : {}), chantiers: snapshot.chantiers, remaining });
    };

    const local = att.file ? null : handleWorkerLocally(text, snapshot, live);
    if (local) return send(local);

    if (!Deno.env.get('GEMINI_API_KEY')) {
      if (att.file) return json({ kind: 'answer', notice: true, answer: 'Lecture de fichier indisponible pour le moment.', remaining });
      return json({ kind: 'answer', notice: true, answer: 'Je n’ai pas compris. Essayez : « 7h30-12h Villa Dupont, 13h-16h30 Bureau Martin ».', remaining });
    }
    const r = await callFunction({
      prompt: workerFunctionPrompt(snapshot, live, text), functions: WORKER_FUNCTIONS, file: att.file,
      kind: looksLikeAction(text, !!att.file) ? 'action' : 'question',
    }, Deno.env);
    if (!r.ok) return json({ kind: 'answer', notice: true, answer: 'L’assistant n’a pas pu répondre. Utilisez la saisie habituelle.', remaining });
    return send(fromWorkerCall(r.call.name, r.call.args, snapshot, live));
  } catch {
    console.error('[worker-assistant] erreur interne');
    return json({ error: 'Erreur serveur' }, 500);
  }
});
