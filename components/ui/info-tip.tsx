'use client';

// Lot 11 — l'infobulle ⓘ : une ligne courte reste sous le réglage, le détail
// est ici. Un Popover (et non un Tooltip) : il s'ouvre au SURVOL à l'ordinateur
// ET au TOUCHER sur tablette et téléphone (un Tooltip ne s'ouvre pas au doigt).
// À placer À CÔTÉ d'un libellé, jamais dedans (ni dans un autre bouton).
import { useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function InfoTip({ text, label = 'Plus d’infos', testId }: { text: React.ReactNode; label?: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  const hover = useRef(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-testid={testId ?? 'info-tip'}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') { hover.current = true; setOpen(true); } }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse' && hover.current) { hover.current = false; setOpen(false); } }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); hover.current = false; setOpen((o) => !o); }}
          className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-[#8a8378] hover:text-[#15120F] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC21A]"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="bt-skin w-auto max-w-[min(280px,85vw)] p-2.5 text-[12.5px] leading-snug" onOpenAutoFocus={(e) => e.preventDefault()}>
        {text}
      </PopoverContent>
    </Popover>
  );
}
