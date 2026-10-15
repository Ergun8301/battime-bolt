'use client';

// Fenêtre d'information « L'endroit au pointage » (lot 6) : affichée UNE fois,
// au premier pointage en direct, avant toute collecte. Voir lib/position-info.ts.

import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { GEO_INFO_LINK, GEO_INFO_TEXT, GEO_INFO_TITLE } from '@/lib/position-info';
// Sa feuille de style est components/geo-info-dialog.css, importée au niveau des ROUTES qui l'affichent (app/poseur/layout.tsx, app/apercu/assistant-salarie/layout.tsx) :
// un import ici ferait une feuille chargée à part avec chaque morceau différé (et alourdirait le chargeur de TOUTES les pages).

export default function GeoInfoDialog({ onOk }: { onOk: () => void }) {
  return (
    <div className="gi-bg" role="dialog" aria-modal="true" aria-label={GEO_INFO_TITLE} data-testid="geo-info">
      <div className="gi">
        <h2><MapPin className="h-4 w-4" /> {GEO_INFO_TITLE}</h2>
        <p>{GEO_INFO_TEXT}</p>
        <Link href={GEO_INFO_LINK}>En savoir plus</Link>
        <button type="button" onClick={onOk}>J’ai compris</button>
      </div>
    </div>
  );
}
