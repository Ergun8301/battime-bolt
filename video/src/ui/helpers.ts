// Petits utilitaires partagés par les scènes.

// 240 -> "4:00" (durées)
export const fmtHM = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min) % 60).padStart(2, '0')}`;

// 450 -> "07:30" (heures de pointage)
export const fmtClock = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min) % 60).padStart(2, '0')}`;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
