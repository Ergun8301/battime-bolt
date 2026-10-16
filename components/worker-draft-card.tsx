'use client';

// Heures dites à l'Assistant BEMEXO (lot 4, lot 7).
// Lot 7 : phrase claire et complète → enregistrée TOUT DE SUITE (« ✅ Fait »,
// Annuler, Modifier) ; chantier manquant → UNE question avec les chantiers ;
// horaires incohérents → la fiche à corriger, puis « Enregistrer ».

import type { ExtraControl } from '@/components/assistant-panel';
import { readCard, undoneMemory, useCardMemory, writeCard } from '@/lib/card-memory';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionAsk, ActionDone } from '@/components/action-done';
import { Loader2, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { checkDraft, fmtMin, shiftMinutes, type DraftExtra, type DraftLine, type SaveLines } from '@/lib/worker-assistant';
import { formatPauseInput, parsePauseInput, readPauseInput } from '@/supabase/functions/_shared/pause';

const CSS = `
.wd{margin-top:10px;border:1px solid rgba(21,18,15,.12);border-radius:12px;background:#FBF8F2;padding:10px}
.wd-date{font-size:12px;font-weight:800;color:#6E6A63;text-transform:uppercase;letter-spacing:.05em;margin:0 0 8px}
.wd-line{background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:10px;padding:8px;margin-bottom:8px}
.wd-line.todo{border-color:#F1B84A;background:#FFFBF0}
.wd-row{display:flex;gap:6px;align-items:center}
.wd select,.wd input{font-family:inherit;font-size:14px;border:1.5px solid rgba(21,18,15,.16);border-radius:8px;padding:7px 8px;background:#fff;color:#15120F;min-width:0}
.wd select{flex:1;font-weight:700}
.wd input[type=time]{flex:1;width:auto;min-width:96px}
.wd .pause{width:76px;font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:700}
.wd .pause[aria-invalid=true]{border-color:#C0461F}
.wd-lbl{font-size:11px;color:#6E6A63;font-weight:700}
.wd-plan{font-size:11.5px;color:#0F7A43;font-weight:700;margin:-2px 0 6px 2px}
.wd-x{border:none;background:transparent;color:#9a948a;padding:4px;cursor:pointer}
.wd-err{font-size:12.5px;color:#9a3b14;font-weight:700;margin:4px 0 8px}
.wd-foot{display:flex;align-items:center;gap:8px;margin-top:4px}
.wd-total{flex:1;white-space:nowrap;font-size:12.5px;color:#56514a;font-weight:700}
.wd-save{border:none;background:#15120F;color:#FBF8F2;border-radius:10px;padding:9px 14px;font-weight:800;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit}
.wd-save:disabled{opacity:.35;cursor:default}
.wd-add{border:1px dashed rgba(21,18,15,.25);background:transparent;border-radius:10px;padding:7px 10px;font-size:12.5px;font-weight:700;color:#56514a;cursor:pointer;display:inline-flex;gap:4px;align-items:center;font-family:inherit}
.wd-done{display:flex;align-items:center;gap:8px;color:#0F7A43;font-weight:800;font-size:14px;margin-top:10px}
`;

interface Props {
  extra: DraftExtra; save: SaveLines; onSaved?: () => void;
  /** Lot 7 : la carte pilote le texte de sa bulle (voir ExtraControl). */
  ctl?: ExtraControl;
  /** Design salarié v2 (planche AS3, AS7) : même logique et mêmes repères ; ni la feuille ci-dessus ni style en ligne, classes `dz-f` (assistant-v2.css). */
  v2?: boolean;
}
const launched = new WeakSet<object>();

/**
 * Lot 3bis — « Total des pauses (h:mm) » : un champ, pas huit puces dans la
 * bulle. Même lecture que partout (_shared/pause.ts). Le texte illisible est
 * porté par la VALEUR de la ligne (NaN), pas par une table indexée : retirer
 * une ligne ne déplace pas l'erreur sur sa voisine.
 */
export function DraftPause({ value, onChange, testId, ariaLabel = 'Total des pauses (h:mm)' }: { value: number; onChange: (m: number) => void; testId: string; ariaLabel?: string }) {
  const [text, setText] = useState(() => (Number.isFinite(value) && value > 0 ? formatPauseInput(value) : ''));
  const [shown, setShown] = useState(false);
  /** Champ vide = pas de pause ; illisible = NaN (bloque « Enregistrer »). */
  const valueOf = (t: string) => (t.trim() ? parsePauseInput(t) ?? NaN : 0);
  // La ligne affichée à cet endroit a changé (ligne retirée au-dessus) : le texte suit sa valeur.
  useEffect(() => {
    if (!Number.isFinite(value)) return;
    setText((t) => (valueOf(t) === value ? t : value > 0 ? formatPauseInput(value) : ''));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = readPauseInput(text, true);
  const bad = r.kind === 'bad' && shown ? r.message : null;
  return (
    <>
      <input className="pause" type="text" inputMode="text" autoComplete="off" maxLength={12} placeholder="0:00" value={text}
        aria-label={ariaLabel} aria-invalid={!!bad || undefined} data-testid={testId}
        onChange={(e) => { setText(e.target.value); setShown(false); onChange(valueOf(e.target.value)); }}
        onBlur={() => setShown(true)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setShown(true); } }} />
      {bad && <span className="wd-err" style={{ margin: 0 }} role="alert" data-testid={`${testId}-error`}>{bad}</span>}
    </>
  );
}

export default function WorkerDraftCard({ extra, save, onSaved, ctl, v2 = false }: Props) {
  const plain = (o: React.CSSProperties) => (v2 ? undefined : o);
  const { chantiers } = extra;
  const [date] = useState(extra.draft.date);
  // Lot 7 : ce qui a déjà été noté survit à un redessin du panneau.
  type Undo = () => Promise<{ ok: boolean; message: string; partial?: boolean }>;
  const mem = readCard<{ phase: 'auto' | 'question' | 'form' | 'done'; done: string; undo: Undo; lines: DraftLine[] }>(extra);
  const [lines, setLines] = useState<DraftLine[]>(mem.lines ?? (extra.draft.lines.length ? extra.draft.lines
    : [{ worksite_id: null, worksite_text: '', start: '08:00', end: '12:00', break_minutes: 0 }]));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(mem.done ?? null);
  const [undo, setUndo] = useState<Undo | undefined>(() => mem.undo);
  const editOf = useRef<Undo | null>(null);
  const complete = !extra.draft.errors.length && extra.draft.lines.length > 0;
  const onlyChantier = complete && extra.draft.lines.some((l) => !l.worksite_id);
  const [phase, setPhase] = useState<'auto' | 'question' | 'form' | 'done'>(mem.phase ?? (complete ? (onlyChantier ? 'question' : 'auto') : 'form'));
  useCardMemory<typeof mem>(extra, (m) => {
    if (m.lines) setLines(m.lines);
    if (m.done) setDone(m.done);
    if (m.undo) setUndo(() => m.undo);
    if (m.phase) setPhase(m.phase);
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    writeCard(extra, { phase });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const [edited, setEdited] = useState(false);
  // Enregistré : plus de « Vérifiez, puis enregistrez. » au-dessus de « Fait ».
  useEffect(() => { if (phase === 'question') ctl?.text(null); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (phase === 'done') ctl?.settle(null); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  // Étape 2 : la fiche attend un « Enregistrer » tant qu'elle est ouverte (le panneau demande « Abandonner cette action ? » avant de vider l'écran).
  useEffect(() => { ctl?.waiting(phase === 'form'); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  // Les mêmes contrôles que le serveur, à chaque modification. Avant toute
  // retouche, on montre aussi ce que le serveur n'a pas pu lire.
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const checked = useMemo(() => checkDraft(date, lines, { aujourdhui: today, chantiers, semaine: [], planning: [] }), [date, lines, chantiers, today]);
  const errors = edited ? checked.errors : Array.from(new Set(checked.errors.concat(extra.draft.errors)));
  const missing = lines.some((l) => !l.worksite_id);
  // Lot 3bis : une pause illisible (NaN, voir DraftPause) bloque « Enregistrer » ; trop longue, checkDraft le dit.
  const pauseBad = lines.some((l) => !Number.isFinite(l.break_minutes));
  const total = lines.reduce((s, l) => s + Math.max(0, shiftMinutes(l.start, l.end, Number.isFinite(l.break_minutes) ? l.break_minutes : 0) || 0), 0);
  // Clé stable par ligne (pas sa position) : retirer une ligne ne fait pas
  // glisser le texte d'un champ « pause » sur la ligne suivante.
  const lineIds = useRef(new WeakMap<DraftLine, number>());
  const nextLineId = useRef(0);
  const keyOf = (l: DraftLine) => { let k = lineIds.current.get(l); if (k === undefined) { k = nextLineId.current++; lineIds.current.set(l, k); } return k; };
  const upd = (i: number, patch: Partial<DraftLine>) => {
    setEdited(true);
    setLines((ls) => ls.map((l, j) => { if (j !== i) return l; const n = { ...l, ...patch }; lineIds.current.set(n, keyOf(l)); return n; }));
  };
  const dateLabel = date === today ? 'Aujourd’hui'
    : new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  // Étape 2 : tant que la carte écrit, le panneau refuse « Nouveau chat », la réouverture d'une ancienne conversation et la suppression du chat affiché
  // (la carte serait démontée avant d'avoir montré « Fait »). `working(false)` part TOUJOURS à la fin, même si la carte a été démontée entre-temps.
  const doSave = async (ls: DraftLine[]) => {
    ctl?.working(true); ctl?.waiting(false);
    let retourFiche = false;
    try { retourFiche = await saveOnce(ls); } finally { ctl?.working(false); }
    if (retourFiche) ctl?.waiting(true); // l'ancienne saisie n'a pas pu être défaite : la fiche reste à l'écran
  };
  /** Vrai si la fiche reste à l'écran (retour à la fiche). */
  const saveOnce = async (ls: DraftLine[]): Promise<boolean> => {
    setBusy(true);
    if (editOf.current) {
      const undoFn = editOf.current;
      const u = await undoFn();
      if (!u.ok) { setBusy(false); setDone(null); setPhase('form'); return true; }
      editOf.current = null;
      // Lot 1 : une ligne retouchée ou envoyée depuis est restée → on ne renote pas (elle serait en double).
      if (u.partial) {
        setBusy(false);
        undoneMemory.set(undoFn, `${u.message} La modification n’est pas faite : reprenez-la dans « Ma journée ».`);
        setPhase('done');
        return false;
      }
    }
    const r = await save(date, ls);
    setBusy(false);
    const msg = r.queued ? `enregistré sur le téléphone — ${r.queued} créneau(x) partiront dès que le réseau revient.` : `${r.ok} créneau${r.ok > 1 ? 'x' : ''} noté${r.ok > 1 ? 's' : ''} (${fmtMin(ls.reduce((s2, l) => s2 + Math.max(0, shiftMinutes(l.start, l.end, l.break_minutes) || 0), 0))}).`;
    writeCard(extra, { phase: 'done', done: msg, undo: r.undo, lines: ls });
    setLines(ls);
    setUndo(() => r.undo);
    setDone(msg);
    setPhase('done');
    onSaved?.();
    return false;
  };
  useEffect(() => {
    if (phase !== 'auto' || launched.has(extra)) return;
    launched.add(extra);
    doSave(lines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'done' && done) {
    return <ActionDone message={done} undo={undo} onEdit={undo ? () => { editOf.current = undo; setPhase('form'); } : undefined} />;
  }
  if (phase === 'auto') return <p className="wd-lbl" style={plain({ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10 })}><Loader2 className="h-4 w-4 animate-spin" /> Je note vos heures…</p>;
  if (phase === 'question') {
    return (
      <ActionAsk
        text="Sur quel chantier ?"
        chips={chantiers.map((c) => ({ label: `${c.nom}${c.ville ? ` · ${c.ville}` : ''}`, value: c.id }))}
        onPick={(id) => { launched.add(extra); setPhase('auto'); doSave(lines.map((l) => (l.worksite_id ? l : { ...l, worksite_id: id }))); }}
      />
    );
  }

  return (
    <div className={v2 ? 'wd dz-f' : 'wd'} data-testid="draft-card">
      {!v2 && <style>{CSS}</style>}
      <p className="wd-date">{dateLabel}</p>
      {lines.map((l, i) => (
        <div key={keyOf(l)} className={`wd-line${l.worksite_id ? '' : ' todo'}`}>
          <div className="wd-row" style={plain({ marginBottom: 6 })}>
            <select value={l.worksite_id ?? ''} onChange={(e) => upd(i, { worksite_id: e.target.value || null, from_planning: false })} aria-label="Chantier">
              <option value="">{l.worksite_text ? `« ${l.worksite_text} » → choisir…` : 'Choisir le chantier…'}</option>
              {chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.ville ? ` · ${c.ville}` : ''}</option>)}
            </select>
            {lines.length > 1 && <button type="button" className="wd-x" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Retirer"><Trash2 className="h-4 w-4" /></button>}
          </div>
          {l.from_planning && l.worksite_id && <p className="wd-plan" data-testid="from-planning">📅 D’après votre planning — modifiable</p>}
          <div className="wd-row">
            <input type="time" value={l.start} onChange={(e) => upd(i, { start: e.target.value })} aria-label="Début" />
            <span className="wd-lbl">→</span>
            <input type="time" value={l.end} onChange={(e) => upd(i, { end: e.target.value })} aria-label="Fin" />
          </div>
          <div className="wd-row" style={plain({ marginTop: 6, flexWrap: 'wrap' })}>
            <span className="wd-lbl">Total des pauses (h:mm)</span>
            <DraftPause value={l.break_minutes} onChange={(m) => upd(i, { break_minutes: m })} testId={`wd-pause-${i}`} />
          </div>
        </div>
      ))}
      {v2 && errors.length > 0 && <div className="dz-f-stop" role="alert"><p className="dz-f-stop-t">Impossible d’enregistrer :</p>{errors.map((e) => <p key={e} className="dz-f-raison">{e}</p>)}</div>}
      {!v2 && errors.map((e) => <p key={e} className="wd-err">{e}</p>)}
      <div className="wd-foot">
        <button type="button" className="wd-add" onClick={() => setLines((ls) => [...ls, { worksite_id: null, worksite_text: '', start: '13:00', end: '17:00', break_minutes: 0 }])}><Plus className="h-3.5 w-3.5" /> Créneau</button>
        <span className="wd-total">Total {fmtMin(total)}</span>
        <button
          type="button" className="wd-save" disabled={busy || missing || pauseBad || errors.length > 0}
          onClick={() => doSave(lines)}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer
        </button>
      </div>
    </div>
  );
}
