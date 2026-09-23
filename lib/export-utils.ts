// Shared Excel/PDF export helpers used by the global team export (admin-export)
// and the per-employee fiche export (worker-detail). Generation only — locking
// of exported entries stays in the caller (only the payroll export locks).

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { TimeEntryWithWorksite, User } from '@/lib/types';
import { routeMinutesByEntry, DEFAULT_OVERTIME_RATES, TIER_1_MINUTES, type OvertimeRates } from '@/lib/overtime';
import { weekStart, weekEnd } from '@/lib/week';

export type ExportEntry = TimeEntryWithWorksite & { user?: User };

/** Une ligne du récapitulatif : un salarié, une semaine. */
interface RecapRow {
  userId: string; worker: string; firstName: string; lastName: string;
  weekStart: string; weekEnd: string;
  minutes: number; normalMinutes: number; overtimeMinutes: number;
  overtime1Minutes: number; overtime2Minutes: number;
  routeMinutes: number; base: number | null;
}

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
  /**
   * Horaire hebdomadaire de base, salarié par salarié (voir lib/overtime.ts).
   * Absent = pas de récapitulatif des heures supplémentaires : le comptable
   * préfère une colonne manquante à un chiffre inventé.
   */
  weeklyHoursByWorker?: Map<string, number>;
  /**
   * Les SEMAINES ENTIÈRES qui recouvrent la période, pour le récapitulatif.
   *
   * Sans ça, une période commençant un vendredi sous-estime les heures
   * supplémentaires : les 35 h déjà faites du lundi au jeudi manquent au
   * décompte et les 8 h du vendredi passent pour des heures normales. Absent =
   * pas de récapitulatif du tout, plutôt qu'un récapitulatif faux.
   */
  recapEntries?: ExportEntry[];
  /** Taux de majoration de l'entreprise. Absent = taux légaux français. */
  overtimeRates?: OvertimeRates;
  /**
   * Le matricule de paie, salarié par salarié — la clé que le logiciel du
   * comptable utilise pour rattacher une ligne à un bulletin. Sans lui, le
   * fichier se lit mais ne s'importe pas : c'est le nom qui sert de clé, et
   * deux homonymes suffisent à tout fausser. Absent = colonne vide, jamais
   * un numéro inventé.
   */
  payrollIdByWorker?: Map<string, string>;
  /**
   * LES JOURS RÉELLEMENT PAYÉS, quand ils ne couvrent pas des semaines entières.
   *
   * `recapEntries` porte des SEMAINES ENTIÈRES, et c'est voulu : sans la
   * semaine complète, les heures supplémentaires sont sous-comptées. Mais une
   * semaine entière déborde de la période choisie — un export du 01/09 au
   * 30/09 traîne le lundi 31/08 avec lui.
   *
   * Tant que ce débordement n'apparaissait que dans un onglet de récapitulatif
   * à côté du détail, il informait. Dans le CSV, le récapitulatif EST le
   * fichier : ce qui y figure est payé. Le 31/08 serait donc payé en
   * septembre, puis repayé à l'export d'août.
   *
   * Avec ce champ, la semaine reste entière pour CLASSER les heures (normales,
   * 25 %, 50 %) mais seuls les jours de la période sont COMPTÉS. Deux périodes
   * qui se suivent ne partagent alors plus un seul jour.
   *
   * Absent = tous les jours comptent (comportement de l'onglet Excel, inchangé).
   */
  payPeriod?: { from: string; to: string };
}

/**
 * Récapitulatif par salarié et par semaine : total, dont route payée, et
 * heures supplémentaires.
 *
 * C'est ce que le comptable saisit réellement — le détail ligne à ligne sert
 * à justifier, pas à recopier. Les heures supplémentaires se comptent à la
 * semaine (lib/overtime.ts), sur des semaines ENTIÈRES.
 */
function weeklyRecap(opts: ExportOptions) {
  const source = opts.recapEntries;
  if (!source || source.length === 0) return [];
  const route = routeMinutesByEntry(source);
  const byWorker = new Map<string, {
    name: string; first: string; last: string;
    /** Minutes travaillées (route payée comprise) et route, JOUR par jour. */
    byDay: Map<string, { minutes: number; route: number }>;
  }>();
  for (const e of source) {
    const id = e.user_id;
    const first = e.user?.first_name ?? '';
    const last = e.user?.last_name ?? '';
    const name = opts.singleWorkerName || `${first} ${last}`.trim() || 'Salarié';
    const cur = byWorker.get(id) || { name, first, last, byDay: new Map<string, { minutes: number; route: number }>() };
    const r = opts.travelPaid ? (route.get(e.id) || 0) : 0;
    const d = cur.byDay.get(e.work_date) || { minutes: 0, route: 0 };
    d.minutes += e.total_minutes + r;
    d.route += r;
    cur.byDay.set(e.work_date, d);
    byWorker.set(id, cur);
  }

  const dansLaPeriode = (jour: string) =>
    !opts.payPeriod || (jour >= opts.payPeriod.from && jour <= opts.payPeriod.to);

  const out: RecapRow[] = [];
  byWorker.forEach((v, id) => {
    const base = opts.weeklyHoursByWorker?.get(id);
    // Sans horaire de base connu, on n'annonce aucune heure supplémentaire :
    // une colonne vide vaut mieux qu'un chiffre faux.
    const seuil = base == null ? Number.MAX_SAFE_INTEGER : Math.max(0, Math.round(base * 60));

    // Les jours groupés par semaine ISO — le même découpage que weeklyTotals.
    const semaines = new Map<string, string[]>();
    // Array.from : la cible TypeScript du projet n'itère pas un Map directement.
    for (const jour of Array.from(v.byDay.keys())) {
      const k = format(weekStart(new Date(`${jour}T00:00:00`)), 'yyyy-MM-dd');
      const arr = semaines.get(k); if (arr) arr.push(jour); else semaines.set(k, [jour]);
    }

    Array.from(semaines.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([debut, jours]) => {
      jours.sort();
      // La SEMAINE ENTIÈRE sert à classer : on la parcourt dans l'ordre, et
      // chaque jour hérite de la tranche où il tombe (les premières `seuil`
      // minutes sont normales, les 8 h suivantes à 25 %, le reste à 50 %).
      // Puis on ne GARDE que les jours de la période payée. Un jour ne peut
      // donc jamais être compté dans deux exports qui se suivent.
      let cumul = 0;
      let minutes = 0, normal = 0, t1 = 0, t2 = 0, routeM = 0;
      let auMoinsUnJourPaye = false;
      for (const jour of jours) {
        const j = v.byDay.get(jour)!;
        const debutJ = cumul;
        const finJ = cumul + j.minutes;
        cumul = finJ;
        if (!dansLaPeriode(jour)) continue;
        auMoinsUnJourPaye = true;
        const tranche = (lo: number, hi: number) => Math.max(0, Math.min(finJ, hi) - Math.max(debutJ, lo));
        minutes += j.minutes;
        routeM += j.route;
        normal += tranche(0, seuil);
        t1 += tranche(seuil, seuil + TIER_1_MINUTES);
        t2 += tranche(seuil + TIER_1_MINUTES, Number.MAX_SAFE_INTEGER);
      }
      // Une semaine dont aucun jour n'est payé ne produit pas de ligne vide.
      if (!auMoinsUnJourPaye) return;
      out.push({
        userId: id, worker: v.name, firstName: v.first, lastName: v.last,
        weekStart: debut,
        weekEnd: format(weekEnd(new Date(`${debut}T00:00:00`)), 'yyyy-MM-dd'),
        minutes,
        normalMinutes: normal,
        overtimeMinutes: t1 + t2,
        overtime1Minutes: t1,
        overtime2Minutes: t2,
        routeMinutes: routeM,
        base: base ?? null,
      });
    });
  });
  return out.sort((a, b) => a.worker.localeCompare(b.worker) || a.weekStart.localeCompare(b.weekStart));
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

/**
 * Construit le classeur. Séparé de l'écriture du fichier : le même classeur
 * part en téléchargement ET en pièce jointe au comptable, sans risque que les
 * deux divergent.
 */
function buildWorkbook(entries: ExportEntry[], opts: ExportOptions) {
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

  // Le récapitulatif vient EN PREMIER : c'est la feuille que le comptable
  // ouvre et saisit. Le détail derrière sert à justifier une ligne.
  const recap = weeklyRecap(opts);
  // Les taux de l'entreprise, affichés dans l'en-tête des colonnes : le
  // comptable lit « Heures sup. 25 % » et sait quoi appliquer, sans avoir à
  // demander ni à supposer.
  const t1 = opts.overtimeRates?.tier1 ?? DEFAULT_OVERTIME_RATES.tier1;
  const t2 = opts.overtimeRates?.tier2 ?? DEFAULT_OVERTIME_RATES.tier2;
  if (recap.length) {
    const recapRows = recap.map((r) => {
      const row: Record<string, string | number> = {};
      if (includeWorker) row['Salarié'] = r.worker;
      row['Semaine du'] = format(parseISO(r.weekStart), 'dd/MM/yyyy');
      row['au'] = format(parseISO(r.weekEnd), 'dd/MM/yyyy');
      row['Base (h/sem.)'] = r.base ?? '-';
      row['Heures normales'] = formatMinutesToHours(r.normalMinutes);
      // Deux colonnes plutôt qu'une : le comptable doit payer les 8 premières
      // heures sup à un taux et les suivantes à un autre. Un total unique
      // l'obligeait à refaire la ventilation à la main, semaine par semaine.
      //
      // Le NUMÉRO du palier fait partie du nom, pas seulement le taux. Une
      // entreprise a le droit de mettre le même pourcentage aux deux paliers
      // (25 / 25) : les deux clés seraient alors identiques, la seconde
      // écraserait la première, et les 8 premières heures supplémentaires
      // disparaîtraient du tableur envoyé au comptable — sans erreur, sans
      // trace. Des heures qui s'évaporent d'un fichier de paie.
      row[`Heures sup. 1 (${t1} %)`] = r.base == null ? '-' : formatMinutesToHours(r.overtime1Minutes);
      row[`Heures sup. 2 (${t2} %)`] = r.base == null ? '-' : formatMinutesToHours(r.overtime2Minutes);
      row['Total semaine'] = formatMinutesToHours(r.minutes);
      return row;
    });
    const wsRecap = XLSX.utils.json_to_sheet(recapRows);
    wsRecap['!cols'] = [
      ...(includeWorker ? [{ wch: 20 }] : []),
      { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 16 }, { wch: 17 }, { wch: 17 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, wsRecap, 'Récapitulatif');
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Détail');
  return wb;
}

export function exportEntriesToExcel(entries: ExportEntry[], opts: ExportOptions): void {
  XLSX.writeFile(buildWorkbook(entries, opts), `${opts.fileName}.xlsx`);
}

/** Le même classeur, encodé pour être joint à un e-mail. */
export function excelAsBase64(entries: ExportEntry[], opts: ExportOptions): string {
  return XLSX.write(buildWorkbook(entries, opts), { type: 'base64', bookType: 'xlsx' });
}

// ─── CSV pour le logiciel de paie ────────────────────────────────────────────
//
// Le PDF se lit, l'Excel se relit, le CSV s'IMPORTE. Ce n'est pas le même
// fichier et ce n'est pas le même lecteur : celui-ci s'adresse à un programme.
// D'où trois choix qui n'en sont pas :
//
//  · le point-virgule, parce qu'Excel français coupe là et pas sur la virgule ;
//  · la virgule décimale, pour la même raison (7.5 devient une date en France) ;
//  · le BOM UTF-8, sans lequel « Rénovation » s'affiche « RÃ©novation ».
//
// UNE LIGNE = UN SALARIÉ × UNE SEMAINE. C'est la maille de la paie : les
// heures supplémentaires se comptent à la semaine, jamais au jour. Le détail
// pointage par pointage reste dans l'Excel — il justifie, il ne se saisit pas.
//
// Les noms de colonnes et les codes de rubrique (HN, HS25…) se règlent cabinet
// par cabinet dans Silae, Sage ou Cegid : aucun format universel n'existe. Ce
// fichier donne les BONNES VALEURS dans des colonnes nommées en clair ; le
// comptable fait correspondre les colonnes une fois, à son premier import.

/** Échappement CSV : guillemets doublés, et on cite dès qu'un séparateur traîne. */
function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Des minutes en centièmes d'heure, virgule française : 450 → « 7,50 ». */
function centiemes(minutes: number): string {
  return (minutes / 60).toFixed(2).replace('.', ',');
}

/**
 * Le récapitulatif de paie, en CSV importable.
 *
 * Renvoie le texte du fichier — l'écriture est séparée pour que la même chaîne
 * puisse partir en téléchargement comme en pièce jointe, sans diverger.
 */
export function payrollCsv(opts: ExportOptions): string {
  const recap = weeklyRecap(opts);
  const rates = opts.overtimeRates || DEFAULT_OVERTIME_RATES;
  const head = [
    'Matricule', 'Nom', 'Prenom',
    'Semaine du', 'Semaine au',
    'Heures normales', `Heures sup ${rates.tier1}%`, `Heures sup ${rates.tier2}%`,
    'Dont route payee', 'Total heures',
    'Base hebdo', 'Controle h:min',
  ];
  const lines = [head.map(csvCell).join(';')];
  for (const r of recap) {
    lines.push([
      opts.payrollIdByWorker?.get(r.userId) || '',
      r.lastName || r.worker,
      r.firstName,
      format(parseISO(r.weekStart), 'dd/MM/yyyy'),
      format(parseISO(r.weekEnd), 'dd/MM/yyyy'),
      centiemes(r.normalMinutes),
      centiemes(r.overtime1Minutes),
      centiemes(r.overtime2Minutes),
      centiemes(r.routeMinutes),
      centiemes(r.minutes),
      // Sans horaire de base connu, rien n'est réparti : on laisse vide plutôt
      // que d'écrire 35 et de faire passer des heures sup pour des normales.
      r.base == null ? '' : String(r.base).replace('.', ','),
      formatMinutesToHours(r.minutes),
    ].map(csvCell).join(';'));
  }
  // CRLF : c'est ce qu'attendent Excel et la plupart des imports de paie.
  return lines.join('\r\n') + '\r\n';
}

export function exportEntriesToCSV(opts: ExportOptions): void {
  // Le BOM en tête du Blob, pas dans la chaîne : la chaîne sert aussi ailleurs.
  const blob = new Blob(['﻿', payrollCsv(opts)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${opts.fileName}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

  // Récapitulatif d'abord : c'est ce que le comptable saisit. Le détail suit,
  // pour justifier une ligne si on la lui conteste.
  const recap = weeklyRecap(opts);
  const pt1 = opts.overtimeRates?.tier1 ?? DEFAULT_OVERTIME_RATES.tier1;
  const pt2 = opts.overtimeRates?.tier2 ?? DEFAULT_OVERTIME_RATES.tier2;
  // Les taux de l'entreprise, affichés dans l'en-tête des colonnes : le
  // comptable lit « Heures sup. 25 % » et sait quoi appliquer, sans avoir à
  // demander ni à supposer.
  const t1 = opts.overtimeRates?.tier1 ?? DEFAULT_OVERTIME_RATES.tier1;
  const t2 = opts.overtimeRates?.tier2 ?? DEFAULT_OVERTIME_RATES.tier2;
  if (recap.length) {
    autoTable(doc, {
      startY: y,
      head: [[
        ...(includeWorker ? ['Salarié'] : []),
        'Semaine du', 'au', 'Base', 'Heures normales',
        `Sup. 1 (${pt1} %)`, `Sup. 2 (${pt2} %)`, 'Total semaine',
      ]],
      body: recap.map((r) => [
        ...(includeWorker ? [r.worker] : []),
        format(parseISO(r.weekStart), 'dd/MM/yyyy'),
        format(parseISO(r.weekEnd), 'dd/MM/yyyy'),
        r.base == null ? '-' : `${r.base} h`,
        formatMinutesToHours(r.normalMinutes),
        r.base == null ? '-' : formatMinutesToHours(r.overtime1Minutes),
        r.base == null ? '-' : formatMinutesToHours(r.overtime2Minutes),
        formatMinutesToHours(r.minutes),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [21, 18, 15] },
    });
    // @ts-expect-error — lastAutoTable est posé par jspdf-autotable sur le document.
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
    doc.setFontSize(11);
    doc.text('Détail des interventions', 14, y);
    y += 4;
  }

  autoTable(doc, {
    startY: y,
    head,
    body,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 64, 175] },
  });

  doc.save(`${opts.fileName}.pdf`);
}
