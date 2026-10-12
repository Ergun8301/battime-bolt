// Edge Function : assistant — l'Assistant BEMEXO du bureau (lots 3 et 3 bis).
//
// DÉPLOIEMENT : `supabase functions deploy assistant` (JWT vérifié), APRÈS la
// migration 20261012090000_lot6_couche_ia_v2.sql.
// Secrets : AI_CONFIG (formule, modèles, plafonds) et AI_API_KEY (repli :
// GEMINI_API_KEY), voir _shared/ai-provider.ts ; ASSISTANT_DAILY_LIMIT
// (facultatif, 50 par défaut : demandes par entreprise et par jour).
// AI_MODEL, AI_ACTION_MODEL et AI_FALLBACK_MODEL ne sont plus lus.
//
// Lot 6 : PLUS DE CLÉ DE SERVICE. Qui appelle, son entreprise, ai_enabled, le
// quota et le plafond global viennent de public.assistant_context, appelée avec
// SON jeton ; tout le reste est lu avec ce même client. Un SEUL appel au modèle
// par demande (rapide, ou documents si un fichier est joint). Le corps
// { statut: true } rend seulement la formule (lue par le support BEMEXO, jamais
// affichée aux patrons ni aux salariés), sans rien compter ni appeler le modèle.
//
// Lot 7 : la réponse porte aussi `question` (UNE question s'il manque une info
// à une action directe) ; l'écran exécute les actions simples tout de suite.
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
import { aiKey, callFunction, formuleNom, PAUSE_MESSAGE, plafondProjet, readAttachment, tierFor } from '../_shared/ai-provider.ts';
import { loadAssistantContext } from '../_shared/assistant-context.ts';
import { DEFAULT_DAILY_LIMIT, MAX_QUESTION_CHARS, buildSnapshot, previousDay, type RawData } from '../_shared/assistant-core.ts';
import {
  actionPrompt, addDays, avertirSecours, buildActionContext, fromFunctionCall, functionsFor, handleActionLocally, mondayOf, questionFor,
  resolveSalarie, summarize, findGuide, guideAnswer, guideForPrompt, guideLinks, type EntryChoice, type LocalReply, type ActionContext,
} from '../_shared/assistant-actions-core.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
// Lot 6 : la formule active part avec chaque réponse (interne : l'écran du support seul la montre).
const FORMULE = formuleNom(Deno.env);
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify({ ...body, formule: FORMULE }), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';

const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Réponse envoyée à l'écran : le brouillon, son résumé, et les listes pour le modifier. */
function reply(r: LocalReply, ctx: ActionContext, remaining: number): Response {
  return json({
    answer: r.answer, links: r.links, remaining,
    action: r.action ? { ...r.action, summary: summarize(r.action.draft, ctx), question: questionFor(r.action.draft, r.action.problems, ctx) } : undefined,
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
    if (!jwt) return json({ error: 'Non authentifié' }, 401);
    const body = await req.json().catch(() => ({})) as { question?: string; file?: unknown; statut?: boolean };
    // Lot 6 : à l'ouverture du panneau, l'écran demande seulement la formule (rien n'est compté).
    if (body.statut === true) return json({ formule: FORMULE });
    const question = String(body.question ?? '').trim().slice(0, MAX_QUESTION_CHARS);
    if (!question) return json({ error: 'Posez une question.' }, 400);
    // 📎 Photo ou PDF : lu par le modèle, jamais journalisé ni stocké ici.
    const att = readAttachment(body.file);
    if (!att.ok) return json({ error: att.error }, 400);

    // Tout passe par LE JETON DU PATRON : ses droits, rien de plus.
    const db = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    // Qui je suis + quota AVANT tout travail (même compteur que le lot 3), en un aller-retour.
    const limit = Number(Deno.env.get('ASSISTANT_DAILY_LIMIT')) || DEFAULT_DAILY_LIMIT;
    const tier = tierFor(!!att.file);
    const me = await loadAssistantContext(db, 'bureau', { limit, tier, globalLimit: plafondProjet(Deno.env, tier) });
    if (!me.ok) {
      switch (me.raison) {
        case 'non_connecte': return json({ error: 'Non authentifié' }, 401);
        case 'non_autorise': return json({ error: 'Réservé au bureau' }, 403);
        case 'ia_coupee': return json({ error: 'Assistant non activé' }, 403);
        case 'quota': return json({ quota: true, answer: `Limite de ${me.limite ?? limit} demandes par jour atteinte pour votre entreprise. Revenez demain.`, links: [] });
        case 'pause': return json({ quota: true, pause: true, answer: PAUSE_MESSAGE, links: [] });
        default: return json({ error: 'Assistant indisponible.' }, 500);
      }
    }
    const user = { id: me.userId };
    const remaining = Math.max(0, me.remaining ?? 0);

    const today = parisToday();
    const hier = previousDay(today);
    const cid = me.companyId;
    const planFrom = addDays(mondayOf(today), -14), planTo = addDays(mondayOf(today), 13);
    const [workers, sites, all, month, entries, planY, planT, sessions, leaves, plan, recent, invits, reserves, closures, docs, expenses, certs] = await Promise.all([
      db.from('users').select('id, company_id, first_name, last_name, role, is_active').eq('company_id', cid),
      db.from('worksites').select('id, company_id, client_name, city, budget_hours, budget_amount').eq('company_id', cid).eq('is_active', true),
      db.rpc('my_worksite_labour', { p_from: null, p_to: null }),
      db.rpc('my_worksite_labour', { p_from: `${today.slice(0, 7)}-01`, p_to: today }),
      db.from('time_entries').select('user_id, company_id').eq('company_id', cid).eq('work_date', hier),
      db.from('planning').select('user_id, company_id, worksite_id, absence_type').eq('company_id', cid).eq('work_date', hier),
      db.from('planning').select('user_id, company_id, worksite_id, absence_type').eq('company_id', cid).eq('work_date', today),
      db.from('active_sessions').select('user_id, company_id, worksite_id, started_at').eq('company_id', cid).eq('work_date', today),
      db.from('leave_requests').select('id, user_id, company_id, type, start_date, end_date').eq('company_id', cid).eq('status', 'pending'),
      db.from('planning').select('id, user_id, company_id, work_date, worksite_id, absence_type, notes, estimated_start').eq('company_id', cid).gte('work_date', planFrom).lte('work_date', planTo),
      db.from('time_entries').select('user_id, company_id, work_date, worksite_id').eq('company_id', cid).neq('status', 'cancelled')
        .gte('work_date', addDays(today, -56)).lte('work_date', today).order('work_date', { ascending: false }).limit(2000),
      // Lot 7 : invitations en attente, réserves ouvertes, mois clôturés (lecture, jeton du patron).
      // Lot 11 : « ouverte » = levée ni par le bureau ni par le salarié (lib/reserves.ts).
      db.from('invitations').select('company_id, email, first_name, last_name, phone').eq('company_id', cid).is('accepted_at', null).gt('expires_at', new Date().toISOString()),
      db.from('time_entries').select('id, company_id, user_id, work_date, worksite_id, observation').eq('company_id', cid).eq('reception', 'avec')
        .is('reserve_resolved_at', null).is('reserve_fixed_at', null).neq('status', 'cancelled').order('work_date', { ascending: false }).limit(50),
      db.from('month_closures').select('company_id, month').eq('company_id', cid),
      // Lot 8 : ce qu'on peut retirer ou corriger (documents, dépenses, habilitations).
      db.from('documents').select('id, company_id, worksite_id, label, file_name, category, created_at').eq('company_id', cid).order('created_at', { ascending: false }).limit(150),
      db.from('worksite_expenses').select('id, company_id, worksite_id, label, amount, category, spent_on').eq('company_id', cid).order('spent_on', { ascending: false }).limit(150),
      db.from('certifications').select('id, company_id, user_id, type, label, expiry_date').eq('company_id', cid).limit(300),
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
      entries: (recent.data ?? []) as Parameters<typeof buildActionContext>[0]['entries'],
      sessions: raw.activeSessions,
      invitations: (invits.data ?? []) as Parameters<typeof buildActionContext>[0]['invitations'],
      reserves: (reserves.data ?? []) as Parameters<typeof buildActionContext>[0]['reserves'],
      closures: (closures.data ?? []) as Parameters<typeof buildActionContext>[0]['closures'],
      documents: (docs.data ?? []) as Parameters<typeof buildActionContext>[0]['documents'],
      expenses: (expenses.data ?? []) as Parameters<typeof buildActionContext>[0]['expenses'],
      certifications: (certs.data ?? []) as Parameters<typeof buildActionContext>[0]['certifications'],
    });
    ctx.me = user.id;
    ctx.demande = question;

    // 1. Les demandes courantes se règlent sans IA (sauf s'il y a un fichier à lire).
    const local = att.file ? null : handleActionLocally(question, ctx);
    if (local) return reply(local, ctx, remaining);

    // 2. Sans clé : on guide quand même.
    if (!aiKey(Deno.env)) {
      if (att.file) return json({ unavailable: true, answer: 'Lecture de fichier indisponible pour le moment.', links: [] });
      const g = findGuide(question);
      return reply(g ? { answer: guideAnswer(g), links: guideLinks(g) }
        : { answer: 'L’assistant est indisponible pour le moment.', links: [] }, ctx, remaining);
    }

    // 3. L'IA choisit UNE fonction de la liste blanche.
    const snapshot = buildSnapshot(raw);
    // Lot 6 : seulement les outils du domaine de la demande ; UN appel (rapide, ou documents si fichier).
    const r = await callFunction({
      prompt: actionPrompt(ctx, JSON.stringify(snapshot), guideForPrompt(), question), functions: functionsFor(!!att.file, question), file: att.file, tier,
    }, Deno.env);
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
    const out = fromFunctionCall(r.call.name, r.call.args, ctx, choices);
    // Un bulletin lu par le modèle de secours (plus léger) : à vérifier avant de confirmer.
    return reply(avertirSecours(out, !!r.secours), ctx, remaining);
  } catch {
    console.error('[assistant] erreur interne');
    return json({ error: 'Erreur serveur' }, 500);
  }
});
