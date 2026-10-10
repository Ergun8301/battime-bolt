'use client';

// Lot 3 — « Imprimer le planning » : une feuille A4 paysage, à afficher au dépôt
// ou à faire signer. Deux pièces :
//  - PrintMenu : le petit menu d'options sous l'icône 🖨 de la barre (la période,
//    toute l'équipe ou un salarié, colonne signature) ;
//  - PlanningPrintSheet : la grille imprimée, montée dans <body> UNIQUEMENT pendant
//    l'impression (cachée à l'écran). Elle reprend les classes et les bulles de
//    l'écran (PL_GRID_CSS, BubbleContent) : le papier ressemble à l'écran, sans ce
//    qui ne sert qu'à l'écran (boutons, « + », sélection, direct, jour J, statuts).
// Lot 3bis : n'importe quelle période — une semaine (‹ ›), un jour (date,
// Aujourd'hui / Demain), un mois (une ligne par salarié, codes des chantiers) —
// par défaut celle de l'écran. Une période hors de l'écran est LUE à part
// (lib/planning-print-data.ts), sans rien écrire.
//
// Rien ici n'écrit en base, et rien ne touche à « Exporter » (qui, lui, verrouille
// les heures de la période) : imprimer ne change aucune donnée.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { format, getISOWeek, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Loader2, Printer } from 'lucide-react';
import { DAY_PARTS } from '@/supabase/functions/_shared/day-part';
import { addDaysISO, ISO_DAY, normalizePeriod, periodDays, shiftPeriod, switchKind, type PeriodKind, type PrintPeriod } from '@/supabase/functions/_shared/print-period';
import type { PrintData } from '@/lib/planning-print-data';

export interface PrintOptions {
  period: PrintPeriod;
  /** 'all' = toute l'équipe, sinon l'id du salarié. */
  who: string;
  signature: boolean;
}
export interface PrintJob extends PrintOptions {
  /** Période lue à part (hors de l'écran) ; null = les données de l'écran. */
  data: PrintData | null;
  /** Monté par Ctrl+P (menu du navigateur) : la page imprime déjà, ne rien relancer. */
  auto?: boolean;
  printedAt: Date;
}
export interface PrintRow { id: string; name: string; initials: string; tint: { background: string; color: string } }

// Seule la signature est retenue. La période part toujours de celle de l'écran
// (lot 3bis), et le salarié revient toujours à « Toute l'équipe » : une feuille
// d'une seule personne par erreur passerait inaperçue sur le panneau du dépôt.
// Un ancien réglage « scope » (lot 3) est simplement ignoré.
const STORE_KEY = 'bemexo_print';
function readPrefs(): { signature: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { signature: v.signature === true };
  } catch { return { signature: false }; }
}
function savePrefs(p: { signature: boolean }) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch { /* stockage indisponible : réglage pour la session */ }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dayFull = (d: Date) => cap(format(d, 'EEEE', { locale: fr }));
/** « 19 – 25 octobre 2026 », « 26 octobre – 1 novembre 2026 », « 28 décembre 2026 – 3 janvier 2027 ». */
function rangeLabel(days: Date[]): string {
  const a = days[0], b = days[days.length - 1];
  if (a.getFullYear() !== b.getFullYear()) return `${format(a, 'd MMMM yyyy', { locale: fr })} – ${format(b, 'd MMMM yyyy', { locale: fr })}`;
  if (a.getMonth() !== b.getMonth()) return `${format(a, 'd MMMM', { locale: fr })} – ${format(b, 'd MMMM yyyy', { locale: fr })}`;
  return `${format(a, 'd')} – ${format(b, 'd MMMM yyyy', { locale: fr })}`;
}

/**
 * Libellé court du menu : « S-43 · 19 – 25 oct. », « S-44 · 26 oct. – 1 nov. »
 * (l'année quand ce n'est pas celle d'aujourd'hui), « Octobre 2026 ».
 */
export function periodLabel(p: PrintPeriod, today: string): string {
  const days = periodDays(p).map((d) => parseISO(d));
  const a = days[0], b = days[days.length - 1];
  if (p.kind === 'month') return cap(format(a, 'MMMM yyyy', { locale: fr }));
  if (p.kind === 'day') return cap(format(a, 'EEEE d MMMM yyyy', { locale: fr }));
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const range = sameMonth ? `${format(a, 'd')} – ${format(b, 'd MMM', { locale: fr })}` : `${format(a, 'd MMM', { locale: fr })} – ${format(b, 'd MMM', { locale: fr })}`;
  const year = a.getFullYear() !== b.getFullYear() || format(b, 'yyyy') !== today.slice(0, 4) ? ` ${format(b, 'yyyy')}` : '';
  return `S-${getISOWeek(a)} · ${range}${year}`;
}

/** Titre de l'onglet pendant l'impression : il devient le nom du PDF et l'en-tête de Chrome. */
export function printTitle(job: PrintOptions, company: string, workerName?: string | null): string {
  const p = normalizePeriod(job.period);
  const d = parseISO(p.start);
  const what = p.kind === 'week' ? `Planning S-${getISOWeek(d)}`
    : p.kind === 'day' ? `Planning ${format(d, 'EEEE d MMMM', { locale: fr })}`
      : `Planning ${format(d, 'MMMM yyyy', { locale: fr })}`;
  return `${what} – ${company}${workerName ? ` – ${workerName}` : ''}`;
}

export const PRINT_MENU_CSS = `
.bt-pl-pr{width:286px;max-width:calc(100vw - 24px)}
.bt-pl-pr-sec{padding:9px 13px;border-top:1px solid rgba(21,18,15,.06)}
.bt-pl-pr-fs{border:0;margin:0;padding:0;min-width:0}
.bt-pl-pr-fs:disabled{opacity:.55}
.bt-pl-pr-lbl{display:block;font-size:11px;font-weight:700;color:#6E6A63;margin-bottom:6px}
.bt-pl-pr-seg{display:flex;gap:6px}
.bt-pl-pr-opt{flex:1;height:30px;border-radius:9px;border:1.5px solid rgba(21,18,15,.16);background:#FAF7F0;font:inherit;font-size:12.5px;font-weight:800;color:#15120F;cursor:pointer}
.bt-pl-pr-opt[aria-pressed="true"],.bt-pl-pr-chip[aria-pressed="true"]{background:#FFC21A;border-color:#15120F}
.bt-pl-pr-nav{display:flex;align-items:center;gap:6px;margin-top:7px}
.bt-pl-pr-arr{flex:none;width:30px;height:30px;padding:0;border-radius:8px;border:1.5px solid rgba(21,18,15,.16);background:#fff;font:inherit;font-size:16px;font-weight:900;line-height:1;color:#15120F;cursor:pointer}
.bt-pl-pr-cur{flex:1;min-width:0;text-align:center;font-size:12.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt-pl-pr-dayrow{display:flex;flex-direction:column;gap:6px;margin-top:7px}
.bt-pl-pr-chips{display:flex;gap:6px}
.bt-pl-pr-chip{flex:1;height:28px;border-radius:8px;border:1.5px solid rgba(21,18,15,.16);background:#fff;font:inherit;font-size:12px;font-weight:800;color:#15120F;cursor:pointer}
.bt-pl-pr-date{width:100%;height:32px;border-radius:9px;border:1.5px solid rgba(21,18,15,.16);background:#F9F5EC;font:inherit;font-size:13px;font-weight:700;color:#15120F;padding:0 9px}
.bt-pl-pr-sel{width:100%;height:32px;border-radius:9px;border:1.5px solid rgba(21,18,15,.16);background:#F9F5EC;font:inherit;font-size:13px;font-weight:700;color:#15120F;padding:0 9px}
.bt-pl-pr-chk{display:flex;align-items:center;gap:8px;margin-top:9px;font-size:12.5px;font-weight:700;color:#15120F;cursor:pointer}
.bt-pl-pr-chk input{width:15px;height:15px;accent-color:#15120F}
.bt-pl-pr-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 13px;border-top:1px solid rgba(21,18,15,.08);background:#FBF6EA}
.bt-pl-pr-note{font-size:11px;color:#6E6A63;font-weight:600}
.bt-pl-pr-go{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 13px;border-radius:9px;border:0;background:#15120F;color:#fff;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;flex:none}
.bt-pl-pr-go:disabled{opacity:.7;cursor:progress}
.bt-pl-pr-go:focus-visible,.bt-pl-pr-opt:focus-visible,.bt-pl-pr-arr:focus-visible,.bt-pl-pr-chip:focus-visible,.bt-pl-pr-date:focus-visible{outline:2px solid #FFC21A;outline-offset:1px}
`;

const KINDS: { kind: PeriodKind; label: string }[] = [{ kind: 'week', label: 'Semaine' }, { kind: 'day', label: 'Jour' }, { kind: 'month', label: 'Mois' }];

/** Le menu d'options, ancré à droite sous l'icône 🖨 (même famille que la légende). */
export function PrintMenu({ displayed, workers, busy, onPrint, onClose }: {
  /** La période de l'écran : le menu s'ouvre toujours sur elle. */
  displayed: PrintPeriod;
  workers: { id: string; name: string }[];
  /** Lecture d'une période hors de l'écran en cours : options figées, « Préparation… ». */
  busy: boolean;
  onPrint: (o: PrintOptions) => void;
  onClose: () => void;
}) {
  // « Aujourd'hui » lu à l'ouverture du menu (et non au rendu de la page) : juste
  // aussi sur un onglet resté ouvert depuis la veille.
  const [today] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [period, setPeriod] = useState<PrintPeriod>(() => normalizePeriod(displayed));
  const [signature, setSignature] = useState(() => readPrefs().signature);
  const [who, setWho] = useState('all');
  const goRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Après un échec de lecture, le menu reste ouvert : « Imprimer » reprend le focus (Entrée = réessayer).
  const wasBusy = useRef(false);
  useEffect(() => { if (wasBusy.current && !busy) goRef.current?.focus(); wasBusy.current = busy; }, [busy]);
  const pickSig = (v: boolean) => { setSignature(v); savePrefs({ signature: v }); };
  const tomorrow = addDaysISO(today, 1);
  const kind = period.kind;
  return (
    <div className="bt-pl-dd bt-pl-pr" role="group" aria-label="Imprimer le planning" data-testid="print-menu">
      <div className="bt-pl-dd-h">Imprimer le planning</div>
      <fieldset className="bt-pl-pr-fs" disabled={busy}>
        <div className="bt-pl-pr-sec">
          <span className="bt-pl-pr-lbl">Période</span>
          <div className="bt-pl-pr-seg">
            {KINDS.map((k) => (
              <button key={k.kind} type="button" className="bt-pl-pr-opt" aria-pressed={kind === k.kind} data-testid={`print-scope-${k.kind}`}
                onClick={() => setPeriod(switchKind(period, k.kind, today))}>{k.label}</button>
            ))}
          </div>
          {kind === 'day' ? (
            <div className="bt-pl-pr-dayrow">
              <div className="bt-pl-pr-chips">
                <button type="button" className="bt-pl-pr-chip" aria-pressed={period.start === today} data-testid="print-today" onClick={() => setPeriod({ kind: 'day', start: today })}>Aujourd&apos;hui</button>
                <button type="button" className="bt-pl-pr-chip" aria-pressed={period.start === tomorrow} data-testid="print-tomorrow" onClick={() => setPeriod({ kind: 'day', start: tomorrow })}>Demain</button>
              </div>
              {/* Champ vidé : on garde le dernier jour valable (jamais de période vide). */}
              <input type="date" className="bt-pl-pr-date" data-testid="print-date" aria-label="Jour à imprimer" value={period.start}
                onChange={(e) => { if (ISO_DAY.test(e.target.value)) setPeriod({ kind: 'day', start: e.target.value }); }} />
            </div>
          ) : (
            <div className="bt-pl-pr-nav">
              <button type="button" className="bt-pl-pr-arr" data-testid="print-prev" aria-label={kind === 'week' ? 'Semaine précédente' : 'Mois précédent'}
                onClick={() => setPeriod(shiftPeriod(period, -1))}>‹</button>
              <span className="bt-pl-pr-cur" data-testid="print-period-label" aria-live="polite">{periodLabel(period, today)}</span>
              <button type="button" className="bt-pl-pr-arr" data-testid="print-next" aria-label={kind === 'week' ? 'Semaine suivante' : 'Mois suivant'}
                onClick={() => setPeriod(shiftPeriod(period, 1))}>›</button>
            </div>
          )}
        </div>
        <div className="bt-pl-pr-sec">
          <label className="bt-pl-pr-lbl" htmlFor="bt-pl-pr-who">Salariés</label>
          <select id="bt-pl-pr-who" className="bt-pl-pr-sel" value={who} onChange={(e) => setWho(e.target.value)} data-testid="print-who">
            <option value="all">Toute l&apos;équipe</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <label className="bt-pl-pr-chk">
            <input type="checkbox" checked={signature} onChange={(e) => pickSig(e.target.checked)} data-testid="print-sig" />
            Avec colonne signature
          </label>
        </div>
      </fieldset>
      <div className="bt-pl-pr-foot">
        {/* Pendant la lecture, « Préparation… » prend la place : la note reviendrait sur deux lignes. */}
        <span className="bt-pl-pr-note">{busy ? '' : 'A4 paysage, en couleur'}</span>
        <button ref={goRef} type="button" className="bt-pl-pr-go" data-testid="print-go" autoFocus disabled={busy} aria-busy={busy || undefined}
          onClick={() => onPrint({ period, who, signature })}>
          {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Préparation…</> : <><Printer className="h-3.5 w-3.5" /> Imprimer</>}
        </button>
      </div>
    </div>
  );
}

// La feuille n'existe qu'à l'impression : cachée à l'écran, seule visible sur papier.
// Le @page n'existe que tant qu'elle est montée : Ctrl+P ailleurs reste inchangé.
// Les règles de grille (PL_GRID_CSS) viennent de la page, qui reste montée.
export const PRINT_SHEET_CSS = `
@media screen{.bt-print{display:none!important}}
@media print{
  @page{size:A4 landscape;margin:8mm}
  html,body{background:#fff!important;margin:0!important;padding:0!important;height:auto!important;min-height:0!important;overflow:visible!important}
  /* L'appli, les fenêtres (portails Radix) et les petits messages : rien d'autre que la feuille. */
  body>*:not(.bt-print){display:none!important}
  .bt-print{display:block!important;font-family:'Archivo',sans-serif;color:#15120F;background:#fff}
  .bt-print--week{zoom:.8}
  /* Sans « graphiques d'arrière-plan », Chrome efface les fonds : les bulles noires
     (heures envoyées) deviendraient du texte pâle sur blanc, les hachures disparaîtraient. */
  .bt-print,.bt-print *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .bt-print .bt-pl-table{min-width:0;width:100%}
  .bt-print thead{display:table-header-group}
  .bt-print tr{break-inside:avoid;page-break-inside:avoid}
  /* Coin « S-43 / Salarié » : ses deux étiquettes sont placées en absolu dans la case. */
  .bt-print .bt-pl-th-name{position:relative;width:auto}
  .bt-print .bt-pl-namecell{position:static}
  .bt-print .bt-pl-namebtn{padding:10px 8px;cursor:default}
  /* Le nom ENTIER sur la feuille (elle se signe) : il passe à la ligne, jamais « … ». */
  .bt-print .bt-pl-name{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere;line-height:1.15}
  .bt-print .bt-pl-cellinner{min-height:0}
  .bt-print .bt-pl-cellfill{cursor:default}
  .bt-print-title>th{border:0;padding:0 0 6px;text-align:left;font-weight:400;background:#fff}
  .bt-print-tl{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
  .bt-print-co{font-size:15px;font-weight:900}
  .bt-print-what{font-size:13px;font-weight:800;text-align:center}
  .bt-print-at{font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#6E6A63;white-space:nowrap}
  .bt-print-leg{display:flex;flex-wrap:wrap;gap:12px;margin-top:4px;font-size:10px;font-weight:600;color:#57524A}
  .bt-print-sw{display:inline-block;width:11px;height:11px;border-radius:3px;border:1px dashed;margin-right:4px;vertical-align:-1px}
  .bt-print-sig{border-left:2px solid #15120F}
  th.bt-print-sig .bt-pl-th-day{font-size:13px}
  td.bt-print-sig{height:56px}
  .bt-print--day .bt-pl-cellfill{flex-direction:row;flex-wrap:wrap;align-items:flex-start}
  .bt-print--day .bt-pl-cellfill>*{flex:0 0 230px}
  /* Lot 3bis — le MOIS : une ligne par salarié, une colonne par jour, sur 1062 px
     utiles (A4 paysage). Dans une case : un petit bloc par intervention, le code du
     chantier (clé en tête de chaque page), la couleur du créneau, noir = envoyé. */
  .bt-print--month .bt-print-title>th{padding-bottom:4px}
  .bt-print--month .bt-print-tl{gap:12px}
  .bt-print--month .bt-print-co{font-size:13px}
  .bt-print--month .bt-print-what{font-size:12px}
  .bt-print--month .bt-print-at{font-size:8.5px}
  .bt-print--month .bt-print-leg{gap:10px;margin-top:3px;font-size:8.5px}
  .bt-print--month .bt-print-sw{width:9px;height:9px;border-radius:2px;margin-right:3px}
  .bt-print-m-key{margin-top:3px;font-size:8.5px;font-weight:600;color:#57524A;line-height:1.35}
  .bt-print-m-key b{font-weight:900;color:#15120F}
  .bt-print-m{width:100%;border-collapse:collapse;table-layout:fixed}
  .bt-print-m col.n{width:32mm}
  .bt-print-m col.sig{width:17mm}
  .bt-print-m th.d{padding:2px 0 3px;text-align:center;border:1px solid rgba(21,18,15,.25);border-bottom:1.5px solid #15120F;line-height:1;font-weight:400}
  .bt-print-m .wd{display:block;font-size:7px;font-weight:700;color:#6E6A63;text-transform:uppercase}
  .bt-print-m .dn{display:block;font-size:9.5px;font-weight:900;margin-top:1px}
  .bt-print-m th.sig .dn{font-size:7.5px}
  .bt-print-m th.n{text-align:left;padding:2px 5px;font-size:9px;font-weight:900;border:1px solid rgba(21,18,15,.25);border-right:1.5px solid #15120F;border-bottom:1.5px solid #15120F}
  .bt-print-m .we{background:#F4F1EA}
  .bt-print-m .mon{border-left:1.5px solid #15120F}
  .bt-print-m td{border:1px solid rgba(21,18,15,.22);padding:1px;vertical-align:top}
  .bt-print-m td.n{padding:3px 5px;font-size:9px;font-weight:800;line-height:1.12;overflow-wrap:anywhere;border-right:1.5px solid #15120F;vertical-align:middle}
  .bt-print-m.with-sig tbody td{height:8mm}
  .bt-print-m .sig{border-left:1.5px solid #15120F}
  .bt-print-m-b{display:block;height:11px;line-height:11px;margin-bottom:1px;border-radius:2px;border-left:2px solid;font-size:7.5px;font-weight:800;text-align:center;white-space:nowrap;overflow:hidden;color:#15120F;letter-spacing:-.02em}
  .bt-print-m-b:last-child{margin-bottom:0}
  .bt-print-m-b.is-real{background:#15120F;color:#F2EDE3}
  .bt-print-m-b.is-white{border:1px dashed;border-left-width:2px}
  .bt-print-m-b.is-off{opacity:.55;text-decoration:line-through}
  .bt-print-m-abs{display:flex;align-items:center;justify-content:center;min-height:12px;height:100%;font-size:8.5px;font-weight:900;border-radius:2px}
}
/* Navigateur qui ignore @page (Firefox, Safari) et imprime en portrait : le mois reste une grille. */
@media print and (orientation:portrait){.bt-print--month{zoom:.67}}
`;
// Objet FIXE, comme PL_STYLE (admin-planning) : un nouvel objet à chaque rendu
// ferait réécrire la feuille de style par React.
const PRINT_SHEET_STYLE = { __html: PRINT_SHEET_CSS };
// Permet à un enfant `height:100%` de suivre la hauteur de la ligne (comme à l'écran).
const CELL_HEIGHT_HACK = { height: '1px' } as const;

/** La grille imprimée. Uniquement des div/span : aucun bouton, rien de cliquable. */
export function PlanningPrintSheet({ job, company, rows, renderCell, codes }: {
  job: PrintJob;
  company: string;
  rows: PrintRow[];
  renderCell: (workerId: string, iso: string) => ReactNode;
  /** Mois : code de chaque chantier imprimé (titre → code), pour la clé « Chantiers : ». */
  codes?: Map<string, string>;
}) {
  const kind = job.period.kind;
  const days = periodDays(job.period).map((d) => parseISO(d));
  const weekNo = getISOWeek(days[0]);
  const one = job.who !== 'all' ? rows[0]?.name : null;
  const cols = 1 + days.length + (job.signature ? 1 : 0);
  const head = (what: string, extra?: ReactNode) => (
    <tr className="bt-print-title">
      <th colSpan={cols}>
        <div className="bt-print-tl">
          <span className="bt-print-co">{company}</span>
          <span className="bt-print-what" data-testid="print-what">{what}{one ? ` · ${one}` : ''}</span>
          <span className="bt-print-at">Imprimé le {format(job.printedAt, "d MMM yyyy 'à' HH:mm", { locale: fr })}</span>
        </div>
        <div className="bt-print-leg">
          {DAY_PARTS.map((d) => (
            <span key={d.key}><span className="bt-print-sw" style={{ background: d.bg, borderColor: d.edge }} />{d.label} · {d.hint}</span>
          ))}
          <span>Blanc : journée entière ou sans horaire · Noir : heures envoyées{kind === 'month' ? ' · C congé · I intempérie · A absent · R repos' : ''}</span>
        </div>
        {extra}
      </th>
    </tr>
  );
  if (kind === 'month') {
    // La clé et l'en-tête des jours sont dans <thead> : Chrome les répète en haut de
    // chaque page, et une ligne (tr) n'est jamais coupée entre deux pages.
    const key = Array.from((codes || new Map<string, string>()).entries()).sort((a, b) => a[1].localeCompare(b[1], 'fr'));
    return (
      <div className="bt-print bt-print--month" data-testid="print-sheet">
        <style dangerouslySetInnerHTML={PRINT_SHEET_STYLE} />
        <table className={`bt-print-m${job.signature ? ' with-sig' : ''}`} data-testid="print-month">
          <colgroup>
            <col className="n" />
            {days.map((d) => <col key={d.toISOString()} />)}
            {job.signature && <col className="sig" />}
          </colgroup>
          <thead>
            {head(`Planning · ${format(days[0], 'MMMM yyyy', { locale: fr })}`, key.length > 0 && (
              <div className="bt-print-m-key" data-testid="print-m-key">
                Chantiers :{' '}
                {key.map(([title, code], i) => <span key={code} data-code={code}>{i ? ' · ' : ''}<b>{code}</b> {title}</span>)}
              </div>
            ))}
            <tr>
              <th className="n">Salarié</th>
              {days.map((d) => {
                const wd = (d.getDay() + 6) % 7;
                return (
                  <th key={d.toISOString()} className={`d${wd >= 5 ? ' we' : ''}${wd === 0 ? ' mon' : ''}`} data-testid="print-m-day">
                    <span className="wd">{format(d, 'EEEEE', { locale: fr })}</span><span className="dn">{format(d, 'd')}</span>
                  </th>
                );
              })}
              {job.signature && <th className="d sig"><span className="dn">Signature</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid="print-m-row">
                <td className="n">{r.name}</td>
                {days.map((d) => {
                  const iso = format(d, 'yyyy-MM-dd');
                  const wd = (d.getDay() + 6) % 7;
                  return (
                    <td key={iso} className={`${wd >= 5 ? 'we' : ''}${wd === 0 ? ' mon' : ''}`.trim() || undefined} data-day={iso} style={CELL_HEIGHT_HACK}>
                      {renderCell(r.id, iso)}
                    </td>
                  );
                })}
                {job.signature && <td className="sig" />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const week = kind === 'week';
  const what = week
    ? `Planning · semaine ${weekNo} · ${rangeLabel(days)}`
    : `${cap(format(days[0], 'EEEE d MMMM yyyy', { locale: fr }))} · semaine ${weekNo}`;
  return (
    <div className={`bt-print bt-print--${kind}`} data-testid="print-sheet">
      <style dangerouslySetInnerHTML={PRINT_SHEET_STYLE} />
      <table className="bt-pl-table">
        {/* Largeurs explicites : en table-layout:fixed, la ligne de titre (colspan) en
            premier rendrait toutes les colonnes égales et couperait les noms. */}
        <colgroup>
          <col style={{ width: week ? 170 : 200 }} />
          {days.map((d) => <col key={d.toISOString()} />)}
          {job.signature && <col style={{ width: week ? 110 : 180 }} />}
        </colgroup>
        <thead>
          {head(what)}
          <tr>
            <th className="bt-pl-th-name">
              <span className="bt-pl-corner-wk">S-{weekNo}</span>
              <span className="bt-pl-corner-sal">Salarié</span>
            </th>
            {days.map((d) => (
              <th key={d.toISOString()} className="bt-pl-th">
                <div className="bt-pl-th-cell">
                  <span className="bt-pl-th-day">{dayFull(d)}</span>
                  <span className="bt-pl-th-num">{format(d, 'd')}</span>
                </div>
              </th>
            ))}
            {job.signature && <th className="bt-pl-th bt-print-sig"><span className="bt-pl-th-day">Signature</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="bt-pl-namecell" style={CELL_HEIGHT_HACK}>
                <div className="bt-pl-namebtn">
                  <span className="bt-pl-nametop">
                    <span className="bt-pl-avatar" style={r.tint}>{r.initials}</span>
                    <span className="bt-pl-name">{r.name}</span>
                  </span>
                </div>
              </td>
              {days.map((d) => {
                const iso = format(d, 'yyyy-MM-dd');
                return (
                  <td key={iso} className="bt-pl-cell" style={CELL_HEIGHT_HACK}>
                    <div className="bt-pl-cellinner">{renderCell(r.id, iso)}</div>
                  </td>
                );
              })}
              {job.signature && <td className="bt-pl-cell bt-print-sig" />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
