// Lot 9 — « EN COURS DEPUIS HH:MM » : UNE seule règle de placement, partagée
// par le bureau (grille), la borne (fonction kiosk) et le salarié (cartes).
//
// Une CASE = un salarié × un jour. Elle passe en vert dès que ce salarié a un
// pointage en direct ouvert ce jour-là, même si le chantier pointé n'est pas
// au planning (scan de la borne, « Autre »). La bulle désignée, quand il y en
// a une, est celle du planning_id du chrono, sinon celle du même chantier —
// JAMAIS « la première bulle » par défaut (ce serait une fausse information).
//
// Fonctions pures, sans dépendance : importées par Deno ET par le navigateur.

export interface LiveSessionLike {
  user_id: string;
  worksite_id: string | null;
  planning_id: string | null;
  work_date: string; // YYYY-MM-DD (jour de Paris où le chrono a démarré)
  started_at: string; // ISO
}
export interface SlotLike {
  id: string;
  user_id: string;
  worksite_id: string | null;
  work_date: string;
  absence?: boolean;
}
export interface LivePlace {
  user_id: string;
  work_date: string;
  /** « 07:45 » (heure de Paris du début) */
  since: string;
  /** Bulle désignée, ou null : le chantier pointé n'est pas au planning de ce jour. */
  slotId: string | null;
  worksite_id: string | null;
}

/** HH:MM à l'heure de Paris. */
export function parisHHmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/** YYYY-MM-DD à l'heure de Paris. */
export function parisDay(ms: number): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date(ms));
}

export const cellKey = (userId: string, date: string) => `${userId}|${date}`;

/**
 * Place chaque chrono ouvert sur sa case (salarié × jour). Un salarié n'a
 * qu'un chrono (clé primaire), donc au plus une case par salarié.
 */
export function placeLive(sessions: LiveSessionLike[], slots: SlotLike[]): Map<string, LivePlace> {
  const out = new Map<string, LivePlace>();
  for (const s of sessions) {
    if (!s.user_id || !s.work_date || !s.started_at) continue;
    const cell = slots.filter((p) => p.user_id === s.user_id && p.work_date === s.work_date && !p.absence);
    const byPlanning = s.planning_id ? cell.find((p) => p.id === s.planning_id) : undefined;
    const bySite = byPlanning ?? (s.worksite_id ? cell.find((p) => p.worksite_id === s.worksite_id) : undefined);
    out.set(cellKey(s.user_id, s.work_date), {
      user_id: s.user_id,
      work_date: s.work_date,
      since: parisHHmm(s.started_at),
      slotId: bySite?.id ?? null,
      worksite_id: s.worksite_id,
    });
  }
  return out;
}
