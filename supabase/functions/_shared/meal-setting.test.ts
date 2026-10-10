// `deno test supabase/functions/_shared/meal-setting.test.ts` (npm run test:panier)
// Lot 3 bis — réglage « Utiliser le panier repas » : décocher masque, rien d'autre.
import { isMissingColumn, MEAL_OFF_MESSAGE, mealEnabledFrom, mealSettingFrom, showMealColumn, showMealCorrection } from './meal-setting.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
const ABSENTE = { code: '42703', message: 'column companies.meal_enabled does not exist' };
const RESEAU = { code: '', message: 'TypeError: Failed to fetch' };

Deno.test('réglages : null quand la colonne manque ou que la valeur est illisible (ligne masquée)', () => {
  eq(mealSettingFrom(null, ABSENTE), null, 'colonne absente (42703)');
  eq(mealSettingFrom({ meal_enabled: true }, RESEAU), null, 'erreur réseau, même avec une ligne');
  eq(mealSettingFrom(null), null, 'aucune ligne');
  eq(mealSettingFrom(undefined), null, 'rien');
  eq(mealSettingFrom({}), null, 'ligne sans la clé (base simulée seulement)');
  eq(mealSettingFrom({ meal_enabled: undefined }), null, 'clé indéfinie');
  eq(mealSettingFrom({ meal_enabled: 'true' }), null, 'texte « true » : refusé (test strict)');
  eq(mealSettingFrom({ meal_enabled: 1 }), null, 'nombre 1 : refusé (test strict)');
  eq(mealSettingFrom({ meal_enabled: true }), true, 'oui');
  eq(mealSettingFrom({ meal_enabled: false }), false, 'non');
});

Deno.test('écrans : tout sauf un « non » explicite donne oui (comportement d’avant)', () => {
  eq(mealEnabledFrom(null, ABSENTE), true, 'colonne absente → oui');
  eq(mealEnabledFrom(null), true, 'aucune ligne → oui');
  eq(mealEnabledFrom({}), true, 'ligne sans la clé → oui');
  eq(mealEnabledFrom({ meal_enabled: true }), true, 'oui');
  eq(mealEnabledFrom({ meal_enabled: false }), false, 'non');
  eq(mealEnabledFrom(null, RESEAU), true, 'réseau coupé, rien de connu → oui');
});

Deno.test('hors ligne : la dernière valeur connue sur le téléphone, jamais pour une colonne absente', () => {
  eq(mealEnabledFrom(null, RESEAU, false), false, 'réseau coupé, « non » gardé → non');
  eq(mealEnabledFrom(null, RESEAU, true), true, 'réseau coupé, « oui » gardé → oui');
  eq(mealEnabledFrom(null, RESEAU, null), true, 'réseau coupé, rien de gardé → oui');
  eq(mealEnabledFrom(null, ABSENTE, false), true, '42703 : la colonne n’existe pas → oui, même avec un « non » gardé');
  eq(mealEnabledFrom({ meal_enabled: true }, undefined, false), true, 'lu en base : la base gagne sur le téléphone');
  eq(mealEnabledFrom({ meal_enabled: false }, undefined, true), false, 'lu en base : la base gagne sur le téléphone (non)');
  eq(isMissingColumn(ABSENTE), true, '42703 reconnu');
  eq(isMissingColumn(RESEAU), false, 'erreur réseau : pas une colonne absente');
  eq(isMissingColumn(null), false, 'pas d’erreur');
});

Deno.test('relevés : la colonne « Panier » reste si la période en contient un', () => {
  eq(showMealColumn(true, []), true, 'utilisé, rien → colonne');
  eq(showMealColumn(false, []), false, 'non utilisé, rien → pas de colonne');
  eq(showMealColumn(false, [{ meal_allowance: null }, { meal_allowance: false }]), false, 'non utilisé, aucun panier → pas de colonne');
  eq(showMealColumn(false, [{ meal_allowance: true, status: 'cancelled' }]), false, 'panier sur une ligne retirée : ne compte pas');
  eq(showMealColumn(false, [{ meal_allowance: true, status: 'submitted' }]), true, 'un panier envoyé → la colonne reste');
  eq(showMealColumn(false, [{ meal_allowance: true }]), true, 'un panier, statut inconnu → la colonne reste');
});

Deno.test('correction bureau : la case reste pour retirer un panier resté', () => {
  eq(showMealCorrection(true, false), true, 'utilisé → case');
  eq(showMealCorrection(false, false), false, 'non utilisé, pas de panier → pas de case');
  eq(showMealCorrection(false, null), false, 'non utilisé, panier inconnu → pas de case');
  eq(showMealCorrection(false, true), true, 'non utilisé, panier resté → case (pour le retirer)');
});

Deno.test('message de refus : une ligne courte qui parle du panier repas', () => {
  eq(MEAL_OFF_MESSAGE.includes('panier repas'), true, 'contient « panier repas »');
  eq(MEAL_OFF_MESSAGE.length < 90 && !MEAL_OFF_MESSAGE.includes('\n'), true, 'une ligne, moins de 90 caractères');
});
