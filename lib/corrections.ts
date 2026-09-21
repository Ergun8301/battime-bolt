// Corriger les heures de quelqu'un d'autre, et le lui dire.
//
// POURQUOI CE FICHIER EXISTE. Deux écrans corrigent les heures d'un salarié :
// la fiche salarié (le bureau) et « Mon équipe aujourd'hui » (le chef
// d'équipe). Écrire la séquence deux fois, c'est garantir qu'un jour l'une des
// deux oubliera d'inscrire l'historique ou de notifier — et ce jour-là, un
// salarié verra ses heures changer sans explication.
//
// LA RÈGLE QUI COMMANDE TOUT : LA CORRECTION PASSE, MÊME SI LA NOTIFICATION
// ÉCHOUE. Une correction juste ne doit pas dépendre de l'état du téléphone du
// salarié. Mais un échec d'envoi ne doit jamais se taire : il s'inscrit dans
// `time_entry_corrections.notify_error`, et `notified_at` reste NULL — un état
// lisible, qui dit « on ne l'a pas prévenu » au lieu de faire semblant.

import { supabase } from '@/lib/supabase';

/** Deux points dans la journée, au format que le salarié lit : « 9h00 ». */
export function fmtHeure(hhmm: string): string {
  const [h, m] = (hhmm || '').slice(0, 5).split(':');
  return `${Number(h)}h${m ?? '00'}`;
}

export interface CorrigeableEntry {
  id: string;
  user_id: string;
  company_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  exported_at?: string | null;
}

export interface CorrectionResult {
  /** Les heures ont-elles réellement changé en base ? */
  ok: boolean;
  /** Le salarié a-t-il reçu la notification ? */
  notified: boolean;
  /** Ce qu'on affiche à celui qui a corrigé — jamais un mensonge rassurant. */
  message: string;
}

/**
 * Corrige les heures d'une ligne, inscrit la correction au journal, et prévient
 * le salarié.
 *
 * L'ORDRE N'EST PAS ARBITRAIRE :
 *
 *   1. On corrige. `.select('id')` : une écriture refusée par la RLS renvoie
 *      zéro ligne SANS erreur, et on croirait avoir corrigé.
 *   2. On inscrit au journal AVANT de notifier — la ligne d'historique est
 *      l'endroit où l'issue de l'envoi va s'écrire ; elle doit exister d'abord.
 *   3. On notifie.
 *   4. On inscrit l'issue.
 *
 * Si l'étape 3 ou 4 échoue, les étapes 1 et 2 tiennent : la correction est
 * faite et tracée, et `notified_at` reste NULL. C'est exactement ce qu'on veut
 * savoir.
 */
export async function corrigerHeures(params: {
  entry: CorrigeableEntry;
  newStart: string;
  newEnd: string;
  /** Qui corrige — son identifiant, pour le journal. */
  correctorId: string;
  /** « bureau » ou « chef » : change la phrase lue par le salarié. */
  auteur: 'bureau' | 'chef';
  /** Titre de la notification (le nom de l'entreprise, comme les autres). */
  companyName: string;
}): Promise<CorrectionResult> {
  const { entry, newStart, newEnd, correctorId, auteur, companyName } = params;

  const oldStart = entry.start_time.slice(0, 5);
  const oldEnd = entry.end_time.slice(0, 5);
  if (oldStart === newStart && oldEnd === newEnd) {
    return { ok: false, notified: false, message: 'Ces heures sont déjà celles-là.' };
  }

  // ── 1 · La correction ──────────────────────────────────────────────────────
  const { data: upd, error: updErr } = await supabase.from('time_entries')
    .update({ start_time: newStart, end_time: newEnd })
    .eq('id', entry.id).select('id');
  if (updErr) throw updErr;
  if (!upd || upd.length === 0) {
    return { ok: false, notified: false, message: "Cette ligne n'a pas pu être corrigée. Recharge." };
  }

  // ── 2 · Le journal, avant l'envoi ──────────────────────────────────────────
  // Un échec ici n'annule PAS la correction : les heures sont justes, et c'est
  // ce qui compte pour la paie. On le dit, sans prétendre que tout va bien.
  const { data: corr, error: corrErr } = await supabase.from('time_entry_corrections')
    .insert({
      company_id: entry.company_id,
      entry_id: entry.id,
      worker_id: entry.user_id,
      work_date: entry.work_date,
      corrected_by: correctorId,
      old_start: oldStart, old_end: oldEnd,
      new_start: newStart, new_end: newEnd,
      was_exported: !!entry.exported_at,
    })
    .select('id').maybeSingle();
  if (corrErr || !corr) {
    return {
      ok: true, notified: false,
      message: 'Heures corrigées, mais la correction n’a pas pu être inscrite — préviens le salarié toi-même.',
    };
  }

  // ── 3 · La notification ────────────────────────────────────────────────────
  const jour = new Date(`${entry.work_date}T00:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long',
  });
  const qui = auteur === 'bureau' ? 'Le bureau a corrigé' : 'Ton chef a corrigé';
  const texte = `${qui} tes heures du ${jour} : ${fmtHeure(oldStart)}–${fmtHeure(oldEnd)} → ${fmtHeure(newStart)}–${fmtHeure(newEnd)}`;

  let notified = false;
  let notifyError: string | null = null;
  try {
    const { data: sess } = await supabase.auth.getSession();
    const jeton = sess?.session?.access_token;
    if (!jeton) throw new Error('session absente');
    const { data: fn, error: fnErr } = await supabase.functions.invoke('send-push', {
      body: {
        user_ids: [entry.user_id],
        // JAMAIS VIDE. `send-push` refuse un titre vide en 400, et l'écran du
        // chef d'équipe n'a pas le nom de l'entreprise sous la main : sans ce
        // repli, sa notification échouerait à tous les coups — silencieusement
        // du point de vue du salarié, qui ne recevrait simplement rien.
        title: companyName || 'BEMEXO',
        body: texte,
        url: '/poseur',
        tag: `correction-${entry.work_date}`,
        // Requis quand l'appelant est un chef d'équipe ; inoffensif sinon.
        work_date: entry.work_date,
      },
    });
    if (fnErr) throw fnErr;
    // `sent: 0` n'est PAS une réussite : le salarié n'a aucun appareil abonné,
    // ou aucun n'a répondu. On refuse de compter ça comme « prévenu ».
    notified = ((fn as { sent?: number } | null)?.sent ?? 0) > 0;
    if (!notified) notifyError = 'aucun appareil joignable';
  } catch (e) {
    notifyError = (e as { message?: string })?.message || 'envoi impossible';
  }

  // ── 4 · L'issue, inscrite au journal ───────────────────────────────────────
  // Elle ne se réécrit qu'une fois (policy `notified_at IS NULL`). Si cette
  // écriture échoue, `notified_at` reste NULL : lisible comme « pas prévenu »,
  // ce qui est le plus prudent des deux malentendus possibles.
  await supabase.from('time_entry_corrections')
    .update(notified ? { notified_at: new Date().toISOString() } : { notify_error: notifyError })
    .eq('id', corr.id);

  return {
    ok: true,
    notified,
    message: notified
      ? 'Heures corrigées — le salarié est prévenu'
      : `Heures corrigées, mais le salarié n’a pas été prévenu (${notifyError}). Il le verra sur sa journée.`,
  };
}
