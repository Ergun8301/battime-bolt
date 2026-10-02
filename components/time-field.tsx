'use client';

// Lot 11 — champ d'heure SIMPLE, sans roulette : on tape « 14h », « 14:30 »…
// ou on choisit dans la liste au quart d'heure (▾). Un `type="text"` (et non
// `type="time"` ni un <select>, qui ouvrent tous deux une roulette sur iPhone).
// La valeur est normalisée en 'HH:MM' en quittant le champ ; '' = pas d'heure.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { filterQuarterHours, parseTimeInput } from '@/lib/time-input';

export function TimeField({ value, onChange, placeholder = '--:--', ariaLabel, testId, invalid = false }: {
  /** 'HH:MM' ou '' */
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
  testId?: string;
  invalid?: boolean;
}) {
  const [text, setText] = useState(value);
  const [bad, setBad] = useState(false);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setText(value); setBad(false); }, [value]);

  const commit = (raw: string) => {
    const v = parseTimeInput(raw);
    if (v === null) { setBad(true); return; }
    setBad(false); setText(v);
    if (v !== value) onChange(v);
  };
  const options = filterQuarterHours(text);
  useEffect(() => {
    if (!open) return;
    // Liste positionnée sur l'heure la plus proche.
    const t = setTimeout(() => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-v="${value || '08:00'}"]`) ?? listRef.current?.querySelector<HTMLElement>('[data-v]');
      el?.scrollIntoView({ block: 'center' });
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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={`${ariaLabel} : choisir dans la liste`} data-testid={testId ? `${testId}-list` : undefined}
            className="flex h-10 w-9 flex-none items-center justify-center rounded-r-md border border-l-0 border-[#15120F]/25 bg-[#F7F2E7] hover:bg-[#FFF3CC]">
            <ChevronDown className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="bt-skin w-28 p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div ref={listRef} className="max-h-56 overflow-y-auto" role="listbox" aria-label={ariaLabel}>
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
