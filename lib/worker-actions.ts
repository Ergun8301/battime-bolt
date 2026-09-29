// Assistant BEMEXO salarié qui AGIT (lot 3 bis) — l'EXÉCUTION, côté navigateur.
// Rien ne part sans « Confirmer ». Chaque action passe par le code des écrans
// du salarié, avec SA session : lib/leave.ts, lib/live-session.ts,
// lib/worker-entry.ts. Jamais les données d'un collègue.
import { supabase } from '@/lib/supabase';
import { requestLeave } from '@/lib/leave';
import { announceLiveChange, startLiveSession, stopLiveSession } from '@/lib/live-session';
import { markEntryReserve } from '@/lib/worker-entry';
import { uploadWorksiteDocument } from '@/lib/chantier-docs';
import { geoInfoSeen } from '@/lib/position-info';
import type { WorkerActionDraft } from '@/supabase/functions/_shared/worker-assistant-core';

export interface WorkerActionResult { ok: boolean; message: string; /** Lot 6 : l'info « endroit » doit d'abord être montrée (CNIL). */ geoInfoFor?: string }
export type WorkerActionExecutor = (d: WorkerActionDraft, attachment?: File) => Promise<WorkerActionResult>;

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const errText = (e: unknown, fallback: string) => (e as { message?: string } | null)?.message || fallback;

export function makeWorkerExecutor(user: { id: string; company_id: string }): WorkerActionExecutor {
  // Même interrupteur que l'écran « Pointer en direct » (réglage de l'entreprise).
  const positionActive = async () => {
    const { data } = await supabase.from('companies').select('position_tracking_enabled').eq('id', user.company_id).maybeSingle();
    return !!(data as { position_tracking_enabled?: boolean } | null)?.position_tracking_enabled;
  };
  return async (d, attachment) => {
    try {
      switch (d.type) {
        case 'demander_conge':
          await requestLeave({ type: d.conge_type, start: d.du, end: d.au, note: d.note });
          return { ok: true, message: 'Demande envoyée au bureau.' };
        case 'commencer_pointage': {
          const day = today();
          const { data: plans } = await supabase.from('planning').select('id, worksite_id').eq('user_id', user.id).eq('work_date', day);
          const planningId = ((plans || []) as { id: string; worksite_id: string | null }[]).find((p) => p.worksite_id === d.worksite_id)?.id ?? null;
          const pos = await positionActive();
          // Même règle que « Je commence » : l'information AVANT la première collecte.
          if (pos && !geoInfoSeen(user.id)) return { ok: false, message: '', geoInfoFor: user.id };
          const r = await startLiveSession({
            userId: user.id, companyId: user.company_id, worksiteId: d.worksite_id!, planningId, workDate: day, positionActive: pos,
          });
          announceLiveChange();
          return r.running ? { ok: false, message: 'Un pointage est déjà en cours.' } : { ok: true, message: 'Pointage démarré.' };
        }
        case 'terminer_pointage': {
          const row = await stopLiveSession({ startedAt: d.depuis, positionActive: await positionActive(), endTime: d.fin || undefined });
          announceLiveChange();
          return { ok: true, message: row ? `Pointage fermé — ${row.start_time.slice(0, 5)} à ${row.end_time.slice(0, 5)}.` : 'Pointage fermé.' };
        }
        case 'signaler_reserve': {
          const line = d.choix.find((c) => c.id === d.entry_id);
          const ok = await markEntryReserve({ userId: user.id, entryId: d.entry_id!, detail: d.detail, wasSubmitted: !!line?.envoyee });
          return ok ? { ok: true, message: 'Réserve notée. Ajoutez des photos via « Documents » si besoin.' }
            : { ok: false, message: 'Ce chantier est verrouillé par le bureau.' };
        }
        case 'ranger_photo': {
          if (!attachment) return { ok: false, message: 'Aucun fichier joint.' };
          const line = d.lignes.find((l) => l.chantier_id === d.worksite_id);
          // Même envoi que le bouton « Documents » : rattaché au jour et à SA ligne s'il y en a une.
          await uploadWorksiteDocument({ companyId: user.company_id, userId: user.id, worksiteId: d.worksite_id!, file: attachment, workDate: today(), timeEntryId: line?.id ?? null });
          if (d.reserve && line) {
            const ok = await markEntryReserve({ userId: user.id, entryId: line.id, detail: d.detail, wasSubmitted: line.envoyee });
            return ok ? { ok: true, message: 'Photo rangée et réserve notée.' } : { ok: true, message: 'Photo rangée. Réserve refusée : chantier verrouillé par le bureau.' };
          }
          return { ok: true, message: 'Photo rangée dans les documents du chantier.' };
        }
      }
    } catch (e) {
      return { ok: false, message: errText(e, 'Action impossible.') };
    }
    return { ok: false, message: 'Action inconnue.' };
  };
}

export const demoWorkerExecutor: WorkerActionExecutor = async () => {
  await new Promise((r) => setTimeout(r, 400));
  return { ok: true, message: 'Fait (démo, rien n’est écrit).' };
};
