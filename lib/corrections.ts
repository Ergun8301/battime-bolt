// Corriger les heures de quelqu'un d'autre, et le lui dire.
//
// POURQUOI CE FICHIER EXISTE. Deux écrans corrigent les heures d'un salarié :
// la fiche salarié (le bureau) et « Mon équipe aujourd'hui » (le chef
// d'équipe). Écrire la séquence deux fois, c'est garantir qu'un jour l'une des
// deux oubliera d'inscrire l'historique ou de notifier — et ce jour-là, un
// salarié verra ses heures changer sans explication.
//
// DEUX RÈGLES, ET IL FAUT LES DISTINGUER :
//
//   · PAS DE TRACE, PAS DE CORRECTION. Les heures et le journal s'écrivent dans
//     la MÊME transaction, par `correct_time_entry`. Deux appels séparés
//     n'auraient pas été une opération : entre les deux, le journal peut
//     échouer — réseau coupé, ou migration pas encore appliquée — et les heures
//     changeraient sans trace ni notification, soit exactement l'état que cette
//     étape existe pour supprimer. Tant que la migration n'est pas passée, la
//     fonction n'existe pas, l'appel échoue, et RIEN ne bouge.
//
//   · LA CORRECTION TIENT MÊME SI LA NOTIFICATION ÉCHOUE. Elle, en revanche,
//     ne doit pas dépendre de l'état du téléphone du salarié. Mais l'échec ne
//     se tait pas : il s'inscrit dans `notify_error`, `notified_at` reste NULL,
//     et les deux écrans le montrent.

import { supabase } from '@/lib/supabase';

/** Deux points dans la journée, au format que le salarié lit : « 9h00 ». */
export function fmtHeure(hhmm: string): string {
  const [h, m] = (hhmm || '').slice(0, 5).split(':');
  return `${Number(h)}h${m ?? '00'}`;
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
 * ON N'ENVOIE QUE L'IDENTIFIANT DE LA LIGNE, ET DEUX HEURES. Ni le salarié
 * concerné, ni la société, ni le rôle de celui qui corrige : le serveur lit
 * tout ça lui-même, dans la ligne et dans la session. Les faire transiter par
 * ici aurait laissé croire qu'ils comptent — et un appelant qui se trompe de
 * `company_id` aurait fabriqué une trace fausse au lieu d'échouer.
 *
 * L'ORDRE N'EST PAS ARBITRAIRE :
 *
 *   1. On corrige ET on inscrit au journal, en une seule transaction.
 *   2. On notifie.
 *   3. On inscrit l'issue de l'envoi sur la ligne de journal.
 *
 * Si l'étape 2 ou 3 échoue, l'étape 1 tient : la correction est faite et
 * tracée, et `notified_at` reste NULL. C'est exactement ce qu'on veut savoir.
 */
export async function corrigerHeures(params: {
  entryId: string;
  newStart: string;
  newEnd: string;
}): Promise<CorrectionResult> {
  const { entryId, newStart, newEnd } = params;

  // ── 1 · Corriger ET inscrire, en un seul geste ─────────────────────────────
  // Le serveur vérifie lui-même qui a le droit de corriger qui : on ne lui
  // envoie ni rôle ni identité, il les lit dans la session.
  const { data, error } = await supabase.rpc('correct_time_entry', {
    p_entry_id: entryId,
    p_start: newStart,
    p_end: newEnd,
  });
  if (error) {
    // Message du serveur tel quel : il est déjà écrit pour être lu.
    return { ok: false, notified: false, message: error.message || 'Correction impossible.' };
  }
  const corr = (Array.isArray(data) ? data[0] : data) as {
    correction_id: string; old_start: string; old_end: string;
    new_start: string; new_end: string; corrected_by_role: 'admin' | 'lead';
  } | null;
  if (!corr) {
    return { ok: false, notified: false, message: 'Correction impossible.' };
  }

  // ── 2 · Prévenir ───────────────────────────────────────────────────────────
  // On n'envoie QUE l'identifiant de la correction. Le texte, le destinataire
  // et le titre sont construits par le serveur à partir du journal : un
  // appelant ne peut donc pas se servir de ce chemin pour envoyer un message
  // de son choix à un collègue.
  let notified = false;
  let notifyError: string | null = null;
  try {
    const { data: fn, error: fnErr } = await supabase.functions.invoke('send-push', {
      body: { correction_id: corr.correction_id },
    });
    if (fnErr) throw fnErr;
    // `sent: 0` n'est PAS une réussite : aucun appareil abonné, ou aucun n'a
    // répondu. On refuse de compter ça comme « prévenu ».
    notified = ((fn as { sent?: number } | null)?.sent ?? 0) > 0;
    if (!notified) notifyError = 'aucun appareil joignable';
  } catch (e) {
    notifyError = (e as { message?: string })?.message || 'envoi impossible';
  }

  // ── 3 · L'issue, inscrite au journal ───────────────────────────────────────
  // Elle ne se réécrit qu'une fois (policy `notified_at IS NULL`). Si cette
  // écriture échoue, `notified_at` reste NULL : lisible comme « pas prévenu »,
  // le plus prudent des deux malentendus possibles.
  await supabase.from('time_entry_corrections')
    .update(notified ? { notified_at: new Date().toISOString() } : { notify_error: notifyError })
    .eq('id', corr.correction_id);

  return {
    ok: true,
    notified,
    message: notified
      ? 'Heures corrigées — le salarié est prévenu'
      : `Heures corrigées, mais le salarié n\u2019a pas été prévenu (${notifyError}). Il le verra sur sa journée.`,
  };
}
