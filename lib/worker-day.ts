// La JOURNÉE du salarié — envoyer, panier, copier — partagée entre l'écran
// « Ma journée » (components/poseur-day.tsx) et l'Assistant BEMEXO (lot 7).
//
// Code sorti TEL QUEL de poseur-day.tsx : un seul chemin, mêmes colonnes, même
// RLS, mêmes garde-fous (identifiant stable des lignes prévues, panier unique,
// `.select('id')` pour voir un refus silencieux de la RLS). Ce qui touche au
// hors-ligne (file du téléphone) reste dans l'écran.
import { supabase } from '@/lib/supabase';
import { planningsToMaterialise, remainingPlannings, sendablePlannings } from '@/lib/work-status';
import { firstBlockingOverlap, keptBreak, pauseAsks, spanMinutes } from '@/supabase/functions/_shared/day-hours';
import { cellKey, placeLive, type LiveSessionLike } from '@/supabase/functions/_shared/live-place';

export interface DayUser { id: string; company_id: string }
export interface PlannedLine { planningId: string; worksiteId: string; start: string; end: string; breakMinutes?: number }

/**
 * Matérialise les chantiers prévus non ouverts, et rend les identifiants des
 * lignes créées pour qu'elles partent avec les autres.
 *
 * EN DEUX TEMPS, ET CE N'EST PAS UN CHOIX. La politique RLS
 * `time_entries_worker_insert` impose `status = 'draft'` : un salarié ne peut
 * pas insérer une ligne déjà envoyée. On insère donc en brouillon, puis la
 * bascule se fait avec le reste (c'est ce chemin qui fait poser `submitted_at`).
 */
export async function materialisePlanned(user: DayUser, date: string, plannedToSend: PlannedLine[]): Promise<string[]> {
  if (plannedToSend.length === 0) return [];
  // IDENTIFIANT STABLE, dérivé du planning : une seconde tentative (réseau qui
  // lâche entre l'insertion et la bascule) ne fabrique pas de doublon d'heures.
  const cid = (planningId: string) => `plan_${planningId}`;
  const rows = plannedToSend.map((p) => ({
    company_id: user.company_id, user_id: user.id, worksite_id: p.worksiteId,
    planning_id: p.planningId, work_date: date,
    start_time: p.start, end_time: p.end,
    // Lot 1 : la pause répondue à l'envoi (« Tu as pris une pause ? »).
    break_minutes: keptBreak(p, p.breakMinutes),
    // Le panier est posé ensuite, par `setDayMeal`, sur une seule ligne du jour.
    meal_allowance: false, observation: null, reception: null,
    status: 'draft' as const,
    client_id: cid(p.planningId),
  }));

  let { data, error } = await supabase.from('time_entries').insert(rows).select('id');

  // 23505 = au moins une de ces lignes existe déjà (tentative précédente) :
  // l'insertion entière est rejetée. On relit ce qui est là, on insère le reste.
  if (error && error.code === '23505') {
    const tous = plannedToSend.map((p) => cid(p.planningId));
    const { data: deja, error: readErr } = await supabase.from('time_entries')
      .select('id, client_id').eq('user_id', user.id).eq('work_date', date).in('client_id', tous);
    if (readErr) throw readErr;
    const presents = (deja || []) as { id: string; client_id: string | null }[];
    const connus = new Set(presents.map((r) => r.client_id));
    const manquantes = rows.filter((r) => !connus.has(r.client_id));
    const ids = presents.map((r) => r.id);
    if (manquantes.length > 0) {
      const { data: ajoutees, error: insErr } = await supabase.from('time_entries').insert(manquantes).select('id');
      if (insErr) throw insErr;
      ids.push(...((ajoutees || []) as { id: string }[]).map((r) => r.id));
    }
    return ids;
  }
  // Base pas encore migrée : sans l'identifiant local (comportement d'avant).
  if (error && error.code === 'PGRST204' && error.message?.includes('client_id')) {
    ({ data, error } = await supabase.from('time_entries')
      .insert(rows.map(({ client_id, ...r }) => r)).select('id'));
  }
  if (error) throw error;
  return ((data || []) as { id: string }[]).map((r) => r.id);
}

/** Bascule « envoyée ». Renvoie le nombre de lignes réellement envoyées (RLS : les verrouillées sont ignorées). */
export async function submitDrafts(user: DayUser, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { data: sent, error } = await supabase.from('time_entries').update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .in('id', ids).eq('user_id', user.id).eq('status', 'draft').select('id');
  if (error) throw error;
  return sent?.length ?? 0;
}

/**
 * Panier repas du jour, EN LIGNE : exactement une ligne cochée par jour (index
 * unique en base). Renvoie false si le panier n'a pas pu être écrit.
 */
export async function setDayMealOnline(user: DayUser, date: string, value: boolean, flagModified = false): Promise<boolean> {
  let ok = true;
  // Le panier ne se pose que sur une ligne vivante et modifiable.
  const { data, error: readErr } = await supabase.from('time_entries')
    .select('id, start_time, meal_allowance')
    .eq('user_id', user.id).eq('work_date', date)
    .neq('status', 'cancelled').eq('locked', false);
  if (readErr) return false;
  const rows = [...(data || [])].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  // Journée déjà envoyée : corriger le panier prévient la secrétaire.
  const stamp = flagModified ? { modified_at: new Date().toISOString(), modified_by: user.id } : {};
  const setMeal = async (id: string, target: boolean) => {
    const { data: upd, error } = await supabase.from('time_entries')
      .update({ meal_allowance: target, ...stamp }).eq('id', id).eq('user_id', user.id).select('id');
    if (error || !upd || upd.length === 0) ok = false;
  };
  // D'abord retirer le panier des autres lignes, PUIS le poser sur la première.
  for (const r of rows.slice(1)) if (r.meal_allowance) await setMeal(r.id, false);
  if (rows[0] && rows[0].meal_allowance !== value) await setMeal(rows[0].id, value);
  return ok;
}

export interface CopySource { worksite_id: string | null; start_time: string; end_time: string; break_minutes?: number | null; observation?: string | null }

/**
 * Copie des lignes (brouillons) sur d'autres jours — « Copier la journée
 * d'hier » et « Dupliquer cette journée ». Le panier ne se copie pas. Le
 * planning du jour cible est rattaché quand il prévoit ce chantier.
 * Renvoie les identifiants créés.
 *
 * Lot 2 : une ligne de 0 minute (sortie oubliée « à compléter », début = fin)
 * ne se recopie pas. La copie perdait le drapeau (la base le remet à faux à
 * chaque insertion) et devenait un brouillon vide… qui pouvait partir.
 */
export async function copyLinesTo(user: DayUser, allSources: CopySource[], targets: string[]): Promise<string[]> {
  const sources = allSources.filter((s) => s.start_time && s.end_time && spanMinutes({ start: s.start_time, end: s.end_time }) > 0);
  if (sources.length === 0 || targets.length === 0) return [];
  const { data: plan } = await supabase.from('planning').select('id, work_date, worksite_id').eq('user_id', user.id).in('work_date', targets);
  const planMap = new Map<string, string>();
  (plan || []).forEach((p: { id: string; work_date: string; worksite_id: string | null }) => {
    if (p.worksite_id) planMap.set(`${p.work_date}|${p.worksite_id}`, p.id);
  });
  const rows = targets.flatMap((td) => sources.map((s) => ({
    company_id: user.company_id, user_id: user.id, worksite_id: s.worksite_id,
    planning_id: planMap.get(`${td}|${s.worksite_id}`) || null,
    // Lot 1 : la pause de la ligne copiée suit (elle était remise à 0).
    work_date: td, start_time: s.start_time, end_time: s.end_time, break_minutes: keptBreak({ start: s.start_time, end: s.end_time }, s.break_minutes),
    // total_minutes est une colonne calculée par Postgres : jamais envoyée.
    meal_allowance: false, observation: s.observation || null, status: 'draft' as const,
  })));
  const { data, error } = await supabase.from('time_entries').insert(rows).select('id');
  if (error) throw error;
  return ((data || []) as { id: string }[]).map((r) => r.id);
}

/**
 * « Envoyer ma journée » EN LIGNE, pour l'assistant : relit la journée et
 * bascule les lignes SAISIES. Lot 1 : les créneaux prévus par le bureau ne
 * partent plus d'ici — une heure prévue n'est pas une heure faite, et
 * l'Assistant ne les montre pas avant d'envoyer. Ils sont comptés dans
 * `plannedLeft` : le salarié les confirme dans « Ma journée ».
 * Le hors-ligne reste l'affaire de l'écran.
 */
export async function sendWorkerDay(user: DayUser, date: string): Promise<{ sent: number; expected: number; plannedLeft: number; blocked?: string }> {
  const [{ data: entries, error: e1 }, { data: plans, error: e2 }, { data: sess }] = await Promise.all([
    supabase.from('time_entries').select('id, status, locked, worksite_id, planning_id, start_time, end_time, break_minutes').eq('user_id', user.id).eq('work_date', date),
    supabase.from('planning').select('id, worksite_id, absence_type, estimated_start, estimated_end').eq('user_id', user.id).eq('work_date', date),
    // Lot 9 : le chrono ouvert. Une lecture qui échoue ne bloque pas l'envoi.
    supabase.from('active_sessions').select('user_id, worksite_id, planning_id, work_date, started_at').eq('user_id', user.id).maybeSingle(),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const rows = (entries || []) as { id: string; status: string; locked: boolean; worksite_id: string | null; planning_id: string | null; start_time: string; end_time: string; break_minutes: number | null }[];
  const planning = (plans || []) as { id: string; worksite_id: string | null; absence_type: string | null; estimated_start: string | null; estimated_end: string | null }[];
  const todo = remainingPlannings(planning.filter((p) => p.worksite_id && !p.absence_type),
    rows.map((e) => ({ worksite_id: e.worksite_id, planning_id: e.planning_id })));
  // Le prévu où le chrono TOURNE ne part pas : « J'ai fini » écrira ses heures,
  // le matérialiser les compterait deux fois. Même règle que l'écran
  // (placeLive : planning du chrono, sinon même chantier — jamais le premier).
  const live = sess as LiveSessionLike | null;
  const liveSlot = live && live.work_date === date
    ? placeLive([live], todo.map((p) => ({ id: p.id, user_id: user.id, worksite_id: p.worksite_id ?? null, work_date: date }))).get(cellKey(user.id, date))?.slotId ?? null
    : null;
  const lines = rows.filter((e) => e.status !== 'cancelled' && e.start_time && e.end_time)
    .map((e) => ({ start: e.start_time, end: e.end_time }));
  const plannedLeft = planningsToMaterialise(sendablePlannings(todo.filter((p) => p.id !== liveSlot), lines)).length;
  const draftIds = rows.filter((e) => e.status === 'draft' && !e.locked).map((e) => e.id);
  // Mêmes garde-fous que l'écran : un chevauchement corrigeable bloque, et plus
  // de 6 h d'affilée sans pause renvoie vers « Ma journée », où la question est posée.
  const spans = rows.filter((e) => e.status !== 'cancelled' && e.start_time && e.end_time && e.start_time.slice(0, 5) !== e.end_time.slice(0, 5))
    .map((e) => ({ id: e.id, start: e.start_time.slice(0, 5), end: e.end_time.slice(0, 5), editable: e.status === 'draft' && !e.locked, break_minutes: e.break_minutes || 0 }));
  const clash = firstBlockingOverlap(spans);
  if (clash) return { sent: 0, expected: draftIds.length, plannedLeft, blocked: `Deux chantiers se chevauchent (${clash[0].start}–${clash[0].end} et ${clash[1].start}–${clash[1].end}) : corrige l’un des deux dans « Ma journée ».` };
  if (draftIds.length > 0 && pauseAsks(spans).length > 0) return { sent: 0, expected: draftIds.length, plannedLeft, blocked: 'Plus de 6 h d’affilée sans pause notée : envoie ta journée depuis « Ma journée », la pause y est demandée.' };
  return { sent: await submitDrafts(user, draftIds), expected: draftIds.length, plannedLeft };
}
