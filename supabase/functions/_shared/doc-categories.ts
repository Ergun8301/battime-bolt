// Catégories des documents de chantier (lot 24, oct. 2026) : les règles PURES,
// partagées par l'écran (components/document-category.tsx, lib/doc-category.ts,
// lib/worker-actions.ts) et le test Deno. Sans base, sans réseau, sans dépendance.
//
// Aucune fonction edge n'importe ce fichier : rien à redéployer.
//
// La base est le vrai garde (migration 20261013120000_lot24_documents_factures_
// categorie.sql) ; ce fichier ne sert qu'à NE PAS PROPOSER ce que la base
// refuserait, et à parler français quand elle refuse. Les listes ci-dessous sont
// les jumelles de celles de la migration (le test les relit dans le fichier SQL).

/** Les catégories, dans l'ORDRE D'AFFICHAGE du choix. Mêmes valeurs que la contrainte de la base (lot 7). */
export const DOC_CATEGORY_NAMES = ['devis', 'plan', 'pv_reception', 'photo', 'reserve', 'facture', 'facture_payee', 'autre'] as const;

export const DOC_CATEGORY_TEXT: Record<string, string> = {
  devis: 'Devis', plan: 'Plan', pv_reception: 'PV de réception', photo: 'Photo', reserve: 'Réserve',
  facture: 'Facture', facture_payee: 'Facture payée', autre: 'Autre',
};
export const NO_CATEGORY_TEXT = 'Sans catégorie';

/** Réservées au bureau, en base (lignes ET fichiers). */
export const INVOICE_CATEGORIES = ['facture', 'facture_payee'] as const;
export const isInvoiceCategory = (c?: string | null): boolean => (INVOICE_CATEGORIES as readonly string[]).includes(String(c ?? ''));

/**
 * Ce que l'AUTEUR d'un document (salarié) peut quitter et poser sur SON document.
 * Jamais une facture (D11), jamais « reserve » (elle alimente le rapport de réserves,
 * que seul le bureau manie). « Sans catégorie » (NULL) compte comme « autre ».
 */
export const AUTHOR_CATEGORIES = ['photo', 'plan', 'devis', 'pv_reception', 'autre'] as const;

/** Libellé d'une catégorie ; NULL → « Sans catégorie » ; valeur inconnue non nulle → la valeur brute. */
export const categoryText = (c?: string | null): string => (c ? (DOC_CATEGORY_TEXT[c] ?? c) : NO_CATEGORY_TEXT);

/** Les choix proposés : le bureau a tout (+ « sans catégorie ») ; l'auteur salarié, l'ensemble léger (+ « sans catégorie »). */
export const categoryChoices = (office: boolean): (string | null)[] => [...(office ? DOC_CATEGORY_NAMES : AUTHOR_CATEGORIES), null];

/** Qui voit le bouton « changer la catégorie » sur ce document. */
export function canEditCategory(p: { office: boolean; userId?: string | null; uploadedBy?: string | null; current?: string | null }): boolean {
  if (p.office) return true;
  if (!p.userId || p.uploadedBy !== p.userId) return false;
  return !p.current || (AUTHOR_CATEGORIES as readonly string[]).includes(p.current);
}

/** Avertissement léger sous le choix (la « confirmation » : le changement reste annulable ensuite). */
export function categoryChangeNotice(from?: string | null, to?: string | null, office = false): string | null {
  if (office && isInvoiceCategory(to) && !isInvoiceCategory(from)) return 'Les salariés ne verront plus ce document.';
  if (office && isInvoiceCategory(from) && !isInvoiceCategory(to)) return 'Les salariés pourront voir ce document.';
  if (from === 'reserve' && to !== 'reserve') return 'Ce document ne sera plus classé dans les réserves.';
  return null;
}

export const REFUSED_TEXT = 'Changement refusé : vous ne pouvez pas modifier ce document.';
export const OFFLINE_TEXT = 'Pas de connexion : rien n’a été changé. Réessayez.';
const UNKNOWN_TEXT = 'Catégorie inconnue : rien n’a été changé.';
const FAILED_TEXT = 'Changement impossible pour le moment. Réessayez dans un instant.';

/** Les messages français que la base lève elle-même (code 42501) : affichables tels quels. */
const DB_MESSAGES = ['réservé', 'propres documents', 'Seule la catégorie'];

type PgErr = { code?: string; message?: string; name?: string } | null | undefined;

/**
 * Message d'écran pour un échec d'enregistrement. Se fonde sur le CODE et le texte, jamais
 * sur le statut HTTP (PostgREST rend 403 pour 42501 mais aussi pour d'autres refus).
 */
export function categoryErrorMessage(e: unknown, online = true): string {
  if (!online) return OFFLINE_TEXT;
  const err = e as PgErr;
  const msg = String(err?.message ?? '');
  if (e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(msg)) return OFFLINE_TEXT;
  const code = String(err?.code ?? '');
  if (code === 'REFUSED') return REFUSED_TEXT; // la base a répondu « aucune ligne » (lib/doc-category.ts)
  if (code === '23514') return UNKNOWN_TEXT;
  if (code === '42501') return DB_MESSAGES.some((m) => msg.includes(m)) ? msg : REFUSED_TEXT;
  return FAILED_TEXT;
}
