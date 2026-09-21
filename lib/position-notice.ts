// L'accusé d'information préalable, et sa file d'attente hors ligne.
//
// POURQUOI UNE FILE. `/poseur` marche sans réseau — c'est le cœur du produit,
// un salarié en sous-sol doit pouvoir noter ses heures. L'accusé, lui, est une
// écriture serveur. Sans file, « J'ai compris » pressé hors ligne serait perdu,
// et l'écran reviendrait à chaque ouverture jusqu'au retour du réseau.
//
// CE QUE LA FILE NE FAIT PAS, ET C'EST VOLONTAIRE : elle ne fait pas semblant.
// Tant que la ligne n'est pas en base, la base refuse la position — des deux
// côtés, départ et fermeture. Un accusé en attente n'autorise donc rien ; il
// évite seulement de redemander. Le salarié pointe normalement pendant ce
// temps, sans qu'aucune position ne soit enregistrée sur lui.

import { supabase } from '@/lib/supabase';

const CLE = 'bemexo.position_notice_pending';

/** Ce qu'on garde en attente : de qui, pour quelle société. */
interface AccuseEnAttente {
  userId: string;
  companyId: string;
}

// localStorage peut jeter (mode privé, quota, stockage bloqué). Aucune de ces
// pannes ne doit empêcher quoi que ce soit : on lit `null`, on écrit dans le
// vide, et l'écran redemandera. Un accusé redemandé n'a jamais fait de mal.
function lire(): AccuseEnAttente | null {
  try {
    const brut = localStorage.getItem(CLE);
    return brut ? (JSON.parse(brut) as AccuseEnAttente) : null;
  } catch {
    return null;
  }
}

function ecrire(v: AccuseEnAttente | null): void {
  try {
    if (v) localStorage.setItem(CLE, JSON.stringify(v));
    else localStorage.removeItem(CLE);
  } catch {
    /* rien : voir ci-dessus */
  }
}

/**
 * Ce salarié a-t-il déjà accusé réception, pour cette société ?
 *
 * `null` = ON NE SAIT PAS (requête en échec, hors réseau). Ce troisième état
 * compte : l'appelant ne doit PAS montrer l'écran dans ce cas. Traiter
 * « je ne sais pas » comme « il n'a pas vu » afficherait l'écran à chaque perte
 * de réseau, à quelqu'un qui l'a déjà lu — et ça ne protégerait personne,
 * puisque c'est la base qui décide, pas l'écran.
 */
export async function aAccuse(userId: string, companyId: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('position_notice_ack')
    .select('id')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) return null;
  return !!data;
}

/**
 * Inscrire l'accusé. Ne lève jamais.
 *
 * `23505` (la ligne existe déjà) est une RÉUSSITE : deux appuis, ou une reprise
 * de file après une écriture qui avait en fait abouti. La contrainte
 * `UNIQUE (user_id, company_id)` est là pour ça — c'est la base qui tranche,
 * pas l'écran.
 */
export async function inscrireAccuse(userId: string, companyId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase
    .from('position_notice_ack')
    .insert({ user_id: userId, company_id: companyId });

  if (!error || error.code === '23505') {
    ecrire(null);
    return { ok: true };
  }
  // Échec : on garde la trace pour repartir au retour du réseau.
  ecrire({ userId, companyId });
  return { ok: false };
}

/** Y a-t-il un accusé de CE salarié en attente ? (l'écran ne se remontre pas) */
export function accuseEnAttente(userId: string, companyId: string): boolean {
  const v = lire();
  return !!v && v.userId === userId && v.companyId === companyId;
}

/**
 * Repartir sur ce qui attend. À appeler au chargement et au retour du réseau,
 * comme la synchronisation des heures.
 */
export async function rejouerAccuse(): Promise<void> {
  const v = lire();
  if (!v) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  await inscrireAccuse(v.userId, v.companyId);
}
