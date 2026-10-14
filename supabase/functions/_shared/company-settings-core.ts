// Lot 29 — réglages de l'entreprise : UNE lecture `companies` pour tout l'écran. PUR :
// partagé par le magasin du navigateur (lib/company-settings.ts) et les tests Deno
// (company-settings-core.test.ts). Aucune fonction edge ne l'importe.
//
// Avant, le bureau relisait la même ligne 4 fois au chargement (nom, borne, assistant,
// abonnement) et le salarié 7 fois (borne, assistant, panier, trajet, position…).
//
// Le salarié ne lit que 5 colonnes : l'e-mail du comptable, les majorations et
// l'abonnement ne descendent pas dans son téléphone (minimisation des données).
//
// REPLI : si une colonne manque en base (42703 : migration d'un autre lot pas encore
// passée, préview sur une autre base), la lecture groupée échoue ENTIÈRE. On relit alors
// par petits groupes, chacun isolé : une colonne absente ne cache que ses propres champs.
// Le repli est collant (la session ne retente pas la lecture groupée à chaque fois).
import { isMissingColumn, mealSettingFrom } from './meal-setting.ts';

export type Scope = 'office' | 'worker';

export interface CompanySettingsValue {
  name: string;
  logoUrl: string;
  travelPaid: boolean;
  weeklyHours: number | null;
  accountantEmail: string;
  overtimeRate1: number | null;
  overtimeRate2: number | null;
  trialEndsAt: string | null;
  subscriptionStatus: string | null;
  aiEnabled: boolean;
  kioskEnabled: boolean;
  positionTrackingEnabled: boolean;
  /** Strict : null = colonne absente ou illisible (voir mealSettingFrom). */
  mealEnabled: boolean | null;
}

/** Repli : un groupe = une requête isolée. */
export const GROUPS: Record<Scope, string[][]> = {
  office: [
    ['name', 'logo_url', 'travel_paid', 'weekly_hours', 'accountant_email', 'overtime_rate_1', 'overtime_rate_2'],
    ['trial_ends_at', 'subscription_status'],
    ['ai_enabled'],
    ['kiosk_enabled'],
    ['position_tracking_enabled'],
    ['meal_enabled'],
  ],
  worker: [['travel_paid'], ['ai_enabled'], ['kiosk_enabled'], ['position_tracking_enabled'], ['meal_enabled']],
};

/** Lecture groupée : toutes les colonnes de l'écran en une requête. */
export const COLUMNS: Record<Scope, string> = {
  office: GROUPS.office.flat().join(', '),
  worker: GROUPS.worker.flat().join(', '),
};

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const orNull = <T>(v: unknown) => (v ?? null) as T | null;

// colonne → champ de la valeur + conversion (mêmes règles que les anciennes lectures éparpillées)
const FIELDS: Record<string, { key: keyof CompanySettingsValue; from: (v: unknown) => unknown }> = {
  name: { key: 'name', from: (v) => str(v) },
  logo_url: { key: 'logoUrl', from: (v) => str(v) },
  travel_paid: { key: 'travelPaid', from: (v) => !!v },
  weekly_hours: { key: 'weeklyHours', from: (v) => orNull<number>(v) },
  accountant_email: { key: 'accountantEmail', from: (v) => str(v).trim() },
  overtime_rate_1: { key: 'overtimeRate1', from: (v) => orNull<number>(v) },
  overtime_rate_2: { key: 'overtimeRate2', from: (v) => orNull<number>(v) },
  trial_ends_at: { key: 'trialEndsAt', from: (v) => orNull<string>(v) },
  subscription_status: { key: 'subscriptionStatus', from: (v) => orNull<string>(v) },
  ai_enabled: { key: 'aiEnabled', from: (v) => !!v },
  kiosk_enabled: { key: 'kioskEnabled', from: (v) => !!v },
  position_tracking_enabled: { key: 'positionTrackingEnabled', from: (v) => !!v },
  meal_enabled: { key: 'mealEnabled', from: (v) => mealSettingFrom({ meal_enabled: v }) },
};

/** Les valeurs d'avant la première lecture (mêmes défauts que les anciens `useState`). */
export function emptyValue(): CompanySettingsValue {
  return {
    name: '', logoUrl: '', travelPaid: false, weeklyHours: null, accountantEmail: '',
    overtimeRate1: null, overtimeRate2: null, trialEndsAt: null, subscriptionStatus: null,
    aiEnabled: false, kioskEnabled: false, positionTrackingEnabled: false, mealEnabled: null,
  };
}

/** Le strict minimum du client Supabase dont on a besoin (testable sans réseau). */
export interface MiniClient {
  from(t: 'companies'): {
    select(cols: string): {
      eq(k: 'id', v: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> };
    };
  };
}

async function lire(c: MiniClient, companyId: string, cols: string[]): Promise<{ row: Row | null; error: unknown }> {
  try {
    const { data, error } = await c.from('companies').select(cols.join(', ')).eq('id', companyId).maybeSingle();
    return { row: error ? null : ((data as Row | null) ?? null), error };
  } catch (error) {
    return { row: null, error: error ?? new Error('lecture impossible') };
  }
}

function appliquer(base: CompanySettingsValue, row: Row | null, cols: string[]): CompanySettingsValue {
  const next: Record<string, unknown> = { ...base };
  for (const col of cols) next[FIELDS[col].key] = FIELDS[col].from(row ? row[col] : undefined);
  return next as unknown as CompanySettingsValue;
}

export interface ReadResult {
  /** null = rien de lisible (réseau…) : l'appelant garde ce qu'il avait, rien n'est remis à zéro. */
  value: CompanySettingsValue | null;
  /** false = repli en cours (à rejouer tel quel à l'appel suivant). */
  grouped: boolean;
  /** true = la colonne meal_enabled n'existe pas en base (42703) → le téléphone oublie sa valeur gardée. */
  mealMissing: boolean;
}

/**
 * Lit la ligne `companies` de l'entreprise : UNE requête en régime normal.
 * `prev` = la valeur déjà connue : un groupe en échec (repli) garde ses champs d'avant.
 */
export async function readCompanySettings(
  c: MiniClient, companyId: string, scope: Scope, prev: CompanySettingsValue | null, mode: { grouped: boolean },
): Promise<ReadResult> {
  const base = prev ?? emptyValue();
  const toutes = GROUPS[scope].flat();
  if (mode.grouped) {
    const r = await lire(c, companyId, toutes);
    if (!r.error) return { value: appliquer(base, r.row, toutes), grouped: true, mealMissing: false };
    if (!isMissingColumn(r.error)) return { value: null, grouped: true, mealMissing: false };
  }
  const reponses = await Promise.all(GROUPS[scope].map((g) => lire(c, companyId, g)));
  let value = base;
  let lu = false;
  let mealMissing = false;
  reponses.forEach((r, i) => {
    if (r.error) {
      if (GROUPS[scope][i][0] === 'meal_enabled' && isMissingColumn(r.error)) mealMissing = true;
      return; // ce groupe seul garde ses valeurs d'avant
    }
    value = appliquer(value, r.row, GROUPS[scope][i]);
    lu = true;
  });
  return { value: lu ? value : null, grouped: false, mealMissing };
}
