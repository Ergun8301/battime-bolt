'use client';

import { useEffect, useRef } from 'react';

// A reliable 3D "barrel/dial" wheel — each item's rotateX is computed in JS on
// scroll (no CSS scroll-driven animations, so it works on iOS Safari + Android).
// Native touch scroll + scroll-snap stops exactly on a value; a central visor
// highlights the selection.

const ITEM_H = 36;        // px per row
const CONTAINER_H = 180;  // px (≈ 5 rows visible)
const PAD = (CONTAINER_H - ITEM_H) / 2;
const ANGLE = 22;         // degrees of tilt per row away from center
const MAX_D = 4.2;        // cull beyond this many rows from center

function WheelColumn({ values, value, onChange }: { values: string[]; value: string; onChange: (v: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLLIElement | null)[]>([]);
  const rafRef = useRef(0);
  const settleRef = useRef<ReturnType<typeof setTimeout>>();
  const valueRef = useRef(value);
  valueRef.current = value;

  const paint = () => {
    const el = scrollRef.current;
    if (!el) return;
    const center = el.scrollTop / ITEM_H;
    for (let i = 0; i < itemsRef.current.length; i++) {
      const it = itemsRef.current[i];
      if (!it) continue;
      const d = i - center;
      const ad = Math.abs(d);
      if (ad > MAX_D) { it.style.opacity = '0'; it.style.transform = 'rotateX(0deg)'; continue; }
      it.style.transform = `rotateX(${-d * ANGLE}deg)`;
      it.style.opacity = String(Math.max(0.1, 1 - ad * 0.26));
    }
  };

  const onScroll = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(paint);
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const idx = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM_H)));
      if (values[idx] !== valueRef.current) onChange(values[idx]);
    }, 90);
  };

  // Sync scroll position to the value (mount + external changes), without fighting the user.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.max(0, values.indexOf(value));
    if (Math.round(el.scrollTop / ITEM_H) !== idx) el.scrollTop = idx * ITEM_H;
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, values]);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="relative overflow-y-scroll snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ height: CONTAINER_H, width: 64, perspective: '600px', perspectiveOrigin: '50% 50%', scrollPaddingBlock: PAD }}
    >
      <ul className="m-0 list-none p-0" style={{ paddingTop: PAD, paddingBottom: PAD, transformStyle: 'preserve-3d' }}>
        {values.map((v, i) => (
          <li
            key={v}
            ref={(el) => { itemsRef.current[i] = el; }}
            className="grid snap-center place-items-center text-2xl font-semibold tabular-nums"
            style={{ height: ITEM_H, backfaceVisibility: 'hidden', willChange: 'transform, opacity' }}
          >
            {v}
          </li>
        ))}
      </ul>
    </div>
  );
}

const HOURS = Array.from({ length: 15 }, (_, i) => String(6 + i).padStart(2, '0')); // 06 → 20
const MINUTES = ['00', '15', '30', '45'];

// Normalise any HH:MM to the grid (hour 06–20, minute on 00/15/30/45).
export function snapToGrid(time: string): string {
  const [rawH, rawM] = (time || '08:00').split(':');
  let h = parseInt(rawH, 10); if (isNaN(h)) h = 8;
  let m = parseInt(rawM, 10); if (isNaN(m)) m = 0;
  m = Math.round(m / 15) * 15;
  if (m === 60) { m = 0; h += 1; }
  h = Math.min(20, Math.max(6, h));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function TimeCylinder({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const norm = snapToGrid(value);
  const [hh, mm] = norm.split(':');
  return (
    <div className="relative flex items-center justify-center gap-1 select-none">
      {/* central visor */}
      <div className="pointer-events-none absolute inset-x-4 top-1/2 h-9 -translate-y-1/2 rounded-lg border-y-2 border-primary/30 bg-primary/10" />
      <WheelColumn values={HOURS} value={hh} onChange={(h) => onChange(`${h}:${mm}`)} />
      <span className="text-2xl font-bold text-muted-foreground">:</span>
      <WheelColumn values={MINUTES} value={mm} onChange={(m) => onChange(`${hh}:${m}`)} />
    </div>
  );
}
