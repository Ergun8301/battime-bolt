// Chantier terminé + bilan du chantier (lot 23, oct. 2026) : les règles PURES,
// partagées par les écrans (components/chantier-termine.tsx, lib/chantier-termine.ts,
// poseur-day, team-day, cost-report) et le test Deno. Sans base, sans réseau.
//
// Aucune fonction edge n'importe ce fichier : rien à redéployer.
//
// POURQUOI UN FICHIER À PART : le bilan ne doit JAMAIS annoncer un chiffre différent de
// « Coût chantiers » ou du registre des réserves. Les règles de calcul qui n'étaient écrites
// que dans l'écran (pourcentage de budget, format des heures et des euros, libellés des
// dépenses) vivent donc ici, et cost-report.tsx les importe : une seule copie.
// Les HEURES, elles, ne sont pas recalculées : elles viennent de my_worksite_labour (SQL), la
// fonction que « Coût chantiers » et les alertes de budget appellent déjà.
import { DOC_CATEGORY_NAMES, categoryText, isInvoiceCategory, NO_CATEGORY_TEXT } from './doc-categories.ts';

// Le statut « terminé » (colonne, jour, « Terminé le … », listes de choix) vit dans chantier-statut.ts, ré-exporté ici.
export * from './chantier-statut.ts';

// ── La date de fin ─────────────────────────────────────────────────────────────

/** Aujourd'hui à Paris, AAAA-MM-JJ (la date « du jour » des écrans : jamais celle du fuseau du téléphone). */
export const todayParis = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** La date de fin choisie : lisible, jamais dans le futur. Renvoie le message à afficher, ou null si tout va bien. */
export function checkCompletionDate(day: string, today: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return 'Date invalide.';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3]) || Number(m[1]) < 2000) return 'Date invalide.';
  if (day > today) return 'La date de fin ne peut pas être dans le futur.';
  return null;
}

// ── Avant de terminer : les avertissements (jamais un blocage) ──────────────────

export interface FinishCheck { reserves: number; live: number; drafts: number; future: number }
export interface FinishWarning { key: keyof FinishCheck; count: number; title: string; detail: string }

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** Les avertissements dans l'ordre de la demande. Liste vide = rien à signaler. */
export function finishWarnings(c: FinishCheck): FinishWarning[] {
  const out: FinishWarning[] = [];
  const many = (n: number) => n > 1;
  if (c.reserves > 0) out.push({ key: 'reserves', count: c.reserves, title: `${c.reserves} ${plural(c.reserves, 'réserve non levée', 'réserves non levées')}`, detail: many(c.reserves) ? 'Elles restent à traiter dans le registre des réserves.' : 'Elle reste à traiter dans le registre des réserves.' });
  if (c.live > 0) out.push({ key: 'live', count: c.live, title: `${c.live} ${plural(c.live, 'pointage en cours', 'pointages en cours')}`, detail: many(c.live) ? 'Ils continuent normalement : les salariés pourront les terminer.' : 'Il continue normalement : le salarié pourra le terminer.' });
  if (c.drafts > 0) out.push({ key: 'drafts', count: c.drafts, title: `${c.drafts} ${plural(c.drafts, 'brouillon non envoyé', 'brouillons non envoyés')}`, detail: 'Ces heures ne comptent pas encore : elles pourront toujours être envoyées.' });
  if (c.future > 0) out.push({ key: 'future', count: c.future, title: `${c.future} ${plural(c.future, 'intervention planifiée à venir', 'interventions planifiées à venir')}`, detail: many(c.future) ? 'Elles restent dans le planning : rien n’est supprimé.' : 'Elle reste dans le planning : rien n’est supprimé.' });
  return out;
}

/** Le bouton de confirmation : « Terminer quand même » dès qu'il y a un avertissement. */
export const finishButtonLabel = (warnings: FinishWarning[]): string => (warnings.length ? 'Terminer quand même' : 'Terminer le chantier');

/** Un brouillon VIDE (0 minute, jamais envoyé) ne compte nulle part (lot 2) : il n'avertit pas non plus. */
export const countDrafts = (entries: { status: string; total_minutes: number }[]): number =>
  entries.filter((e) => e.status === 'draft' && Number(e.total_minutes) > 0).length;

/**
 * Interventions encore à faire : un jour à venir, ou aujourd'hui tant qu'aucune heure envoyée n'est liée à la case.
 * Une absence (congé, maladie…) n'est pas une intervention.
 */
export function countUpcoming(planning: { id: string; work_date: string; absence_type?: string | null }[], today: string, doneToday: Iterable<string> = []): number {
  const done = new Set(doneToday);
  return planning.filter((p) => !p.absence_type && (p.work_date > today || (p.work_date === today && !done.has(p.id)))).length;
}

// ── Les règles de « Coût chantiers », sorties de l'écran pour être partagées ───

/** Heures « 8 h 30 » (mêmes mots que Coût chantiers). */
export const fmtH = (min: number): string => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};
/** Euros « 1 200 € » (arrondi à l'euro). */
export const fmtEur = (n: number): string => Math.round(n).toLocaleString('fr-FR') + ' €';

/** Les dépenses : mêmes catégories, mêmes mots, même ordre que Coût chantiers (la base les contraint à ces quatre valeurs). */
export const EXPENSE_CATEGORIES = [
  { key: 'materiaux', label: 'Matériaux' },
  { key: 'sous_traitance', label: 'Sous-traitance' },
  { key: 'location', label: 'Location' },
  { key: 'autre', label: 'Divers' },
] as const;
export const EXPENSE_LABEL: Record<string, string> = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.label]));

/** Statuts qui comptent dans les heures et les réserves (jumeau de COUNTED_STATUSES, lib/status.ts : le test les compare). */
export const COUNTED = ['submitted', 'validated'] as const;
export const isCountedStatus = (s?: string | null): boolean => s === 'submitted' || s === 'validated';

export type BudgetTone = '' | 'soft' | 'warn' | 'over';
export interface BudgetInput { hours: number | null | undefined; amount: number | null | undefined; usedMinutes: number; usedCost: number }
/**
 * Avancement du budget de MAIN-D'ŒUVRE sur TOUT le chantier : le plus avancé des deux (heures, euros), ton à 70 / 80 / 100 %.
 * Règle de Coût chantiers et des e-mails d'alerte, mot pour mot. null = aucun budget exploitable.
 */
export function budgetProgress(b: BudgetInput): { pct: number; tone: BudgetTone; label: string } | null {
  const pcts: number[] = [];
  if (b.hours && b.hours > 0) pcts.push((b.usedMinutes / 60) / b.hours * 100);
  if (b.amount && b.amount > 0) pcts.push(b.usedCost / b.amount * 100);
  if (!pcts.length) return null;
  const pct = Math.max(...pcts);
  const tone: BudgetTone = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : pct >= 70 ? 'soft' : '';
  const label = b.hours && b.hours > 0
    ? `${fmtH(b.usedMinutes)} / ${b.hours} h`
    : `${fmtEur(b.usedCost)} / ${fmtEur(b.amount || 0)}`;
  return { pct, tone, label };
}

// ── Le bilan du chantier ────────────────────────────────────────────────────────

/** Une ligne de my_worksite_labour : un salarié sur un chantier (toute la vie du chantier). */
export interface LabourRow {
  worksite_id: string; user_id: string;
  worked_minutes: number; route_minutes: number; paid_minutes: number;
  cost: number; unpriced_minutes: number;
}
/** Une intervention du chantier (time_entries). `lifted` : calculé par l'appelant avec isReserveLifted (lib/reserves.ts), l'UNE définition. */
export interface BilanEntry {
  id: string; user_id: string; work_date: string; status: string; total_minutes: number;
  reception?: string | null; lifted?: boolean; observation?: string | null;
}
export interface BilanInput {
  worksiteId: string;
  completedDay: string | null;
  labour: LabourRow[];
  entries: BilanEntry[];
  names: Record<string, string>;
  expenses: { category: string; amount: number }[];
  docs: { category: string | null }[];
  budget: { hours: number | null | undefined; amount: number | null | undefined };
  /** Les factures n'apparaissent QUE pour le bureau (lot 24). Le bilan est une fenêtre du bureau : vrai ; le test prouve aussi le cas faux. */
  office: boolean;
}

export interface BilanWorker {
  userId: string; name: string;
  paidMinutes: number; routeMinutes: number; cost: number; unpricedMinutes: number;
  /** Brouillons non envoyés (n'entrent dans aucun total). */
  draftMinutes: number;
}
export interface Bilan {
  period: { first: string | null; last: string | null; completed: string | null };
  hours: { workers: BilanWorker[]; paidMinutes: number; routeMinutes: number; cost: number; unpricedMinutes: number; draftMinutes: number };
  expenses: { total: number; count: number; byCategory: { key: string; label: string; total: number; count: number }[] };
  reserves: { open: number; lifted: number; openList: { id: string; work_date: string; who: string; text: string }[] };
  documents: { total: number; byCategory: { key: string; label: string; count: number }[] };
  budget: { progress: ReturnType<typeof budgetProgress>; hoursLine: { used: number; planned: number; pct: number } | null; amountLine: { used: number; planned: number; pct: number; incomplete: boolean } | null };
  /** Main-d'œuvre + dépenses, comme la carte « Total » de Coût chantiers. */
  totalCost: number;
}

/**
 * Assemble le bilan. N'invente AUCUN chiffre d'heures : les heures comptées, la route et le coût sont ceux de
 * my_worksite_labour (somme des lignes de CE chantier, champ par champ, comme le fait Coût chantiers).
 * Seuls les brouillons (non comptés ailleurs) sont additionnés ici, à partir des interventions.
 */
export function buildBilan(i: BilanInput): Bilan {
  const mine = i.labour.filter((r) => r.worksite_id === i.worksiteId);
  const byUser = new Map<string, BilanWorker>();
  const worker = (userId: string): BilanWorker => {
    let w = byUser.get(userId);
    if (!w) { w = { userId, name: i.names[userId] || 'Salarié', paidMinutes: 0, routeMinutes: 0, cost: 0, unpricedMinutes: 0, draftMinutes: 0 }; byUser.set(userId, w); }
    return w;
  };
  for (const r of mine) {
    const w = worker(r.user_id);
    w.paidMinutes += Number(r.paid_minutes || 0);
    w.routeMinutes += Number(r.route_minutes || 0);
    w.cost += Number(r.cost || 0);
    w.unpricedMinutes += Number(r.unpriced_minutes || 0);
  }
  for (const e of i.entries) {
    if (e.status === 'draft' && Number(e.total_minutes) > 0) worker(e.user_id).draftMinutes += Number(e.total_minutes);
  }
  const workers = Array.from(byUser.values()).sort((a, b) => (b.paidMinutes - a.paidMinutes) || (b.draftMinutes - a.draftMinutes) || a.name.localeCompare(b.name, 'fr'));
  const sum = (f: (w: BilanWorker) => number) => workers.reduce((s, w) => s + f(w), 0);
  const paidMinutes = sum((w) => w.paidMinutes), cost = sum((w) => w.cost), unpricedMinutes = sum((w) => w.unpricedMinutes);

  // Période : les interventions qui COMPTENT (même règle que les heures).
  const counted = i.entries.filter((e) => isCountedStatus(e.status)).map((e) => e.work_date).sort();

  const expTotal = i.expenses.reduce((s, e) => s + Number(e.amount), 0);
  const knownKeys = new Set<string>(EXPENSE_CATEGORIES.map((c) => c.key));
  const byCat = [...EXPENSE_CATEGORIES.map((c) => ({ key: c.key as string, label: c.label as string })),
    ...Array.from(new Set(i.expenses.map((e) => e.category).filter((k) => !knownKeys.has(k)))).map((k) => ({ key: k, label: k }))]
    .map((c) => {
      const rows = i.expenses.filter((e) => e.category === c.key);
      return { ...c, total: rows.reduce((s, e) => s + Number(e.amount), 0), count: rows.length };
    }).filter((c) => c.count > 0);

  // Réserves : mêmes interventions que le registre (réception « avec », heures qui comptent).
  const res = i.entries.filter((e) => e.reception === 'avec' && isCountedStatus(e.status));
  const open = res.filter((e) => !e.lifted);
  const openList = open.slice().sort((a, b) => b.work_date.localeCompare(a.work_date) || a.id.localeCompare(b.id)).slice(0, 10)
    .map((e) => ({ id: e.id, work_date: e.work_date, who: i.names[e.user_id] || 'Salarié', text: (e.observation || '').trim() }));

  // Documents : un nombre par catégorie, dans l'ordre du choix de catégorie ; « Sans catégorie » en dernier.
  const docs = i.office ? i.docs : i.docs.filter((d) => !isInvoiceCategory(d.category));
  const unknown = Array.from(new Set(docs.map((d) => d.category ?? '').filter((k) => k && !(DOC_CATEGORY_NAMES as readonly string[]).includes(k))));
  const docCats = [...DOC_CATEGORY_NAMES as readonly string[], ...unknown, ''].map((k) => ({
    key: k || 'sans_categorie', label: k ? categoryText(k) : NO_CATEGORY_TEXT, count: docs.filter((d) => (d.category ?? '') === k).length,
  })).filter((c) => c.count > 0);

  const hours = i.budget.hours && i.budget.hours > 0 ? i.budget.hours : null;
  const amount = i.budget.amount && i.budget.amount > 0 ? i.budget.amount : null;
  return {
    period: { first: counted[0] ?? null, last: counted[counted.length - 1] ?? null, completed: i.completedDay },
    hours: { workers, paidMinutes, routeMinutes: sum((w) => w.routeMinutes), cost, unpricedMinutes, draftMinutes: sum((w) => w.draftMinutes) },
    expenses: { total: expTotal, count: i.expenses.length, byCategory: byCat },
    reserves: { open: open.length, lifted: res.length - open.length, openList },
    documents: { total: docs.length, byCategory: docCats },
    budget: {
      progress: budgetProgress({ hours, amount, usedMinutes: paidMinutes, usedCost: cost }),
      hoursLine: hours ? { used: paidMinutes, planned: hours, pct: (paidMinutes / 60) / hours * 100 } : null,
      amountLine: amount ? { used: cost, planned: amount, pct: cost / amount * 100, incomplete: unpricedMinutes > 0 } : null,
    },
    totalCost: cost + expTotal,
  };
}

