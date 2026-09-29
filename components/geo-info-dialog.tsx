'use client';

// Fenêtre d'information « L'endroit au pointage » (lot 6) : affichée UNE fois,
// au premier pointage en direct, avant toute collecte. Voir lib/position-info.ts.

import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { GEO_INFO_LINK, GEO_INFO_TEXT, GEO_INFO_TITLE } from '@/lib/position-info';

const CSS = `
.gi-bg{position:fixed;inset:0;z-index:95;background:rgba(21,18,15,.45);display:flex;align-items:flex-end;justify-content:center;padding:16px}
.gi{width:100%;max-width:420px;background:#FBF8F2;border-radius:18px;padding:18px;box-shadow:0 20px 50px rgba(21,18,15,.3);margin-bottom:env(safe-area-inset-bottom)}
.gi h2{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:900;margin:0 0 8px;color:#15120F}
.gi p{font-size:14px;line-height:1.5;color:#3d3833;margin:0 0 10px}
.gi a{font-size:13px;font-weight:700;color:#6E6A63;text-decoration:underline}
.gi button{width:100%;margin-top:14px;border:none;background:#FFC21A;border-radius:13px;padding:14px;font-weight:900;font-size:16px;color:#15120F;cursor:pointer;font-family:inherit;box-shadow:0 3px 0 #C99300}
`;

export default function GeoInfoDialog({ onOk }: { onOk: () => void }) {
  return (
    <div className="gi-bg" role="dialog" aria-modal="true" aria-label={GEO_INFO_TITLE} data-testid="geo-info">
      <style>{CSS}</style>
      <div className="gi">
        <h2><MapPin className="h-4 w-4" /> {GEO_INFO_TITLE}</h2>
        <p>{GEO_INFO_TEXT}</p>
        <Link href={GEO_INFO_LINK}>En savoir plus</Link>
        <button type="button" onClick={onOk}>J’ai compris</button>
      </div>
    </div>
  );
}
