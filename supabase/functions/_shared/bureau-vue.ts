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

/** « 30 h », « 7h30 », « 45 min » : des minutes en heures, court (sans décimale, sans signe), pour tenir sur une ligne sous le nom. */
export function heuresCourtes(minutes: number): string {
  const m = Math.round(Math.abs(minutes));
  const h = Math.floor(m / 60); const r = m % 60;
  if (h === 0 && r > 0) return `${r} min`;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h} h`;
}

export interface PrevuSalarie {
  /** Durée prévue de TOUTES ses interventions de la semaine (minutes), hors absence, hors retirée. */
  prevu: number;
  /** La part déjà passée : jours avant aujourd'hui, et interventions d'aujourd'hui déjà finies (`maintenant` « HH:MM »). */
  prevuEcoule: number;
  /** Jours d'absence de la semaine (congé, arrêt…) : l'écart à l'objectif dit « absent N j » au lieu d'un « manque » trompeur. */
  absences?: number;
}

/** Prévu de la semaine par salarié, pour l'objectif sous le nom (une intervention sans heure de fin compte 0). */
export function prevuSemaine(dates: string[], salaries: string[], prevues: LignePrevue[], aExclure: Set<string>, aujourdhui: string, maintenant: string): Record<string, PrevuSalarie> {
  const out: Record<string, PrevuSalarie> = {};
  const absents: Record<string, Set<string>> = {};
  for (const id of salaries) { out[id] = { prevu: 0, prevuEcoule: 0, absences: 0 }; absents[id] = new Set(); }
  for (const p of prevues) {
    if (p.absence_type && out[p.user_id] && dates.includes(p.work_date)) { absents[p.user_id].add(p.work_date); out[p.user_id].absences = absents[p.user_id].size; }
    if (p.absence_type || aExclure.has(p.id) || !out[p.user_id] || !dates.includes(p.work_date)) continue;
    const m = dureePrevue(p.estimated_start, p.estimated_end);
    out[p.user_id].prevu += m;
    if (p.work_date < aujourdhui || (p.work_date === aujourdhui && (p.estimated_end || '').slice(0, 5) <= maintenant)) out[p.user_id].prevuEcoule += m;
  }
  return out;
}

export type TonObjectif = 'manque' | 'dessus' | 'atteint' | 'absent';
export interface LignesObjectif {
  /** « Prévu 30 / 35 h » (« Prévu 30 h » sans objectif). */
  prevu: string;
  /** « manque 5 h », « + 3 h », « objectif atteint », « absent 2 j » (absence dans la semaine) ; vide sans objectif. Le SIGNE et le MOT portent le sens, la couleur ne fait que l'appuyer. */
  ecartObjectif: string; ton: TonObjectif | null;
  /** « Pointé 28 h » et « écart −2 h » (par rapport au prévu déjà passé) ; null tant que rien n'est passé ni pointé. */
  pointe: string | null; ecartPointe: string | null;
  /** Phrase complète pour l'infobulle et les lecteurs d'écran. */
  phrase: string;
}

/** Les deux lignes courtes sous le nom du salarié. `objectif` en heures (0 = pas d'horaire hebdomadaire). Aucun effet sur heures sup., paie, exports. */
export function lignesObjectif(objectif: number, p: PrevuSalarie, pointe: number): LignesObjectif {
  const obj = Math.max(0, Math.round(objectif * 60));
  let ecartObjectif = ''; let ton: TonObjectif | null = null; let phraseObj = '';
  if (obj > 0) {
    const d = p.prevu - obj;
    const abs = p.absences || 0;
    if (d < 0 && abs > 0) { ecartObjectif = `absent ${abs} j`; ton = 'absent'; phraseObj = `${heuresCourtes(d)} sous l’objectif de ${heuresCourtes(obj)}, avec ${abs} jour${abs > 1 ? 's' : ''} d’absence`; }
    else if (d < 0) { ecartObjectif = `manque ${heuresCourtes(d)}`; ton = 'manque'; phraseObj = `il manque ${heuresCourtes(d)} pour atteindre l’objectif de ${heuresCourtes(obj)}`; }
    else if (d > 0) { ecartObjectif = `+ ${heuresCourtes(d)}`; ton = 'dessus'; phraseObj = `${heuresCourtes(d)} au-dessus de l’objectif de ${heuresCourtes(obj)}`; }
    else { ecartObjectif = 'objectif atteint'; ton = 'atteint'; phraseObj = `objectif de ${heuresCourtes(obj)} atteint`; }
  }
  const prevuTxt = obj > 0 ? `Prévu ${heuresCourtes(p.prevu).replace(/ h$/, '')} / ${heuresCourtes(obj)}` : `Prévu ${heuresCourtes(p.prevu)}`;
  let pointeTxt: string | null = null; let ecartPointe: string | null = null; let phrasePointe = '';
  if (pointe > 0 || p.prevuEcoule > 0) {
    const e = pointe - p.prevuEcoule;
    pointeTxt = `Pointé ${heuresCourtes(pointe)}`;
    ecartPointe = `écart ${e < 0 ? '−' : e > 0 ? '+' : ''}${heuresCourtes(e)}`;
    phrasePointe = ` Pointé ${heuresCourtes(pointe)} pour ${heuresCourtes(p.prevuEcoule)} prévues jusqu’ici : ${e < 0 ? `${heuresCourtes(e)} de moins` : e > 0 ? `${heuresCourtes(e)} de plus` : 'pile'}.`;
  }
  const phrase = `Prévu ${heuresCourtes(p.prevu)} cette semaine${phraseObj ? `, ${phraseObj}` : ''}.${phrasePointe}`;
  return { prevu: prevuTxt, ecartObjectif, ton, pointe: pointeTxt, ecartPointe, phrase };
}
