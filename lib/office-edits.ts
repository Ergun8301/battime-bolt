// Lot 2 — le bureau corrige une journée envoyée AVEC UN MOTIF (heures, pause,
// panier, route), ou la renvoie au salarié. Côté navigateur.
//
// MÊMES DEUX RÈGLES QUE lib/corrections.ts, ET POUR LES MÊMES RAISONS :
//
//   · PAS DE TRACE, PAS DE CORRECTION. Les heures et le journal
//     (`time_entry_edits`) s'écrivent dans la MÊME transaction, par
//     `office_correct_entry` / `office_return_day`. Tant que la migration
//     20261009120000 n'est pas appliquée, ces fonctions n'existent pas : l'appel
//     échoue, on le DIT (« mise à jour de la base en attente ») et RIEN ne bouge.
//     Jamais de repli sur une écriture brute — c'est exactement ce que ce lot
//     existe pour supprimer.
//
//   · LA CORRECTION TIENT MÊME SI LA NOTIFICATION ÉCHOUE. L'échec s'inscrit au
//     journal (`notify_error`), et la fiche montre « pas prévenu ».
//
// `corrigerHeures` (lib/corrections.ts) reste le chemin du chef d'équipe, de
// l'Assistant, et de la fiche tant que la migration n'est pas passée.

import { supabase } from '@/lib/supabase';
import { diffLabels, pushBody, type Changes, type EditState } from '@/supabase/functions/_shared/office-edits';

/** Une ligne du journal des gestes du bureau, telle que les écrans la lisent. */
export interface EntryEdit {
  id: string;
  entry_id: string;
  work_date: string;
  kind: 'correction' | 'return';
  reason: string;
  edited_by: string;
  edited_at: string;
  old_values: Partial<EditState>;
  new_values: Partial<EditState>;
  correction_id: string | null;
  notified_at: string | null;
  notify_error: string | null;
}

type Reader = { from: (t: string) => { select: (c: string) => { in: (k: string, v: string[]) => { order: (c: string, o: { ascending: boolean }) => PromiseLike<{ data: unknown; error: unknown }> } } } };

/**
 * Le journal des lignes affichées. Requête à part, et silencieuse : tant que la
 * table n'existe pas (migration pas encore passée), `available` est faux — la
 * fiche garde EXACTEMENT son panneau d'avant (début / fin seulement), le
 * salarié ne voit aucun bandeau. Même idée que fetchQrFlags (lib/qr-entry.ts).
 */
export async function fetchEntryEdits(sb: Reader, ids: string[]): Promise<{ available: boolean; byEntry: Map<string, EntryEdit[]> }> {
  const byEntry = new Map<string, EntryEdit[]>();
  if (ids.length === 0) return { available: false, byEntry };
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from('time_entry_edits')
      .select('id, entry_id, work_date, kind, reason, edited_by, edited_at, old_values, new_values, correction_id, notified_at, notify_error')
      .in('entry_id', ids.slice(i, i + 200))
      .order('edited_at', { ascending: true });
    if (error || !Array.isArray(data)) return { available: false, byEntry: new Map() };
    for (const r of data as EntryEdit[]) {
      const l = byEntry.get(r.entry_id) || [];
      l.push(r);
      byEntry.set(r.entry_id, l);
    }
  }
  return { available: true, byEntry };
}

/** La dernière ligne du journal d'une ligne d'heures (le geste le plus récent du bureau). */
export const lastEdit = (list?: EntryEdit[]) => (list && list.length ? list[list.length - 1] : undefined);

/** Une ligne en brouillon dont le dernier geste du bureau est un renvoi : elle attend le salarié. */
export const isReturned = (status: string | undefined, list?: EntryEdit[]) => status === 'draft' && lastEdit(list)?.kind === 'return';

export interface OfficeEditResult {
  /** Les heures ont-elles réellement changé en base ? */
  ok: boolean;
  /** Le salarié a-t-il reçu la notification ? */
  notified: boolean;
  /** Ce qu'on affiche au bureau — jamais un mensonge rassurant. */
  message: string;
}

const PENDING = 'Mise à jour de la base en attente : rien n’a été modifié.';
const errMessage = (e: { code?: string; message?: string } | null, fallback: string) =>
  e?.code === 'PGRST202' ? PENDING : (e?.message || fallback);

/**
 * Prévenir, puis inscrire l'issue. Le texte vient de la règle partagée
 * (`pushBody`), envoyé par la branche « message du bureau » de `send-push`
 * (déjà en production : aucun déploiement). `sent: 0` n'est PAS « prévenu ».
 */
async function notify(rows: EntryEdit[], workerId: string, workDate: string, companyName: string, body: string) {
  let notified = false;
  let notifyError: string | null = null;
  try {
    const { data: fn, error: fnErr } = await supabase.functions.invoke('send-push', {
      body: { user_ids: [workerId], title: companyName || 'BEMEXO', body, url: '/poseur', tag: `correction-${workDate}` },
    });
    if (fnErr) throw fnErr;
    notified = ((fn as { sent?: number } | null)?.sent ?? 0) > 0;
    if (!notified) notifyError = 'aucun appareil joignable';
  } catch (e) {
    notifyError = (e as { message?: string })?.message || 'envoi impossible';
  }
  // L'issue ne se réécrit qu'une fois (côté base). Si cette écriture échoue,
  // `notified_at` reste vide : lisible « pas prévenu », le plus prudent.
  await supabase.rpc('office_edit_mark_notified', { p_ids: rows.map((r) => r.id), p_error: notified ? null : notifyError });
  // La correction de début / fin est AUSSI dans le journal que lisent les
  // écrans d'avant : même issue, même écriture que lib/corrections.ts.
  for (const r of rows) {
    if (!r.correction_id) continue;
    await supabase.from('time_entry_corrections')
      .update(notified ? { notified_at: new Date().toISOString() } : { notify_error: notifyError })
      .eq('id', r.correction_id);
  }
  return { notified, notifyError };
}

/**
 * Corrige une ligne envoyée (heures, pause, panier, route) avec un motif, et
 * prévient le salarié. On n'envoie que l'identifiant de la ligne, les
 * changements et le motif : le serveur lit lui-même le salarié, l'entreprise
 * et le droit de corriger.
 */
export async function correctOfficeEntry(p: {
  entryId: string; workerId: string; workDate: string; changes: Changes; reason: string; companyName: string;
}): Promise<OfficeEditResult> {
  const { data, error } = await supabase.rpc('office_correct_entry', {
    p_entry_id: p.entryId, p_changes: p.changes, p_reason: p.reason.trim(),
  });
  if (error) return { ok: false, notified: false, message: errMessage(error as { code?: string; message?: string }, 'Correction impossible.') };
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as EntryEdit[];
  if (rows.length === 0) return { ok: false, notified: false, message: 'Correction impossible.' };
  const main = rows.find((r) => r.entry_id === p.entryId) || rows[rows.length - 1];
  const labels = diffLabels(main.old_values, main.new_values);
  const { notified, notifyError } = await notify(rows, p.workerId, p.workDate, p.companyName,
    pushBody({ kind: 'correction', date: p.workDate, labels, reason: p.reason }));
  return {
    ok: true, notified,
    message: notified
      ? 'Journée corrigée — le salarié est prévenu'
      : `Journée corrigée, mais le salarié n’a pas été prévenu (${notifyError}). Il le verra sur sa journée.`,
  };
}

/**
 * Renvoie toute la journée au salarié (ses lignes envoyées repassent en
 * brouillon), avec un motif qu'il lit, et le prévient.
 */
export async function returnDayToWorker(p: { workerId: string; workDate: string; reason: string; companyName: string }): Promise<OfficeEditResult> {
  const { data, error } = await supabase.rpc('office_return_day', {
    p_user_id: p.workerId, p_work_date: p.workDate, p_reason: p.reason.trim(),
  });
  if (error) return { ok: false, notified: false, message: errMessage(error as { code?: string; message?: string }, 'Renvoi impossible.') };
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as EntryEdit[];
  if (rows.length === 0) return { ok: false, notified: false, message: 'Renvoi impossible.' };
  const { notified, notifyError } = await notify(rows, p.workerId, p.workDate, p.companyName,
    pushBody({ kind: 'return', date: p.workDate, reason: p.reason }));
  return {
    ok: true, notified,
    message: notified
      ? 'Journée renvoyée au salarié — il est prévenu'
      : `Journée renvoyée au salarié, mais il n’a pas été prévenu (${notifyError}). Il la verra sur sa journée.`,
  };
}
