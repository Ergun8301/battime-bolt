// Lot 3 bis — « Utiliser le panier repas » (réglage de l'entreprise). PUR :
// partagé par les écrans (navigateur) et les tests Deno (meal-setting.test.ts).
//
// DÉCOCHER LE RÉGLAGE MASQUE, RIEN D'AUTRE. Aucun panier déjà noté
// (`time_entries.meal_allowance`) n'est touché. Côté salarié, la case disparaît
// et l'écran n'écrit plus le panier. Côté bureau et exports, ce qui EXISTE reste
// visible (puce, badge, colonne d'une période qui contient un panier) : un
// panier resté ne disparaît jamais en silence d'un fichier de paie, et le bureau
// peut toujours le retirer.

export const MEAL_OFF_MESSAGE = 'Votre entreprise n’utilise pas le panier repas : rien à cocher.';

type MealRow = { meal_enabled?: unknown } | null | undefined;

/** PostgREST « colonne absente » : la migration du lot 3 bis n'est pas encore passée. */
export const isMissingColumn = (error: unknown) => (error as { code?: string } | null | undefined)?.code === '42703';

/**
 * Réglages : null = colonne absente ou illisible → ligne masquée.
 * Test STRICT du booléen, volontaire : la vraie base rend la clé ou une erreur
 * (42703) ; seule une base simulée rend une ligne sans la clé — les anciens
 * tests d'écran gardent alors la fenêtre d'avant, à l'identique.
 */
export function mealSettingFrom(row: MealRow, error?: unknown): boolean | null {
  if (error || !row || typeof row.meal_enabled !== 'boolean') return null;
  return row.meal_enabled;
}

/**
 * Écrans : la valeur à appliquer. Lue → elle. Colonne absente (42703) → oui,
 * comme avant. Autre erreur (hors ligne, réseau) → la dernière valeur connue
 * sur ce téléphone, sinon oui : un salarié hors ligne d'une entreprise sans
 * panier ne doit pas voir la case revenir et en noter un dans ses lignes en attente.
 */
export function mealEnabledFrom(row: MealRow, error?: unknown, cached?: boolean | null): boolean {
  const v = mealSettingFrom(row, error);
  if (v !== null) return v;
  if (error && !isMissingColumn(error) && typeof cached === 'boolean') return cached;
  return true;
}

/** Colonne / total « panier » d'un relevé : affiché si l'entreprise l'utilise OU si la période en contient un. */
export const showMealColumn = (enabled: boolean, entries: { meal_allowance?: boolean | null; status?: string }[]) =>
  enabled || entries.some((e) => !!e.meal_allowance && e.status !== 'cancelled');

/** Case « Panier » de la correction bureau : visible si utilisé, ou pour retirer un panier resté. */
export const showMealCorrection = (enabled: boolean, entryMeal?: boolean | null) => enabled || !!entryMeal;
