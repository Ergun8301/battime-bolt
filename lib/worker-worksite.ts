// Chantier créé par le SALARIÉ depuis l'Assistant BEMEXO (fiche « Tout confirmer », « ajoute le chantier X »).
//
// Le salarié a le droit d'INSÉRER un chantier de son entreprise (politique
// worksites_worker_insert_own_company), pas de le modifier ni de le supprimer.
// `company_id` vient de sa session, jamais de la réponse du serveur. Le chantier
// est CHERCHÉ avant d'être créé par la fiche « Tout confirmer » (même nom + même ville : réutilisé, pas de doublon) ; le geste court
// « ajoute le chantier X à Lyon » le crée tel que dit.
import { supabase } from '@/lib/supabase';
import { createWorksite } from '@/lib/planning-writes';
import { memeChantier } from '@/supabase/functions/_shared/worker-multi';
import type { NewWorksite } from '@/supabase/functions/_shared/worker-assistant-core';

export interface FoundWorksite { id: string; nom: string; ville: string }

/** Chantiers ACTIFS de l'entreprise de même nom + ville (relus au moment du geste). Un chantier archivé n'est jamais réutilisé. */
export async function findWorksite(companyId: string, nw: NewWorksite): Promise<FoundWorksite | null> {
  const { data, error } = await supabase.from('worksites').select('id, client_name, city').eq('company_id', companyId).eq('is_active', true).limit(2000);
  if (error) throw error;
  const rows = (data ?? []) as { id: string; client_name: string | null; city: string | null }[];
  const hit = rows.find((r) => memeChantier(nw, { nom: r.client_name ?? '', ville: r.city }));
  return hit ? { id: hit.id, nom: hit.client_name ?? nw.nom, ville: hit.city ?? '' } : null;
}

/** La colonne `postal_code` n'est créée par aucune migration du dépôt : si la base la refuse, on rejoue sans elle (le code est gardé dans l'adresse). */
const isMissingPostalCode = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return !!x && ['PGRST204', '42703'].includes(String(x.code ?? '')) && String(x.message ?? '').includes('postal_code');
};

/** Crée le chantier (champ par champ ; le code postal seulement s'il est fourni). À appeler sous withOrigin('assistant'). */
export async function createWorksiteSalarie(companyId: string, nw: NewWorksite): Promise<FoundWorksite> {
  const fields = { client_name: nw.nom, city: nw.ville, address: nw.adresse, description: nw.description };
  let row: { id: string; client_name: string };
  try {
    row = await createWorksite(companyId, { ...fields, postal_code: nw.code_postal });
  } catch (e) {
    if (!nw.code_postal || !isMissingPostalCode(e)) throw e;
    row = await createWorksite(companyId, { ...fields, address: nw.adresse ? `${nw.adresse}, ${nw.code_postal}` : nw.code_postal });
  }
  return { id: row.id, nom: row.client_name, ville: nw.ville };
}
