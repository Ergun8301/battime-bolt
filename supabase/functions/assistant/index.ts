// Edge Function : assistant — l'Assistant BEMEXO du bureau (lots 3 et 3 bis).
//
// DÉPLOIEMENT : `supabase functions deploy assistant` (JWT vérifié).
// Secrets : GEMINI_API_KEY, AI_MODEL (facultatif), ASSISTANT_DAILY_LIMIT
// (facultatif, 50 par défaut : demandes par entreprise et par jour).
//
// CE QU'ELLE FAIT : répondre (chiffres de l'entreprise), GUIDER (où cliquer,
// 3 étapes au plus) et PRÉPARER une action de la liste blanche (inviter,
// créer un client, poser une absence, affecter, proposer le planning,
// corriger un pointage).
//
// CE QU'ELLE NE FAIT PAS : écrire. Elle renvoie un BROUILLON contrôlé ; c'est
// l'écran qui l'exécute, après « Confirmer », avec les droits du patron et le
// même code que l'interface (lib/planning-writes.ts, lib/corrections.ts).
//
// GARANTIES : lectures avec le JETON DU PATRON (sa RLS) ; jamais de paie
// sensible dans les données envoyées au modèle ; rien n'est stocké hormis le
// compteur du quota ; aucune question ni réponse dans les logs.
// Réservé à un ADMIN actif d'une entreprise dont `ai_enabled` est vrai.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { callFunction } from '../_shared/ai-provider.ts';
import { DEFAULT_DAILY_LIMIT, MAX_QUESTION_CHARS, buildSnapshot, previousDay, type RawData } from '../_shared/assistant-core.ts';
import {
  ASSISTANT_FUNCTIONS, actionPrompt, addDays, buildActionContext, fromFunctionCall, handleActionLocally, mondayOf,
  resolveSalarie, summarize, findGuide, guideAnswer, guideForPrompt, NAV_ACTIONS, type EntryChoice, type LocalReply, type ActionContext,
} from '../_shared/assistant-actions-core.ts';


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

/** Réponse envoyée à l'écran : le brouillon, son résumé, et les listes pour le modifier. */
function reply(r: LocalReply, ctx: ActionContext, remaining: number) {
  return json({
    answer: r.answer, links: r.links, remaining,
    action: r.action ? { ...r.action, summary: summarize(r.action.draft, ctx) } : undefined,
    options: r.action ? {
      salaries: ctx.salaries.filter((s) => s.role !== 'admin' || r.action!.draft.type === 'poser_absence')
        .map((s) => ({ id: s.id, nom: `${s.prenom} ${s.nom}`.trim() })),
      chantiers: ctx.chantiers.map((c) => ({ id: c.id, nom: c.nom, ville: c.ville })),
    } : undefined,
  });
}

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

    // Quota AVANT tout travail (même quota que le lot 3).
    const limit = Number(Deno.env.get('ASSISTANT_DAILY_LIMIT')) || DEFAULT_DAILY_LIMIT;
    const { data: used, error: qErr } = await admin.rpc('assistant_consume', { p_company: me.company_id, p_limit: limit });
    if (qErr) return json({ error: 'Assistant indisponible.' }, 500);
    if (used == null) {
      return json({ quota: true, answer: `Limite de ${limit} demandes par jour atteinte pour votre entreprise. Revenez demain.`, links: [] });
    }
    const remaining = Math.max(0, limit - Number(used));

    // Lecture AVEC LE JETON DU PATRON : ses droits, rien de plus.
    const db = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const today = parisToday();
    const hier = previousDay(today);
    const cid = me.company_id as string;
    const planFrom = addDays(mondayOf(today), -14), planTo = addDays(mondayOf(today), 13);
    const [workers, sites, all, month, entries, planY, planT, sessions, leaves, plan] = await Promise.all([
      db.from('users').select('id, company_id, first_name, last_name, role, is_active').eq('company_id', cid),
      db.from('worksites').select('id, company_id, client_name, city, budget_hours, budget_amount').eq('company_id', cid).eq('is_active', true),
      db.rpc('my_worksite_labour', { p_from: null, p_to: null }),
      db.rpc('my_worksite_labour', { p_from: `${today.slice(0, 7)}-01`, p_to: today }),
      db.from('time_entries').select('user_id, company_id').eq('company_id', cid).eq('work_date', hier),
      db.from('planning').select('user_id, company_id, worksite_id, absence_type').eq('company_id', cid).eq('work_date', hier),
      db.from('planning').select('user_id, company_id, worksite_id, absence_type').eq('company_id', cid).eq('work_date', today),
      db.from('active_sessions').select('user_id, company_id, worksite_id, started_at').eq('company_id', cid),
      db.from('leave_requests').select('user_id, company_id, type, start_date, end_date').eq('company_id', cid).eq('status', 'pending'),
      db.from('planning').select('user_id, company_id, work_date, worksite_id, absence_type').eq('company_id', cid).gte('work_date', planFrom).lte('work_date', planTo),
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
    const ctx = buildActionContext({
      companyId: cid, today, users: raw.workers, worksites: raw.worksites,
      planning: (plan.data ?? []) as Parameters<typeof buildActionContext>[0]['planning'],
      leaves: raw.pendingLeaves,
    });

    // 1. Les demandes courantes se règlent sans IA.
    const local = handleActionLocally(question, ctx);
    if (local) return reply(local, ctx, remaining);

    // 2. Sans clé : on guide quand même.
    if (!Deno.env.get('GEMINI_API_KEY')) {
      const g = findGuide(question);
      return reply(g ? { answer: guideAnswer(g), links: g.lien ? [{ label: NAV_ACTIONS[g.lien], action: g.lien }] : [] }
        : { answer: 'L’assistant est indisponible pour le moment.', links: [] }, ctx, remaining);
    }

    // 3. L'IA choisit UNE fonction de la liste blanche.
    const snapshot = buildSnapshot(raw);
    const r = await callFunction({ prompt: actionPrompt(ctx, JSON.stringify(snapshot), guideForPrompt(), question), functions: ASSISTANT_FUNCTIONS }, Deno.env);
    if (!r.ok) return json({ unavailable: true, answer: 'L’assistant n’a pas pu répondre. Réessayez dans un instant.', links: [] });

    // Correction : on lit SES lignes envoyées ce jour-là (jeton du patron).
    let choices: EntryChoice[] = [];
    if (r.call.name === 'corriger_pointage') {
      const uid = resolveSalarie(String(r.call.args.salarie ?? ''), ctx);
      const day = String(r.call.args.date ?? '');
      if (uid && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
        const { data } = await db.from('time_entries').select('id, start_time, end_time, status, worksite:worksites(client_name)')
          .eq('company_id', cid).eq('user_id', uid).eq('work_date', day).not('status', 'in', '(draft,cancelled)').order('start_time');
        type Row = { id: string; start_time: string; end_time: string; worksite: { client_name: string | null } | { client_name: string | null }[] | null };
        choices = ((data ?? []) as unknown as Row[]).map((e) => {
          const ws = Array.isArray(e.worksite) ? e.worksite[0] : e.worksite;
          return { id: e.id, chantier: ws?.client_name || 'Chantier', debut: e.start_time.slice(0, 5), fin: e.end_time.slice(0, 5) };
        });
      }
    }
    return reply(fromFunctionCall(r.call.name, r.call.args, ctx, choices), ctx, remaining);
  } catch {
    console.error('[assistant] erreur interne');
    return json({ error: 'Erreur serveur' }, 500);
  }
});
