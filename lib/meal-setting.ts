// Lot 3 bis — « Utiliser le panier repas » (réglage de l'entreprise), navigateur.
//
// LECTURE À PART : `select('meal_enabled')` pour les gestes (exports, réglages).
// Tant que la migration n'est pas passée, cette requête échoue seule (42703) et
// les écrans font exactement comme avant. Ne JAMAIS ajouter meal_enabled à un
// select de plusieurs colonnes (planning, fiche, historique) : il ferait échouer
// la lecture entière. Seule exception : la lecture commune des réglages
// (lib/company-settings.ts, lot 29), qui repasse colonne par colonne quand la
// lecture groupée échoue en 42703 — c'est ce qui rend l'exception sûre.
//
// La dernière valeur lue est gardée sur le téléphone, entreprise par
// entreprise : hors ligne, l'écran applique ce qu'il savait (voir mealEnabledFrom).
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCompanySettings } from '@/lib/company-settings';
import { isMissingColumn, mealEnabledFrom, mealSettingFrom } from '@/supabase/functions/_shared/meal-setting';

export { MEAL_OFF_MESSAGE, showMealColumn, showMealCorrection } from '@/supabase/functions/_shared/meal-setting';

const cacheKey = (companyId: string) => `bemexo-panier-reglage-v1:${companyId}`;
function readCache(companyId: string): boolean | null {
  try {
    const v = window.localStorage.getItem(cacheKey(companyId));
    return v === '1' ? true : v === '0' ? false : null;
  } catch { return null; }
}
/** Garde la dernière valeur connue (null = l'oublie : colonne absente, donc « oui »). */
export function rememberMealEnabled(companyId: string, v: boolean | null) {
  try {
    if (v === null) window.localStorage.removeItem(cacheKey(companyId));
    else window.localStorage.setItem(cacheKey(companyId), v ? '1' : '0');
  } catch { /* stockage indisponible : on relira la base la prochaine fois */ }
}

async function fetchMeal(companyId: string) {
  const { data, error } = await supabase.from('companies').select('meal_enabled').eq('id', companyId).maybeSingle();
  const v = mealSettingFrom(data, error);
  if (v !== null) rememberMealEnabled(companyId, v);
  else if (isMissingColumn(error)) rememberMealEnabled(companyId, null);
  return { data, error };
}

/** Réglages : null = colonne absente ou illisible → la ligne est masquée. */
export async function readMealSetting(companyId: string): Promise<boolean | null> {
  try {
    const { data, error } = await fetchMeal(companyId);
    return mealSettingFrom(data, error);
  } catch { return null; }
}

/** Écrans et exports : relu au moment du geste (export, Assistant). Erreur → dernière valeur connue, sinon oui. */
export async function readMealEnabled(companyId: string): Promise<boolean> {
  try {
    const { data, error } = await fetchMeal(companyId);
    return mealEnabledFrom(data, error, readCache(companyId));
  } catch (e) {
    return mealEnabledFrom(null, e ?? new Error('lecture impossible'), readCache(companyId));
  }
}

/**
 * Écrans : null tant que rien n'est connu (ni lu, ni gardé sur ce téléphone).
 * Sans entreprise (démo) → oui. Les écrans traitent null comme « oui » à
 * l'affichage (pas de clignotement pour la majorité, qui l'utilise) ; seul un
 * « non » explicite masque et bloque l'écriture (voir poseur-day). Null ne dure
 * qu'au tout premier chargement sur un téléphone : ensuite la valeur gardée sert
 * d'emblée, puis la lecture la confirme.
 */
export function useMealEnabled(companyId: string | null | undefined): boolean | null {
  // Lot 29 : lu avec les autres réglages de l'entreprise (une seule requête pour tout l'écran,
  // voir lib/company-settings.ts). La fonction de lecture à part (readMealEnabled) reste pour
  // les gestes (exports, fenêtre de réglages) : elle relit toujours la base.
  const settings = useCompanySettings(companyId);
  const [cached, setCached] = useState<boolean | null>(null);
  useEffect(() => { setCached(companyId ? readCache(companyId) : null); }, [companyId]);
  if (!companyId) return true;
  if (settings) {
    if (typeof settings.mealEnabled === 'boolean') return settings.mealEnabled;
    // Ni oui ni non : colonne absente (le cache vient d'être oublié, voir company-settings) → oui ;
    // lecture illisible (réseau, groupe en échec) → la dernière valeur gardée sur ce téléphone,
    // comme mealEnabledFrom : un « non » du patron ne doit pas redevenir « oui » sur une erreur.
    return readCache(companyId) ?? true;
  }
  return cached;
}
