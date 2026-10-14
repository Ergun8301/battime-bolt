'use client';

// Lot 3 — « Imprimer le planning » : une feuille A4 paysage, à afficher au dépôt
// ou à faire signer. Deux pièces :
//  - PrintMenu : le petit menu d'options sous l'icône 🖨 de la barre (la période,
//    toute l'équipe ou un salarié, colonne signature) ;
//  - PlanningPrintSheet (planning-print-sheet.tsx) : la grille imprimée, montée dans <body> UNIQUEMENT pendant
//    l'impression (cachée à l'écran). Elle reprend les classes et les bulles de
//    l'écran (PL_GRID_CSS, BubbleContent) : le papier ressemble à l'écran, sans ce
//    qui ne sert qu'à l'écran (boutons, « + », sélection, direct, jour J, statuts).
// Lot 3bis : n'importe quelle période — une semaine (‹ ›), un jour (date,
// Aujourd'hui / Demain), un mois (une ligne par salarié, codes des chantiers) —
// par défaut celle de l'écran. Une période hors de l'écran est LUE à part
// (lib/planning-print-data.ts), sans rien écrire.
//
// Lot 4 : « Avec les tâches » (semaine ou jour, quand la migration est passée) :
// les tâches du jour sous chaque case ; les réunions, elles, sont toujours
// imprimées (couleur à part, légende « Réunion »). Le mois n'imprime ni l'un ni l'autre.
//
// Mise en page papier : voir components/planning-print-sheet.tsx (chargé à la demande, hors du
// premier affichage) — la feuille est le planning de l'écran, sans la barre d'outils.
//
// Rien ici n'écrit en base, et rien ne touche à « Exporter » (qui, lui, verrouille
// les heures de la période) : imprimer ne change aucune donnée.
import { useEffect, useRef, useState } from 'react';
import { format, getISOWeek, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Loader2, Printer } from 'lucide-react';
import { addDaysISO, ISO_DAY, normalizePeriod, periodDays, shiftPeriod, switchKind, type PeriodKind, type PrintPeriod } from '@/supabase/functions/_shared/print-period';
import type { PrintData } from '@/lib/planning-print-data';

export interface PrintOptions {
  period: PrintPeriod;
  /** 'all' = toute l'équipe, sinon l'id du salarié. */
  who: string;
  signature: boolean;
  /** Lot 4 : les tâches du jour sous les cases (semaine / jour). */
  tasks?: boolean;
}
export interface PrintJob extends PrintOptions {
  /** Période lue à part (hors de l'écran) ; null = les données de l'écran. */
  data: PrintData | null;
  /** Monté par Ctrl+P (menu du navigateur) : la page imprime déjà, ne rien relancer. */
  auto?: boolean;
  printedAt: Date;
}
export interface PrintRow { id: string; name: string; initials: string; tint: { background: string; color: string }; /** Sa photo, si l'écran en montre une. */ photo?: string | null }

// Seules la signature et « Avec les tâches » (lot 4) sont retenues. La période part
// toujours de celle de l'écran (lot 3bis), et le salarié revient toujours à « Toute
// l'équipe » : une feuille d'une seule personne par erreur passerait inaperçue sur
// le panneau du dépôt. Un ancien réglage « scope » (lot 3) est simplement ignoré.
const STORE_KEY = 'bemexo_print';
type Prefs = { signature: boolean; tasks: boolean };
function readPrefs(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { signature: v.signature === true, tasks: v.tasks === true };
  } catch { return { signature: false, tasks: false }; }
}
function savePrefs(p: Partial<Prefs>) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...readPrefs(), ...p })); } catch { /* stockage indisponible : réglage pour la session */ }
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
export function PrintMenu({ displayed, workers, busy, onPrint, onClose, tasksOn = false }: {
  /** La période de l'écran : le menu s'ouvre toujours sur elle. */
  displayed: PrintPeriod;
  workers: { id: string; name: string }[];
  /** Lecture d'une période hors de l'écran en cours : options figées, « Préparation… ». */
  busy: boolean;
  onPrint: (o: PrintOptions) => void;
  onClose: () => void;
  /** Lot 4 : les tâches existent (migration passée) → case « Avec les tâches ». */
  tasksOn?: boolean;
}) {
  // « Aujourd'hui » lu à l'ouverture du menu (et non au rendu de la page) : juste
  // aussi sur un onglet resté ouvert depuis la veille.
  const [today] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [period, setPeriod] = useState<PrintPeriod>(() => normalizePeriod(displayed));
  const [signature, setSignature] = useState(() => readPrefs().signature);
  const [withTasks, setWithTasks] = useState(() => readPrefs().tasks);
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
  const pickTasks = (v: boolean) => { setWithTasks(v); savePrefs({ tasks: v }); };
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
          {/* Lot 4 : semaine ou jour (le mois n'a pas la place d'une liste). */}
          {tasksOn && kind !== 'month' && (
            <label className="bt-pl-pr-chk">
              <input type="checkbox" checked={withTasks} onChange={(e) => pickTasks(e.target.checked)} data-testid="print-tasks" />
              Avec les tâches
            </label>
          )}
        </div>
      </fieldset>
      <div className="bt-pl-pr-foot">
        {/* Pendant la lecture, « Préparation… » prend la place : la note reviendrait sur deux lignes. */}
        <span className="bt-pl-pr-note">{busy ? '' : 'A4 paysage, en couleur'}</span>
        <button ref={goRef} type="button" className="bt-pl-pr-go" data-testid="print-go" autoFocus disabled={busy} aria-busy={busy || undefined}
          onClick={() => onPrint({ period, who, signature, tasks: tasksOn && kind !== 'month' && withTasks })}>
          {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Préparation…</> : <><Printer className="h-3.5 w-3.5" /> Imprimer</>}
        </button>
      </div>
    </div>
  );
}

