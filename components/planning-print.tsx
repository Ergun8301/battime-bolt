'use client';

// Lot 3 — « Imprimer le planning » : une feuille A4 paysage, à afficher au dépôt
// ou à faire signer. Deux pièces :
//  - PrintMenu : le petit menu d'options sous l'icône 🖨 de la barre (semaine ou un
//    jour, toute l'équipe ou un salarié, colonne signature) ;
//  - PlanningPrintSheet : la grille imprimée, montée dans <body> UNIQUEMENT pendant
//    l'impression (cachée à l'écran). Elle reprend les classes et les bulles de
//    l'écran (PL_GRID_CSS, BubbleContent) : le papier ressemble à l'écran, sans ce
//    qui ne sert qu'à l'écran (boutons, « + », sélection, direct, jour J, statuts).
//
// Rien ici n'écrit en base, et rien ne touche à « Exporter » (qui, lui, verrouille
// les heures de la période) : imprimer ne change aucune donnée.
import { useEffect, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Printer } from 'lucide-react';
import { DAY_PARTS } from '@/supabase/functions/_shared/day-part';

export type PrintScope = 'week' | 'day';
export interface PrintOptions {
  scope: PrintScope;
  /** Jour choisi (0 = lundi) quand scope = 'day'. */
  dayIdx: number;
  /** 'all' = toute l'équipe, sinon l'id du salarié. */
  who: string;
  signature: boolean;
}
export interface PrintJob extends PrintOptions {
  /** Monté par Ctrl+P (menu du navigateur) : la page imprime déjà, ne rien relancer. */
  auto?: boolean;
  printedAt: Date;
}
export interface PrintRow { id: string; name: string; initials: string; tint: { background: string; color: string } }

// Seuls le type de période et la signature sont retenus (le salarié revient
// toujours à « Toute l'équipe » : une feuille d'une seule personne par erreur
// passerait inaperçue sur le panneau du dépôt).
const STORE_KEY = 'bemexo_print';
function readPrefs(): { scope: PrintScope; signature: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { scope: v.scope === 'day' ? 'day' : 'week', signature: v.signature === true };
  } catch { return { scope: 'week', signature: false }; }
}
function savePrefs(p: { scope: PrintScope; signature: boolean }) {
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

/** Titre de l'onglet pendant l'impression : il devient le nom du PDF et l'en-tête de Chrome. */
export function printTitle(job: PrintOptions, company: string, days: Date[], weekNo: number, workerName?: string | null): string {
  const what = job.scope === 'week' ? `Planning S-${weekNo}` : `Planning ${format(days[job.dayIdx] || days[0], 'EEEE d MMMM', { locale: fr })}`;
  return `${what} – ${company}${workerName ? ` – ${workerName}` : ''}`;
}

export const PRINT_MENU_CSS = `
.bt-pl-pr{width:286px;max-width:calc(100vw - 24px)}
.bt-pl-pr-sec{padding:9px 13px;border-top:1px solid rgba(21,18,15,.06)}
.bt-pl-pr-sec:first-of-type{border-top:0}
.bt-pl-pr-lbl{display:block;font-size:11px;font-weight:700;color:#6E6A63;margin-bottom:6px}
.bt-pl-pr-seg{display:flex;gap:6px}
.bt-pl-pr-opt{flex:1;height:30px;border-radius:9px;border:1.5px solid rgba(21,18,15,.16);background:#FAF7F0;font:inherit;font-size:12.5px;font-weight:800;color:#15120F;cursor:pointer}
.bt-pl-pr-opt[aria-pressed="true"],.bt-pl-pr-day[aria-pressed="true"]{background:#FFC21A;border-color:#15120F}
.bt-pl-pr-days{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-top:7px}
.bt-pl-pr-day{height:34px;padding:0;border-radius:8px;border:1.5px solid rgba(21,18,15,.16);background:#fff;font:inherit;color:#15120F;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;line-height:1}
.bt-pl-pr-day small{font-family:'JetBrains Mono',monospace;font-size:8.5px;text-transform:uppercase;color:#6E6A63}
.bt-pl-pr-day b{font-size:12.5px;font-weight:900}
.bt-pl-pr-sel{width:100%;height:32px;border-radius:9px;border:1.5px solid rgba(21,18,15,.16);background:#F9F5EC;font:inherit;font-size:13px;font-weight:700;color:#15120F;padding:0 9px}
.bt-pl-pr-chk{display:flex;align-items:center;gap:8px;margin-top:9px;font-size:12.5px;font-weight:700;color:#15120F;cursor:pointer}
.bt-pl-pr-chk input{width:15px;height:15px;accent-color:#15120F}
.bt-pl-pr-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 13px;border-top:1px solid rgba(21,18,15,.08);background:#FBF6EA}
.bt-pl-pr-note{font-size:11px;color:#6E6A63;font-weight:600}
.bt-pl-pr-go{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 13px;border-radius:9px;border:0;background:#15120F;color:#fff;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;flex:none}
.bt-pl-pr-go:focus-visible,.bt-pl-pr-opt:focus-visible,.bt-pl-pr-day:focus-visible{outline:2px solid #FFC21A;outline-offset:1px}
`;

/** Le menu d'options, ancré à droite sous l'icône 🖨 (même famille que la légende). */
export function PrintMenu({ days, weekNo, workers, defaultDayIdx, onPrint, onClose }: {
  days: Date[];
  weekNo: number;
  workers: { id: string; name: string }[];
  /** Aujourd'hui s'il est dans la semaine affichée, sinon lundi. */
  defaultDayIdx: number;
  onPrint: (o: PrintOptions) => void;
  onClose: () => void;
}) {
  const [prefs] = useState(readPrefs);
  const [scope, setScope] = useState<PrintScope>(prefs.scope);
  const [signature, setSignature] = useState(prefs.signature);
  const [dayIdx, setDayIdx] = useState(defaultDayIdx);
  const [who, setWho] = useState('all');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const pickScope = (s: PrintScope) => { setScope(s); savePrefs({ scope: s, signature }); };
  const pickSig = (v: boolean) => { setSignature(v); savePrefs({ scope, signature: v }); };
  return (
    <div className="bt-pl-dd bt-pl-pr" role="group" aria-label="Imprimer le planning" data-testid="print-menu">
      <div className="bt-pl-dd-h">Imprimer le planning</div>
      <div className="bt-pl-pr-sec">
        <span className="bt-pl-pr-lbl">Période</span>
        <div className="bt-pl-pr-seg">
          <button type="button" className="bt-pl-pr-opt" aria-pressed={scope === 'week'} data-testid="print-scope-week" onClick={() => pickScope('week')}>Semaine {weekNo}</button>
          <button type="button" className="bt-pl-pr-opt" aria-pressed={scope === 'day'} data-testid="print-scope-day" onClick={() => pickScope('day')}>Un jour</button>
        </div>
        {scope === 'day' && (
          <div className="bt-pl-pr-days">
            {days.map((d, i) => (
              <button key={d.toISOString()} type="button" className="bt-pl-pr-day" aria-pressed={dayIdx === i} data-testid="print-day"
                aria-label={format(d, 'EEEE d MMMM', { locale: fr })} onClick={() => setDayIdx(i)}>
                <small>{format(d, 'EEE', { locale: fr }).replace('.', '')}</small><b>{format(d, 'd')}</b>
              </button>
            ))}
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
      <div className="bt-pl-pr-foot">
        <span className="bt-pl-pr-note">A4 paysage, en couleur</span>
        <button type="button" className="bt-pl-pr-go" data-testid="print-go" autoFocus onClick={() => onPrint({ scope, dayIdx, who, signature })}>
          <Printer className="h-3.5 w-3.5" /> Imprimer
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
}
`;
// Objet FIXE, comme PL_STYLE (admin-planning) : un nouvel objet à chaque rendu
// ferait réécrire la feuille de style par React.
const PRINT_SHEET_STYLE = { __html: PRINT_SHEET_CSS };
// Permet à un enfant `height:100%` de suivre la hauteur de la ligne (comme à l'écran).
const CELL_HEIGHT_HACK = { height: '1px' } as const;

/** La grille imprimée. Uniquement des div/span : aucun bouton, rien de cliquable. */
export function PlanningPrintSheet({ job, company, weekNo, days, rows, renderCell }: {
  job: PrintJob;
  company: string;
  weekNo: number;
  /** La semaine affichée, ou le seul jour choisi. */
  days: Date[];
  rows: PrintRow[];
  renderCell: (workerId: string, iso: string) => ReactNode;
}) {
  const week = job.scope === 'week';
  const one = job.who !== 'all' ? rows[0]?.name : null;
  const what = week
    ? `Planning · semaine ${weekNo} · ${rangeLabel(days)}`
    : `${cap(format(days[0], 'EEEE d MMMM yyyy', { locale: fr }))} · semaine ${weekNo}`;
  const cols = 1 + days.length + (job.signature ? 1 : 0);
  return (
    <div className={`bt-print bt-print--${job.scope}`} data-testid="print-sheet">
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
                <span>Blanc : journée entière ou sans horaire · Noir : heures envoyées</span>
              </div>
            </th>
          </tr>
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
