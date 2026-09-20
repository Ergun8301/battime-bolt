// Envoi différé des saisies faites sans réseau.
//
// Avant : la synchronisation ne regardait QUE le jour affiché à l'écran. Une
// journée saisie lundi sur un chantier sans réseau ne repartait jamais si le
// salarié rouvrait l'application le mardi — les heures restaient sur le
// téléphone, invisibles du bureau, et personne n'en savait rien.
//
// Maintenant : tout ce qui attend part, quel que soit le jour, dès qu'il y a du
// réseau — au lancement de l'application, au retour du réseau, et au retour au
// premier plan. Une seule synchronisation à la fois (verrou de module) : sans
// ça, deux écrans montés en même temps inséraient la même ligne deux fois.
//
// Doublons : chaque saisie porte son identifiant local (`client_id`). Un index
// unique côté base fait que la même saisie ne peut pas entrer deux fois, même
// si la réponse du serveur se perd et que le téléphone réessaie.

import { supabase } from '@/lib/supabase';
import {
  getPendingEntries, removePendingEntry, updatePendingEntry,
  OFFLINE_SYNCED_EVENT, type PendingEntry,
} from '@/lib/offline-store';

/** Au-delà, on arrête de réessayer en silence et on le dit au salarié. */
export const MAX_ATTEMPTS = 5;

export type SyncResult = {
  synced: number;
  /** Échecs temporaires : réseau, serveur indisponible. On réessaiera. */
  retrying: number;
  /** Saisies bloquées : elles ne passeront pas sans intervention. */
  blocked: PendingEntry[];
};

const EMPTY: SyncResult = { synced: 0, retrying: 0, blocked: [] };

// Verrou de module : une seule synchronisation à la fois pour tout l'onglet.
let running = false;

type PgError = { code?: string; message?: string; details?: string };

/** L'index unique « un panier par jour » a rejeté la ligne. */
function isMealConflict(e: PgError): boolean {
  return e.code === '23505' && `${e.message} ${e.details}`.includes('one_meal_per_day');
}

/** La saisie est déjà arrivée au serveur lors d'une tentative précédente. */
function isAlreadySent(e: PgError): boolean {
  return e.code === '23505' && `${e.message} ${e.details}`.includes('client_id');
}

/** La colonne client_id n'existe pas encore en base (SQL pas encore passé). */
function isMissingClientId(e: PgError): boolean {
  return e.code === 'PGRST204' && `${e.message}`.includes('client_id');
}

/**
 * Rien ne sert de réessayer : la journée est verrouillée ou exportée, le
 * chantier a été supprimé, ou la base refuse la ligne telle quelle.
 */
function isPermanent(e: PgError): boolean {
  if (!e.code) return false;
  return ['23503', '23514', '42501', '23502'].includes(e.code) || e.code.startsWith('P0');
}

/**
 * La ligne vient d'arriver en base, en BROUILLON. Le salarié, lui, avait déjà
 * appuyé sur « Envoyer ma journée » — sans réseau. On termine donc son geste.
 *
 * POURQUOI EN DEUX TEMPS. La politique RLS `time_entries_worker_insert` impose
 * `status = 'draft'` : insérer directement une ligne envoyée est REFUSÉ (vérifié
 * en base, pas supposé). C'est aussi la seule façon d'obtenir un `submitted_at`
 * correct — le garde en base l'efface à l'insertion et ne le pose que sur la
 * bascule brouillon → envoyée.
 *
 * On vise la ligne par son `client_id` : il vaut le `localId` et couvre aussi le
 * cas « elle était déjà arrivée ». Sur une base trop ancienne pour avoir cette
 * colonne, l'insertion s'est faite sans elle : la bascule ne trouve rien et la
 * ligne reste en brouillon — visible dans le bandeau, donc jamais perdue.
 */
async function markSubmittedAfterSync(userId: string, localId: string): Promise<void> {
  try {
    await supabase.from('time_entries')
      .update({ status: 'submitted' })
      .eq('client_id', localId).eq('user_id', userId).eq('status', 'draft');
  } catch {
    // Jamais bloquant : la ligne est en base, c'est l'essentiel. Au pire elle
    // reste à envoyer et le salarié le voit dans son bandeau.
  }
}

/**
 * Envoie TOUTES les saisies en attente de ce salarié, quel que soit leur jour.
 * Ne lève jamais : les échecs sont comptés et rendus à l'appelant.
 */
export async function syncAllPending(userId: string): Promise<SyncResult> {
  if (typeof window === 'undefined' || !navigator.onLine || running) return EMPTY;
  const pending = getPendingEntries(userId);
  if (pending.length === 0) return EMPTY;

  running = true;
  let synced = 0;
  let retrying = 0;
  const blocked: PendingEntry[] = [];

  try {
    for (const entry of pending) {
      // Refus définitif déjà constaté : on n'insiste pas tout seul. Le salarié
      // peut forcer une nouvelle tentative depuis le bandeau (unblockPendingEntries).
      if (entry.blocked) { blocked.push(entry); continue; }
      const base = {
        company_id: entry.company_id,
        user_id: entry.user_id,
        worksite_id: entry.worksite_id,
        planning_id: entry.planning_id,
        work_date: entry.work_date,
        start_time: entry.start_time,
        end_time: entry.end_time,
        break_minutes: 0,
        // total_minutes est une colonne calculée en base — jamais envoyée.
        meal_allowance: entry.meal_allowance,
        observation: entry.observation,
        reception: entry.reception ?? null,
        gap_before: entry.gap_before ?? null,
        status: 'draft' as const,
      };

      try {
        let { error } = await supabase.from('time_entries').insert({ ...base, client_id: entry.localId });

        if (error && isMissingClientId(error)) {
          // Base pas encore migrée : on envoie sans l'identifiant local.
          ({ error } = await supabase.from('time_entries').insert(base));
        }
        if (error && isAlreadySent(error)) {
          // Déjà arrivée : la tentative précédente avait réussi sans qu'on le sache.
          if (entry.submit_after_sync) await markSubmittedAfterSync(userId, entry.localId);
          removePendingEntry(userId, entry.localId);
          synced++;
          continue;
        }
        if (error && isMealConflict(error)) {
          // Un panier existe déjà ce jour-là : on garde celui du serveur.
          ({ error } = await supabase.from('time_entries')
            .insert({ ...base, client_id: entry.localId, meal_allowance: false }));
          if (error && isMissingClientId(error)) {
            ({ error } = await supabase.from('time_entries').insert({ ...base, meal_allowance: false }));
          }
        }

        if (!error) {
          if (entry.submit_after_sync) await markSubmittedAfterSync(userId, entry.localId);
          removePendingEntry(userId, entry.localId);
          synced++;
          continue;
        }

        const attempts = (entry.attempts || 0) + 1;
        const stop = isPermanent(error) || attempts >= MAX_ATTEMPTS;
        updatePendingEntry(userId, entry.localId, { attempts, lastError: error.message, blocked: stop });
        if (stop) blocked.push({ ...entry, attempts, blocked: true });
        else retrying++;
      } catch (e) {
        // Coupure en plein envoi : temporaire, on retentera.
        const attempts = (entry.attempts || 0) + 1;
        const stop = attempts >= MAX_ATTEMPTS;
        updatePendingEntry(userId, entry.localId, { attempts, lastError: String(e), blocked: stop });
        if (stop) blocked.push({ ...entry, attempts, blocked: true });
        else retrying++;
      }
    }
  } finally {
    running = false;
  }

  // Prévient les écrans montés (« Ma journée » notamment) : sans ce signal, la
  // carte « en attente » restait affichée et comptée alors que la ligne était
  // déjà partie, et le bouton d'envoi ne faisait plus rien.
  if (synced > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OFFLINE_SYNCED_EVENT));
  }

  return { synced, retrying, blocked };
}
