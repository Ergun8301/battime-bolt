// Côté SALARIÉ : ce qui n'est PAS une capacité (menus ☰, légende, bandeaux, routes publiques…), avec la raison.
// Vide en 3a-1 (socle).
import type { EntreeInterne } from './types.ts';

/** Jamais une clé d'écriture (`rpc:`, `fn:`, `table:*:insert|update|delete|upsert`) : voir la liste suivante. */
export const INTERNE_SALARIE: EntreeInterne[] = [];

/**
 * Écritures que l'assistant ne portera pas, à REVUE EXPLICITE : plafonnée dans
 * `dettes.json` (`ecritures_non_assistees`) et comptée par T9. Même forme que l'interne.
 */
export const ECRITURES_NON_ASSISTEES_SALARIE: EntreeInterne[] = [];
