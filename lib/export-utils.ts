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
}

function formatMinutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

// No validation step anymore: anything not a draft counts as "Envoyé".
function statusLabel(status: string): string {
  return status === 'draft' ? 'Brouillon' : 'Envoyé';
}

export function exportEntriesToExcel(entries: ExportEntry[], opts: ExportOptions): void {
  const includeWorker = !opts.singleWorkerName;

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
    row['Total heures'] = formatMinutesToHours(entry.total_minutes);
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
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 30 },
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

  const totalMinutes = entries.reduce((sum, e) => sum + e.total_minutes, 0);
  const paniers = entries.filter((e) => e.meal_allowance).length;
  doc.text(`Total heures : ${formatMinutesToHours(totalMinutes)}`, 14, y);
  doc.text(`Paniers repas : ${paniers}`, 100, y);
  y += 8;

  const head = includeWorker
    ? [['Date', 'Salarié', 'Client', 'Ville', 'Début', 'Fin', 'Pause', 'Total', 'Panier', 'Statut']]
    : [['Date', 'Client', 'Ville', 'Début', 'Fin', 'Pause', 'Total', 'Panier', 'Statut']];

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
      formatMinutesToHours(entry.total_minutes),
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
