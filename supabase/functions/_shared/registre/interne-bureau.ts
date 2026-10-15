// Côté BUREAU : ce qui n'est PAS une capacité (menus ☰, légende, bandeaux, routes publiques…), avec la raison.
// Ici : les aperçus de démonstration du bureau (?demo=…). Les pages publiques (vitrine, pages légales, connexion, e-mails à lien
// signé), la tablette et le sélecteur d'heure sont déjà classés dans interne-salarie.ts : une clé n'est jamais classée deux fois.
// Ni menu ☰ ni bandeau ici : le menu ☰ du téléphone est la capacité B72, le bandeau « Mode support » la B139, la légende (B11) n'a pas de clé.
import type { EntreeInterne } from './types.ts';

/** Jamais une clé d'écriture (`rpc:`, `fn:`, `table:*:insert|update|delete|upsert`) : voir la liste suivante. */
export const INTERNE_BUREAU: EntreeInterne[] = [
  { cle: 'route:/apercu/acces-support', raison: 'Aperçu de démonstration (?demo=support, données fictives, absent de la production) : aucune écriture réelle.' },
  { cle: 'route:/apercu/assistant', raison: 'Aperçu de démonstration (?demo=assistant, réponses fictives, absent de la production) : aucune écriture réelle.' },
  { cle: 'route:/apercu/cout-salarie', raison: 'Aperçu de démonstration (?demo=cout, faux bulletin, absent de la production) : aucune écriture réelle.' },
];

/**
 * Écritures que l'assistant ne portera pas, à REVUE EXPLICITE : plafonnée dans
 * `dettes.json` (`ecritures_non_assistees`) et comptée par T9. Même forme que l'interne.
 * Vide côté bureau : chaque écriture du bureau est rattachée à une capacité, qui dit elle-même (outil, `humain` + raison ou `dette`)
 * ce que l'assistant en fera ; aucune écriture n'est restée sans capacité.
 */
export const ECRITURES_NON_ASSISTEES_BUREAU: EntreeInterne[] = [];
