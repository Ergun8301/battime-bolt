'use client';

// Lot 3bis — LE choix de la pause, partout où une pause se note : fiche du
// salarié, question à l'envoi (lignes de la borne comprises), correction du
// bureau. Puces 0 / 15 / 30 / 45 min / 1 h / 1 h 30 / 2 h, plus « Autre »
// (h:mm). Lecture, affichage et règle « plus courte que la ligne » :
// supabase/functions/_shared/pause.ts.
//
// CSS autonome (pause-picker.css, importé plus bas) : la question à l'envoi est
// rendue dans un portail Radix, hors de la feuille de style de « Ma journée ».
import { Fragment, useEffect, useRef, useState } from 'react';
import { formatPause, formatPauseInput, parsePauseInput, pauseFits, readPauseInput, PAUSE_QUICK, PAUSE_TOO_LONG } from '@/supabase/functions/_shared/pause';
// Sa feuille de style est components/pause-picker.css, importée au niveau des ROUTES qui l'affichent (app/poseur/layout.tsx, app/admin/layout.tsx) :
// un import ici ferait une feuille chargée à part avec chaque morceau différé (et alourdirait le chargeur de TOUTES les pages).

const isQuick = (m: number | null | undefined) => m != null && (PAUSE_QUICK as readonly number[]).includes(m);
/** L'indice, phrase par phrase : « Additionne-les » ne se coupe plus au trait d'union, ni « ? » de son mot. */
const hintParts = (h: string) => h.replace(/ ([?:!;])/g, '\u00a0$1').replace(/\. /g, '.\n').split('\n');

export interface PausePickerProps {
  /** Minutes ; null = rien de choisi (question à l'envoi). */
  value: number | null;
  onChange: (minutes: number) => void;
  /** Durée de la ligne (pause NON déduite) : une puce aussi longue est grisée. */
  maxExclusive?: number;
  testId: string;
  variant?: 'phone' | 'compact';
  /** Libellé de la puce 0 : « 0 » (fiche, bureau) ou « Non » (question à l'envoi). */
  zeroLabel?: string;
  /** null : le parent affiche son propre titre. */
  label?: string | null;
  hint?: string | null;
  /** Présent : « Autre » ne part qu'avec ce bouton (ou Entrée). Sinon, chaque valeur valide part en direct. */
  confirmLabel?: string;
  /** Saisie illisible ou pause trop longue : le parent bloque l'enregistrement (null = rien ne bloque). */
  onErrorChange?: (message: string | null) => void;
  /** Bureau : messages au « vous ». */
  vous?: boolean;
  disabled?: boolean;
}

export default function PausePicker({
  value, onChange, maxExclusive, testId, variant = 'phone', zeroLabel = '0', label = 'Total des pauses', hint = null,
  confirmLabel, onErrorChange, vous = false, disabled = false,
}: PausePickerProps) {
  // Une valeur hors des puces (20 min notées par l'Assistant) ouvre « Autre », pré-rempli.
  const [open, setOpen] = useState(() => value != null && !isQuick(value));
  const [text, setText] = useState(() => (value != null && !isQuick(value) ? formatPauseInput(value) : ''));
  // « Durée non comprise » ne s'affiche qu'en quittant le champ (ou Entrée / OK), jamais pendant la frappe.
  const [shown, setShown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusNext = useRef(false);
  const errCb = useRef(onErrorChange);
  errCb.current = onErrorChange;

  const read = readPauseInput(text, vous);
  const typed = open && read.kind === 'ok' ? read.minutes : null;
  const typedOk = typed != null && pauseFits(typed, maxExclusive);
  // Ce qui bloque le parent : texte illisible, durée tapée trop longue, ou valeur
  // gardée devenue trop longue (heures raccourcies après avoir choisi 2 h).
  const error = open && read.kind === 'bad' ? read.message
    : typed != null && !typedOk ? PAUSE_TOO_LONG
    : value != null && !pauseFits(value, maxExclusive) ? PAUSE_TOO_LONG : null;
  const shownError = error && (shown || error === PAUSE_TOO_LONG) ? error : null;

  useEffect(() => { errCb.current?.(error); }, [error]);
  // Retiré de l'écran (fiche fermée) : plus rien de bloquant (comme TimeField).
  useEffect(() => () => errCb.current?.(null), []);

  // Valeur changée de l'extérieur : « Autre » suit, sans jamais écraser ce qui est en cours de frappe.
  useEffect(() => {
    if (value == null || isQuick(value)) return;
    setOpen(true);
    setText((t) => (parsePauseInput(t) === value ? t : formatPauseInput(value)));
  }, [value]);

  useEffect(() => {
    if (open && focusNext.current) { focusNext.current = false; inputRef.current?.focus(); }
  }, [open]);

  // Échap dans le champ : on quitte le champ, sans fermer la fenêtre autour
  // (la question à l'envoi fermée = envoi abandonné). Radix écoute Échap sur
  // le document en capture : seul un écouteur sur window, avant lui, l'arrête.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.target !== inputRef.current) return;
      e.stopPropagation();
      inputRef.current?.blur();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const pick = (m: number) => { setOpen(false); setText(''); setShown(false); onChange(m); };
  const openOther = () => {
    if (open) { inputRef.current?.focus(); return; }
    setText(value != null && value > 0 ? formatPauseInput(value) : '');
    setShown(false);
    focusNext.current = true;
    setOpen(true);
  };
  const onText = (t: string) => {
    setText(t);
    setShown(false);
    if (confirmLabel) return;
    const r = readPauseInput(t, vous);
    if (r.kind === 'ok' && pauseFits(r.minutes, maxExclusive) && r.minutes !== value) onChange(r.minutes);
  };
  const confirm = () => { if (typed != null && typedOk) onChange(typed); else setShown(true); };
  const leave = () => {
    setShown(true);
    // Champ vidé : il reprend la pause gardée (un « Autre » vide ne change rien).
    if (read.kind === 'empty' && !confirmLabel && value != null && value > 0) setText(formatPauseInput(value));
  };

  const otherOn = open || (value != null && !isQuick(value));
  const head = (label || hint) && (
    <div className="bt-pp-head">
      {label && <div className="bt-pp-label" data-testid={`${testId}-label`}>{label}</div>}
      {hint && (
        <div className="bt-pp-hint" data-testid={`${testId}-hint`}>
          {hintParts(hint).map((p, i) => <Fragment key={i}>{i > 0 && ' '}<span className="bt-pp-s">{p}</span></Fragment>)}
        </div>
      )}
    </div>
  );

  return (
    <div className={`bt-pp bt-pp--${variant}`} role="group" aria-label={label ?? 'Total des pauses'} data-testid={testId}>
      {head}
      <div className="bt-pp-chips">
        {PAUSE_QUICK.map((m) => {
          const tooLong = m > 0 && maxExclusive != null && m >= maxExclusive;
          const on = !open && value === m;
          return (
            <button key={m} type="button" className={`bt-pp-b${on ? ' on' : ''}`} aria-pressed={on} data-testid={`${testId}-${m}`}
              disabled={disabled || tooLong} title={tooLong ? 'Plus long que la journée' : undefined} onClick={() => pick(m)}>
              {m === 0 ? zeroLabel : formatPause(m)}
            </button>
          );
        })}
        <button type="button" className={`bt-pp-b${otherOn ? ' on' : ''}`} aria-pressed={otherOn} data-testid={`${testId}-autre`}
          disabled={disabled} onClick={openOther}>
          Autre
        </button>
      </div>
      {open && (
        <div className="bt-pp-other">
          <input
            ref={inputRef}
            className="bt-pp-in"
            type="text"
            inputMode="text"
            autoComplete="off"
            maxLength={12}
            placeholder="h:mm"
            aria-label="Total des pauses (h:mm)"
            aria-invalid={!!shownError || undefined}
            data-testid={`${testId}-input`}
            value={text}
            disabled={disabled}
            onChange={(e) => onText(e.target.value)}
            onBlur={leave}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (confirmLabel) confirm(); else setShown(true); } }}
          />
          {typedOk && <span className="bt-pp-preview" data-testid={`${testId}-preview`}>= {formatPause(typed!)}</span>}
          {confirmLabel && (
            <button type="button" className="bt-pp-ok" data-testid={`${testId}-ok`} disabled={disabled || !typedOk} onClick={confirm}>
              {confirmLabel}
            </button>
          )}
        </div>
      )}
      {shownError && <div className="bt-pp-err" role="alert" data-testid={`${testId}-error`}>{shownError}</div>}
    </div>
  );
}
