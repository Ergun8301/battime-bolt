// Lot 11 — « Lever la réserve » : UN seul chemin, pour le bureau ET pour le
// salarié (même formulaire, même ordre, mêmes garde-fous).
//
//   1. la photo (facultative) part d'abord : un document du chantier rattaché à
//      l'intervention de la réserve, catégorie « réserve », nommé
//      « Réserve levée — jj/mm/aaaa » (le nom d'un document ne change plus) ;
//   2. puis la levée elle-même, par les fonctions serveur déjà en production :
//        bureau  → set_reserve_resolution(id, true, commentaire)
//        salarié → mark_reserve_fixed(id, true, commentaire)
//      (qui a levé, quand, et le commentaire sont posés par le serveur) ;
//   3. si la levée est refusée, la photo envoyée est retirée : pas de photo
//      « réserve levée » pour une réserve qui ne l'est pas.
//
// Aucune nouvelle fonction en base, aucun déclencheur : voir lib/reserves.ts
// pour la définition partagée de « levée ».
import { supabase } from '@/lib/supabase';
import { uploadWorksiteDocument, removeWorksiteDocument, downscaleImage } from '@/lib/chantier-docs';
import { RESERVE_LIFT_LABEL } from '@/lib/reserves';

export interface LiftedPhoto { id: string; path: string }

/**
 * Côté salarié, deux écrans montrent les mêmes réserves (la carte de « Ma
 * journée » et le bandeau « réserves à lever ») : celui qui lève prévient
 * l'autre, qui relit (sans clignoter : les relectures passent par keep()).
 */
export const RESERVES_CHANGED_EVENT = 'bemexo:reserves-changed';
export const announceReservesChanged = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(RESERVES_CHANGED_EVENT));
};

/** « Réserve levée — 02/10/2026 » (jour de Paris). */
export const liftPhotoLabel = (d: Date = new Date()) =>
  `${RESERVE_LIFT_LABEL} — ${d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' })}`;

/** Erreur à l'étape photo : la réserve n'a PAS été levée. */
export class LiftPhotoError extends Error {
  constructor(public original: unknown) { super('photo'); this.name = 'LiftPhotoError'; }
}

export async function liftReserve(p: {
  role: 'admin' | 'worker';
  companyId: string;
  userId: string;
  entryId: string;
  worksiteId: string | null;
  note?: string | null;
  photo?: File | null;
}): Promise<{ photo: LiftedPhoto | null }> {
  const note = (p.note ?? '').trim() || null;
  let photo: LiftedPhoto | null = null;
  if (p.photo) {
    if (!p.worksiteId) throw new LiftPhotoError(new Error('Chantier introuvable'));
    try {
      const file = await downscaleImage(p.photo);
      const up = await uploadWorksiteDocument({
        companyId: p.companyId, userId: p.userId, worksiteId: p.worksiteId, file,
        timeEntryId: p.entryId, category: 'reserve', label: liftPhotoLabel(),
      });
      photo = { id: up.id, path: up.path };
    } catch (e) {
      throw new LiftPhotoError(e);
    }
  }
  const { error } = p.role === 'admin'
    ? await supabase.rpc('set_reserve_resolution', { p_entry_id: p.entryId, p_resolved: true, p_note: note })
    : await supabase.rpc('mark_reserve_fixed', { p_entry_id: p.entryId, p_fixed: true, p_note: note });
  if (error) {
    if (photo) { try { await removeWorksiteDocument(photo.id, photo.path); } catch { /* le refus compte plus que le ménage */ } }
    throw error;
  }
  return { photo };
}

/**
 * « Annuler » (10 s, salarié) : la réserve revient « à lever ». La fonction
 * serveur refuse si le bureau l'a levée entre-temps (« déjà été levée par le
 * bureau ») — on le dit tel quel. La photo de cette levée est retirée avec.
 */
export async function undoWorkerLift(entryId: string, photo: LiftedPhoto | null): Promise<void> {
  const { error } = await supabase.rpc('mark_reserve_fixed', { p_entry_id: entryId, p_fixed: false, p_note: null });
  if (error) throw error;
  if (photo) { try { await removeWorksiteDocument(photo.id, photo.path); } catch { /* document resté : visible dans « Documents » */ } }
}

/**
 * « Rouvrir » (bureau) : efface les DEUX levées (bureau et salarié) en une
 * écriture — `set_reserve_resolution(false)` seul laisserait la levée du
 * salarié, et la réserve resterait dans « Levées ». Écriture directe permise à
 * l'administrateur (politique admin) ; aucune heure n'est touchée. Les photos
 * restent dans les documents du chantier (rien n'est supprimé).
 */
export async function reopenReserve(entryId: string): Promise<void> {
  // Seules les DATES de levée sont retirées : le commentaire du salarié et
  // celui du bureau restent en base (aucune donnée effacée). Les écrans ne les
  // montrent que pour une réserve levée (lib/reserves liftedNote), et une
  // nouvelle levée les remplace.
  const { data, error } = await supabase.from('time_entries').update({
    reserve_resolved_at: null, reserve_resolved_by: null,
    reserve_fixed_at: null, reserve_fixed_by: null,
  }).eq('id', entryId).select('id');
  if (error) throw error;
  if (!data || !data.length) throw new Error('Réserve introuvable.');
}

/** Un refus du serveur, en français de chantier. `tu` = côté salarié. */
export function liftErrorMessage(e: unknown, tu = false): string {
  if (e instanceof LiftPhotoError) {
    return tu
      ? 'La photo n’est pas partie : réserve pas encore levée. Réessaie (ou sans photo).'
      : 'La photo n’a pas pu être envoyée : la réserve n’est pas levée. Réessayez (ou sans photo).';
  }
  const msg = (e as { message?: string })?.message || '';
  if (/déjà été levée|vient d.être levée/.test(msg)) return 'Cette réserve a déjà été levée par le bureau.';
  if (/Seul le salarié/.test(msg)) return 'Seul le salarié de cette intervention peut lever cette réserve.';
  if (/ne porte pas de réserve/.test(msg)) return 'Cette intervention ne porte plus de réserve.';
  if (/introuvable/i.test(msg)) return 'Réserve introuvable (supprimée ?). Rechargez la page.';
  return tu ? 'Pas de réseau ou refus du serveur : réessaie.' : 'L’enregistrement a échoué. Réessayez.';
}
