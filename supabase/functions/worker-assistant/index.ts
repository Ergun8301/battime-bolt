// Edge Function : worker-assistant — l'Assistant BEMEXO du SALARIÉ (lot 4).
//
// DÉPLOIEMENT : `supabase functions deploy worker-assistant` (JWT vérifié),
// APRÈS la migration 20261012090000_lot6_couche_ia_v2.sql.
// Secrets : AI_CONFIG (formule, modèles — Gemini ou Claude —, plafonds), AI_API_KEY (clé Gemini ; repli :
// GEMINI_API_KEY) et ANTHROPIC_API_KEY (clé Claude), voir _shared/ai-provider.ts ; WORKER_ASSISTANT_DAILY_LIMIT
// (facultatif, 20 par défaut : demandes par salarié et par jour).
// AI_MODEL, AI_ACTION_MODEL et AI_FALLBACK_MODEL ne sont plus lus.
//
// Lot 6 : PLUS DE CLÉ DE SERVICE. Qui appelle, son entreprise, ai_enabled, le
// quota et le plafond global viennent de public.assistant_context, appelée avec
// SON jeton. UN seul appel au modèle par demande. Le corps { statut: true }
// rend seulement la formule (lue par le support BEMEXO, jamais affichée aux
// patrons ni aux salariés), sans rien compter ni appeler le modèle.
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
// d'autre ; réglage de l'entreprise) ; `question` s'il manque une info.
//
// Phrases longues, plusieurs actions, turc (corps { multi: true }, 1500 caractères) : le tour
// partagé (_shared/worker-turn.ts) passe par l'IA en réflexion « medium », jamais par le
// lecteur local, et rend UNE fiche `multi` à confirmer en un clic (rien n'est écrit ici).
// Une demande = une unité de quota, quel que soit le nombre d'appels. Sans `multi: true`
// (ancien navigateur), le comportement est exactement celui d'avant.
//
// Étape 2 (chat avec mémoire) : le corps peut porter `history` (les derniers messages de la conversation, texte seul). Il est nettoyé
// (_shared/assistant-history.ts : 7 messages, 600 caractères chacun, 3000 en tout, tout le reste ignoré), posé sur le snapshot
// (`snapshot.historique`, comme `snapshot.demande`) et mis dans la consigne du modèle pour comprendre « et la pause c'était 30 minutes »,
// « et Kevin ? ». Une relance de ce genre saute le lecteur local (qui n'a pas le contexte) quand le modèle est disponible.
// Le texte de l'historique n'est JAMAIS journalisé ; une demande reste une demande : le quota ne change pas.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { aiDisponible, callFunction, formuleNom, PAUSE_MESSAGE, plafondProjet, readAttachment, tierFor } from '../_shared/ai-provider.ts';
import { loadAssistantContext } from '../_shared/assistant-context.ts';
import { nettoyerHistorique, sansDemandeRecollee } from '../_shared/assistant-history.ts';
import { WORKER_TEXT_MAX } from '../_shared/saisie-profil.ts';
import {
  buildWorkerSnapshot, DEFAULT_WORKER_DAILY_LIMIT, formatColleagues, mondayOf, workerQuestionFor,
  type ColleagueRow, type WorkerFullReply, type WorkerLive, type WorkerRaw,
} from '../_shared/worker-assistant-core.ts';
import type { LongLegacy } from '../_shared/worker-multi.ts';
import { runWorkerTurn, type WorkerMultiReply } from '../_shared/worker-turn.ts';
import { boucleActive, ouvrirActif, outilsCoupes } from '../_shared/etape3-config.ts';
import { boucleOutils } from '../_shared/ai-boucle.ts';
import { LECTURES_SALARIE } from '../_shared/lectures/salarie.ts';
import { brancherOuvrirSalarie } from '../_shared/ouvrir.ts';
import type { OptionsOutilsSalarie } from '../_shared/worker-outils.ts';

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
const plusDays = (iso: string, d: number) => { const x = new Date(`${iso}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Non authentifié' }, 401);
    const body = await req.json().catch(() => ({})) as { text?: string; file?: unknown; statut?: boolean; multi?: boolean; history?: unknown; caps?: unknown };
    // Lot 6 : à l'ouverture du panneau, l'écran demande seulement la formule (rien n'est compté).
    if (body.statut === true) return json({ formule: FORMULE });
    const text = String(body.text ?? '').trim().slice(0, WORKER_TEXT_MAX);
    if (!text) return json({ error: 'Écrivez ou dictez vos heures.' }, 400);
    // 📎 Photo ou PDF : lu par le modèle, jamais journalisé ni stocké ici.
    const att = readAttachment(body.file);
    if (!att.ok) return json({ error: att.error }, 400);

    // Tout passe par LE JETON DU SALARIÉ ; les lectures sont filtrées sur SON id.
    const db = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    // Qui je suis + quota AVANT tout travail (même compteur que le lot 4), en un aller-retour.
    const limit = Number(Deno.env.get('WORKER_ASSISTANT_DAILY_LIMIT')) || DEFAULT_WORKER_DAILY_LIMIT;
    const tier = tierFor(!!att.file);
    const ctxR = await loadAssistantContext(db, 'salarie', { limit, tier, globalLimit: plafondProjet(Deno.env, tier) });
    if (!ctxR.ok) {
      switch (ctxR.raison) {
        case 'non_connecte': return json({ error: 'Non authentifié' }, 401);
        case 'non_autorise': return json({ error: 'Réservé aux salariés' }, 403);
        case 'ia_coupee': return json({ error: 'Assistant non activé' }, 403);
        case 'quota': return json({ kind: 'answer', notice: true, answer: `Limite de ${ctxR.limite ?? limit} demandes par jour atteinte. Utilisez la saisie habituelle.` });
        case 'pause': return json({ kind: 'answer', notice: true, pause: true, answer: `${PAUSE_MESSAGE} Utilisez la saisie habituelle.` });
        default: return json({ error: 'Assistant indisponible.' }, 500);
      }
    }
    const user = { id: ctxR.userId };
    const me = { company_id: ctxR.companyId };
    const today = parisToday();
    const [sites, entries, plan, sess, todayRows, yRows, myLeaves, myDocs] = await Promise.all([
      db.from('worksites').select('id, company_id, client_name, city').eq('company_id', me.company_id).eq('is_active', true).order('client_name'),
      db.from('time_entries').select('user_id, work_date, start_time, end_time, break_minutes, status').eq('user_id', user.id).gte('work_date', mondayOf(today)).lte('work_date', today),
      db.from('planning').select('user_id, work_date, estimated_start, estimated_end, absence_type, worksite_id').eq('user_id', user.id).gte('work_date', plusDays(today, -2)).lte('work_date', plusDays(today, 1)),
      db.from('active_sessions').select('worksite_id, started_at').eq('user_id', user.id).maybeSingle(),
      db.from('time_entries').select('id, start_time, end_time, status, worksite_id, meal_allowance, reception, reserve_fixed_at, reserve_resolved_at').eq('user_id', user.id).eq('work_date', today).neq('status', 'cancelled').order('start_time'),
      db.from('time_entries').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('work_date', plusDays(today, -1)).neq('status', 'cancelled'),
      // Lot 8 : SES demandes en attente et SES documents récents (pour les retirer).
      db.from('leave_requests').select('id, type, start_date, end_date').eq('user_id', user.id).eq('status', 'pending').order('start_date'),
      db.from('documents').select('id, label, file_name, worksite_id, created_at').eq('uploaded_by', user.id).gte('created_at', `${plusDays(today, -14)}T00:00:00Z`).order('created_at', { ascending: false }).limit(20),
    ]);
    const snapshot = buildWorkerSnapshot({
      userId: user.id, companyId: me.company_id, today,
      worksites: (sites.data ?? []) as WorkerRaw['worksites'],
      entries: (entries.data ?? []) as WorkerRaw['entries'],
      planning: (plan.data ?? []) as WorkerRaw['planning'],
    });
    snapshot.demande = text;
    // Étape 2 : la conversation, seulement si le modèle peut la lire (sans clé, le lecteur local répond comme avant). Une demande que
    // l'écran vient de recoller à sa réponse (« J'ai travaillé de 8h à 12h, chez Martin ») n'est pas répétée dans le bloc : le MESSAGE la porte.
    const iaOk = aiDisponible(Deno.env, tier);
    if (iaOk) snapshot.historique = sansDemandeRecollee(nettoyerHistorique(body.history), text);
    const remaining = Math.max(0, ctxR.remaining ?? 0);
    // Étape 3 (3b-1) : `ouvrir` (profils court et long) seulement si le secret AI_ETAPE3 le dit pour cette entreprise, que l'écran annonce `ouvrir1` et qu'AUCUN fichier
    // n'est joint. Éteint : consigne, outils et liens d'avant, octet pour octet.
    const ouvrirOn = ouvrirActif(Deno.env, 'salarie', me.company_id, body.caps, !!att.file);
    if (ouvrirOn) brancherOuvrirSalarie(snapshot, ctxR.role === 'lead' ? 'lead' : 'worker');
    const coupes = outilsCoupes(Deno.env);
    const etape3: OptionsOutilsSalarie | undefined = ouvrirOn || coupes.length ? { ouvrir: ouvrirOn, coupes } : undefined;
    // Lot 3 bis : ce qu'il faut pour préparer un pointage ou une réserve (SES lignes).
    const siteName = (id: string | null) => snapshot.chantiers.find((c) => c.id === id)?.nom ?? 'Chantier';
    const s0 = sess.data as { worksite_id: string; started_at: string } | null;
    const live: WorkerLive = {
      enCours: s0 ? { chantier_id: s0.worksite_id, chantier: siteName(s0.worksite_id), depuis: s0.started_at } : null,
      lignes: ((todayRows.data ?? []) as { id: string; start_time: string; end_time: string; status: string; worksite_id: string | null; meal_allowance: boolean | null; reception: string | null; reserve_fixed_at: string | null; reserve_resolved_at: string | null }[])
        .map((e) => ({
          id: e.id, chantier: siteName(e.worksite_id), chantier_id: e.worksite_id, debut: e.start_time.slice(0, 5), fin: e.end_time.slice(0, 5), envoyee: e.status !== 'draft',
          // Lot 11 : « levée » = par le bureau OU par lui (même définition que lib/reserves.ts).
          panier: !!e.meal_allowance, reserve: e.reception === 'avec', corrigee: !!(e.reserve_fixed_at || e.reserve_resolved_at),
        })),
      hier: yRows.count ?? 0,
      conges: ((myLeaves.data ?? []) as { id: string; type: string; start_date: string; end_date: string }[]).map((l) => ({ id: l.id, type: l.type, du: l.start_date, au: l.end_date })),
      documents: ((myDocs.data ?? []) as { id: string; label: string | null; file_name: string | null; worksite_id: string; created_at: string }[])
        .map((x) => ({ id: x.id, nom: (x.label || x.file_name || 'Document').slice(0, 60), chantier: siteName(x.worksite_id), date: x.created_at.slice(0, 10) })),
    };
    // 3c : lectures à la demande, seulement si `boucle` est allumé pour cette entreprise, que l'écran annonce `boucle1` et qu'AUCUN fichier n'est joint. Éteint : rien ne change.
    const boucleOn = boucleActive(Deno.env, 'salarie', me.company_id, body.caps, !!att.file);
    // Réponse : la fiche `multi`, l'action (et la question s'il manque une info), ou le planning des collègues.
    // `teinte` : le modèle a lu des données (noms de chantier écrits par d'autres) → aucun geste « direct », l'écran attend « Confirmer », et rien ne s'ouvre tout seul.
    const send = async (r: WorkerFullReply | WorkerMultiReply | LongLegacy, teinte = false): Promise<Response> => {
      if (r.kind === 'multi') return json({ ...r, chantiers: snapshot.chantiers, remaining });
      if (r.kind === 'collegues') {
        const { data, error } = await db.rpc('colleagues_planning', { p_from: r.date, p_to: r.date });
        const answer = error ? 'Le planning des collègues n’est pas disponible.'
          : !data || !(data as unknown[]).length ? 'Le bureau n’a pas partagé le planning des collègues, ou personne n’est prévu ce jour-là.'
          : formatColleagues(data as ColleagueRow[], r.qui, r.date, today);
        return json({ kind: 'answer', answer, chantiers: snapshot.chantiers, remaining });
      }
      const question = r.kind === 'action' ? workerQuestionFor(r.action.draft, r.action.problems, snapshot) : null;
      return json({ ...r, ...(question ? { question } : {}), ...(teinte && r.kind === 'action' ? { confirmer: true } : {}), ...(teinte ? { auto: false } : {}), chantiers: snapshot.chantiers, remaining });
    };

    // Le tour (lecteur local, ou IA en profil court / long) est le MÊME code que celui du banc de mesure.
    const t = await runWorkerTurn({
      text, file: att.file, snapshot, live, tier, iaDisponible: aiDisponible(Deno.env, tier), multiOk: body.multi === true,
      ...(etape3 ? { etape3 } : {}),
      call: (req) => callFunction(req, Deno.env),
      ...(boucleOn ? { boucle: (req: Parameters<typeof callFunction>[0]) => boucleOutils({ req, lectures: LECTURES_SALARIE, ctx: { db, cote: 'salarie', companyId: me.company_id, userId: user.id, today }, env: Deno.env }) } : {}),
    });
    if (t.via === 'erreur') {
      if (t.raison === 'sans_cle') {
        if (att.file) return json({ kind: 'answer', notice: true, answer: 'Lecture de fichier indisponible pour le moment.', remaining });
        // Phrase longue : jamais le lecteur local (il déformerait la phrase) ; le panneau remet la phrase dans le champ.
        if (t.profil === 'long') return json({ kind: 'answer', notice: true, answer: 'L’assistant n’est pas disponible pour le moment. Utilisez la saisie habituelle.', remaining });
        return json({ kind: 'answer', notice: true, answer: 'Je n’ai pas compris. Essayez : « 7h30-12h Villa Dupont, 13h-16h30 Bureau Martin ».', remaining });
      }
      return json({ kind: 'answer', notice: true, answer: 'L’assistant n’a pas pu répondre. Utilisez la saisie habituelle.', remaining });
    }
    return send(t.reply, t.via === 'ia' && !!t.teinte);
  } catch {
    console.error('[worker-assistant] erreur interne');
    return json({ error: 'Erreur serveur' }, 500);
  }
});
