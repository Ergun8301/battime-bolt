// Design salarié · ÉTAPE 2 — les RÈGLES de l'écran du salarié, en fonctions pures (aucun React, aucune base, aucune horloge cachée).
//
// Pourquoi ce fichier : la nouvelle interface (planche du designer) a besoin de calculs que l'écran actuel fait au milieu de son affichage
// (`components/poseur-day.tsx`, `app/poseur/page.tsx`) ou qui n'existent nulle part (état d'une ligne en un mot, bande des 7 jours, axe de la
// mini-frise, aide sous le bouton d'envoi). Les écrire ici, testés en Deno, permet à l'ancienne et à la nouvelle vue de s'appuyer sur la MÊME règle,
// et à l'étape suivante de ne changer que l'affichage. Rien n'est encore branché sur l'écran : aucun changement visible.
// Contrat : docs/design-brief/audit-salarie/03-plan-integration.md §1.4 et §1.5.
//
// SERVEUR ET NAVIGATEUR : ce module n'importe rien (le navigateur l'atteint par '@/supabase/functions/_shared/…', comme day-hours.ts).

const pad = (n: number) => String(n).padStart(2, '0');
/** « 07:30:00 » ou « 07:30 » → minutes depuis minuit ; null si illisible. */
export function minutesDe(h: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(h ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
const hhmm = (min: number) => `${pad(Math.floor(((min % 1440) + 1440) % 1440 / 60))}:${pad(((min % 60) + 60) % 60)}`;

// ── 1. L'état d'UNE ligne d'heures ──────────────────────────────────────────
export type EtatLigne =
  | 'comptable'      // exportée ou verrouillée : « Chez le comptable »
  | 'envoyee'        // envoyée au bureau
  | 'renvoyee'       // renvoyée par le bureau à corriger (brouillon qui a déjà été envoyé)
  | 'fin-a-completer'// sortie oubliée SANS heure de fin : ne part pas
  | 'sortie-oubliee' // sortie oubliée, heure de fin proposée à vérifier
  | 'a-envoyer'      // brouillon
  | 'retiree';       // annulée
export interface LigneBrute {
  status?: string | null; locked?: boolean | null; exported_at?: string | null; submitted_at?: string | null;
  exit_forgotten?: boolean | null; start_time?: string | null; end_time?: string | null;
}
/**
 * Priorité (la plus forte d'abord) : retirée > chez le comptable > fin à compléter > sortie oubliée > renvoyée > à envoyer > envoyée.
 * « Renvoyée » = brouillon dont `submitted_at` est non nul : la base interdit au salarié de repasser une ligne en brouillon, seul le bureau le fait.
 */
export function etatLigne(e: LigneBrute): EtatLigne {
  if (e.status === 'cancelled') return 'retiree';
  if (e.locked || e.exported_at) return 'comptable';
  const brouillon = e.status === 'draft';
  if (brouillon && e.exit_forgotten) {
    const s = String(e.start_time ?? '').slice(0, 5), f = String(e.end_time ?? '').slice(0, 5);
    return s && s === f ? 'fin-a-completer' : 'sortie-oubliee';
  }
  if (brouillon) return e.submitted_at ? 'renvoyee' : 'a-envoyer';
  return 'envoyee';
}
export const LIBELLE_LIGNE: Record<EtatLigne, string> = {
  comptable: 'Chez le comptable', envoyee: 'Envoyé', renvoyee: 'À corriger', 'fin-a-completer': 'Fin à compléter',
  'sortie-oubliee': 'Sortie oubliée', 'a-envoyer': 'À envoyer', retiree: 'Retirée',
};

// ── 2. L'état d'UN jour (bande des 7 jours) ─────────────────────────────────
export type EtatJour = 'vide' | 'prevu' | 'a-envoyer' | 'renvoye' | 'oublie' | 'envoye' | 'cloture' | 'absence';
export interface JourBrut {
  date: string;
  /** Lettre d'absence au planning (conge, maladie, intemperie, repos) ou null. */
  absence?: string | null;
  /** Il y a du prévu au planning ce jour-là. */
  prevu?: boolean;
  lignes: LigneBrute[];
  /** Mois clôturé, ou jour couvert par la clôture de CE salarié. */
  cloture?: boolean;
}
/** Priorité : clôturé > absence > renvoyé > oublié (fin à compléter ou sortie oubliée) > à envoyer > envoyé > prévu > vide. */
export function etatJour(j: JourBrut): EtatJour {
  if (j.cloture) return 'cloture';
  if (j.absence) return 'absence';
  const etats = j.lignes.map(etatLigne).filter((x) => x !== 'retiree');
  if (etats.includes('renvoyee')) return 'renvoye';
  if (etats.includes('fin-a-completer') || etats.includes('sortie-oubliee')) return 'oublie';
  if (etats.includes('a-envoyer')) return 'a-envoyer';
  if (etats.length) return 'envoye';
  return j.prevu ? 'prevu' : 'vide';
}
const LETTRE_ABSENCE: Record<string, string> = { conge: 'C', maladie: 'M', intemperie: 'I', repos: 'R' };
export const lettreAbsence = (a: string | null | undefined): string | null => (a ? LETTRE_ABSENCE[a] ?? '·' : null);

export interface CaseBande { date: string; jour: string; numero: number; etat: EtatJour; aujourdhui: boolean; affiche: boolean; lettre: string | null }
const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const ajouter = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const lundiDe = (iso: string) => ajouter(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
/**
 * La bande lundi → dimanche de la semaine du jour affiché. « Aujourd'hui » et « affiché » sont deux axes à part de l'état : un jour peut être
 * aujourd'hui ET envoyé ET clôturé (la pastille reprend l'état du jour, l'anneau dit « aujourd'hui »).
 */
export function bandeJours(jourAffiche: string, aujourdhui: string, parDate: ReadonlyMap<string, Omit<JourBrut, 'date'>>): CaseBande[] {
  const lundi = lundiDe(jourAffiche);
  return Array.from({ length: 7 }, (_, i) => {
    const date = ajouter(lundi, i);
    const brut = parDate.get(date) ?? { lignes: [] };
    return {
      date, jour: JOURS_COURTS[i], numero: Number(date.slice(8)), etat: etatJour({ date, ...brut }),
      aujourdhui: date === aujourdhui, affiche: date === jourAffiche, lettre: lettreAbsence(brut.absence),
    };
  });
}

// ── 3. Titres et repères ────────────────────────────────────────────────────
/** Numéro de semaine ISO 8601 (la semaine du jeudi). « Semaine 42 ». */
export function semaineIso(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const debut = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - debut) / 86_400_000 + 1) / 7);
}
export const titreSemaine = (iso: string) => `Semaine ${semaineIso(iso)}`;
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** Le petit mot au-dessus de la date : AUJOURD'HUI, RENVOYÉE, ERREUR, ou le jour de la semaine en capitales. */
export function kicker(jour: { date: string; aujourdhui: boolean; etat: EtatJour; erreurEnvoi?: boolean }): string {
  if (jour.erreurEnvoi) return 'ERREUR';
  if (jour.etat === 'renvoye') return 'RENVOYÉE';
  if (jour.aujourdhui) return 'AUJOURD’HUI';
  return JOURS[new Date(`${jour.date}T12:00:00Z`).getUTCDay()].toUpperCase();
}
/** Minutes → « 7:30 » (format du dossier). */
export const hm = (min: number) => `${Math.floor(Math.max(0, min) / 60)}:${pad(Math.max(0, min) % 60)}`;

// ── 4. Aide sous le bouton d'envoi ──────────────────────────────────────────
export type EtatEnvoi = 'rien' | 'pret' | 'envoi' | 'envoye' | 'hors-ligne' | 'echec';
export interface ContexteEnvoi { pointageEnCours: boolean; brouillons: number; enAttente: number; finACompleter: boolean; cloture: boolean }
/** UNE phrase d'aide (une seule ligne à 360 px : 12 px en capitales, jamais plus de 34 caractères pour le pointage), choisie selon ce qui est vrai (la planche la codait en dur sur 8 écrans où elle était fausse). null = aucune aide. */
export function aideEnvoi(etat: EtatEnvoi, c: ContexteEnvoi): string | null {
  if (c.cloture) return 'Ces heures sont clôturées : rapproche-toi de la secrétaire.';
  if (c.finACompleter) return 'Une sortie oubliée n’a pas d’heure de fin : mets-la avant d’envoyer.';
  switch (etat) {
    case 'envoi': return 'Envoi en cours…';
    case 'hors-ligne': {
      const n = c.enAttente || c.brouillons;
      return n > 1 ? `Pas de réseau : ${n} lignes partiront toutes seules au retour du réseau.` : 'Pas de réseau : 1 ligne partira toute seule au retour du réseau.';
    }
    case 'echec': return 'L’envoi a échoué : touche pour réessayer.';
    case 'envoye': return c.pointageEnCours ? 'Envoyé. Le pointage reste ouvert.' : null;
    case 'pret': return c.pointageEnCours ? 'Le pointage en cours ne part pas' : null;
    default: return null;
  }
}

// ── 5. Pourquoi une ligne en attente n'est pas partie ───────────────────────
export const MAX_ESSAIS = 5;
/** Le message brut de la base (PostgREST) → une raison lisible. Le détail technique n'est jamais montré. */
export function raisonEchec(entree: { lastError?: string | null; attempts?: number | null }): string {
  const m = String(entree.lastError ?? '');
  if (/jusqu/i.test(m) && /clôtur/i.test(m)) return 'Refusé : tes heures sont clôturées à cette date.';
  if (/clôtur/i.test(m)) return 'Refusé : le mois est clôturé.';
  if (/ne redevient pas brouillon/i.test(m)) return 'Refusé : journée déjà envoyée.';
  if (/hors de votre entreprise/i.test(m)) return 'Refusé : ce chantier n’existe plus dans ton entreprise.';
  if (/ne se réactive pas/i.test(m)) return 'Refusé : ce chantier a été retiré.';
  if ((entree.attempts ?? 0) >= MAX_ESSAIS) return `${MAX_ESSAIS} essais sans réussite : préviens le bureau.`;
  return 'Pas encore envoyé : nouvel essai automatique.';
}

// ── 6. L'axe de la mini-frise ───────────────────────────────────────────────
export interface SegmentFrise { debut: string; fin: string }
export interface AxeFrise {
  /** Bornes en minutes depuis minuit du jour affiché ; `fin` peut dépasser 1440 (nuit). */
  debut: number; fin: number; largeur: number;
  /** Le premier tick (en minutes) où l'on passe minuit, ou null. */
  minuit: number | null;
  /** Une graduation par heure pleine : { min, label }. */
  ticks: { min: number; label: string }[];
  /** Segments placés sur l'axe, dans l'ordre reçu (minutes absolues). Une fin ≤ début est un POINT (sortie oubliée), jamais 24 h. */
  segments: { debut: number; fin: number; point: boolean }[];
}
/** Largeur minimale de l'axe : 8 h. */
export const FRISE_LARGEUR_MIN = 8 * 60;
/**
 * Règle (README du dossier, §7, essayée sur 7 cas — voir salarie-vue.test.ts) :
 *   · début = heure pleine qui PRÉCÈDE le premier début (08:00 pile reste 08:00), moins 1 h ; fin = heure pleine qui SUIT la dernière fin, plus 1 h ;
 *   · largeur minimale 8 h, centrée sur le milieu des segments ; aucune ligne : l'horaire de base (`base`, par défaut 08:00 → 17:00) ;
 *   · la nuit : un segment qui finit avant d'avoir commencé passe minuit (+24 h), et le suivant reste dans la même nuit ;
 *   · une sortie oubliée (fin = début) est un point : elle ne rallonge pas l'axe à 24 h.
 */
export function friseAxe(segments: readonly SegmentFrise[], base: SegmentFrise = { debut: '08:00', fin: '17:00' }): AxeFrise {
  const places: AxeFrise['segments'] = [];
  let debutPrec = -Infinity;
  for (const s of segments) {
    const d0 = minutesDe(s.debut), f0 = minutesDe(s.fin);
    if (d0 === null || f0 === null) continue;
    // Le jour d'un segment : le plus petit décalage de 24 h qui ne le fait pas commencer AVANT le début du précédent (les segments arrivent dans l'ordre
    // de la journée ; un chevauchement ordinaire reste donc dans le même jour, seule la nuit passe au lendemain).
    let d = d0;
    if (d < debutPrec) d += 1440 * Math.ceil((debutPrec - d) / 1440);
    const point = f0 === d0;
    let f = point ? d : f0 + (d - d0);
    if (!point && f < d) f += 1440;
    places.push({ debut: d, fin: f, point });
    debutPrec = d;
  }
  const sources = places.length ? places : [{ debut: minutesDe(base.debut) ?? 480, fin: minutesDe(base.fin) ?? 1020, point: false }];
  const min = Math.min(...sources.map((x) => x.debut)), max = Math.max(...sources.map((x) => x.fin));
  let debut = Math.floor(min / 60) * 60 - 60, fin = Math.ceil(max / 60) * 60 + 60;
  if (fin - debut < FRISE_LARGEUR_MIN) {
    debut = Math.floor(((min + max) / 2 - FRISE_LARGEUR_MIN / 2) / 60) * 60;
    fin = debut + FRISE_LARGEUR_MIN;
  }
  const ticks: AxeFrise['ticks'] = [];
  for (let t = debut; t <= fin; t += 60) ticks.push({ min: t, label: t % 1440 === 0 && t !== debut ? 'minuit' : hhmm(t).slice(0, 2) + ' h' });
  return { debut, fin, largeur: fin - debut, minuit: ticks.find((t) => t.min % 1440 === 0 && t.min > 0)?.min ?? null, ticks, segments: places };
}

/**
 * Étape 8 (planche AS4) : la date d'une conversation de l'historique de l'assistant, « Aujourd’hui · 09:12 », « Hier · 18:40 », « 12 oct. · 07:55 ».
 * Jours de CALENDRIER à l'heure du fuseau (un chat d'hier soir est « Hier » ce matin) ; une date illisible donne ''.
 */
export function dateConversation(iso: string, maintenant: Date = new Date(), fuseau = 'Europe/Paris'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const jour = (x: Date) => x.toLocaleDateString('sv-SE', { timeZone: fuseau });
  const ecart = Math.round((Date.parse(`${jour(maintenant)}T00:00:00Z`) - Date.parse(`${jour(d)}T00:00:00Z`)) / 86400000);
  const heure = d.toLocaleTimeString('fr-FR', { timeZone: fuseau, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const quand = ecart <= 0 ? 'Aujourd’hui' : ecart === 1 ? 'Hier' : d.toLocaleDateString('fr-FR', { timeZone: fuseau, day: 'numeric', month: 'short' });
  return `${quand} · ${heure}`;
}

// ── 9. Le résumé d'un mois (page « Mon mois ») ──────────────────────────────
// Calculé sur les lignes et les affectations DÉJÀ lues par la page (aucune requête de plus).
export interface LigneMois { work_date: string; status?: string | null; total_minutes?: number | null; meal_allowance?: boolean | null }
export interface AffectationMois { work_date: string; absence_type?: string | null }
export interface ResumeMois {
  /** Heures ENVOYÉES (envoyée ou validée) : la même règle que le total d'avant (`isCounted`). */
  minutes: number;
  /** Jours qui portent au moins une ligne envoyée. */
  joursTravailles: number;
  /** Jours envoyés avec panier repas. */
  paniers: number;
  /** Jours de congé. */
  conges: number;
  /** Jours de maladie ou d'intempérie (le repos n'est pas une absence). */
  absences: number;
  /** Heures notées pas encore envoyées (brouillons) et les jours concernés. */
  aEnvoyerMinutes: number;
  aEnvoyerJours: number;
}
/** Une ligne retirée (`cancelled`) ne compte nulle part ; un jour d'absence ne compte qu'une fois même si deux affectations le disent. */
export function resumeMois(lignes: readonly LigneMois[], affectations: readonly AffectationMois[] = []): ResumeMois {
  const envoyes = new Set<string>(), paniers = new Set<string>(), brouillons = new Set<string>(), conges = new Set<string>(), absences = new Set<string>();
  let minutes = 0, aEnvoyerMinutes = 0;
  for (const l of lignes) {
    const m = Number(l.total_minutes) || 0;
    if (l.status === 'submitted' || l.status === 'validated') {
      minutes += m; envoyes.add(l.work_date);
      if (l.meal_allowance) paniers.add(l.work_date);
    } else if (l.status === 'draft') { aEnvoyerMinutes += m; brouillons.add(l.work_date); }
  }
  for (const a of affectations) {
    if (a.absence_type === 'conge') conges.add(a.work_date);
    else if (a.absence_type === 'maladie' || a.absence_type === 'intemperie') absences.add(a.work_date);
  }
  return { minutes, joursTravailles: envoyes.size, paniers: paniers.size, conges: conges.size, absences: absences.size, aEnvoyerMinutes, aEnvoyerJours: brouillons.size };
}
