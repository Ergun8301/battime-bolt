// Design du bureau (v2) · règles PURES de lecture du planning : les totaux d'heures de la semaine (NOUVEAU, décidé dans le README du designer),
// la plage d'une absence, la ligne « À relancer ». Aucune base, aucun React : testé par Deno (bureau-vue.test.ts).
// Elles ne lisent QUE ce que l'écran a déjà chargé (aucune requête de plus).

/** « 142:15 » : des minutes en heures:minutes (jamais de décimale). */
export function hm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Durée prévue d'une intervention en minutes (0 sans heure de fin, ou si la fin n'est pas après le début). « 08:00:00 » ou « 08:00 ». */
export function dureePrevue(debut?: string | null, fin?: string | null): number {
  if (!debut || !fin) return 0;
  const lire = (t: string) => { const [h, m] = t.split(':'); return Number(h) * 60 + Number(m || 0); };
  const a = lire(debut); const b = lire(fin);
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? b - a : 0;
}

export interface LigneHeures { user_id: string; work_date: string; total_minutes: number }
export interface LignePrevue { id: string; user_id: string; work_date: string; estimated_start?: string | null; estimated_end?: string | null; absence_type?: string | null }

export interface TotauxSemaine {
  /** Heures envoyées par jour (minutes), dans l'ordre de `dates`. */
  jours: number[];
  /** Par salarié : envoyées et prévues restantes (minutes). */
  parSalarie: Record<string, { envoyees: number; prevues: number }>;
  /** Total envoyé de la semaine, et prévu restant (« + 61:00 h prévues à venir »). */
  envoyees: number;
  aVenir: number;
}

/**
 * Totaux de la semaine affichée. `envoyees` = les heures envoyées (la grille ne lit que celles-là : ni brouillon, ni pointage en cours).
 * `prevues` = la durée prévue des interventions de la semaine qui ne portent encore AUCUNE heure (ni envoyée, ni brouillon),
 * hors absence, hors retirée par le salarié (`aExclure` : ids de planning).
 */
export function totauxSemaine(dates: string[], salaries: string[], heures: LigneHeures[], prevues: LignePrevue[], aExclure: Set<string>): TotauxSemaine {
  const jours = dates.map(() => 0);
  const parSalarie: Record<string, { envoyees: number; prevues: number }> = {};
  for (const id of salaries) parSalarie[id] = { envoyees: 0, prevues: 0 };
  let envoyees = 0; let aVenir = 0;
  for (const h of heures) {
    const i = dates.indexOf(h.work_date);
    if (i < 0 || !parSalarie[h.user_id]) continue;
    const m = Math.max(0, h.total_minutes || 0);
    jours[i] += m; parSalarie[h.user_id].envoyees += m; envoyees += m;
  }
  for (const p of prevues) {
    if (p.absence_type || aExclure.has(p.id) || !parSalarie[p.user_id] || !dates.includes(p.work_date)) continue;
    const m = dureePrevue(p.estimated_start, p.estimated_end);
    parSalarie[p.user_id].prevues += m; aVenir += m;
  }
  return { jours, parSalarie, envoyees, aVenir };
}

/** Hauteur d'une barre du bandeau (0 à 100) : la plus haute des 7 jours = 100 ; un jour à zéro = 0. */
export function hauteursBarres(jours: number[]): number[] {
  const max = Math.max(0, ...jours);
  return jours.map((m) => (max > 0 ? Math.round((m / max) * 100) : 0));
}

/** Pourcentage de la jauge d'un salarié : envoyées / (envoyées + prévues), 0 s'il n'y a rien. */
export function pourcentJauge(envoyees: number, prevues: number): number {
  const t = envoyees + prevues;
  return t > 0 ? Math.round((envoyees / t) * 100) : 0;
}

/** « Bruno ×2, Fanny ×2, Eli » : les salariés à relancer (prénom, ×n au-delà d'un jour), les plus en retard d'abord, trois au plus puis « … ». */
export function resumeRelance(items: { prenom: string; jours: number }[], max = 3): string {
  const tri = [...items].filter((i) => i.jours > 0).sort((a, b) => b.jours - a.jours || a.prenom.localeCompare(b.prenom, 'fr'));
  const txt = tri.slice(0, max).map((i) => (i.jours > 1 ? `${i.prenom} ×${i.jours}` : i.prenom));
  if (tri.length > max) txt.push('…');
  return txt.join(', ');
}

/** Plage d'une absence autour d'un jour : premier et dernier jour consécutifs du même type (`type(date)` rend le type d'absence ou null). */
export function plageAbsence(date: string, type: (d: string) => string | null): { du: string; au: string; jours: number } {
  const t = type(date);
  const decale = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  let du = date; let au = date;
  if (!t) return { du, au, jours: 1 };
  for (let i = 0; i < 62 && type(decale(du, -1)) === t; i++) du = decale(du, -1);
  for (let i = 0; i < 62 && type(decale(au, 1)) === t; i++) au = decale(au, 1);
  const jours = Math.round((new Date(`${au}T12:00:00Z`).getTime() - new Date(`${du}T12:00:00Z`).getTime()) / 86400000) + 1;
  return { du, au, jours };
}
