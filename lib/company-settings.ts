// Lot 29 — réglages de l'entreprise : UNE lecture partagée par tout l'écran.
//
// Avant, chaque crochet relisait `companies` pour son compte (bureau : 4 fois au
// chargement ; salarié : 7 fois) et le sondage de 60 s relisait le nom, le logo…
// Ici : un magasin au niveau du module, une entrée par entreprise (jamais global :
// un compte support change d'entreprise), qui partage UNE lecture en cours.
//
// Quand la ligne est relue :
//  - au premier besoin (montage d'un écran) ;
//  - à la demande, après un enregistrement des réglages (reloadCompanySettings) ;
//  - au retour sur l'onglet, SEULEMENT si la dernière lecture a 5 min ou plus
//    (position, panier… changés par un autre administrateur). Jamais au sondage ;
//  - toutes les 60 s tant que RIEN n'a pu être lu (première lecture en échec, réseau
//    mobile) et que l'onglet est visible : sinon l'écran resterait sans nom, sans trajet
//    payé ni heures de l'entreprise jusqu'au rechargement.
// Un réglage changé ailleurs n'apparaît donc qu'au rechargement ou à ce retour. Les gestes
// qui comptent (exports de paie, « Je commence » avec position) relisent eux-mêmes.
//
// Une lecture en échec ne remet rien à zéro : on garde la dernière valeur connue.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth-provider';
import { rememberMealEnabled } from '@/lib/meal-setting';
import {
  readCompanySettings, type CompanySettingsValue, type MiniClient, type Scope,
} from '@/supabase/functions/_shared/company-settings-core';

export type { CompanySettingsValue, Scope };

/** Au retour sur l'onglet, on relit si la dernière lecture est plus vieille que ça. */
export const STALE_AFTER_MS = 5 * 60_000;
/** Tant que rien n'a été lu, nouvel essai à cet intervalle (onglet visible seulement). */
export const RETRY_AFTER_MS = 60_000;

interface Entry {
  value: CompanySettingsValue | null;
  /** Étendue des colonnes lues : 'office' couvre aussi une demande 'worker'. */
  scope: Scope | null;
  /**
   * Étendue DEMANDÉE (posée avant la lecture, donc connue même si la lecture échoue) : toute
   * relecture (retour d'onglet, nouvel essai, rechargement) s'y tient. Sans elle, un bureau dont
   * la première lecture a échoué relirait avec les 5 colonnes du salarié et perdrait l'essai
   * d'abonnement, le nom, le logo…
   */
  wanted: Scope | null;
  /** Minuteur du prochain essai tant que rien n'a pu être lu. */
  retry: ReturnType<typeof setTimeout> | null;
  readAt: number;
  /** false = repli par petits groupes (une colonne manque en base), voir le noyau. */
  grouped: boolean;
  /** Numéro de la dernière lecture lancée : seule la plus récente a le droit d'écrire. */
  seq: number;
  pending: { promise: Promise<CompanySettingsValue | null>; scope: Scope } | null;
}

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

function entryOf(companyId: string): Entry {
  let e = entries.get(companyId);
  if (!e) { e = { value: null, scope: null, wanted: null, retry: null, readAt: 0, grouped: true, seq: 0, pending: null }; entries.set(companyId, e); }
  return e;
}

const sameValue = (a: CompanySettingsValue, b: CompanySettingsValue) =>
  (Object.keys(a) as (keyof CompanySettingsValue)[]).every((k) => a[k] === b[k]);

/** La valeur déjà lue pour cette entreprise (null tant que rien n'a été lu). */
export function getCompanySettings(companyId: string | null | undefined): CompanySettingsValue | null {
  return companyId ? entries.get(companyId)?.value ?? null : null;
}

const plusLarge = (a: Scope | null, b: Scope): Scope => (a === 'office' || b === 'office' ? 'office' : 'worker');

/** Rien n'a pu être lu : on réessaie dans une minute, si l'écran est encore là et visible. */
function planifierNouvelEssai(companyId: string, e: Entry) {
  if (e.value || e.retry !== null || !listeners.get(companyId)?.size) return;
  e.retry = setTimeout(() => {
    e.retry = null;
    // Onglet caché : zéro requête, le retour sur l'onglet (auRetour) relira.
    if (e.value || document.visibilityState === 'hidden' || !listeners.get(companyId)?.size) return;
    void loadCompanySettings(companyId, e.wanted ?? 'worker');
  }, RETRY_AFTER_MS);
}

function lire(companyId: string, scope: Scope): Promise<CompanySettingsValue | null> {
  const e = entryOf(companyId);
  const lue = e.wanted = plusLarge(e.wanted, scope); // colonnes de CETTE lecture
  const seq = ++e.seq;
  const promise = readCompanySettings(supabase as unknown as MiniClient, companyId, lue, e.value, { grouped: e.grouped })
    .then((res) => {
      if (seq !== e.seq) return e.value; // une lecture plus récente a pris la main : celle-ci est périmée
      e.pending = null;
      e.grouped = res.grouped;
      // Le téléphone garde la dernière valeur du panier (hors ligne), comme fetchMeal.
      if (res.mealMissing) rememberMealEnabled(companyId, null);
      if (res.value) {
        e.readAt = Date.now();
        e.scope = plusLarge(e.scope, lue);
        if (e.retry !== null) { clearTimeout(e.retry); e.retry = null; }
        if (typeof res.value.mealEnabled === 'boolean') rememberMealEnabled(companyId, res.value.mealEnabled);
        if (!e.value || !sameValue(e.value, res.value)) {
          e.value = res.value; // objet remplacé seulement si un champ a changé : pas de redessin inutile
          listeners.get(companyId)?.forEach((l) => l());
        }
        return e.value;
      }
      planifierNouvelEssai(companyId, e);
      return null; // CETTE lecture a échoué : les appelants qui exigent du frais (exports de paie) le savent
    });
  e.pending = { promise, scope: lue };
  return promise;
}

/**
 * Lit la ligne si elle manque ou si elle est plus vieille que `maxAgeMs` ; partage la
 * lecture déjà en cours. Sans `maxAgeMs`, une valeur déjà lue est rendue telle quelle.
 */
export function loadCompanySettings(
  companyId: string, scope: Scope, opts: { maxAgeMs?: number } = {},
): Promise<CompanySettingsValue | null> {
  const e = entryOf(companyId);
  e.wanted = plusLarge(e.wanted, scope);
  if (e.pending && (e.pending.scope === 'office' || scope === 'worker')) return e.pending.promise;
  const couvre = e.value !== null && (e.scope === 'office' || scope === 'worker');
  if (couvre && (opts.maxAgeMs === undefined || Date.now() - e.readAt < opts.maxAgeMs)) return Promise.resolve(e.value);
  return lire(companyId, scope);
}

/** Lecture FRAÎCHE forcée (après « Enregistrer », exports de paie, fin d'une action de l'assistant, retour de paiement). Renvoie null si CETTE lecture échoue. */
export function reloadCompanySettings(companyId: string): Promise<CompanySettingsValue | null> {
  return lire(companyId, entries.get(companyId)?.wanted ?? 'office');
}

// Un SEUL écouteur de retour sur l'onglet pour tout le module : installé au premier abonné,
// retiré au dernier. Au retour : au plus UNE requête par entreprise, et seulement si la
// dernière lecture date de 5 min ou plus.
function auRetour() {
  if (document.visibilityState === 'hidden') return;
  listeners.forEach((set, companyId) => {
    if (set.size) void loadCompanySettings(companyId, entries.get(companyId)?.wanted ?? 'worker', { maxAgeMs: STALE_AFTER_MS });
  });
}
let abonnes = 0;
function subscribe(companyId: string | null | undefined, onChange: () => void) {
  if (!companyId) return () => {};
  const set = listeners.get(companyId) ?? new Set<() => void>();
  listeners.set(companyId, set);
  set.add(onChange);
  if (++abonnes === 1) document.addEventListener('visibilitychange', auRetour);
  return () => {
    set.delete(onChange);
    if (--abonnes === 0) document.removeEventListener('visibilitychange', auRetour);
  };
}

/**
 * Les réglages de l'entreprise (null tant que rien n'est lu). Le bureau (rôle admin) lit les
 * 13 colonnes, le salarié seulement les 5 qui le concernent. Tous les crochets d'un écran
 * partagent la même lecture.
 */
export function useCompanySettings(companyId: string | null | undefined): CompanySettingsValue | null {
  const { user } = useAuth();
  const scope: Scope = user?.role === 'admin' ? 'office' : 'worker';
  const abonner = useCallback((onChange: () => void) => subscribe(companyId, onChange), [companyId]);
  const value = useSyncExternalStore(abonner, () => getCompanySettings(companyId), () => null);
  useEffect(() => {
    if (companyId) void loadCompanySettings(companyId, scope);
  }, [companyId, scope]);
  return value;
}
