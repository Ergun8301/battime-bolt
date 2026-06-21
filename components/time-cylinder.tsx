'use client';

import { useEffect, useMemo, useRef } from 'react';

// A reliable looping 3D "barrel/dial" wheel. Each item's rotateX is computed in
// JS on scroll (no CSS scroll-driven animations → works on iOS Safari + Android).
// Infinite loop: the list is repeated; when the wheel settles we silently recenter
// into the middle copy (invisible, same value) so the user can always keep turning
// in either direction. overscroll-contain stops the page from scrolling underneath.

const ITEM_H = 40;        // px per row
const CONTAINER_H = 200;  // px (≈ 5 rows visible)
const PAD = (CONTAINER_H - ITEM_H) / 2;
const ANGLE = 22;         // degrees of tilt per row from center
const MAX_D = 4.2;        // cull beyond this many rows from center
const COL_W = 64;         // px per column

function WheelColumn({ values, value, onChange }: { values: string[]; value: string; onChange: (v: string) => void }) {
  const N = values.length;
  const COPIES = N >= 12 ? 7 : 21; // enough buffer that a single fling never reaches the end
  const MID = Math.floor(COPIES / 2);
  const reps = useMemo(() => Array.from({ length: COPIES * N }, (_, i) => values[i % N]), [values, COPIES, N]);

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

  const settle = () => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_H);
    const vIdx = ((idx % N) + N) % N;
    if (values[vIdx] !== valueRef.current) onChange(values[vIdx]);
    // Recenter into the middle copy (idle → invisible jump, same value shown).
    const target = (MID * N + vIdx) * ITEM_H;
    if (Math.abs(el.scrollTop - target) > 0.5) { el.scrollTop = target; paint(); }
  };

  const onScroll = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(paint);
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(settle, 110);
  };

  // Sync scroll to the value (mount + external changes).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const vIdx = Math.max(0, values.indexOf(value));
    const cur = ((Math.round(el.scrollTop / ITEM_H) % N) + N) % N;
    if (cur !== vIdx || el.scrollTop === 0) el.scrollTop = (MID * N + vIdx) * ITEM_H;
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, values]);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="relative overflow-y-scroll snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ height: CONTAINER_H, width: COL_W, perspective: '600px', perspectiveOrigin: '50% 50%', scrollPaddingBlock: PAD, overscrollBehavior: 'contain', touchAction: 'pan-y' }}
    >
      <ul className="m-0 list-none p-0" style={{ paddingTop: PAD, paddingBottom: PAD, transformStyle: 'preserve-3d' }}>
        {reps.map((v, i) => (
          <li
            key={i}
            ref={(el) => { itemsRef.current[i] = el; }}
            className="grid snap-center place-items-center text-2xl font-bold tabular-nums text-[#F2EDE3]"
            style={{ height: ITEM_H, backfaceVisibility: 'hidden', willChange: 'transform, opacity', fontFamily: "'JetBrains Mono', monospace" }}
          >
            {v}
          </li>
        ))}
      </ul>
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')); // 00 → 23
const MINUTES = ['00', '15', '30', '45'];

// Normalise any HH:MM to the grid (24h, minute on 00/15/30/45).
export function snapToGrid(time: string): string {
  const [rawH, rawM] = (time || '08:00').split(':');
  let h = parseInt(rawH, 10); if (isNaN(h)) h = 8;
  let m = parseInt(rawM, 10); if (isNaN(m)) m = 0;
  m = Math.round(m / 15) * 15;
  if (m === 60) { m = 0; h += 1; }
  h = ((h % 24) + 24) % 24;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function TimeCylinder({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const norm = snapToGrid(value);
  const [hh, mm] = norm.split(':');
  return (
    <div className="relative mx-auto flex w-fit items-center justify-center gap-0.5 select-none">
      {/* central visor — bande jaune chantier sur le tiroir noir */}
      <div className="pointer-events-none absolute inset-x-1 top-1/2 h-10 -translate-y-1/2 rounded-md border-y-2 border-[#FFC21A] bg-[rgba(255,194,26,0.16)]" />
      <WheelColumn values={HOURS} value={hh} onChange={(h) => onChange(`${h}:${mm}`)} />
      <span className="text-xl font-bold text-[#a59c86]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>:</span>
      <WheelColumn values={MINUTES} value={mm} onChange={(m) => onChange(`${hh}:${m}`)} />
    </div>
  );
}
