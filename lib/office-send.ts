// « Envoyer à sa place » : le bureau envoie les heures qu'un salarié a saisies sans les envoyer. Module à part, chargé au clic (import différé) depuis le
// planning et la fiche d'une ligne, pour ne pas alourdir le premier chargement de /admin.
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { notifyWorker } from '@/lib/admin-writes';
import { makeBubbleKeyOf } from '@/lib/planning-cells';
import { fetchCompanyClosures, closedFor } from '@/lib/worker-closure';
import { fetchEntryEdits, isReturned } from '@/lib/office-edits';
import { isEmptyDraft } from '@/supabase/functions/_shared/day-hours';

/**
 * « Envoyer à sa place » : le bureau envoie une ligne que le salarié a saisie sans l'envoyer (brouillon). Elle compte alors comme n'importe quelle journée envoyée.
 * Jamais sans trace : `submitted_by` porte la personne du bureau. Une ligne déjà envoyée, retirée, verrouillée ou renvoyée au salarié n'est pas touchée (0 ligne = false).
 * Le salarié est prévenu (notification, un plus jamais bloquant).
 */
export async function sendDraftForWorker(companyId: string, entryId: string, officeUserId: string): Promise<boolean> {
  const { data, error } = await supabase.from('time_entries')
    .update({ status: 'submitted', submitted_at: new Date().toISOString(), submitted_by: officeUserId })
    .eq('id', entryId).eq('company_id', companyId).eq('status', 'draft').eq('locked', false).is('submitted_at', null)
    .select('id, user_id, work_date, start_time, end_time');
  if (error) throw error;
  const row = (data as { user_id: string; work_date: string; start_time: string; end_time: string }[] | null)?.[0];
  if (!row) return false;
  const jour = new Date(`${row.work_date}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  await notifyWorker(row.user_id, 'Heures envoyées par le bureau',
    `Vos heures du ${jour} (${row.start_time.slice(0, 5)} – ${row.end_time.slice(0, 5)}) ont été envoyées pour vous par le bureau.`, 'heures');
  return true;
}

/** Toutes les lignes en brouillon d'une case du planning ; renvoie le nombre de lignes réellement envoyées (0 = déjà changées). */
export async function sendDraftsForWorker(companyId: string, entryIds: string[], officeUserId: string): Promise<number> {
  let n = 0;
  for (const id of entryIds) if (await sendDraftForWorker(companyId, id, officeUserId)) n++;
  return n;
}

/** Le geste complet, messages compris (planning et fiche d'une ligne) : vrai si au moins une ligne est partie. */
export async function envoyerAPlace(p: { companyId: string; entryIds: string[]; officeUserId: string; prenom: string }): Promise<boolean> {
  try {
    if (await sendDraftsForWorker(p.companyId, p.entryIds, p.officeUserId)) { toast.success(`Heures envoyées pour ${p.prenom} : il est prévenu`); return true; }
    toast.error('Ces heures ont déjà changé (envoyées ou renvoyées) : rechargez.');
  } catch (err) {
    const msg = (err as { message?: string })?.message || 'Envoi impossible';
    toast.error(/submitted_by/.test(msg) ? 'Mise à jour de la base en attente : envoi impossible pour le moment.' : msg);
  }
  return false;
}

/**
 * « Valider ses heures » : une intervention PRÉVUE dont le salarié n'a rien saisi (il a dit « c'est bon » au téléphone). Le bureau crée la ligne d'heures
 * envoyée, sur l'horaire prévu, avec la trace `submitted_by` ; le salarié est prévenu. Refusé s'il existe déjà une ligne sur cette intervention.
 */
export async function validerPourSalarie(p: {
  companyId: string; officeUserId: string; prenom: string;
  slot: { id: string; user_id: string; worksite_id: string; work_date: string }; debut: string; fin: string;
}): Promise<boolean> {
  try {
    const { data: deja, error: e1 } = await supabase.from('time_entries').select('id').eq('planning_id', p.slot.id).neq('status', 'cancelled').limit(1);
    if (e1) throw e1;
    if (deja?.length) { toast.error(`${p.prenom} a déjà des heures sur cette intervention : rechargez le planning.`); return false; }
    const { error } = await supabase.from('time_entries').insert({
      company_id: p.companyId, user_id: p.slot.user_id, worksite_id: p.slot.worksite_id, planning_id: p.slot.id, work_date: p.slot.work_date,
      start_time: `${p.debut.slice(0, 5)}:00`, end_time: `${p.fin.slice(0, 5)}:00`, break_minutes: 0,
      status: 'submitted', submitted_at: new Date().toISOString(), submitted_by: p.officeUserId,
    });
    if (error) throw error;
    const jour = new Date(`${p.slot.work_date}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    await notifyWorker(p.slot.user_id, 'Heures validées par le bureau', `Vos heures du ${jour} (${p.debut.slice(0, 5)} – ${p.fin.slice(0, 5)}) ont été validées pour vous par le bureau.`, 'heures');
    toast.success(`Heures validées pour ${p.prenom} : il est prévenu`);
    return true;
  } catch (err) {
    const msg = (err as { message?: string })?.message || 'Validation impossible';
    toast.error(/submitted_by/.test(msg) ? 'Mise à jour de la base en attente : validation impossible pour le moment.' : msg);
    return false;
  }
}

// ───────────────────────── « Tout valider » : plusieurs journées d'un coup ─────────────────────────
// Un salarié ou toute l'entreprise, sur un jour, une semaine ou un mois. Deux sortes de journées, les MÊMES que les gestes un par un :
//   · « saisi » : un brouillon que le salarié n'a pas envoyé → envoyé à sa place (même règle que sendDraftForWorker) ;
//   · « prévu » : une intervention passée sans rien de saisi → une ligne envoyée sur l'horaire prévu (même règle que validerPourSalarie).
// Jamais : un mois clôturé, un salarié clôturé à cette date, une sortie oubliée, une journée renvoyée au salarié, une case retirée, un pointage en cours,
// une intervention sans horaire. Celles-là sont comptées à part (« à voir une par une »), pas cochables.

export interface JourAValider {
  /** `d:<id>` (brouillon) ou `p:<id>` (intervention prévue). */
  cle: string;
  sorte: 'saisi' | 'prevu';
  user_id: string; work_date: string; worksite_id: string | null;
  debut: string; fin: string; minutes: number;
}
export interface AValider { jours: JourAValider[]; aVoir: { user_id: string; work_date: string; raison: string }[] }

const hm = (t?: string | null) => (t || '').slice(0, 5);
const minutesEntre = (a: string, b: string) => (+b.slice(0, 2) * 60 + +b.slice(3, 5)) - (+a.slice(0, 2) * 60 + +a.slice(3, 5));
const heureParis = () => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

/** Lecture seule : ce qui reste à valider entre `from` et `to` (inclus, jamais après aujourd'hui), pour un salarié ou tous. */
export async function chargerAValider(p: { companyId: string; from: string; to: string; today: string; userId?: string | null }): Promise<AValider> {
  const to = p.to > p.today ? p.today : p.to;
  const jours: JourAValider[] = []; const aVoir: AValider['aVoir'] = [];
  if (p.from > to) return { jours, aVoir };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtre = (q: any) => (p.userId ? q.eq('user_id', p.userId) : q) as PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  const [planRes, entRes, liveRes, moisRes, clotures] = await Promise.all([
    filtre(supabase.from('planning').select('id, user_id, work_date, worksite_id, absence_type, estimated_start, estimated_end, added_by_worker, created_at')
      .eq('company_id', p.companyId).gte('work_date', p.from).lte('work_date', to)),
    filtre(supabase.from('time_entries').select('id, user_id, work_date, worksite_id, planning_id, status, start_time, end_time, total_minutes, locked, submitted_at, exit_forgotten')
      .eq('company_id', p.companyId).gte('work_date', p.from).lte('work_date', to)),
    supabase.from('active_sessions').select('user_id, planning_id, work_date').eq('company_id', p.companyId),
    supabase.from('month_closures').select('month').eq('company_id', p.companyId),
    fetchCompanyClosures(p.companyId),
  ]);
  if (planRes.error) throw planRes.error;
  if (entRes.error) throw entRes.error;
  type Slot = { id: string; user_id: string; work_date: string; worksite_id: string | null; absence_type: string | null; estimated_start: string | null; estimated_end: string | null; added_by_worker?: boolean; created_at?: string };
  type Ent = { id: string; user_id: string; work_date: string; worksite_id: string | null; planning_id: string | null; status: string; start_time: string | null; end_time: string | null; total_minutes: number | null; locked: boolean | null; submitted_at: string | null; exit_forgotten?: boolean | null };
  const slots = (planRes.data || []) as unknown as Slot[];
  const ents = (entRes.data || []) as unknown as Ent[];
  const enCours = new Set(((liveRes.data || []) as { planning_id: string | null; user_id: string; work_date: string }[]).map((l) => l.planning_id || `${l.user_id}|${l.work_date}`));
  const moisClos = new Set(((moisRes.data || []) as { month: string }[]).map((m) => m.month.slice(0, 7)));
  const ferme = (uid: string, d: string) => moisClos.has(d.slice(0, 7)) || closedFor(clotures, uid, d);
  const keyOf = makeBubbleKeyOf(slots as never);
  const pris = new Set<string>(); // cases (bulle) qui ont déjà une ligne d'heures, quelle qu'elle soit (sauf retirée)
  const retirees = new Set<string>();
  for (const e of ents) { if (e.status === 'cancelled') { if (e.planning_id) retirees.add(e.planning_id); continue; } pris.add(keyOf(e)); }

  const brouillons = ents.filter((e) => e.status === 'draft' && !e.submitted_at && !e.locked);
  const { byEntry } = await fetchEntryEdits(supabase as never, brouillons.map((e) => e.id));
  for (const e of brouillons) {
    if (isEmptyDraft(e)) continue; // brouillon vide : ne compte nulle part
    const raison = ferme(e.user_id, e.work_date) ? 'période clôturée' : e.exit_forgotten ? 'sortie oubliée à compléter' : isReturned(e.status, byEntry.get(e.id)) ? 'renvoyée au salarié' : !e.start_time || !e.end_time ? 'horaire incomplet' : null;
    if (raison) { aVoir.push({ user_id: e.user_id, work_date: e.work_date, raison }); continue; }
    jours.push({ cle: `d:${e.id}`, sorte: 'saisi', user_id: e.user_id, work_date: e.work_date, worksite_id: e.worksite_id, debut: hm(e.start_time), fin: hm(e.end_time), minutes: e.total_minutes ?? Math.max(0, minutesEntre(hm(e.start_time), hm(e.end_time))) });
  }
  const maintenant = heureParis();
  for (const s of slots) {
    if (s.absence_type || !s.worksite_id || pris.has(`p:${s.id}`) || retirees.has(s.id)) continue;
    if (enCours.has(s.id) || enCours.has(`${s.user_id}|${s.work_date}`)) continue;
    const debut = hm(s.estimated_start), fin = hm(s.estimated_end);
    if (s.work_date === p.today && (!fin || fin > maintenant)) continue; // pas encore fini aujourd'hui
    const raison = ferme(s.user_id, s.work_date) ? 'période clôturée' : !debut || !fin ? 'horaire prévu manquant' : fin <= debut ? 'horaire prévu à vérifier' : null;
    if (raison) { aVoir.push({ user_id: s.user_id, work_date: s.work_date, raison }); continue; }
    jours.push({ cle: `p:${s.id}`, sorte: 'prevu', user_id: s.user_id, work_date: s.work_date, worksite_id: s.worksite_id, debut, fin, minutes: minutesEntre(debut, fin) });
  }
  jours.sort((a, b) => a.user_id.localeCompare(b.user_id) || a.work_date.localeCompare(b.work_date) || a.debut.localeCompare(b.debut));
  return { jours, aVoir };
}

/**
 * Le geste « Tout valider » : envoie les brouillons et crée les lignes des interventions prévues choisies, avec la trace `submitted_by`.
 * Une seule notification par salarié. Ce qui a changé entre-temps (déjà envoyé, une saisie arrivée) est laissé tel quel et compté.
 */
export async function validerEnLot(p: { companyId: string; officeUserId: string; jours: JourAValider[] }): Promise<{ faits: number; ignores: number }> {
  const maintenant = new Date().toISOString();
  const faitsPar = new Map<string, string[]>();
  const noter = (uid: string, d: string) => { const l = faitsPar.get(uid) || []; l.push(d); faitsPar.set(uid, l); };
  const saisis = p.jours.filter((j) => j.sorte === 'saisi');
  for (let i = 0; i < saisis.length; i += 100) {
    const lot = saisis.slice(i, i + 100);
    const { data, error } = await supabase.from('time_entries')
      .update({ status: 'submitted', submitted_at: maintenant, submitted_by: p.officeUserId })
      .in('id', lot.map((j) => j.cle.slice(2))).eq('company_id', p.companyId).eq('status', 'draft').eq('locked', false).is('submitted_at', null)
      .select('user_id, work_date');
    if (error) throw error;
    for (const r of (data || []) as { user_id: string; work_date: string }[]) noter(r.user_id, r.work_date);
  }
  const prevus = p.jours.filter((j) => j.sorte === 'prevu');
  for (let i = 0; i < prevus.length; i += 100) {
    const lot = prevus.slice(i, i + 100);
    const { data: deja, error: e1 } = await supabase.from('time_entries').select('planning_id').in('planning_id', lot.map((j) => j.cle.slice(2))).neq('status', 'cancelled');
    if (e1) throw e1;
    const occupes = new Set(((deja || []) as { planning_id: string }[]).map((r) => r.planning_id));
    const lignes = lot.filter((j) => !occupes.has(j.cle.slice(2))).map((j) => ({
      company_id: p.companyId, user_id: j.user_id, worksite_id: j.worksite_id, planning_id: j.cle.slice(2), work_date: j.work_date,
      start_time: `${j.debut}:00`, end_time: `${j.fin}:00`, break_minutes: 0, status: 'submitted', submitted_at: maintenant, submitted_by: p.officeUserId,
    }));
    if (!lignes.length) continue;
    const { error } = await supabase.from('time_entries').insert(lignes);
    if (error) throw error;
    for (const l of lignes) noter(l.user_id, l.work_date);
  }
  const jour = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  await Promise.all(Array.from(faitsPar, ([uid, dates]) => {
    const t = Array.from(new Set(dates)).sort();
    const quand = t.length === 1 ? `du ${jour(t[0])}` : `du ${jour(t[0])} au ${jour(t[t.length - 1])}`;
    return notifyWorker(uid, 'Heures validées par le bureau', `Le bureau a validé ${t.length} journée${t.length > 1 ? 's' : ''} pour vous (${quand}).`, 'heures');
  }));
  const faits = Array.from(faitsPar.values()).reduce((n, l) => n + l.length, 0);
  return { faits, ignores: p.jours.length - faits };
}
