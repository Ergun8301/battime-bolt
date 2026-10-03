// Lot 9 — le planning de la SEMAINE affiché par la borne, en lecture seule.
//
// La fonction `kiosk` (action `board`) lit la base avec la clé service, TOUJOURS
// filtrée sur l'entreprise de la borne, puis confie la mise en forme à
// `buildBoard`, ici, sans base ni réseau. La borne affiche ce résultat tel quel
// (components/kiosk-week-grid.tsx), le mode démo aussi : un seul constructeur.
//
// CE QUI SORT, ET RIEN D'AUTRE (liste blanche, testée dans kiosk-board.test.ts) :
//   · prénom + nom ; une teinte d'avatar (entier) ;
//   · par bulle : chantier, ville, horaires PRÉVUS, une couleur (entier) ;
//   · « Absent », sans le motif (une maladie est une donnée de santé) ;
//   · l'heure de DÉBUT d'un pointage en direct ouvert aujourd'hui (« en cours
//     depuis 07:42 ») — seule exception, validée, à « aucune heure pointée ».
// Jamais : identifiant (uuid), e-mail, note, motif d'absence, heures faites,
// durée, coût. Les salariés sont désignés par une clé locale (« w0 », « w1 »…)
// qui ne vaut que pour cette réponse.
//
// Fonctions pures : importées par Deno (fonction kiosk) ET par la borne (démo).
import { parisDay, placeLive } from './live-place.ts';

/** Nombre de couleurs de chantier (CHANTIER_PALETTES, components/planning-bubble.tsx). */
export const PALETTE_COUNT = 7;

/**
 * Même empreinte que `hashStr` de components/planning-bubble.tsx (le bureau) :
 * une bulle a la même couleur au bureau et sur la borne. Recopiée ici parce que
 * ce fichier-là est un composant React que Deno ne lit pas ; le test vérifie
 * que les deux donnent le même résultat.
 */
export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ── Entrées : les colonnes EXACTES lues par la fonction kiosk ────────────────
export interface BoardUser { id: string; first_name: string | null; last_name: string | null }
export interface BoardPlanning {
  id: string;
  user_id: string;
  worksite_id: string | null;
  work_date: string;
  estimated_start: string | null;
  estimated_end: string | null;
  absence_type: string | null;
  position: number | null;
  created_at: string | null;
}
export interface BoardWorksite { id: string; client_name: string | null; city: string | null }
export interface BoardSession {
  user_id: string;
  worksite_id: string | null;
  planning_id: string | null;
  work_date: string;
  started_at: string;
}
export interface BoardInput {
  users: BoardUser[];
  planning: BoardPlanning[];
  worksites: BoardWorksite[];
  sessions: BoardSession[];
  nowMs: number;
}

// ── Sortie : ce que la tablette reçoit (et garde en cache hors ligne) ────────
export interface KioskBoardWorker { k: string; first_name: string; last_name: string; tint: number }
export interface KioskBoardSlot {
  w: string;
  date: string;
  title: string;
  sub: string | null;
  hours: string | null;
  color: number;
  /** « 07:42 » : pointage en direct ouvert sur cette bulle, sinon null. */
  live: string | null;
}
export interface KioskBoardAbsence { w: string; date: string }
/** Pointage en direct ouvert sur un chantier qui n'est pas au planning de ce jour. */
export interface KioskBoardLiveExtra { w: string; date: string; title: string; since: string }
export interface KioskBoard {
  week_start: string;
  today: string;
  days: string[];
  workers: KioskBoardWorker[];
  slots: KioskBoardSlot[];
  absences: KioskBoardAbsence[];
  live_extra: KioskBoardLiveExtra[];
}

/** aaaa-mm-jj + n jours, en arithmétique de calendrier (aucun changement d'heure). */
export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** La semaine de Paris qui contient `nowMs` : du lundi au dimanche (lib/week.ts). */
export function parisWeek(nowMs: number): { today: string; week_start: string; days: string[] } {
  const today = parisDay(nowMs);
  const [y, m, d] = today.split('-').map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // lundi = 0
  const week_start = addDaysISO(today, -offset);
  return { today, week_start, days: Array.from({ length: 7 }, (_, i) => addDaysISO(week_start, i)) };
}

/** Horaire prévu, comme le bureau (plannedHoursOf) : « 14:00 » ou « 14:00–18:00 ». */
export function plannedHours(start: string | null, end: string | null): string | null {
  return start ? `${start.slice(0, 5)}${end ? `–${end.slice(0, 5)}` : ''}` : null;
}

// Ordre dans une case, comme le bureau (orderCmp) : position manuelle d'abord,
// puis ordre de création.
function orderCmp(a: BoardPlanning, b: BoardPlanning): number {
  const pa = a.position ?? null;
  const pb = b.position ?? null;
  if (pa !== null && pb !== null) return pa - pb;
  if (pa !== null) return -1;
  if (pb !== null) return 1;
  return (a.created_at || '').localeCompare(b.created_at || '');
}

const clean = (s: string | null | undefined) => (s || '').trim();

export function buildBoard({ users, planning, worksites, sessions, nowMs }: BoardInput): KioskBoard {
  const { today, week_start, days } = parisWeek(nowMs);
  const inWeek = new Set(days);

  // Salariés : l'ordre reçu (prénom, comme le bureau), une clé locale chacun.
  const keyOf = new Map<string, string>();
  const workers: KioskBoardWorker[] = [];
  for (const u of users) {
    if (!u?.id || keyOf.has(u.id)) continue;
    const k = `w${workers.length}`;
    keyOf.set(u.id, k);
    workers.push({ k, first_name: clean(u.first_name), last_name: clean(u.last_name), tint: hashStr(u.id) % PALETTE_COUNT });
  }
  const sites = new Map(worksites.filter((w) => w?.id).map((w) => [w.id, w]));

  // Une ligne d'un autre salarié ou d'un chantier qui n'est pas de l'entreprise
  // ne s'affiche pas (la fonction filtre déjà ; on ne fait pas confiance).
  const rows = planning.filter((p) =>
    p && keyOf.has(p.user_id) && inWeek.has(p.work_date) && (!p.worksite_id || sites.has(p.worksite_id)));

  // Absences : une case, un « Absent ». Le motif ne sort jamais.
  const absentCells = new Set<string>();
  const absences: KioskBoardAbsence[] = [];
  for (const p of rows) {
    if (!p.absence_type) continue;
    const key = `${p.user_id}|${p.work_date}`;
    if (absentCells.has(key)) continue;
    absentCells.add(key);
    absences.push({ w: keyOf.get(p.user_id)!, date: p.work_date });
  }

  // Bulles : une case d'absence n'en montre pas (même règle que le bureau).
  const planned = rows
    .filter((p) => !p.absence_type && !absentCells.has(`${p.user_id}|${p.work_date}`))
    .sort(orderCmp);

  // « En cours depuis » : SEULEMENT les pointages ouverts aujourd'hui (Paris),
  // placés par la règle commune (live-place.ts) — jamais « la première bulle ».
  const todays = sessions.filter((s) => s && keyOf.has(s.user_id) && s.work_date === today && !!s.started_at);
  const places = placeLive(todays, [
    ...planned.map((p) => ({ id: p.id, user_id: p.user_id, worksite_id: p.worksite_id, work_date: p.work_date })),
    ...rows.filter((p) => p.absence_type).map((p) => ({ id: p.id, user_id: p.user_id, worksite_id: p.worksite_id, work_date: p.work_date, absence: true })),
  ]);
  const liveBySlot = new Map<string, string>();
  const live_extra: KioskBoardLiveExtra[] = [];
  // (forEach : la borne est compilée en ES5, sans itération de Map.)
  places.forEach((place) => {
    if (!place.since) return;
    if (place.slotId) { liveBySlot.set(place.slotId, place.since); return; }
    const site = place.worksite_id ? sites.get(place.worksite_id) : undefined;
    live_extra.push({ w: keyOf.get(place.user_id)!, date: place.work_date, title: clean(site?.client_name) || 'Chantier', since: place.since });
  });

  const slots: KioskBoardSlot[] = planned.map((p) => {
    const site = p.worksite_id ? sites.get(p.worksite_id) : undefined;
    const title = clean(site?.client_name) || 'Chantier';
    // « Autre » n'a pas de ville : s'il en porte une, elle a été saisie à la main
    // et ne décrit rien (même règle que la palette du bureau).
    const city = title === 'Autre' ? '' : clean(site?.city);
    return {
      w: keyOf.get(p.user_id)!,
      date: p.work_date,
      title,
      sub: city || null,
      hours: plannedHours(p.estimated_start, p.estimated_end),
      color: hashStr(p.worksite_id || p.id) % PALETTE_COUNT,
      live: liveBySlot.get(p.id) ?? null,
    };
  });

  return { week_start, today, days, workers, slots, absences, live_extra };
}

/** Le tableau reçu est-il bien un planning de borne ? (réponse d'une ancienne fonction, cache abîmé…) */
export function isKioskBoard(v: unknown): v is KioskBoard {
  const b = v as KioskBoard | null;
  return !!b && typeof b.week_start === 'string' && Array.isArray(b.days) && b.days.length === 7
    && Array.isArray(b.workers) && Array.isArray(b.slots) && Array.isArray(b.absences) && Array.isArray(b.live_extra);
}
