// Shared Excel/PDF export helpers used by the global team export (admin-export)
// and the per-employee fiche export (worker-detail). Generation only — locking
// of exported entries stays in the caller (only the payroll export locks).

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { TimeEntryWithWorksite, User } from '@/lib/types';

export type ExportEntry = TimeEntryWithWorksite & { user?: User };

export interface ExportOptions {
  /** File name without extension. */
  fileName: string;
  /** PDF heading. */
  title: string;
  /** Human-readable period, e.g. "01/06/2026 au 07/06/2026". */
  periodLabel: string;
  companyName?: string;
  /** When set, the per-person mode: drops the "Salarié" column and shows the name in the header. */
  singleWorkerName?: string;
  /**
   * L'entreprise paie-t-elle le temps de route entre deux chantiers ?
   * La colonne « Route » est toujours présente — on ne cache pas du temps
   * déclaré — mais elle n'entre dans le total que si l'entreprise le paie.
   */
  travelPaid?: boolean;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Minutes de route attribuées à chaque intervention.
 *
 * Le salarié qualifie le temps écoulé depuis l'intervention précédente du même
 * jour (`gap_before`). Ici on retrouve la durée de ce trou, par salarié et par
 * jour, et on ne retient que ce qui a été appelé « route ». Une pause, ou un
 * trou dont personne n'a rien dit, vaut zéro : jamais de temps payé en douce.
 */
function routeMinutesByEntry(entries: ExportEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  const groups = new Map<string, ExportEntry[]>();
  for (const e of entries) {
    const k = `${e.user_id}|${e.work_date}`;
    const arr = groups.get(k);
    if (arr) arr.push(e); else groups.set(k, [e]);
  }
  groups.forEach((arr) => {
    const sorted = [...arr]
      .filter((e) => e.start_time && e.end_time)
      .map((e) => {
        const start = toMin(e.start_time.slice(0, 5));
        let end = toMin(e.end_time.slice(0, 5));
        if (end < start) end += 24 * 60; // franchit minuit
        return { e, start, end };
      })
      .sort((a, b) => a.start - b.start);
    let prevEnd = -1;
    for (const s of sorted) {
      if (prevEnd >= 0 && s.start > prevEnd && s.e.gap_before === 'route') {
        out.set(s.e.id, s.start - prevEnd);
      }
      if (s.end > prevEnd) prevEnd = s.end;
    }
  });
  return out;
}

function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

// Les appelants ne passent que des lignes envoyées (voir lib/status.ts) ; si un
// brouillon ou une ligne retirée arrivait quand même ici, il serait nommé.
function statusLabel(status: string): string {
  if (status === 'draft') return 'Brouillon';
  if (status === 'cancelled') return 'Retirée';
  return 'Envoyé';
}

export function exportEntriesToExcel(entries: ExportEntry[], opts: ExportOptions): void {
  const includeWorker = !opts.singleWorkerName;

  const route = routeMinutesByEntry(entries);
  const rows = entries.map((entry) => {
    const row: Record<string, string | number> = {
      'Date': format(parseISO(entry.work_date), 'dd/MM/yyyy'),
    };
    if (includeWorker) {
      row['Salarié'] = `${entry.user?.first_name ?? ''} ${entry.user?.last_name ?? ''}`.trim() || '-';
    }
    row['Client'] = entry.worksite?.client_name || '-';
    row['Ville'] = entry.worksite?.city || '-';
    row['Début'] = entry.start_time?.substring(0, 5) || '-';
    row['Fin'] = entry.end_time?.substring(0, 5) || '-';
    row['Pause (min)'] = entry.break_minutes;
    row['Route (min)'] = route.get(entry.id) || 0;
    row['Total heures'] = formatMinutesToHours(entry.total_minutes + (opts.travelPaid ? (route.get(entry.id) || 0) : 0));
    row['Panier repas'] = entry.meal_allowance ? 'Oui' : 'Non';
    row['Statut'] = statusLabel(entry.status);
    row['Observation'] = entry.observation || '-';
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 12 },
    ...(includeWorker ? [{ wch: 20 }] : []),
    { wch: 25 }, { wch: 15 }, { wch: 8 }, { wch: 8 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 30 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Saisies');
  XLSX.writeFile(wb, `${opts.fileName}.xlsx`);
}

export function exportEntriesToPDF(entries: ExportEntry[], opts: ExportOptions): void {
  const includeWorker = !opts.singleWorkerName;
  const doc = new jsPDF('landscape');

  doc.setFontSize(18);
  doc.text(opts.title, 14, 20);

  doc.setFontSize(11);
  let y = 30;
  doc.text(`Période : ${opts.periodLabel}`, 14, y); y += 6;
  if (opts.companyName) { doc.text(`Entreprise : ${opts.companyName}`, 14, y); y += 6; }
  if (opts.singleWorkerName) { doc.text(`Salarié : ${opts.singleWorkerName}`, 14, y); y += 6; }

  const route = routeMinutesByEntry(entries);
  let routeTotal = 0;
  route.forEach((m) => { routeTotal += m; });
  const workMinutes = entries.reduce((sum, e) => sum + e.total_minutes, 0);
  const totalMinutes = workMinutes + (opts.travelPaid ? routeTotal : 0);
  const paniers = entries.filter((e) => e.meal_allowance).length;
  doc.text(`Total heures : ${formatMinutesToHours(totalMinutes)}`, 14, y);
  doc.text(`Paniers repas : ${paniers}`, 100, y);
  y += 6;
  if (routeTotal > 0) {
    doc.text(
      `Dont route : ${formatMinutesToHours(routeTotal)} — ${opts.travelPaid ? 'payée, comprise dans le total' : 'non payée, hors total'}`,
      14, y,
    );
    y += 6;
  }
  y += 2;

  const head = includeWorker
    ? [['Date', 'Salarié', 'Client', 'Ville', 'Début', 'Fin', 'Pause', 'Route', 'Total', 'Panier', 'Statut']]
    : [['Date', 'Client', 'Ville', 'Début', 'Fin', 'Pause', 'Route', 'Total', 'Panier', 'Statut']];

  const body = entries.map((entry) => {
    const cols: string[] = [format(parseISO(entry.work_date), 'dd/MM/yyyy')];
    if (includeWorker) {
      cols.push(`${entry.user?.first_name ?? ''} ${entry.user?.last_name ?? ''}`.trim() || '-');
    }
    cols.push(
      entry.worksite?.client_name || '-',
      entry.worksite?.city || '-',
      entry.start_time?.substring(0, 5) || '-',
      entry.end_time?.substring(0, 5) || '-',
      `${entry.break_minutes} min`,
      `${route.get(entry.id) || 0} min`,
      formatMinutesToHours(entry.total_minutes + (opts.travelPaid ? (route.get(entry.id) || 0) : 0)),
      entry.meal_allowance ? 'Oui' : 'Non',
      statusLabel(entry.status),
    );
    return cols;
  });

  autoTable(doc, {
    startY: y,
    head,
    body,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 64, 175] },
  });

  doc.save(`${opts.fileName}.pdf`);
}
