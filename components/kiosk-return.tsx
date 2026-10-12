'use client';

import { useEffect } from 'react';
import { hasKioskPairing, isInstalledApp } from '@/lib/kiosk-device';

// Lot 2 (IA) — filet de sécurité sur la vitrine (/landing) : la tablette de la
// borne, ouverte depuis une icône d'écran d'accueil, revient sur /borne. Un vrai
// visiteur (onglet de navigateur, ou appareil sans borne reliée) ne voit rien.
export default function KioskReturn() {
  useEffect(() => {
    if (hasKioskPairing() && isInstalledApp()) window.location.replace('/borne');
  }, []);
  return null;
}
