// Coût réel d'un salarié — le cœur, partagé MOT POUR MOT entre l'écran du
// bureau (navigateur) et la fonction Edge `payslip-read` (Deno).
//
// Deux choses vivent ici, et rien d'autre :
//   1. le NETTOYAGE de ce que l'IA a lu sur un bulletin (contrôles de
//      cohérence : dans le doute, le champ reste VIDE et l'admin le complète) ;
//   2. le CALCUL du coût horaire réel à partir des bulletins validés.
//
// Aucune dépendance, aucun accès réseau : testable seul (payslip.test.ts).

/** Chiffres d'un bulletin, tels que l'admin les valide. */
export interface PayslipFigures {
  /** Mois du bulletin, "aaaa-mm". */
  month: string | null;
  /** Salaire brut du mois (€). */
  gross: number | null;
  /** « Total versé par l'employeur » / coût total employeur (€). */
  employer_total: number | null;
  /** Heures payées sur le mois. */
  paid_hours: number | null;
}

export const HOURS_MIN = 1;
export const HOURS_MAX = 250;
/** Taux par défaut de la cotisation caisse de congés payés BTP (%). */
export const BTP_LEAVE_DEFAULT_RATE = 20.7;
/** Nombre de bulletins validés pris dans la moyenne. */
export const AVERAGE_OVER = 3;

/**
 * Lit un montant tel qu'un modèle ou un humain peut l'écrire : 2345.67,
 * "2 345,67", "2.345,67 €", "1 234". Renvoie null si ce n'est pas un nombre
 * positif fini.
 */
export function parseAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/[\s  €]/g, '').replace(/eur(os?)?$/i, '');
  if (!s) return null;
  // "2.345,67" → "2345.67" ; "2,345.67" → "2345.67" ; "2345,67" → "2345.67"
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** "2026-08", "08/2026", "2026-08-01" → "2026-08". Sinon null. */
export function parseMonth(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(s);
  if (m) return fmtMonth(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return fmtMonth(Number(m[2]), Number(m[1]));
  return null;
}
function fmtMonth(y: number, mo: number): string | null {
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12) return null;
  return `${y}-${String(mo).padStart(2, '0')}`;
}

/**
 * Ce que l'IA a lu → ce qu'on montre à l'admin. Chaque doute vide le champ :
 *   - total employeur ≤ brut : impossible (les charges patronales s'ajoutent
 *     au brut) → total employeur vidé ;
 *   - heures hors [1 ; 250] → vidées.
 * `doubts` liste les champs vidés, pour les signaler à l'écran.
 */
export function sanitizeExtraction(raw: unknown): { figures: PayslipFigures; doubts: (keyof PayslipFigures)[] } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const doubts: (keyof PayslipFigures)[] = [];
  const month = parseMonth(r.month);
  const gross = parseAmount(r.gross);
  let employer_total = parseAmount(r.employer_total);
  let paid_hours = parseAmount(r.paid_hours);
  if (r.month != null && r.month !== '' && !month) doubts.push('month');
  if (r.gross != null && r.gross !== '' && gross == null) doubts.push('gross');
  if (employer_total != null && gross != null && employer_total <= gross) {
    employer_total = null;
    doubts.push('employer_total');
  }
  if (paid_hours != null && (paid_hours < HOURS_MIN || paid_hours > HOURS_MAX)) {
    paid_hours = null;
    doubts.push('paid_hours');
  }
  return { figures: { month, gross, employer_total, paid_hours }, doubts };
}

/** Motif de refus avant enregistrement, ou null si les chiffres sont complets et cohérents. */
export function validateFigures(f: PayslipFigures): string | null {
  if (!f.month) return 'Indiquez le mois du bulletin.';
  if (f.gross == null) return 'Indiquez le salaire brut.';
  if (f.employer_total == null) return 'Indiquez le total versé par l’employeur.';
  if (f.paid_hours == null) return 'Indiquez les heures payées.';
  if (f.employer_total <= f.gross) return 'Le total employeur doit être supérieur au brut.';
  if (f.paid_hours < HOURS_MIN || f.paid_hours > HOURS_MAX) return `Les heures payées doivent être entre ${HOURS_MIN} et ${HOURS_MAX}.`;
  return null;
}

export interface LeaveFund { enabled: boolean; rate: number }

/**
 * Coût horaire d'UN bulletin : (total employeur + cotisation congés BTP) ÷ heures payées.
 *
 * La cotisation à la caisse de congés payés BTP ne figure pas dans le total du
 * bulletin : l'employeur la verse à part, sur la base du salaire BRUT. D'où
 * brut × taux, ajouté au total employeur. Caisse éteinte (restaurants) : rien.
 */
export function slipHourlyCost(
  s: { gross: number; employer_total: number; paid_hours: number },
  fund: LeaveFund = { enabled: false, rate: BTP_LEAVE_DEFAULT_RATE },
): number {
  const leave = fund.enabled ? s.gross * (fund.rate / 100) : 0;
  return (s.employer_total + leave) / s.paid_hours;
}

/**
 * Coût horaire réel = moyenne des 3 derniers bulletins validés (les plus
 * récents par mois). Null s'il n'y en a aucun.
 */
export function realHourlyCost(
  slips: { month: string; gross: number; employer_total: number; paid_hours: number }[],
  fund?: LeaveFund,
): { hourly: number; count: number } | null {
  const usable = slips.filter((s) => s.paid_hours > 0);
  if (!usable.length) return null;
  const last = [...usable].sort((a, b) => b.month.localeCompare(a.month)).slice(0, AVERAGE_OVER);
  const sum = last.reduce((acc, s) => acc + slipHourlyCost(s, fund), 0);
  return { hourly: Math.round((sum / last.length) * 100) / 100, count: last.length };
}

/**
 * Coût réel des heures d'un chantier : Σ minutes pointées × coût horaire du
 * salarié. Les salariés sans bulletin sont comptés à part (jamais à zéro €).
 */
export function realLabourCost(
  minutesByUser: Map<string, number> | [string, number][],
  rateByUser: Map<string, number>,
): { cost: number; unpricedUsers: number } {
  let cost = 0;
  let unpricedUsers = 0;
  const entries = Array.isArray(minutesByUser) ? minutesByUser : Array.from(minutesByUser.entries());
  for (const [uid, minutes] of entries) {
    if (!minutes) continue;
    const rate = rateByUser.get(uid);
    if (rate == null) { unpricedUsers++; continue; }
    cost += (minutes / 60) * rate;
  }
  return { cost: Math.round(cost * 100) / 100, unpricedUsers };
}

/** Consigne donnée au modèle. Ne demande QUE les quatre chiffres. */
export const PAYSLIP_PROMPT = `Tu lis un bulletin de paie français.
Renvoie UNIQUEMENT ces quatre valeurs, en JSON :
- month : le mois de la période de paie, au format "aaaa-mm"
- gross : le salaire brut du mois, en euros (nombre)
- employer_total : le coût total pour l'employeur ("Total versé par l'employeur", "Coût total employeur", "Coût global" ou libellé équivalent), en euros (nombre)
- paid_hours : le nombre d'heures payées sur le mois (nombre)
Si une valeur est absente ou illisible, mets null. N'invente rien.
Ne recopie AUCUNE autre information (ni nom, ni adresse, ni numéro de sécurité sociale, ni net à payer).`;

/** Schéma de réponse imposé au modèle (sous-ensemble OpenAPI accepté par Gemini). */
export const PAYSLIP_SCHEMA = {
  type: 'object',
  properties: {
    month: { type: 'string', nullable: true },
    gross: { type: 'number', nullable: true },
    employer_total: { type: 'number', nullable: true },
    paid_hours: { type: 'number', nullable: true },
  },
  required: ['month', 'gross', 'employer_total', 'paid_hours'],
} as const;

/** Faux bulletin du mode démo (préviews uniquement). */
export const DEMO_FIGURES: PayslipFigures = { month: '2026-08', gross: 2450, employer_total: 3528.4, paid_hours: 151.67 };
