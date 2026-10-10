// Lot 3 bis — « Utiliser le panier repas » (réglage de l'entreprise), navigateur.
//
// LECTURE TOUJOURS SEULE : `select('meal_enabled')`, rien d'autre. Tant que la
// migration n'est pas passée, cette requête échoue seule (42703) et les écrans
// font exactement comme avant. Ne JAMAIS ajouter meal_enabled à un select de
// plusieurs colonnes (réglages, planning, fiche, historique) : il ferait échouer
// la lecture entière.
//
// La dernière valeur lue est gardée sur le téléphone, entreprise par
// entreprise : hors ligne, l'écran applique ce qu'il savait (voir mealEnabledFrom).
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
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
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!companyId) { setOn(true); return; }
    let stale = false;
    setOn(readCache(companyId));
    readMealEnabled(companyId).then((v) => { if (!stale) setOn(v); });
    return () => { stale = true; };
  }, [companyId]);
  return on;
}
