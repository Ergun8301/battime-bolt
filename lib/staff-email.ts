// Lot 19 — e-mails du bureau : le côté navigateur (chargé AVEC la fenêtre, à l'ouverture).
//   · l'appel à la fonction `send-staff-email` (états : ok / refusé / absente / réseau) ;
//   · la lecture du planning de la semaine (UNE lecture paginée, seulement à l'ouverture) ;
//   · le PDF du planning d'un salarié (jsPDF chargé À LA DEMANDE, comme les exports) ;
//   · le journal des envois (lecture sous règle de ligne, sur demande).
// Les règles (plafond, nettoyage du texte, libellés) sont dans
// supabase/functions/_shared/staff-email-core.ts : la fenêtre et la fonction disent la même chose.
import { addDays, format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { fetchAllPaged } from '@/lib/fetch-all';
import { loadPdf } from '@/lib/export-utils';
import { plannedHours } from '@/supabase/functions/_shared/kiosk-board';
import { weekFromMonday, type ResultItem } from '@/supabase/functions/_shared/staff-email-core';

// ── L'appel à la fonction ───────────────────────────────────────────────────

export type Etat = {
  available: boolean;
  cap: number;
  used: number;
  remaining: number;
  workers: { id: string; has_email: boolean; unsubscribed: Record<string, boolean> }[];
};
export type SendData = { cap: number; used: number; remaining: number; sent: number; results: ResultItem[]; error?: string };

export type CallResult<T> =
  | { kind: 'ok'; data: T }
  /** La fonction a répondu non (403, 429, 400…) : `data` porte son message et, pour un plafond, les résultats. */
  | { kind: 'refused'; status: number; data: Record<string, unknown> }
  /** Fonction non déployée ou migration absente : « pas encore disponible ». */
  | { kind: 'missing' }
  /** Pas de réponse (réseau coupé) : l'envoi a PEUT-ÊTRE eu lieu. */
  | { kind: 'network' };

export async function callStaffEmail<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<CallResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke('send-staff-email', { body });
    if (!error) {
      const d = (data || {}) as Record<string, unknown>;
      return d.available === false ? { kind: 'missing' } : { kind: 'ok', data: d as T };
    }
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      let d: Record<string, unknown> = {};
      try { d = (await ctx.json()) as Record<string, unknown>; } catch { /* corps illisible */ }
      // 404 : la fonction n'est pas déployée ; 503 « available:false » : la migration manque.
      if (ctx.status === 404 || d.available === false) return { kind: 'missing' };
      return { kind: 'refused', status: ctx.status, data: d };
    }
    return { kind: 'network' };
  } catch {
    return { kind: 'network' };
  }
}

// ── Le planning de la semaine ───────────────────────────────────────────────

export interface WeekSlot {
  id: string;
  user_id: string;
  work_date: string;
  estimated_start: string | null;
  estimated_end: string | null;
  notes: string | null;
  absence_type: string | null;
  position: number | null;
  created_at: string;
  worksite: { client_name: string | null; address: string | null; city: string | null; postal_code: string | null } | null;
}

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Le planning de la semaine, pour toute l'entreprise (lecture seule, paginée, toute erreur est levée). */
export async function loadWeekSlots(companyId: string, monday: string): Promise<WeekSlot[]> {
  const week = weekFromMonday(monday);
  if (!week) throw new Error('semaine invalide');
  return fetchAllPaged<WeekSlot>((f, t) => supabase.from('planning')
    .select('id, user_id, work_date, estimated_start, estimated_end, notes, absence_type, position, created_at, worksite:worksites(client_name, address, city, postal_code)')
    .eq('company_id', companyId).gte('work_date', week.start).lte('work_date', week.end)
    .order('work_date').order('id').range(f, t) as unknown as Page<WeekSlot>);
}

const ABSENCE: Record<string, string> = { conge: 'Congé', maladie: 'Arrêt maladie', intemperie: 'Intempérie', repos: 'Repos' };

/** Même ordre que le bureau dans une case : position manuelle d'abord, puis création. */
function slotOrder(a: WeekSlot, b: WeekSlot): number {
  if (a.position != null && b.position != null) return a.position - b.position;
  if (a.position != null) return -1;
  if (b.position != null) return 1;
  return (a.created_at || '').localeCompare(b.created_at || '');
}

/** Combien d'interventions (ou absences) ce salarié a cette semaine. */
export const countFor = (slots: WeekSlot[], userId: string) => slots.filter((s) => s.user_id === userId).length;

// ── Le PDF ──────────────────────────────────────────────────────────────────

/** jsPDF n'écrit que le Latin-1 / WinAnsi : tout le reste devient « ? » plutôt qu'un signe illisible. */
export function pdfText(s: string | null | undefined): string {
  return (s || '').replace(/[\r\n\t]+/g, ' ').replace(/[^ -~ -ÿ–—‘’“”•…€]/g, '?').trim();
}

export const dayLabel = (iso: string) => {
  const t = format(parseISO(iso), 'EEEE d MMMM', { locale: fr });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Les lignes du tableau : lundi à vendredi toujours, samedi et dimanche seulement s'il y a quelque chose. */
export function weekRows(monday: string, slots: WeekSlot[]): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < 7; i++) {
    const date = format(addDays(parseISO(monday), i), 'yyyy-MM-dd');
    const day = slots.filter((s) => s.work_date === date).sort(slotOrder);
    if (!day.length) { if (i < 5) rows.push([dayLabel(date), '', 'Rien de prévu', '', '']); continue; }
    day.forEach((s, k) => {
      const where = [s.worksite?.address, [s.worksite?.postal_code, s.worksite?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      rows.push([
        k === 0 ? dayLabel(date) : '',
        s.absence_type ? '' : (plannedHours(s.estimated_start, s.estimated_end) || ''),
        s.absence_type ? (ABSENCE[s.absence_type] || 'Absence') : (s.worksite?.client_name || 'Chantier'),
        s.absence_type ? '' : where,
        s.notes || '',
      ].map(pdfText));
    });
  }
  return rows;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(bin);
}

/** Le PDF (base64) du planning de la semaine d'UN salarié. jsPDF n'arrive qu'ici, à la demande. */
export async function buildWeekPdf(a: { companyName: string; workerName: string; monday: string; slots: WeekSlot[] }): Promise<string> {
  const { jsPDF, autoTable } = await loadPdf();
  const week = weekFromMonday(a.monday);
  if (!week) throw new Error('semaine invalide');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFontSize(18);
  doc.text('Planning de la semaine', 14, 20);
  doc.setFontSize(12);
  doc.text(pdfText(a.workerName), 14, 29);
  doc.setFontSize(11);
  doc.text(pdfText(`Semaine ${week.label}`), 14, 36);
  doc.setTextColor(110, 106, 99);
  doc.text(pdfText(a.companyName), 14, 42);
  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    startY: 48,
    head: [['Jour', 'Horaire', 'Chantier', 'Adresse', 'Note']],
    body: weekRows(a.monday, a.slots),
    styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [21, 18, 15] },
    columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 24 }, 2: { cellWidth: 44 }, 3: { cellWidth: 48 }, 4: { cellWidth: 32 } },
  });
  doc.setFontSize(8);
  doc.setTextColor(110, 106, 99);
  doc.text(pdfText(`Envoyé avec BEMEXO le ${format(new Date(), 'dd/MM/yyyy')} - le planning peut encore changer.`), 14, 287);
  return toBase64(new Uint8Array(doc.output('arraybuffer')));
}

// ── Le journal ──────────────────────────────────────────────────────────────

export interface LogRow { id: string; kind: string; user_id: string | null; recipient_mask: string; status: string; created_at: string }

/** Les derniers envois (règle de ligne : le bureau de son entreprise). Erreur ou table absente : liste vide. */
export async function loadLog(companyId: string): Promise<LogRow[] | null> {
  const { data, error } = await supabase.from('staff_email_log')
    .select('id, kind, user_id, recipient_mask, status, created_at')
    .eq('company_id', companyId).order('created_at', { ascending: false }).limit(20);
  return error ? null : ((data || []) as LogRow[]);
}
