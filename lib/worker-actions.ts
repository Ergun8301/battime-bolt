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
import { announceLiveChange, finishLiveSession, startLiveSession } from '@/lib/live-session';
import { parisHHmm } from '@/lib/utils';
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
  effacer_heures: 'Heures effacées', annuler_conge: 'Demande de congé annulée', modifier_conge: 'Demande de congé modifiée',
  annuler_pointage: 'Pointage annulé', retirer_photo: 'Document retiré', retirer_reserve: 'Réserve retirée',
};
async function journal(action: string, summary: string, undone = false) {
  const { error } = await supabase.rpc('assistant_journal_log', { p_action: action, p_summary: summary, p_undone: undone });
  return !error;
}

export function makeWorkerExecutor(user: { id: string; company_id: string }): WorkerActionExecutor {
  // Même interrupteur que « Je commence » sur l'écran (réglage de l'entreprise).
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
    // Lot 8 : l'annulation peut rendre son propre message.
    let undo: (() => Promise<void | string>) | undefined;
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
          // Lot 9 : même geste que « J'ai fini » (lib/live-session.ts) — à tout
          // moment, à la minute ; moins d'une minute = annulé, sans erreur.
          // Une fin donnée AVANT le début serait annulée sans un mot par le
          // serveur : on le dit d'abord, pour que l'heure soit corrigée.
          if (d.fin && d.fin <= parisHHmm(d.depuis)) {
            return { ok: false, message: `Heure de fin avant le début (${parisHHmm(d.depuis)}) : indiquez une heure après.` };
          }
          const r = await finishLiveSession({ userId: user.id, startedAt: d.depuis, positionActive: await positionActive(), endTime: d.fin || undefined });
          announceLiveChange();
          if (r.kind === 'stale') return { ok: false, message: 'Ce pointage était déjà fermé (borne ou autre appareil).' };
          if (r.kind === 'too_short') return { ok: false, message: 'Rien à compter pour l’instant : réessayez dans quelques minutes, ou annulez le pointage.' };
          // Rien n'a été écrit : « Annuler » remet simplement le chrono en route.
          const relancer = async () => {
            const { error } = await supabase.from('active_sessions').insert({
              user_id: user.id, company_id: user.company_id, worksite_id: d.worksite_id, planning_id: null, work_date: today(), started_at: d.depuis,
            });
            if (error) throw error;
            announceLiveChange();
          };
          if (r.kind === 'cancelled') {
            message = d.fin ? 'Pointage annulé : rien n’est noté.' : 'Pointage annulé (moins d’une minute) : rien n’est noté.';
            if (d.worksite_id) undo = relancer;
            break;
          }
          const row = r;
          message = `Pointage fermé — ${row.start_time.slice(0, 5)} à ${row.end_time.slice(0, 5)}.`;
          // Annuler : on retire la ligne créée et le chrono repart de l'heure d'origine.
          if (d.worksite_id) {
            undo = async () => {
              const { data } = await supabase.from('time_entries').select('id').eq('user_id', user.id).eq('work_date', today())
                .eq('start_time', row.start_time).eq('end_time', row.end_time).eq('status', 'draft').order('created_at', { ascending: false }).limit(1);
              const id = (data as { id: string }[] | null)?.[0]?.id;
              if (!id) throw new Error('La ligne a déjà été envoyée : corrigez-la dans « Ma journée ».');
              await deleteDrafts([id]);
              await relancer();
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
        // ── Lot 8 : effacer ce qu'il a saisi. Tout est LU avant : « Annuler » remet à l'identique. ──
        case 'effacer_heures': {
          let q = supabase.from('time_entries').select('*').eq('user_id', user.id).eq('work_date', d.date).eq('status', 'draft').eq('locked', false);
          if (!d.tout && d.entry_id) q = q.eq('id', d.entry_id);
          const { data: rows, error: readErr } = await q;
          if (readErr) throw readErr;
          const list = (rows ?? []) as (Record<string, unknown> & { id: string })[];
          if (!list.length) return { ok: false, message: 'Rien à effacer : les heures envoyées ne s’effacent plus (demandez au bureau de les corriger).' };
          const { data: gone, error } = await supabase.from('time_entries').delete().in('id', list.map((r) => r.id)).eq('user_id', user.id).eq('status', 'draft').select('id');
          if (error) throw error;
          const ids = new Set(((gone ?? []) as { id: string }[]).map((x) => x.id));
          const deleted = list.filter((r) => ids.has(r.id));
          if (!deleted.length) return { ok: false, message: 'Rien n’a été effacé : ces heures sont verrouillées par le bureau.' };
          message = `${deleted.length} ligne${deleted.length > 1 ? 's' : ''} effacée${deleted.length > 1 ? 's' : ''}.`;
          undo = async () => {
            // total_minutes est calculé par la base : on ne le renvoie pas.
            const back = deleted.map(({ total_minutes: _t, ...r }) => r);
            const { error: e } = await supabase.from('time_entries').insert(back);
            if (e) throw e;
          };
          break;
        }
        case 'annuler_conge':
        case 'modifier_conge': {
          const { data: prev, error: readErr } = await supabase.from('leave_requests').select('id, type, start_date, end_date, note').eq('id', d.leave_id!).eq('user_id', user.id).eq('status', 'pending').maybeSingle();
          if (readErr) throw readErr;
          const p0 = prev as { id: string; type: string; start_date: string; end_date: string; note: string | null } | null;
          if (!p0) return { ok: false, message: 'Demande déjà traitée par le bureau : elle ne peut plus être changée d’ici.' };
          const { data: gone, error } = await supabase.from('leave_requests').delete().eq('id', p0.id).select('id');
          if (error) throw error;
          if (!gone || gone.length === 0) return { ok: false, message: 'Demande déjà traitée par le bureau.' };
          if (d.type === 'modifier_conge') await requestLeave({ type: p0.type, start: d.du, end: d.au, note: p0.note });
          message = d.type === 'annuler_conge' ? 'Demande de congé annulée.' : 'Nouvelles dates envoyées au bureau.';
          undo = async () => {
            if (d.type === 'modifier_conge') {
              const { data } = await supabase.from('leave_requests').select('id').eq('user_id', user.id).eq('status', 'pending')
                .eq('start_date', d.du).eq('end_date', d.au).order('created_at', { ascending: false }).limit(1);
              const id = (data as { id: string }[] | null)?.[0]?.id;
              if (id) await supabase.from('leave_requests').delete().eq('id', id);
            }
            // Même demande qu'avant (mêmes dates, même motif), par le même chemin que « Mes congés ».
            await requestLeave({ type: p0.type, start: p0.start_date, end: p0.end_date, note: p0.note });
          };
          break;
        }
        case 'annuler_pointage': {
          const { data: sess, error: readErr } = await supabase.from('active_sessions').select('*').eq('user_id', user.id).maybeSingle();
          if (readErr) throw readErr;
          if (!sess) return { ok: false, message: 'Aucun pointage en cours.' };
          const { error } = await supabase.from('active_sessions').delete().eq('user_id', user.id);
          if (error) throw error;
          announceLiveChange();
          message = 'Pointage annulé : rien n’est noté.';
          undo = async () => {
            const { error: e } = await supabase.from('active_sessions').insert(sess as Record<string, unknown>);
            if (e) throw e;
            announceLiveChange();
          };
          break;
        }
        case 'retirer_photo': {
          const { data: doc, error: readErr } = await supabase.from('documents').select('*').eq('id', d.document_id!).eq('uploaded_by', user.id).single();
          if (readErr) throw readErr;
          const row = doc as Record<string, unknown> & { id: string; file_path: string; label: string | null; file_name: string | null };
          const { data: blob, error: dlErr } = await supabase.storage.from('chantier-docs').download(row.file_path);
          if (dlErr || !blob) return { ok: false, message: 'Le fichier n’a pas pu être lu : rien n’a été retiré.' };
          const { data: gone, error } = await supabase.from('documents').delete().eq('id', row.id).select('id');
          if (error) throw error;
          if (!gone || gone.length === 0) return { ok: false, message: 'Retrait refusé : ce document n’est pas à vous.' };
          await supabase.storage.from('chantier-docs').remove([row.file_path]);
          message = `« ${row.label || row.file_name || 'Document'} » retiré.`;
          undo = async () => {
            const up = await supabase.storage.from('chantier-docs').upload(row.file_path, blob, { upsert: true, contentType: blob.type || undefined });
            if (up.error) throw up.error;
            const { error: e } = await supabase.from('documents').insert(row);
            if (e) throw e;
          };
          break;
        }
        case 'retirer_reserve': {
          const { data: prev } = await supabase.from('time_entries').select('reception, observation').eq('id', d.entry_id!).eq('user_id', user.id).eq('status', 'draft').maybeSingle();
          const p0 = prev as { reception: string | null; observation: string | null } | null;
          if (!p0) return { ok: false, message: 'Cette journée est envoyée : la réserve se voit avec le bureau.' };
          const { data: upd, error } = await supabase.from('time_entries').update({ reception: null }).eq('id', d.entry_id!).eq('user_id', user.id).eq('status', 'draft').select('id');
          if (error) throw error;
          if (!upd || upd.length === 0) return { ok: false, message: 'Ce chantier est verrouillé par le bureau.' };
          message = 'Réserve retirée.';
          undo = async () => {
            const { error: e } = await supabase.from('time_entries').update({ reception: p0.reception, observation: p0.observation }).eq('id', d.entry_id!).eq('user_id', user.id);
            if (e) throw e;
          };
          break;
        }
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
        let said: void | string;
        try { said = await run(); } catch (e) { return { ok: false, message: errText(e, 'Annulation impossible.') }; }
        await journal(d.type, summary, true);
        return { ok: true, message: typeof said === 'string' ? said : 'Annulé : c’est comme avant.' };
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
