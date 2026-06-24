'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';
import { TimeEntry, Worksite, Planning } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Copy, AlertTriangle } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  addPendingEntry, getPendingEntries, removePendingEntry, clearPendingEntriesForDate,
  generateLocalId, PendingEntry,
} from '@/lib/offline-store';
import { TimeCylinder, snapToGrid } from '@/components/time-cylinder';

interface TimeEntryWithWorksite extends TimeEntry {
  worksite: Worksite;
}

// "h" format for the editor duration boxes (ex: 4h00).
function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}
// ":" format used everywhere on « Ma journée » (ex: 6:45).
function fmtHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

// Worked duration of a slot (break is always 0 in the slot model).
function calculateTotalMinutes(start: string, end: string, breakMins: number): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e < s) e += 24 * 60;
  return Math.max(0, e - s - breakMins);
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

// Pauses = the gaps between consecutive (sorted) slots. Computed, never stored.
function computePauses(slots: { start: string; end: string }[]) {
  const sorted = slots.filter((s) => s.start && s.end).sort((a, b) => a.start.localeCompare(b.start));
  const out: { start: string; end: string; minutes: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = toMin(sorted[i].start) - toMin(sorted[i - 1].end);
    if (gap > 0) out.push({ start: sorted[i - 1].end, end: sorted[i].start, minutes: gap });
  }
  return out;
}

const DAY_CSS = `
.bt-day{display:flex;flex-direction:column;height:100%;min-height:0;flex:1}
.bt-day-scroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px 16px 6px}
.bt-day-scroll::-webkit-scrollbar{display:none}

.bt-net{flex:none;color:#fff;padding:7px 18px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700}
.bt-net-off{background:#C0461F}
.bt-net-sync{background:#2a2620;color:#FFC21A}
.bt-net-dot{width:7px;height:7px;background:currentColor;border-radius:50%;flex:none}

.bt-total{background:#15120F;color:#F2EDE3;border-radius:20px;padding:20px;position:relative;overflow:hidden}
.bt-total-ruban{position:absolute;top:0;right:0;width:88px;height:9px;background:repeating-linear-gradient(45deg,#15120F 0 7px,#FFC21A 7px 14px)}
.bt-total-k{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#a59c86;margin-bottom:8px}
.bt-total-big{font-family:'JetBrains Mono',monospace;font-size:52px;font-weight:700;letter-spacing:-.02em;line-height:.9}
.bt-total-unit{font-size:15px;font-weight:700;color:#a59c86;margin-left:4px}
.bt-stats{display:flex;gap:8px;margin-top:16px}
.bt-stat{flex:1;background:#211D19;border-radius:11px;padding:10px 12px}
.bt-stat-n{font-family:'JetBrains Mono',monospace;font-size:19px;font-weight:700;color:#F2EDE3;line-height:1}
.bt-stat-l{font-size:11px;font-weight:600;color:#a59c86;margin-top:2px}
.bt-stat.on{background:#FFC21A}
.bt-stat.on .bt-stat-n{color:#15120F;font-family:'Archivo',sans-serif;font-size:16px;font-weight:900;line-height:1.1}
.bt-stat.on .bt-stat-l{color:#7a5e00;font-weight:700}

.bt-meal{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:14px;padding:13px 15px;margin-top:12px}
.bt-meal-emoji{font-size:22px}
.bt-meal-t{font-size:15px;font-weight:800;color:#15120F}
.bt-meal-s{font-size:12.5px;color:#6E6A63;font-weight:500}
.bt-switch{width:54px;height:31px;background:#cfc8b8;border-radius:30px;position:relative;flex:none;border:none;cursor:pointer;transition:background .15s;padding:0}
.bt-switch.on{background:#15120F}
.bt-switch i{position:absolute;top:3px;left:3px;width:25px;height:25px;background:#fff;border-radius:50%;transition:left .15s,background .15s}
.bt-switch.on i{left:26px;background:#FFC21A}

.bt-sec{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#9a8a3a;font-weight:700;margin:24px 4px 12px}

.bt-iv{background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:16px;padding:15px;margin-bottom:11px}
.bt-iv.draft{background:#FFFDF6;border:1.5px dashed #E0AE1C}
.bt-iv.off{background:#FFFBF4;border:1.5px dashed #C0461F}
.bt-iv-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
.bt-iv-name{font-size:17px;font-weight:800;letter-spacing:-.01em;color:#15120F}
.bt-iv-city{font-size:13px;color:#6E6A63;font-weight:600}
.bt-badge{flex:none;display:flex;align-items:center;gap:5px;border-radius:7px;padding:4px 9px;font-size:11px;font-weight:800;white-space:nowrap}
.bt-badge-sent{background:#E4F2E9;border:1px solid #B7DCC4;color:#1F7A4D}
.bt-badge-sent .dot{width:14px;height:14px;background:#2FA36B;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:900}
.bt-badge-draft{background:#FFF1CC;border:1px solid #E8CE7A;color:#8a6d05}
.bt-badge-off{background:#FBE3D8;border:1px solid #E8B79E;color:#9a3b14}
.bt-iv-times{display:flex;align-items:center;gap:14px;border-top:1px solid rgba(21,18,15,.08);padding-top:10px;font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:#15120F}
.bt-iv-times .dot{width:4px;height:4px;background:#c4bdae;border-radius:50%}
.bt-iv-note{font-size:13px;color:#6E6A63;margin-top:8px}
.bt-iv-acts{display:flex;gap:8px;margin-top:12px}
.bt-iv-mod{flex:1;border:1.5px solid #15120F;background:transparent;border-radius:10px;padding:10px;font-weight:800;font-size:13.5px;color:#15120F;cursor:pointer;font-family:inherit}
.bt-iv-del{flex:none;border:none;background:#15120F;border-radius:10px;padding:10px 13px;font-weight:800;font-size:13.5px;color:#F2EDE3;cursor:pointer;font-family:inherit}

.bt-iv-cancel{background:transparent;border:1px solid rgba(21,18,15,.12);border-radius:16px;padding:13px 15px;margin-bottom:11px;opacity:.55;display:flex;align-items:center;justify-content:space-between;gap:10px}
.bt-cancel-name{font-size:16px;font-weight:800;color:#6E6A63;text-decoration:line-through}
.bt-cancel-time{font-family:'JetBrains Mono',monospace;font-size:12.5px;color:#9a948a;font-weight:600;text-decoration:line-through}
.bt-cancel-badge{flex:none;font-size:11px;font-weight:800;color:#9a948a;border:1px solid rgba(21,18,15,.18);border-radius:7px;padding:4px 9px;white-space:nowrap}

.bt-iv-plan{background:transparent;border:1.5px dashed rgba(21,18,15,.28);border-radius:16px;padding:15px;margin-bottom:11px}
.bt-plan-k{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#9a8a3a;font-weight:700;margin-bottom:4px}
.bt-plan-btn{width:100%;border:none;background:#15120F;border-radius:11px;padding:13px;font-weight:800;font-size:14.5px;color:#FFC21A;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;margin-top:12px;font-family:inherit}

.bt-empty{text-align:center;font-size:13.5px;color:#6E6A63;font-weight:600;padding:18px 0 4px}
.bt-ghostbtn{display:inline-flex;align-items:center;gap:8px;margin-top:12px;background:transparent;border:1.5px solid rgba(21,18,15,.2);color:#15120F;border-radius:11px;padding:11px 16px;font-weight:800;font-size:13.5px;cursor:pointer;font-family:inherit}
.bt-dup{display:inline-flex;align-items:center;gap:7px;margin:6px auto 4px;background:transparent;border:1px solid rgba(21,18,15,.16);color:#6E6A63;border-radius:10px;padding:9px 15px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
.bt-sentnote{text-align:center;font-size:12.5px;color:#9a948a;font-weight:600;padding:4px 0 2px}

.bt-day-dock{flex:none;padding:14px 16px calc(env(safe-area-inset-bottom) + 16px);background:#F2EDE3;border-top:1px solid rgba(21,18,15,.1);display:flex;gap:10px}
.bt-fab{flex:none;width:58px;border:2px solid #15120F;background:#F2EDE3;border-radius:15px;font-weight:900;font-size:26px;color:#15120F;display:flex;align-items:center;justify-content:center;cursor:pointer;font-family:inherit}
.bt-send{flex:1;border:none;background:#FFC21A;border-radius:15px;padding:17px;font-weight:900;font-size:17px;color:#15120F;box-shadow:0 4px 0 #C99300;display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;font-family:inherit}
.bt-send:disabled{background:#e7ddc4;color:#9a948a;box-shadow:0 4px 0 #cfc4a5;cursor:default}
.bt-send.done{background:#E4F2E9;color:#1F7A4D;box-shadow:0 4px 0 #b7dcc4}

/* ===== ÉDITEUR PLEIN ÉCRAN ===== */
.bt-ed{position:fixed;inset:0;z-index:60;display:flex;justify-content:center;background:rgba(21,18,15,.35)}
.bt-ed-inner{width:100%;max-width:480px;height:100vh;height:100svh;height:100dvh;background:#F2EDE3;display:flex;flex-direction:column;position:relative;overflow:hidden}
.bt-ed-hdr{background:#15120F;color:#F2EDE3;flex:none;padding:calc(env(safe-area-inset-top) + 16px) 18px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.bt-ed-cancel{border:none;background:transparent;color:#a59c86;font-size:15px;font-weight:700;padding:6px 2px;cursor:pointer;font-family:inherit;flex:none;min-width:54px;text-align:left}
.bt-ed-title{font-size:17px;font-weight:900;letter-spacing:-.01em;text-align:center;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-ed-scroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 18px 18px}
.bt-ed-scroll::-webkit-scrollbar{display:none}
.bt-ed-dock{flex:none;padding:13px 18px calc(env(safe-area-inset-bottom) + 18px);background:#F2EDE3;border-top:1px solid rgba(21,18,15,.12);box-shadow:0 -10px 24px -12px rgba(21,18,15,.18)}

.bt-site{border:1px solid rgba(21,18,15,.14);text-align:left;background:#fff;color:#15120F;border-radius:13px;padding:14px 15px;display:flex;align-items:center;gap:12px;width:100%;cursor:pointer;margin-bottom:8px;font-family:inherit}
.bt-site.on{background:#15120F;color:#F2EDE3;border-color:#15120F}
.bt-site.other{border-style:dashed;border-color:rgba(21,18,15,.3)}
.bt-site-name{display:block;font-size:16px;font-weight:800;letter-spacing:-.01em}
.bt-site-city{display:block;font-size:13px;font-weight:600;color:#6E6A63}
.bt-site.on .bt-site-city{color:#a59c86}
.bt-rdo{flex:none;width:22px;height:22px;border:2px solid rgba(21,18,15,.2);border-radius:50%;display:flex;align-items:center;justify-content:center}
.bt-site.on .bt-rdo{width:26px;height:26px;border:none;background:#FFC21A;color:#15120F;font-weight:900;font-size:14px;border-radius:50%}
.bt-rdo-plus{flex:none;width:26px;height:26px;background:#15120F;color:#FFC21A;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:17px}

.bt-times{display:flex;gap:9px;align-items:stretch}
.bt-timecard{flex:1;border:1.5px solid rgba(21,18,15,.16);background:#fff;border-radius:13px;padding:11px 14px;display:flex;flex-direction:column;gap:3px;cursor:pointer;text-align:left;font-family:inherit}
.bt-timecard:active{border-color:#15120F}
.bt-timecard .k{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#9a948a;font-weight:700}
.bt-timecard .v{font-family:'JetBrains Mono',monospace;font-size:25px;font-weight:700;color:#15120F;line-height:1}
.bt-dur{flex:none;width:84px;background:#15120F;border-radius:13px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#FFC21A}
.bt-dur .k{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#a59c86;font-weight:700}
.bt-dur .v{font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700}
.bt-times-hint{text-align:center;font-size:12.5px;color:#9a948a;font-weight:600;margin-top:8px}

.bt-pause-auto{display:flex;align-items:center;gap:8px;margin-top:16px;background:rgba(255,194,26,.12);border:1px solid rgba(255,194,26,.4);border-radius:12px;padding:11px 13px;font-size:12.5px;font-weight:700;color:#7a5e00}

.bt-note{width:100%;font-family:inherit;font-size:15.5px;font-weight:500;color:#15120F;padding:14px 15px;border:1.5px solid rgba(21,18,15,.16);border-radius:13px;background:#fff;outline:none;resize:none}

.bt-save{width:100%;border:none;background:#FFC21A;border-radius:13px;padding:15px;font-weight:900;font-size:16px;color:#15120F;box-shadow:0 4px 0 #C99300;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font-family:inherit}
.bt-save:disabled{opacity:.6;cursor:default}
.bt-retire{width:100%;background:transparent;border:none;color:#C0461F;font-weight:800;font-size:14px;padding:10px;cursor:pointer;margin-bottom:8px;font-family:inherit}

/* ===== TIROIR MOLETTE ===== */
.bt-overlay{position:absolute;inset:0;background:rgba(21,18,15,.5);z-index:8;opacity:0;pointer-events:none;transition:opacity .25s ease}
.bt-overlay.open{opacity:1;pointer-events:auto}
.bt-sheet{position:absolute;left:0;right:0;bottom:0;background:#15120F;border-radius:24px 24px 0 0;z-index:9;padding:12px 16px calc(env(safe-area-inset-bottom) + 22px);transform:translateY(106%);transition:transform .32s cubic-bezier(.22,1,.36,1)}
.bt-sheet.open{transform:translateY(0)}
.bt-grip{width:42px;height:5px;background:#3a352f;border-radius:3px;margin:2px auto 12px}
.bt-seg{display:flex;background:#211D19;border-radius:11px;padding:4px;gap:4px;margin-bottom:8px}
.bt-segb{flex:1;border:none;background:transparent;color:#a59c86;border-radius:8px;padding:9px;font-weight:800;font-size:13px;cursor:pointer;text-align:center;font-family:inherit}
.bt-segb .lbl{display:block}
.bt-segb .v{font-family:'JetBrains Mono',monospace;font-size:17px;font-weight:700;color:#6E6A63;display:block;margin-top:1px}
.bt-segb.on{background:#000}
.bt-segb.on .lbl{color:#FFC21A}
.bt-segb.on .v{color:#F2EDE3}
.bt-sheet-dur{display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:2px}
.bt-sheet-dur .k{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#a59c86;font-weight:700}
.bt-sheet-dur .v{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:#FFC21A}
.bt-molette{display:flex;justify-content:center;padding:4px 0 2px}
`;

// ─── main ──────────────────────────────────────────────────────────────────────

type SlotTarget =
  | { kind: 'planned'; planningId: string }
  | { kind: 'entry'; entryId: string }
  | { kind: 'pending'; localId: string }
  | { kind: 'new' };

export default function PoseurDay({ date: dateProp }: { date?: string } = {}) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntryWithWorksite[]>([]);
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [planning, setPlanning] = useState<(Planning & { worksite: Worksite })[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Day-level panier repas (one per day).
  const [dayMeal, setDayMeal] = useState(false);

  // Inline slot editor
  const [openSlot, setOpenSlot] = useState<SlotTarget | null>(null);
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fObs, setFObs] = useState('');
  const [fSaving, setFSaving] = useState(false);
  // Chantier picker (existing chantiers only — workers don't create clients)
  const [fWorksiteId, setFWorksiteId] = useState('');
  // Tiroir molette (purement présentation : quelle roue on règle)
  const [drawerField, setDrawerField] = useState<'start' | 'end' | null>(null);
  // Les pauses sont CALCULÉES automatiquement (les trous entre créneaux, via
  // computePauses ; break_minutes reste toujours 0). Plus de sélecteur manuel :
  // le salarié saisit seulement ses heures, la pause se déduit toute seule.

  // Coherence confirmation
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [coherenceWarnings, setCoherenceWarnings] = useState<string[]>([]);

  // Copy-yesterday
  const [copyingYesterday, setCopyingYesterday] = useState(false);

  // Repeat this day onto other days (same chantier for several days).
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyDates, setCopyDates] = useState<Date[]>([]);
  // A sent day is frozen; every change re-asks for confirmation (secretary informed).
  const [confirmCorrectOpen, setConfirmCorrectOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [lateOpen, setLateOpen] = useState(false);

  const date = dateProp || format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(`${date}T00:00:00`), 1), 'yyyy-MM-dd');
  // Payroll cutoff: a day in a past month is locked — corrections go through the secretary.
  const monthLocked = date.slice(0, 7) < format(new Date(), 'yyyy-MM');

  // ─── Fetch server data ─────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [entriesRes, worksitesRes, planningRes] = await Promise.all([
        supabase.from('time_entries').select('*, worksite:worksites(*)').eq('user_id', user.id).eq('work_date', date).order('start_time'),
        supabase.from('worksites').select('*').eq('company_id', user.company_id).eq('is_active', true).order('client_name'),
        supabase.from('planning').select('*, worksite:worksites(*)').eq('user_id', user.id).eq('work_date', date),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      if (worksitesRes.error) throw worksitesRes.error;
      if (planningRes.error) throw planningRes.error;

      setEntries(entriesRes.data || []);
      setWorksites(worksitesRes.data || []);
      setPlanning(planningRes.data || []);

      const pendForToday = getPendingEntries(user.id).filter((e) => e.work_date === date);
      setDayMeal((entriesRes.data || []).some((e: TimeEntryWithWorksite) => e.meal_allowance) || pendForToday.some((e) => e.meal_allowance));
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Impossible de charger vos données');
    } finally {
      setLoading(false);
    }
  }, [user, date]);

  // ─── Sync pending offline entries ─────────────────────────────────────────

  const syncPendingEntries = useCallback(async () => {
    if (!user || !navigator.onLine) return;
    const pending = getPendingEntries(user.id).filter((e) => e.work_date === date);
    if (pending.length === 0) return;

    setSyncing(true);
    let synced = 0;
    for (const entry of pending) {
      try {
        const { error } = await supabase.from('time_entries').insert({
          company_id: entry.company_id,
          user_id: entry.user_id,
          worksite_id: entry.worksite_id,
          planning_id: entry.planning_id,
          work_date: entry.work_date,
          start_time: entry.start_time,
          end_time: entry.end_time,
          break_minutes: 0,
          // total_minutes is a generated column in Postgres — never send it.
          meal_allowance: entry.meal_allowance,
          observation: entry.observation,
          status: 'draft',
        });
        if (!error) {
          removePendingEntry(user.id, entry.localId);
          synced++;
        }
      } catch { /* continue */ }
    }
    setSyncing(false);

    if (synced > 0) {
      toast.success(`${synced} intervention${synced > 1 ? 's' : ''} synchronisée${synced > 1 ? 's' : ''}`);
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
      fetchData();
    }
  }, [user, date, fetchData]);

  // ─── Online / offline listeners ───────────────────────────────────────────

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => { setIsOnline(true); syncPendingEntries(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingEntries]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (user) {
      const pending = getPendingEntries(user.id).filter((e) => e.work_date === date);
      setPendingEntries(pending);
      if (navigator.onLine && pending.length > 0) syncPendingEntries();
    }
  }, [user, date, syncPendingEntries]);

  // Reset the editor sub-state when the editor closes.
  useEffect(() => {
    if (!openSlot) setDrawerField(null);
  }, [openSlot]);

  // ─── Day meal: keep exactly one flagged row per day (no migration) ──────────

  const applyDayMeal = useCallback(async (value: boolean) => {
    if (!user) return;
    if (navigator.onLine) {
      const { data } = await supabase.from('time_entries').select('id, start_time, meal_allowance').eq('user_id', user.id).eq('work_date', date);
      const rows = [...(data || [])].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
      const ups = [];
      for (let i = 0; i < rows.length; i++) {
        const target = i === 0 ? value : false;
        if (rows[i].meal_allowance !== target) {
          ups.push(supabase.from('time_entries').update({ meal_allowance: target }).eq('id', rows[i].id).eq('user_id', user.id));
        }
      }
      if (ups.length) await Promise.all(ups);
    }
    const pend = getPendingEntries(user.id).filter((e) => e.work_date === date);
    if (pend.length > 0) {
      const sorted = [...pend].sort((a, b) => a.start_time.localeCompare(b.start_time));
      clearPendingEntriesForDate(user.id, date);
      sorted.forEach((e, i) => addPendingEntry(user.id, { ...e, meal_allowance: i === 0 ? value : false }));
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
    }
  }, [user, date]);

  const toggleDayMeal = async (value: boolean) => {
    setDayMeal(value);
    try {
      await applyDayMeal(value);
      if (navigator.onLine) fetchData();
    } catch (err) {
      console.error('Error setting meal:', err);
    }
  };

  // ─── Inline editor open / save / delete ─────────────────────────────────────

  const openPlanned = (p: Planning & { worksite: Worksite }) => {
    if (monthLocked) { setLateOpen(true); return; }
    setOpenSlot({ kind: 'planned', planningId: p.id });
    setFStart(snapToGrid(p.estimated_start ? p.estimated_start.substring(0, 5) : '08:00'));
    setFEnd(snapToGrid(p.estimated_end ? p.estimated_end.substring(0, 5) : '17:00'));
    setFObs('');
  };
  const openEntry = (e: TimeEntryWithWorksite) => {
    setOpenSlot({ kind: 'entry', entryId: e.id });
    setFStart(snapToGrid(e.start_time?.substring(0, 5) || '08:00'));
    setFEnd(snapToGrid(e.end_time?.substring(0, 5) || '17:00'));
    setFObs(e.observation || '');
  };
  const openPending = (e: PendingEntry) => {
    setOpenSlot({ kind: 'pending', localId: e.localId });
    setFStart(snapToGrid(e.start_time.substring(0, 5)));
    setFEnd(snapToGrid(e.end_time.substring(0, 5)));
    setFObs(e.observation || '');
  };
  const openNew = () => {
    if (monthLocked) { setLateOpen(true); return; }
    setOpenSlot({ kind: 'new' });
    setFWorksiteId('');
    // First slot of the day → morning ; otherwise → afternoon. Worker adjusts if needed.
    const hasContent = entries.length + pendingEntries.length > 0;
    if (hasContent) { setFStart('13:00'); setFEnd('17:00'); }
    else { setFStart('08:00'); setFEnd('12:00'); }
    setFObs('');
  };
  const cancelSlot = () => { setDrawerField(null); setOpenSlot(null); };

  // On a sent (frozen) day, any touch — edit a sent entry OR declare a remaining
  // chantier OR the meal — goes through this confirm, then unlocks the day.
  const askCorrect = (action: (() => void) | null) => { setPendingAction(() => action); setConfirmCorrectOpen(true); };
  const confirmCorrect = () => {
    setConfirmCorrectOpen(false);
    const action = pendingAction;
    setPendingAction(null);
    action?.();
  };

  const saveSlot = async () => {
    if (!user || !openSlot) return;
    if (!fStart || !fEnd) { toast.error("Indique l'heure de début et de fin"); return; }
    setFSaving(true);
    try {
      const totalMins = calculateTotalMinutes(fStart, fEnd, 0);
      let savedMsg = 'Heures enregistrées';

      // ── Update an existing entry ──
      if (openSlot.kind === 'entry') {
        const wasSubmitted = entries.find((e) => e.id === openSlot.entryId)?.status === 'submitted';
        if (wasSubmitted) savedMsg = 'Modification enregistrée — la secrétaire est prévenue';
        const { error } = await supabase.from('time_entries').update({
          start_time: fStart, end_time: fEnd, break_minutes: 0, observation: fObs.trim() || null,
          // Editing an already-sent entry: flag it so the secretary sees the change.
          ...(wasSubmitted ? { modified_at: new Date().toISOString(), modified_by: user.id } : {}),
        }).eq('id', openSlot.entryId).eq('user_id', user.id);
        if (error) throw error;
      } else if (openSlot.kind === 'pending') {
        const pend = getPendingEntries(user.id).find((e) => e.localId === openSlot.localId);
        if (pend) {
          removePendingEntry(user.id, openSlot.localId);
          addPendingEntry(user.id, { ...pend, start_time: fStart, end_time: fEnd, break_minutes: 0, total_minutes: totalMins, observation: fObs.trim() || null });
        }
      } else {
        // ── Create a new slot (planned chantier or free intervention) ──
        let worksiteId = '';
        let worksiteName = '';
        let worksiteCity: string | null = null;

        if (openSlot.kind === 'planned') {
          const p = planning.find((pp) => pp.id === openSlot.planningId);
          worksiteId = p?.worksite_id || '';
          worksiteName = p?.worksite?.client_name || '';
          worksiteCity = p?.worksite?.city || null;
        } else {
          worksiteId = fWorksiteId;
          const ws = worksites.find((w) => w.id === worksiteId);
          worksiteName = ws?.client_name || ''; worksiteCity = ws?.city || null;
        }
        if (!worksiteId) { toast.error('Choisis un chantier'); return; }

        const planningId = planning.find((p) => p.worksite_id === worksiteId)?.id || null;

        if (!navigator.onLine) {
          const pending: PendingEntry = {
            localId: generateLocalId(), company_id: user.company_id, user_id: user.id, worksite_id: worksiteId,
            planning_id: planningId, work_date: date, start_time: fStart, end_time: fEnd, break_minutes: 0,
            total_minutes: totalMins, meal_allowance: false, observation: fObs.trim() || null,
            _worksite_name: worksiteName, _worksite_city: worksiteCity, _saved_at: Date.now(),
          };
          addPendingEntry(user.id, pending);
        } else {
          const { error } = await supabase.from('time_entries').insert({
            company_id: user.company_id, user_id: user.id, worksite_id: worksiteId, planning_id: planningId,
            work_date: date, start_time: fStart, end_time: fEnd, break_minutes: 0,
            meal_allowance: false, observation: fObs.trim() || null, status: 'draft',
          });
          if (error) throw error;
        }
      }

      setDrawerField(null);
      setOpenSlot(null);
      await applyDayMeal(dayMeal);
      if (navigator.onLine) fetchData();
      setPendingEntries(getPendingEntries(user.id).filter((e) => e.work_date === date));
      toast.success(savedMsg);
    } catch (err) {
      console.error('Error saving slot:', err);
      toast.error("Impossible d'enregistrer");
    } finally {
      setFSaving(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('time_entries').delete().eq('id', entryId).eq('user_id', user.id);
      if (error) throw error;
      toast.success('Intervention supprimée');
      if (openSlot?.kind === 'entry' && openSlot.entryId === entryId) setOpenSlot(null);
      await applyDayMeal(dayMeal);
      fetchData();
    } catch (err) {
      console.error('Error deleting entry:', err);
      toast.error('Impossible de supprimer');
    }
  };

  // Remove a wrong intervention. Draft → delete. Sent → soft-cancel (stays
  // visible "Retirée", excluded from the total, secretary informed).
  const handleRetire = async (entry: TimeEntryWithWorksite) => {
    if (!user) return;
    try {
      if (entry.status === 'submitted') {
        const { error } = await supabase.from('time_entries')
          .update({ status: 'cancelled', modified_at: new Date().toISOString(), modified_by: user.id })
          .eq('id', entry.id).eq('user_id', user.id);
        if (error) throw error;
        toast.success('Intervention retirée — la secrétaire est prévenue');
      } else {
        const { error } = await supabase.from('time_entries').delete().eq('id', entry.id).eq('user_id', user.id);
        if (error) throw error;
        toast.success('Intervention retirée');
      }
      setOpenSlot(null);
      await applyDayMeal(dayMeal);
      fetchData();
    } catch (err) {
      console.error('Error retiring entry:', err);
      toast.error('Impossible de retirer');
    }
  };

  const handleDeletePending = (localId: string) => {
    if (!user) return;
    removePendingEntry(user.id, localId);
    setPendingEntries((prev) => prev.filter((e) => e.localId !== localId));
    if (openSlot?.kind === 'pending' && openSlot.localId === localId) setOpenSlot(null);
    toast.success('Intervention supprimée');
  };

  // ─── Copy yesterday ──────────────────────────────────────────────────────────

  const handleCopyYesterday = async () => {
    if (!user) return;
    if (!navigator.onLine) { toast.error('Copie indisponible hors-ligne'); return; }
    setCopyingYesterday(true);
    try {
      const { data: yEntries, error } = await supabase.from('time_entries').select('*').eq('user_id', user.id).eq('work_date', yesterday).order('start_time');
      if (error) throw error;
      if (!yEntries || yEntries.length === 0) { toast.error('Aucune intervention hier à copier'); return; }

      const rows = yEntries.map((e) => ({
        company_id: user.company_id, user_id: user.id, worksite_id: e.worksite_id,
        planning_id: planning.find((p) => p.worksite_id === e.worksite_id)?.id || null,
        work_date: date, start_time: e.start_time, end_time: e.end_time, break_minutes: 0,
        // total_minutes is a generated column in Postgres — never send it.
        meal_allowance: false, observation: e.observation, status: 'draft' as const,
      }));
      const { error: insErr } = await supabase.from('time_entries').insert(rows);
      if (insErr) throw insErr;

      toast.success(`${rows.length} intervention${rows.length > 1 ? 's' : ''} copiée${rows.length > 1 ? 's' : ''} depuis hier`);
      await applyDayMeal(dayMeal);
      fetchData();
    } catch (err) {
      console.error('Error copying yesterday:', err);
      toast.error("Impossible de copier la journée d'hier");
    } finally {
      setCopyingYesterday(false);
    }
  };

  // ─── Repeat this day onto other days ─────────────────────────────────────────

  const copyTargetStrs = copyDates.map((d) => format(d, 'yyyy-MM-dd')).filter((d) => d !== date);

  const copyToDates = async (targetStrs: string[]) => {
    if (!user) return;
    if (!navigator.onLine) { toast.error('Copie indisponible hors-ligne'); return; }
    const targets = Array.from(new Set(targetStrs)).filter((d) => d !== date);
    const sources = [
      ...entries.map((e) => ({ worksite_id: e.worksite_id, start_time: e.start_time, end_time: e.end_time, meal_allowance: e.meal_allowance, observation: e.observation })),
      ...pendingEntries.map((e) => ({ worksite_id: e.worksite_id, start_time: e.start_time, end_time: e.end_time, meal_allowance: e.meal_allowance, observation: e.observation })),
    ];
    if (sources.length === 0) { toast.error('Aucune intervention à copier'); return; }
    if (targets.length === 0) { toast.error('Aucun jour à remplir'); return; }
    setCopying(true);
    try {
      // Link planning_id where the target day already has that chantier planned.
      const { data: plan } = await supabase.from('planning').select('id, work_date, worksite_id').eq('user_id', user.id).in('work_date', targets);
      const planMap = new Map<string, string>();
      (plan || []).forEach((p: { id: string; work_date: string; worksite_id: string | null }) => {
        if (p.worksite_id) planMap.set(`${p.work_date}|${p.worksite_id}`, p.id);
      });
      const rows = targets.flatMap((td) => sources.map((s) => ({
        company_id: user.company_id, user_id: user.id, worksite_id: s.worksite_id,
        planning_id: planMap.get(`${td}|${s.worksite_id}`) || null,
        work_date: td, start_time: s.start_time, end_time: s.end_time, break_minutes: 0,
        meal_allowance: s.meal_allowance, observation: s.observation || null, status: 'draft' as const,
      })));
      const { error } = await supabase.from('time_entries').insert(rows);
      if (error) throw error;
      toast.success(`Copié sur ${targets.length} jour${targets.length > 1 ? 's' : ''}`);
      setRepeatOpen(false);
    } catch (err) {
      console.error('Error repeating day:', err);
      toast.error('Impossible de copier');
    } finally {
      setCopying(false);
    }
  };

  // ─── Submit day ────────────────────────────────────────────────────────────

  const checkCoherenceWarnings = (): string[] => {
    const drafts = entries.filter((e) => e.status === 'draft' && !e.locked);
    if (drafts.length === 0) return [];
    const warnings: string[] = [];
    if (plannedTodo.length > 0) {
      warnings.push(`Il reste ${plannedTodo.length} chantier${plannedTodo.length > 1 ? 's' : ''} prévu${plannedTodo.length > 1 ? 's' : ''} sans heures.`);
    }
    const totalMins = drafts.reduce((s, e) => s + e.total_minutes, 0);
    if (totalMins > 600) warnings.push(`Total : ${formatMinutesToHours(totalMins)} (dépasse 10h). Vérifie tes horaires.`);
    const slots = [...entries, ...pendingEntries]
      .map((e) => ({ s: (e.start_time || '').slice(0, 5), e: (e.end_time || '').slice(0, 5) }))
      .filter((x) => x.s && x.e)
      .sort((a, b) => a.s.localeCompare(b.s));
    if (slots.some((x, i) => i > 0 && toMin(x.s) < toMin(slots[i - 1].e))) {
      warnings.push('Certaines interventions se chevauchent. Vérifie tes heures.');
    }
    return warnings;
  };

  const handleSubmitDay = () => {
    const draftIds = entries.filter((e) => e.status === 'draft' && !e.locked).map((e) => e.id);
    if (draftIds.length === 0) { toast.error('Ajoute au moins une intervention'); return; }
    const warnings = checkCoherenceWarnings();
    if (warnings.length > 0) { setCoherenceWarnings(warnings); setConfirmOpen(true); } else { doSubmit(); }
  };

  const doSubmit = async () => {
    if (!user) return;
    const draftIds = entries.filter((e) => e.status === 'draft' && !e.locked).map((e) => e.id);
    if (draftIds.length === 0) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('time_entries').update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .in('id', draftIds).eq('user_id', user.id).eq('status', 'draft');
      if (error) throw error;
      toast.success('Journée envoyée');
      fetchData();
    } catch (err) {
      console.error('Error submitting day:', err);
      toast.error("Impossible d'envoyer");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Computed ──────────────────────────────────────────────────────────────

  const liveEntries = entries.filter((e) => e.status !== 'cancelled');
  const cancelledEntries = entries.filter((e) => e.status === 'cancelled');
  const serverTotal = liveEntries.reduce((s, e) => s + e.total_minutes, 0);
  const pendingTotal = pendingEntries.reduce((s, e) => s + e.total_minutes, 0);
  const totalMinutes = serverTotal + pendingTotal;
  const nbInterventions = liveEntries.length + pendingEntries.length;
  const hasDrafts = liveEntries.some((e) => e.status === 'draft') || pendingEntries.length > 0;
  const hasRealDrafts = liveEntries.some((e) => e.status === 'draft' && !e.locked);
  const allSubmitted = liveEntries.length > 0 && liveEntries.every((e) => e.status !== 'draft') && pendingEntries.length === 0;
  const frozen = allSubmitted; // a sent day stays frozen; every change re-asks to confirm
  const isEmpty = liveEntries.length === 0 && pendingEntries.length === 0;
  const isEditable = (e: TimeEntryWithWorksite) => !e.locked && !e.exported_at;

  // Keep cancelled worksites in the set too, so a removed planned chantier doesn't
  // pop back as "à déclarer" (it shows only as "Retirée").
  const declaredWorksiteIds = new Set<string>([
    ...(entries.map((e) => e.worksite_id).filter(Boolean) as string[]),
    ...pendingEntries.map((e) => e.worksite_id),
  ]);
  const plannedTodo = planning.filter((p) => p.worksite_id && !declaredWorksiteIds.has(p.worksite_id));

  const pauses = computePauses(
    [...liveEntries, ...pendingEntries].map((e) => ({ start: (e.start_time || '').slice(0, 5), end: (e.end_time || '').slice(0, 5) })),
  );
  const pauseMinutes = pauses.reduce((s, p) => s + p.minutes, 0);

  // "Autre" is a real worksite pinned at the top of the picker (created once per
  // company in Supabase) — for work the secretary hasn't listed / the worker can't name.
  const OTHER_NAME = 'Autre';
  const sortedWorksites = [...worksites].sort((a, b) => {
    if (a.client_name === OTHER_NAME) return -1;
    if (b.client_name === OTHER_NAME) return 1;
    return a.client_name.localeCompare(b.client_name);
  });

  // Unified list of the day's slots — planned-not-yet-declared, declared entries, and pending
  // (offline) entries — sorted by start time. The card position stays put as soon as the slot
  // has a start time, so filling a planned card no longer makes it jump to the bottom.
  type DayItem =
    | { kind: 'planned'; sort: string; key: string; data: Planning & { worksite: Worksite } }
    | { kind: 'entry'; sort: string; key: string; data: TimeEntryWithWorksite }
    | { kind: 'pending'; sort: string; key: string; data: PendingEntry }
    | { kind: 'cancelled'; sort: string; key: string; data: TimeEntryWithWorksite };
  const items: DayItem[] = [
    ...plannedTodo.map((p): DayItem => ({ kind: 'planned', sort: (p.estimated_start || '99:99').slice(0, 5), key: `p:${p.id}`, data: p })),
    ...liveEntries.map((e): DayItem => ({ kind: 'entry', sort: (e.start_time || '99:99').slice(0, 5), key: `e:${e.id}`, data: e })),
    ...pendingEntries.map((pe): DayItem => ({ kind: 'pending', sort: (pe.start_time || '99:99').slice(0, 5), key: `pe:${pe.localId}`, data: pe })),
    ...cancelledEntries.map((e): DayItem => ({ kind: 'cancelled', sort: (e.start_time || '99:99').slice(0, 5), key: `c:${e.id}`, data: e })),
  ].sort((a, b) => a.sort.localeCompare(b.sort));

  const titleName = !openSlot ? ''
    : openSlot.kind === 'planned' ? (planning.find((p) => p.id === openSlot.planningId)?.worksite?.client_name || '')
    : openSlot.kind === 'entry' ? (entries.find((e) => e.id === openSlot.entryId)?.worksite?.client_name || '')
    : openSlot.kind === 'pending' ? (pendingEntries.find((e) => e.localId === openSlot.localId)?._worksite_name || '')
    : '';
  const titleCity = !openSlot ? ''
    : openSlot.kind === 'planned' ? (planning.find((p) => p.id === openSlot.planningId)?.worksite?.city || '')
    : openSlot.kind === 'entry' ? (entries.find((e) => e.id === openSlot.entryId)?.worksite?.city || '')
    : openSlot.kind === 'pending' ? (pendingEntries.find((e) => e.localId === openSlot.localId)?._worksite_city || '')
    : '';
  const slotTitle = !openSlot ? ''
    : openSlot.kind === 'new' ? 'Nouvelle intervention'
    : titleName ? `Chantier ${titleName}` : 'Intervention';

  const editorEntry = openSlot?.kind === 'entry' ? entries.find((x) => x.id === openSlot.entryId) : undefined;
  const durMin = (fStart && fEnd) ? calculateTotalMinutes(fStart, fEnd, 0) : 0;

  if (loading) {
    return (
      <div className="bt-day">
        <style dangerouslySetInnerHTML={{ __html: DAY_CSS }} />
        <div className="bt-day-scroll space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="bt-day">
      <style dangerouslySetInnerHTML={{ __html: DAY_CSS }} />

      {/* ===== BANDEAU RÉSEAU ===== */}
      {!isOnline && (
        <div className="bt-net bt-net-off">
          <span className="bt-net-dot" />
          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Hors-ligne, tout est gardé{pendingEntries.length > 0 ? ` · ${pendingEntries.length} en attente` : ''}
          </span>
        </div>
      )}
      {isOnline && syncing && (
        <div className="bt-net bt-net-sync">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span>Synchronisation…</span>
        </div>
      )}

      {/* ===== ZONE SCROLLABLE ===== */}
      <div className="bt-day-scroll">

        {/* ----- TOTAL DU JOUR ----- */}
        <div className="bt-total">
          <div className="bt-total-ruban" />
          <div className="bt-total-k">Total aujourd&apos;hui</div>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span className="bt-total-big">{fmtHM(totalMinutes)}</span>
            <span className="bt-total-unit">travaillées</span>
          </div>
          <div className="bt-stats">
            <div className="bt-stat">
              <div className="bt-stat-n">{nbInterventions}</div>
              <div className="bt-stat-l">intervention{nbInterventions > 1 ? 's' : ''}</div>
            </div>
            <div className="bt-stat">
              <div className="bt-stat-n">{fmtHM(pauseMinutes)}</div>
              <div className="bt-stat-l">pause{pauses.length > 1 ? 's' : ''}</div>
            </div>
            <div className={`bt-stat${dayMeal ? ' on' : ''}`}>
              <div className="bt-stat-n">{dayMeal ? 'Panier ✓' : 'Panier'}</div>
              <div className="bt-stat-l">{dayMeal ? 'repas pris' : 'non pris'}</div>
            </div>
          </div>
        </div>

        {/* ----- PANIER REPAS (toggle, une fois/jour) ----- */}
        <div className="bt-meal">
          <span className="bt-meal-emoji">🥪</span>
          <div style={{ flex: 1 }}>
            <div className="bt-meal-t">Panier repas</div>
            <div className="bt-meal-s">{dayMeal ? "Déclaré pour aujourd'hui" : 'Pour la journée'}</div>
          </div>
          <button
            type="button"
            className={`bt-switch${dayMeal ? ' on' : ''}`}
            aria-label="Panier repas"
            aria-pressed={dayMeal}
            onClick={() => {
              if (monthLocked) { setLateOpen(true); return; }
              if (frozen) { askCorrect(null); return; }
              toggleDayMeal(!dayMeal);
            }}
          >
            <i />
          </button>
        </div>

        {/* ----- INTERVENTIONS ----- */}
        <div className="bt-sec">Interventions du jour</div>

        {items.map((item) => {
          if (item.kind === 'planned') {
            const p = item.data;
            const onTap = monthLocked ? () => setLateOpen(true) : frozen ? () => askCorrect(() => openPlanned(p)) : () => openPlanned(p);
            return (
              <div key={item.key} className="bt-iv-plan">
                <div className="bt-plan-k">
                  {p.estimated_start && p.estimated_end ? `Prévu · ${p.estimated_start.substring(0, 5)}–${p.estimated_end.substring(0, 5)}` : 'Prévu'}
                </div>
                <div className="bt-iv-name">{p.worksite?.client_name}</div>
                {p.worksite?.city && <div className="bt-iv-city">{p.worksite.city}</div>}
                <button type="button" className="bt-plan-btn" onClick={onTap}>
                  <span style={{ fontSize: 18 }}>+</span> Déclarer ce chantier
                </button>
              </div>
            );
          }

          if (item.kind === 'entry') {
            const entry = item.data;
            const tappable = isEditable(entry);
            const isDraft = entry.status === 'draft' && !entry.locked;
            const onTap = !tappable ? undefined : monthLocked ? () => setLateOpen(true) : frozen ? () => askCorrect(() => openEntry(entry)) : () => openEntry(entry);
            return (
              <div key={item.key} className={`bt-iv${isDraft ? ' draft' : ''}`}>
                <div className="bt-iv-top">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="bt-iv-name">{entry.worksite?.client_name || OTHER_NAME}</div>
                    {entry.worksite?.city && <div className="bt-iv-city">{entry.worksite.city}</div>}
                  </div>
                  {entry.status === 'submitted' && (
                    <div className="bt-badge bt-badge-sent"><span className="dot">✓</span> Envoyé</div>
                  )}
                  {isDraft && <div className="bt-badge bt-badge-draft">● Brouillon</div>}
                </div>
                <div className="bt-iv-times">
                  <span>{entry.start_time?.substring(0, 5)} → {entry.end_time?.substring(0, 5)}</span>
                  <span className="dot" />
                  <span>{fmtHM(entry.total_minutes)}</span>
                </div>
                {entry.observation && <div className="bt-iv-note">{entry.observation}</div>}
                {isDraft && (
                  <div className="bt-iv-acts">
                    <button type="button" className="bt-iv-mod" onClick={onTap}>Modifier</button>
                    <button type="button" className="bt-iv-del" onClick={() => handleRetire(entry)}>Retirer</button>
                  </div>
                )}
                {!isDraft && tappable && (
                  <div className="bt-iv-acts">
                    <button type="button" className="bt-iv-mod" onClick={onTap}>Modifier</button>
                  </div>
                )}
              </div>
            );
          }

          if (item.kind === 'cancelled') {
            const entry = item.data;
            return (
              <div key={item.key} className="bt-iv-cancel">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="bt-cancel-name">{entry.worksite?.client_name || OTHER_NAME}</div>
                  <div className="bt-cancel-time">{entry.start_time?.substring(0, 5)} → {entry.end_time?.substring(0, 5)} · {fmtHM(entry.total_minutes)}</div>
                </div>
                <div className="bt-cancel-badge">Retirée</div>
              </div>
            );
          }

          // pending (offline)
          const entry = item.data;
          return (
            <div key={item.key} className="bt-iv off">
              <div className="bt-iv-top">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="bt-iv-name">{entry._worksite_name}</div>
                  {entry._worksite_city && <div className="bt-iv-city">{entry._worksite_city}</div>}
                </div>
                <div className="bt-badge bt-badge-off">● En attente</div>
              </div>
              <div className="bt-iv-times">
                <span>{entry.start_time.substring(0, 5)} → {entry.end_time.substring(0, 5)}</span>
                <span className="dot" />
                <span>{fmtHM(entry.total_minutes)}</span>
              </div>
              <div className="bt-iv-acts">
                <button type="button" className="bt-iv-mod" onClick={() => openPending(entry)}>Modifier</button>
                <button type="button" className="bt-iv-del" onClick={() => handleDeletePending(entry.localId)}>Retirer</button>
              </div>
            </div>
          );
        })}

        {/* Vide → astuce + copier hier */}
        {isEmpty && plannedTodo.length === 0 && (
          <div className="bt-empty">
            <div>Aucune intervention aujourd&apos;hui.</div>
            {isOnline && !monthLocked && (
              <button type="button" className="bt-ghostbtn" onClick={handleCopyYesterday} disabled={copyingYesterday}>
                {copyingYesterday ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Copier la journée d&apos;hier
              </button>
            )}
          </div>
        )}

        {/* Dupliquer cette journée */}
        {!isEmpty && !monthLocked && (
          <div style={{ textAlign: 'center' }}>
            <button type="button" className="bt-dup" onClick={() => { setCopyDates([]); setRepeatOpen(true); }}>
              <Copy className="h-4 w-4" /> Dupliquer cette journée
            </button>
          </div>
        )}

        {/* Journée envoyée — note de correction */}
        {allSubmitted && (
          <div className="bt-sentnote">
            {monthLocked
              ? 'Mois clôturé — vois avec la secrétaire pour modifier.'
              : 'Touche une intervention pour la corriger (la secrétaire sera prévenue).'}
          </div>
        )}
      </div>

      {/* ===== BARRE D'ACTION DOCKÉE (bas) ===== */}
      <div className="bt-day-dock">
        <button
          type="button"
          className="bt-fab"
          aria-label="Ajouter une intervention"
          onClick={frozen && !monthLocked ? () => askCorrect(openNew) : openNew}
        >
          +
        </button>

        {!isOnline ? (
          <button type="button" className="bt-send" disabled>Envoyer ma journée</button>
        ) : pendingEntries.length > 0 ? (
          <button type="button" className="bt-send" onClick={syncPendingEntries} disabled={syncing}>
            {syncing && <Loader2 className="h-4 w-4 animate-spin" />} Synchroniser ({pendingEntries.length})
          </button>
        ) : allSubmitted ? (
          <button type="button" className="bt-send done" disabled>Journée envoyée ✓</button>
        ) : hasRealDrafts ? (
          <button type="button" className="bt-send" onClick={handleSubmitDay} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Envoyer ma journée <span style={{ fontSize: 19 }}>→</span>
          </button>
        ) : (
          <button type="button" className="bt-send" disabled>Envoyer ma journée <span style={{ fontSize: 19 }}>→</span></button>
        )}
      </div>

      {/* ===== ÉDITEUR PLEIN ÉCRAN — Ajouter / modifier une intervention ===== */}
      {openSlot && (
        <div className="bt-ed">
          <div className="bt-ed-inner">
            <div className="bt-ed-hdr">
              <button type="button" className="bt-ed-cancel" onClick={cancelSlot}>Annuler</button>
              <div className="bt-ed-title">{slotTitle}</div>
              <span style={{ width: 54, flex: 'none' }} aria-hidden />
            </div>

            <div className="bt-ed-scroll">

              {/* 1 · Chantier */}
              <div className="bt-sec">1 · Chantier</div>
              {openSlot.kind === 'new' ? (
                sortedWorksites.map((ws) => {
                  const isOther = ws.client_name === OTHER_NAME;
                  const on = fWorksiteId === ws.id;
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      className={`bt-site${on ? ' on' : ''}${isOther ? ' other' : ''}`}
                      onClick={() => setFWorksiteId(ws.id)}
                    >
                      {isOther && !on ? <span className="bt-rdo-plus">+</span> : null}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="bt-site-name">{isOther ? 'Autre chantier' : ws.client_name}</span>
                        <span className="bt-site-city">{isOther ? 'Travail non prévu, à préciser' : (ws.city || '')}</span>
                      </span>
                      {!(isOther && !on) && <span className="bt-rdo">{on ? '✓' : ''}</span>}
                    </button>
                  );
                })
              ) : (
                <div className="bt-site on">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="bt-site-name">{titleName || OTHER_NAME}</span>
                    {titleCity && <span className="bt-site-city">{titleCity}</span>}
                  </span>
                  <span className="bt-rdo">✓</span>
                </div>
              )}

              {/* 2 · Horaires */}
              <div className="bt-sec">2 · Horaires</div>
              <div className="bt-times">
                <button type="button" className="bt-timecard" onClick={() => setDrawerField('start')}>
                  <span className="k">Début</span>
                  <span className="v">{fStart}</span>
                </button>
                <button type="button" className="bt-timecard" onClick={() => setDrawerField('end')}>
                  <span className="k">Fin</span>
                  <span className="v">{fEnd}</span>
                </button>
                <div className="bt-dur">
                  <span className="k">Durée</span>
                  <span className="v">{formatMinutesToHours(durMin)}</span>
                </div>
              </div>
              <div className="bt-times-hint">Touchez une heure pour la régler</div>

              {/* Pauses calculées automatiquement (trous entre créneaux) — plus de sélecteur manuel */}
              <div className="bt-pause-auto">
                <span aria-hidden>☕</span>
                Les pauses sont calculées automatiquement d&apos;après vos horaires.
              </div>

              {/* 3 · Note */}
              <div className="bt-sec">3 · Note <span style={{ textTransform: 'none', letterSpacing: 0, color: '#a39d92' }}>(facultatif)</span></div>
              <textarea
                className="bt-note"
                rows={2}
                placeholder="Préciser le travail effectué…"
                value={fObs}
                onChange={(e) => setFObs(e.target.value)}
              />
            </div>

            {/* Barre d'action dockée */}
            <div className="bt-ed-dock">
              {openSlot.kind === 'entry' && editorEntry && (
                <button type="button" className="bt-retire" disabled={fSaving} onClick={() => handleRetire(editorEntry)}>
                  Retirer cette intervention
                </button>
              )}
              <button type="button" className="bt-save" onClick={saveSlot} disabled={fSaving}>
                {fSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Enregistrer l&apos;intervention <span style={{ fontSize: 18 }}>✓</span>
              </button>
            </div>

            {/* ===== TIROIR MOLETTE ===== */}
            <div className={`bt-overlay${drawerField ? ' open' : ''}`} onClick={() => setDrawerField(null)} />
            <div className={`bt-sheet${drawerField ? ' open' : ''}`}>
              <div className="bt-grip" />
              <div className="bt-seg">
                <button type="button" className={`bt-segb${drawerField !== 'end' ? ' on' : ''}`} onClick={() => setDrawerField('start')}>
                  <span className="lbl">Début</span>
                  <span className="v">{fStart}</span>
                </button>
                <button type="button" className={`bt-segb${drawerField === 'end' ? ' on' : ''}`} onClick={() => setDrawerField('end')}>
                  <span className="lbl">Fin</span>
                  <span className="v">{fEnd}</span>
                </button>
              </div>
              <div className="bt-sheet-dur">
                <span className="k">Durée totale</span>
                <span className="v">{formatMinutesToHours(durMin)}</span>
              </div>
              <div className="bt-molette">
                {/* La molette TimeCylinder et sa mécanique restent intactes. */}
                <TimeCylinder
                  value={drawerField === 'end' ? fEnd : fStart}
                  onChange={(v) => (drawerField === 'end' ? setFEnd(v) : setFStart(v))}
                />
              </div>
              <button type="button" className="bt-save" style={{ marginTop: 14 }} onClick={() => setDrawerField(null)}>
                Valider les heures ✓
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Repeat this day onto other days */}
      <Dialog open={repeatOpen} onOpenChange={setRepeatOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Copy className="h-5 w-5" /> Dupliquer cette journée</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Choisis les jours où copier cette journée (mêmes chantiers + heures).</p>
          <div className="flex justify-center">
            <Calendar mode="multiple" selected={copyDates} onSelect={(d) => setCopyDates(d || [])} locale={fr} weekStartsOn={1} disabled={{ before: new Date() }} />
          </div>
          <Button className="w-full h-11" disabled={copying || copyTargetStrs.length === 0} onClick={() => copyToDates(copyTargetStrs)}>
            {copying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            Copier{copyTargetStrs.length > 0 ? ` (${copyTargetStrs.length})` : ''}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Month closed — too late to edit */}
      <Dialog open={lateOpen} onOpenChange={setLateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Mois clôturé</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Cette journée appartient à un mois déjà clôturé. Pour toute modification, rapproche-toi de la secrétaire.</p>
          <Button className="w-full mt-2" onClick={() => setLateOpen(false)}>Compris</Button>
        </DialogContent>
      </Dialog>

      {/* Confirm correcting an already-sent day */}
      <Dialog open={confirmCorrectOpen} onOpenChange={(o) => { setConfirmCorrectOpen(o); if (!o) setPendingAction(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Journée déjà envoyée</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Cette journée a déjà été envoyée. Si tu y touches, la secrétaire en sera informée.</p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => { setConfirmCorrectOpen(false); setPendingAction(null); }}>Annuler</Button>
            <Button className="flex-1" onClick={confirmCorrect}>Continuer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Coherence confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Vérification</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {coherenceWarnings.map((w, i) => <p key={i} className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">{w}</p>)}
            <p className="text-sm text-muted-foreground pt-1">Envoyer quand même ta journée ?</p>
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>Corriger</Button>
            <Button className="flex-1" onClick={() => { setConfirmOpen(false); doSubmit(); }}>Confirmer l&apos;envoi</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
