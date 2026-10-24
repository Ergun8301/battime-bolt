'use client';

// Lot 11 — champ d'heure SIMPLE, sans roulette : on tape « 14h », « 14:30 »…
// ou on choisit dans la liste au quart d'heure (▾). Un `type="text"` (et non
// `type="time"` ni un <select>, qui ouvrent tous deux une roulette sur iPhone).
// La valeur est normalisée en 'HH:MM' en quittant le champ ; '' = pas d'heure.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { filterQuarterHours, listAnchor, parseTimeInput } from '@/lib/time-input';

export function TimeField({ value, onChange, placeholder = '--:--', ariaLabel, testId, invalid = false, onBadChange }: {
  /** 'HH:MM' ou '' */
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
  testId?: string;
  invalid?: boolean;
  /** Saisie illisible (« 7h75 ») : le parent bloque l'enregistrement au lieu de garder l'ancienne heure en silence. */
  onBadChange?: (bad: boolean) => void;
}) {
  const [text, setText] = useState(value);
  const [bad, setBadState] = useState(false);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const badCb = useRef(onBadChange);
  badCb.current = onBadChange;
  const setBad = (b: boolean) => { setBadState(b); badCb.current?.(b); };
  useEffect(() => { setText(value); setBad(false); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  // Champ retiré de l'écran (fenêtre fermée) : plus rien de bloquant.
  useEffect(() => () => badCb.current?.(false), []);

  const commit = (raw: string) => {
    const v = parseTimeInput(raw);
    if (v === null) { setBad(true); return; }
    setBad(false); setText(v);
    if (v !== value) onChange(v);
  };
  const options = filterQuarterHours(text);
  useEffect(() => {
    if (!open) return;
    // Liste (00:00 → 23:45) positionnée sur une heure utile : celle déjà saisie, sinon 07:00.
    // On règle le défilement de la LISTE seulement (scrollIntoView ferait aussi bouger la fenêtre derrière).
    const t = setTimeout(() => {
      const list = listRef.current;
      const el = list?.querySelector<HTMLElement>(`[data-v="${listAnchor(value)}"]`) ?? list?.querySelector<HTMLElement>('[data-v]');
      if (list && el) list.scrollTop = Math.max(0, el.offsetTop - (list.clientHeight - el.offsetHeight) / 2);
    }, 0);
    return () => clearTimeout(t);
  }, [open, value]);

  return (
    <span className="inline-flex w-full min-w-0 items-stretch">
      <input
        type="text"
        inputMode="text"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={bad || invalid || undefined}
        data-testid={testId}
        onChange={(e) => { setText(e.target.value); setBad(false); }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit((e.target as HTMLInputElement).value); } }}
        className={`h-10 w-full min-w-0 rounded-l-md border bg-white px-3 font-mono text-[15px] font-bold tracking-wide outline-none focus:ring-2 focus:ring-[#FFC21A] ${bad || invalid ? 'border-[#C0461F]' : 'border-[#15120F]/25'}`}
      />
      {/* `modal` : la liste a son propre verrou de défilement, au-dessus de celui de la fenêtre (Dialog). Sans lui, la fenêtre
          avalait la roulette de la souris, le trackpad et le doigt sur la liste ; avec lui, la liste défile et la page derrière ne bouge pas. */}
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <button type="button" aria-label={`${ariaLabel} : choisir dans la liste`} data-testid={testId ? `${testId}-list` : undefined}
            className="flex h-10 w-9 flex-none items-center justify-center rounded-r-md border border-l-0 border-[#15120F]/25 bg-[#F7F2E7] hover:bg-[#FFF3CC]">
            <ChevronDown className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="bt-skin w-28 p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div ref={listRef} className="relative max-h-56 overflow-y-auto overscroll-contain" role="listbox" aria-label={ariaLabel} data-testid={testId ? `${testId}-options` : undefined}>
            {options.map((q) => (
              <button key={q} type="button" role="option" aria-selected={q === value} data-v={q}
                onClick={() => { setOpen(false); setBad(false); setText(q); if (q !== value) onChange(q); }}
                className={`block w-full rounded px-2 py-1.5 text-left font-mono text-[14px] font-bold ${q === value ? 'bg-[#FFC21A] text-[#15120F]' : 'hover:bg-[#FFF3CC]'}`}>
                {q}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {bad && <span className="sr-only" role="alert">Heure non comprise. Ex. 14h ou 14:30</span>}
    </span>
  );
}

/** « Ex. 14h ou 14:30 » sous un champ refusé. */
export const TIME_HINT = 'Ex. 14h ou 14:30';
