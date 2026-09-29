// Assistant BEMEXO salarié qui AGIT — l'EXÉCUTION, côté navigateur (lot 3 bis, lot 7).
//
// Chaque action passe par le code des écrans du salarié, avec SA session :
// lib/leave.ts, lib/live-session.ts, lib/worker-entry.ts, lib/worker-day.ts,
// lib/chantier-docs.ts. Jamais les données d'un collègue.
//
// Lot 7 : les gestes simples sont lancés tout de suite par l'écran ; chacun
// rend une VRAIE annulation (`undo`). Tout est noté dans `assistant_journal`.
import { supabase } from '@/lib/supabase';
import { requestLeave } from '@/lib/leave';
import { announceLiveChange, startLiveSession, stopLiveSession } from '@/lib/live-session';
import { markEntryReserve, updateEntryTimes } from '@/lib/worker-entry';
import { removeWorksiteDocument, uploadWorksiteDocument } from '@/lib/chantier-docs';
import { copyLinesTo, sendWorkerDay, setDayMealOnline } from '@/lib/worker-day';
import { createWorksite } from '@/lib/planning-writes';
import { geoInfoSeen } from '@/lib/position-info';
import type { WorkerActionDraft } from '@/supabase/functions/_shared/worker-assistant-core';

export interface WorkerActionResult {
  ok: boolean; message: string;
  /** Lot 6 : l'info « endroit » doit d'abord être montrée (CNIL). */
  geoInfoFor?: string;
  /** Lot 7 : vraie annulation de ce qui vient d'être fait. */
  undo?: () => Promise<{ ok: boolean; message: string }>;
}
export type WorkerActionExecutor = (d: WorkerActionDraft, attachment?: File) => Promise<WorkerActionResult>;

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const errText = (e: unknown, fallback: string) => (e as { message?: string } | null)?.message || fallback;

const SUMMARY: Record<WorkerActionDraft['type'], string> = {
  demander_conge: 'Demande de congé', commencer_pointage: 'Début de pointage', terminer_pointage: 'Fin de pointage',
  signaler_reserve: 'Réserve signalée', ranger_photo: 'Document rangé', envoyer_journee: 'Journée envoyée',
  modifier_heures: 'Horaires modifiés', panier_repas: 'Panier repas', copier_journee: 'Journée copiée',
  reserve_corrigee: 'Réserve corrigée sur place', nouveau_chantier: 'Nouveau chantier', email_client: 'Email du client',
};
async function journal(action: string, summary: string, undone = false) {
  const { error } = await supabase.rpc('assistant_journal_log', { p_action: action, p_summary: summary, p_undone: undone });
  return !error;
}

export function makeWorkerExecutor(user: { id: string; company_id: string }): WorkerActionExecutor {
  // Même interrupteur que l'écran « Pointer en direct » (réglage de l'entreprise).
  const positionActive = async () => {
    const { data } = await supabase.from('companies').select('position_tracking_enabled').eq('id', user.company_id).maybeSingle();
    return !!(data as { position_tracking_enabled?: boolean } | null)?.position_tracking_enabled;
  };
  const deleteDrafts = async (ids: string[]) => {
    if (!ids.length) return;
    const { error } = await supabase.from('time_entries').delete().in('id', ids).eq('user_id', user.id).eq('status', 'draft');
    if (error) throw error;
  };
  return async (d, attachment) => {
    let message = '';
    let undo: (() => Promise<void>) | undefined;
    try {
      switch (d.type) {
        case 'demander_conge': {
          await requestLeave({ type: d.conge_type, start: d.du, end: d.au, note: d.note });
          message = 'Demande envoyée au bureau.';
          // Annuler = « Annuler ma demande » (possible tant qu'elle attend).
          undo = async () => {
            const { data } = await supabase.from('leave_requests').select('id').eq('user_id', user.id).eq('status', 'pending')
              .eq('start_date', d.du).eq('end_date', d.au).order('created_at', { ascending: false }).limit(1);
            const id = (data as { id: string }[] | null)?.[0]?.id;
            if (!id) throw new Error('Demande déjà traitée par le bureau : elle ne peut plus être annulée d’ici.');
            const { error } = await supabase.from('leave_requests').delete().eq('id', id).select('id');
            if (error) throw error;
          };
          break;
        }
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
          if (r.running) return { ok: false, message: 'Un pointage est déjà en cours.' };
          message = 'Pointage démarré.';
          // Même geste que « Annuler le pointage ».
          undo = async () => {
            const { error } = await supabase.from('active_sessions').delete().eq('user_id', user.id);
            if (error) throw error;
            announceLiveChange();
          };
          break;
        }
        case 'terminer_pointage': {
          const row = await stopLiveSession({ startedAt: d.depuis, positionActive: await positionActive(), endTime: d.fin || undefined });
          announceLiveChange();
          message = row ? `Pointage fermé — ${row.start_time.slice(0, 5)} à ${row.end_time.slice(0, 5)}.` : 'Pointage fermé.';
          // Annuler : on retire la ligne créée et le chrono repart de l'heure d'origine.
          if (row && d.worksite_id) {
            undo = async () => {
              const { data } = await supabase.from('time_entries').select('id').eq('user_id', user.id).eq('work_date', today())
                .eq('start_time', row.start_time).eq('end_time', row.end_time).eq('status', 'draft').order('created_at', { ascending: false }).limit(1);
              const id = (data as { id: string }[] | null)?.[0]?.id;
              if (!id) throw new Error('La ligne a déjà été envoyée : corrigez-la dans « Ma journée ».');
              await deleteDrafts([id]);
              const { error } = await supabase.from('active_sessions').insert({
                user_id: user.id, company_id: user.company_id, worksite_id: d.worksite_id, planning_id: null, work_date: today(), started_at: d.depuis,
              });
              if (error) throw error;
              announceLiveChange();
            };
          }
          break;
        }
        case 'signaler_reserve': {
          const line = d.choix.find((c) => c.id === d.entry_id);
          const { data: prev } = await supabase.from('time_entries').select('reception, observation').eq('id', d.entry_id!).eq('user_id', user.id).maybeSingle();
          const ok = await markEntryReserve({ userId: user.id, entryId: d.entry_id!, detail: d.detail, wasSubmitted: !!line?.envoyee });
          if (!ok) return { ok: false, message: 'Ce chantier est verrouillé par le bureau.' };
          message = 'Réserve notée. Ajoutez des photos via « Documents » si besoin.';
          const p0 = prev as { reception: string | null; observation: string | null } | null;
          undo = async () => {
            const { error } = await supabase.from('time_entries').update({ reception: p0?.reception ?? null, observation: p0?.observation ?? null })
              .eq('id', d.entry_id!).eq('user_id', user.id);
            if (error) throw error;
          };
          break;
        }
        case 'ranger_photo': {
          if (!attachment) return { ok: false, message: 'Aucun fichier joint.' };
          const line = d.lignes.find((l) => l.chantier_id === d.worksite_id);
          // Même envoi que le bouton « Documents » : rattaché au jour et à SA ligne s'il y en a une.
          const doc = await uploadWorksiteDocument({
            companyId: user.company_id, userId: user.id, worksiteId: d.worksite_id!, file: attachment, workDate: today(), timeEntryId: line?.id ?? null,
            ...(d.categorie ? { category: d.categorie } : {}),
          });
          message = 'Document rangé dans le chantier.';
          let reserved = false;
          if (d.reserve && line) {
            reserved = await markEntryReserve({ userId: user.id, entryId: line.id, detail: d.detail, wasSubmitted: line.envoyee });
            message = reserved ? 'Photo rangée et réserve notée.' : 'Photo rangée. Réserve refusée : chantier verrouillé par le bureau.';
          }
          undo = async () => {
            await removeWorksiteDocument(doc.id, doc.path);
            if (reserved && line && !line.reserve) {
              await supabase.from('time_entries').update({ reception: null }).eq('id', line.id).eq('user_id', user.id);
            }
          };
          break;
        }
        // ── Lot 7 ──
        case 'envoyer_journee': {
          const r = await sendWorkerDay(user, d.date);
          if (r.expected === 0) return { ok: false, message: 'Rien à envoyer : notez d’abord vos heures.' };
          if (r.sent === 0) return { ok: false, message: 'Rien n’a été envoyé : la journée est verrouillée ou a changé.' };
          message = r.sent < r.expected ? `${r.sent} chantier(s) envoyé(s) sur ${r.expected} — les autres sont verrouillés.` : 'Journée envoyée au bureau.';
          break;
        }
        case 'modifier_heures': {
          const line = d.choix.find((c) => c.id === d.entry_id)!;
          const ok = await updateEntryTimes({ userId: user.id, entryId: line.id, start: d.debut, end: d.fin, wasSubmitted: line.envoyee });
          if (!ok) return { ok: false, message: 'Cette ligne est verrouillée par le bureau.' };
          message = `Horaires changés : ${d.debut} → ${d.fin}.`;
          undo = async () => {
            const back = await updateEntryTimes({ userId: user.id, entryId: line.id, start: line.debut, end: line.fin, wasSubmitted: line.envoyee });
            if (!back) throw new Error('Ligne verrouillée entre-temps.');
          };
          break;
        }
        case 'panier_repas': {
          const { data: before } = await supabase.from('time_entries').select('meal_allowance').eq('user_id', user.id).eq('work_date', today()).eq('meal_allowance', true).limit(1);
          const had = !!(before && before.length);
          const ok = await setDayMealOnline(user, today(), d.valeur);
          if (!ok) return { ok: false, message: 'Panier non pris en compte (journée verrouillée).' };
          message = d.valeur ? 'Panier repas coché.' : 'Panier repas retiré.';
          undo = async () => { if (!(await setDayMealOnline(user, today(), had))) throw new Error('Journée verrouillée.'); };
          break;
        }
        case 'copier_journee': {
          const { data: src, error } = await supabase.from('time_entries').select('worksite_id, start_time, end_time, observation')
            .eq('user_id', user.id).eq('work_date', d.depuis).neq('status', 'cancelled').order('start_time');
          if (error) throw error;
          if (!src || !src.length) return { ok: false, message: 'Rien à copier ce jour-là.' };
          const ids = await copyLinesTo(user, src as { worksite_id: string | null; start_time: string; end_time: string; observation: string | null }[], d.vers);
          message = `${src.length} ligne${src.length > 1 ? 's' : ''} copiée${src.length > 1 ? 's' : ''} sur ${d.vers.length} jour${d.vers.length > 1 ? 's' : ''}.`;
          undo = () => deleteDrafts(ids);
          break;
        }
        case 'reserve_corrigee': {
          const { error } = await supabase.rpc('mark_reserve_fixed', { p_entry_id: d.entry_id, p_fixed: true, p_note: null });
          if (error) throw error;
          message = 'Réserve marquée « corrigée sur place ».';
          undo = async () => {
            const { error: e2 } = await supabase.rpc('mark_reserve_fixed', { p_entry_id: d.entry_id, p_fixed: false, p_note: null });
            if (e2) throw e2;
          };
          break;
        }
        case 'nouveau_chantier':
          await createWorksite(user.company_id, { client_name: d.nom, city: d.ville });
          message = `Chantier « ${d.nom} » ajouté.`;
          break;
        case 'email_client': {
          const { error } = await supabase.rpc('set_worksite_client_email', { p_worksite_id: d.worksite_id, p_email: d.email });
          if (error) throw error;
          message = 'Email du client enregistré.';
          break;
        }
      }
    } catch (e) {
      return { ok: false, message: errText(e, 'Action impossible.') };
    }
    const summary = `${SUMMARY[d.type]}${message ? ` — ${message}` : ''}`.slice(0, 380);
    await journal(d.type, summary);
    const result: WorkerActionResult = { ok: true, message };
    if (undo) {
      const run = undo;
      result.undo = async () => {
        try { await run(); } catch (e) { return { ok: false, message: errText(e, 'Annulation impossible.') }; }
        await journal(d.type, summary, true);
        return { ok: true, message: 'Annulé : c’est comme avant.' };
      };
    }
    return result;
  };
}

export const demoWorkerExecutor: WorkerActionExecutor = async (d) => {
  await new Promise((r) => setTimeout(r, 400));
  const confirmOnly = ['envoyer_journee', 'nouveau_chantier', 'email_client'].includes(d.type);
  return {
    ok: true, message: `${SUMMARY[d.type]} (démo, rien n’est écrit).`,
    ...(confirmOnly ? {} : { undo: async () => { await new Promise((r) => setTimeout(r, 300)); return { ok: true, message: 'Annulé (démo).' }; } }),
  };
};
