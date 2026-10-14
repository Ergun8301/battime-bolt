'use client';

// « Copier vers un autre jour… » — le choix du ou des jours, depuis la fenêtre de modification d'une case.
//
// Cette fenêtre ne fait que CHOISIR : elle n'écrit rien. À « Copier », elle rend les jours choisis à l'écran du
// planning, qui écrit avec la même fonction que la copie par glisser (mêmes règles : jour d'absence, mois clôturé,
// salarié clôturé, même intervention déjà là, chevauchement d'horaires — jamais d'heures, de documents ni de pointage).
// Elle montre d'avance les jours refusés (grisés), avec la raison écrite en dessous.
//
// Les jours de la semaine affichée viennent de l'écran. Les autres semaines sont lues en base À L'OUVERTURE de la
// semaine seulement (une lecture, jamais au chargement de la page).
//
// Chargée à l'ouverture (lib/lazy-window), comme les autres fenêtres du bureau.
import { useEffect, useMemo, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/** Une ligne de planning lue pour juger d'une case visée (hors de la semaine affichée). */
export interface CopyRow { id: string; user_id: string; work_date: string; worksite_id: string | null; estimated_start: string | null; estimated_end: string | null; absence_type: string | null }
export interface CopyTarget { workerId: string; date: string }

export interface CopySource {
  id: string;
  /** Le client, pour le titre. */
  title: string;
  /** « 08:00–12:00 » ou null. */
  hours: string | null;
  workerId: string;
  /** Le jour de la case copiée (aaaa-mm-jj). */
  date: string;
}

interface Props {
  source: CopySource | null;
  workers: { id: string; name: string }[];
  /** Le lundi de la semaine affichée à l'écran (aaaa-mm-jj). */
  weekStart: string;
  /**
   * La règle de la copie par glisser pour une case visée : le texte du refus, ou null si elle peut partir.
   * `rows` = la case lue en base (semaine non affichée) ; absent = la case telle que l'écran la montre.
   */
  check: (workerId: string, date: string, rows?: CopyRow[]) => string | null;
  /** Lit les cases d'un salarié sur une période (null = lecture impossible). */
  loadRows: (workerId: string, from: string, to: string) => Promise<CopyRow[] | null>;
  busy: boolean;
  onClose: () => void;
  onConfirm: (targets: CopyTarget[]) => void;
}

const CSS = { __html: `
.bt-cd{display:grid;gap:12px;min-width:0}
.bt-cd-note{margin:0;font-size:12.5px;font-weight:600;color:#6b6459;line-height:1.45}
.bt-cd-sel{width:100%;height:44px;border-radius:10px;border:1.5px solid rgba(21,18,15,.2);background:#fff;font:inherit;font-size:14px;font-weight:700;color:#15120F;padding:0 10px}
.bt-cd-lbl{display:block;font-size:12px;font-weight:800;margin-bottom:5px;color:#15120F}
.bt-cd-nav{display:flex;align-items:center;justify-content:space-between;gap:8px}
.bt-cd-nav b{font-size:13.5px;font-weight:800;text-align:center;flex:1}
.bt-cd-nav button{-webkit-tap-highlight-color:transparent;flex:none;width:44px;height:44px;border-radius:10px;border:1.5px solid rgba(21,18,15,.2);background:#FAF7F0;color:#15120F;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.bt-cd-nav button:disabled{opacity:.4;cursor:default}
.bt-cd-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.bt-cd-day{-webkit-tap-highlight-color:transparent;min-width:0;min-height:52px;border-radius:10px;border:1.5px solid rgba(21,18,15,.2);background:#fff;color:#15120F;font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:2px 0}
.bt-cd-day .d{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;text-transform:uppercase;color:#6E6A63}
.bt-cd-day .n{font-size:16px;font-weight:800}
.bt-cd-day[aria-pressed="true"]{background:#FFC21A;border-color:#15120F}
.bt-cd-day[aria-pressed="true"] .d{color:#15120F}
.bt-cd-day:disabled{opacity:.4;cursor:not-allowed;background:repeating-linear-gradient(45deg,#F1ECE2 0 6px,#E9E3D6 6px 12px)}
.bt-cd-day:focus-visible,.bt-cd-nav button:focus-visible{outline:2px solid #15120F;outline-offset:2px}
.bt-cd-why{margin:0;padding:0 0 0 16px;font-size:12.5px;font-weight:600;color:#7a5e00;line-height:1.45}
.bt-cd-foot{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.bt-cd-foot button{min-height:44px}
` };

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MAX_AFTER = 26; // semaines proposées après celle de l'écran
const MAX_BEFORE = 4;

export default function PlanningCopyDialog(props: Props) {
  const { source, onClose } = props;
  return (
    <Dialog open={!!source} onOpenChange={(o) => { if (!o && !props.busy) onClose(); }}>
      <DialogContent className="bt-skin max-w-md max-h-[88vh] overflow-y-auto" data-testid="copy-dialog">
        <style dangerouslySetInnerHTML={CSS} />
        <DialogHeader>
          <DialogTitle>Copier vers un autre jour</DialogTitle>
        </DialogHeader>
        {/* Le contenu n'existe que fenêtre ouverte : chaque ouverture repart de zéro. */}
        {source && <Body key={source.id} {...props} source={source} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ source, workers, weekStart, check, loadRows, busy, onClose, onConfirm }: Props & { source: CopySource }) {
  const [worker, setWorker] = useState(source.workerId);
  const [offset, setOffset] = useState(0); // en semaines, par rapport à la semaine affichée
  const [picked, setPicked] = useState<string[]>([]);
  // Les semaines lues en base, par salarié + lundi. 'err' = lecture impossible (on le dit, rien n'est proposé).
  const [cache, setCache] = useState<Record<string, CopyRow[] | 'err'>>({});

  const monday = iso(addDays(parseISO(weekStart), offset * 7));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => iso(addDays(parseISO(monday), i))), [monday]);
  const onScreen = offset === 0;
  const key = `${worker}|${monday}`;
  const rows = onScreen ? undefined : cache[key];
  const loading = !onScreen && rows === undefined;
  const failed = rows === 'err';

  useEffect(() => {
    if (onScreen || cache[key] !== undefined) return;
    let live = true;
    loadRows(worker, days[0], days[6]).then((r) => { if (live) setCache((c) => ({ ...c, [key]: r ?? 'err' })); }).catch(() => { if (live) setCache((c) => ({ ...c, [key]: 'err' })); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const refusal = (date: string): string | null => {
    if (loading) return 'lecture en cours';
    if (failed) return 'lecture impossible';
    return check(worker, date, Array.isArray(rows) ? rows : undefined);
  };
  const toggle = (date: string) => setPicked((p) => (p.includes(date) ? p.filter((x) => x !== date) : [...p, date].sort()));
  const refused = days.map((d) => ({ d, why: refusal(d) })).filter((x) => x.why && !loading);
  const label = (d: string) => format(parseISO(d), 'EEE d MMM', { locale: fr });
  const chosen = picked.length;

  return (
    <div className="bt-cd">
      <div>
        <p className="text-base font-semibold" data-testid="copy-source">{source.title}{source.hours ? ` · ${source.hours}` : ''}</p>
        <p className="bt-cd-note">Choisissez un ou plusieurs jours. La copie reprend le chantier, l’horaire prévu et la note — jamais les heures déjà saisies.</p>
      </div>

      {workers.length > 1 && (
        <div>
          <label className="bt-cd-lbl" htmlFor="bt-cd-worker">Pour qui ?</label>
          <select id="bt-cd-worker" className="bt-cd-sel" value={worker} data-testid="copy-worker"
            onChange={(e) => { setWorker(e.target.value); setPicked([]); }}>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      )}

      <div className="bt-cd-nav">
        <button type="button" aria-label="Semaine précédente" data-testid="copy-week-prev" disabled={offset <= -MAX_BEFORE} onClick={() => setOffset((o) => o - 1)}><ChevronLeft className="h-4 w-4" /></button>
        <b data-testid="copy-week">Semaine du {format(parseISO(days[0]), 'd', { locale: fr })} au {format(parseISO(days[6]), 'd MMM', { locale: fr })}{onScreen ? ' (affichée)' : ''}</b>
        <button type="button" aria-label="Semaine suivante" data-testid="copy-week-next" disabled={offset >= MAX_AFTER} onClick={() => setOffset((o) => o + 1)}><ChevronRight className="h-4 w-4" /></button>
      </div>

      <div className="bt-cd-days" role="group" aria-label="Jours où copier" data-testid="copy-days">
        {days.map((d) => {
          const why = refusal(d);
          const on = picked.includes(d);
          return (
            <button key={d} type="button" className="bt-cd-day" data-testid="copy-day" data-date={d} aria-pressed={on} disabled={!!why}
              aria-label={cap(format(parseISO(d), 'EEEE d MMMM', { locale: fr }))} onClick={() => toggle(d)}>
              <span className="d">{format(parseISO(d), 'EEE', { locale: fr }).replace('.', '')}</span>
              <span className="n">{format(parseISO(d), 'd')}</span>
            </button>
          );
        })}
      </div>

      {loading && <p className="bt-cd-note" data-testid="copy-loading"><Loader2 className="inline h-4 w-4 animate-spin motion-reduce:animate-none" /> Lecture du planning de cette semaine…</p>}
      {failed && <p className="bt-cd-why" style={{ listStyle: 'none', paddingLeft: 0 }} role="alert" data-testid="copy-error">Impossible de lire le planning de cette semaine. Rien n’est proposé : changez de semaine, puis revenez.</p>}
      {refused.length > 0 && (
        <ul className="bt-cd-why" data-testid="copy-refused">
          {refused.map((x) => <li key={x.d}>{label(x.d)} : {x.why}</li>)}
        </ul>
      )}
      {picked.length > 0 && (
        <p className="bt-cd-note" data-testid="copy-picked">Choisis : {picked.map(label).join(', ')}</p>
      )}

      <div className="bt-cd-foot">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy} data-testid="copy-close">Fermer</Button>
        <Button type="button" disabled={chosen === 0 || busy} onClick={() => onConfirm(picked.map((date) => ({ workerId: worker, date })))} data-testid="copy-go">
          {busy && <Loader2 className="h-4 w-4 animate-spin mr-2 motion-reduce:animate-none" />}
          {chosen <= 1 ? 'Copier sur ce jour' : `Copier sur ces ${chosen} jours`}
        </Button>
      </div>
    </div>
  );
}
