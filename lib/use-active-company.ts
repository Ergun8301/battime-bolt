'use client';

import { useAuth } from '@/components/auth-provider';

/**
 * Accesseur unique de "l'entreprise courante".
 *
 * Modele actuel : 1 compte = 1 entreprise -> on renvoie le `company_id` du
 * profil connecte. Tout NOUVEAU code doit lire l'entreprise courante ICI,
 * plutot que via `user.company_id` en dur.
 *
 * Objectif "pret a etendre" : le jour ou l'on supporte le multi-entreprises
 * (table d'appartenances + entreprise active stockee en session + selecteur),
 * seule cette fonction evoluera. Les appelants qui passent par elle n'auront
 * rien a changer. Les lectures `user.company_id` existantes (planning, poseur,
 * exports) pourront migrer vers cet accesseur progressivement.
 */
export function useActiveCompany(): { companyId: string | null; loading: boolean } {
  const { user, loading } = useAuth();
  return { companyId: user?.company_id ?? null, loading };
}
