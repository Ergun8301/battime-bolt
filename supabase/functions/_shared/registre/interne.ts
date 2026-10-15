// Ce qui n'est PAS une capacité, avec la raison (menus ☰, légende, bandeaux, routes publiques…).
// Deux listes, volontairement séparées :
//   · INTERNE : jamais une clé d'écriture (`rpc:`, `fn:`, `table:*:insert|update|delete|upsert`) ;
//     plafonnée (`interne`) par dettes.json ;
//   · ECRITURES_NON_ASSISTEES : une écriture que l'assistant ne portera pas. À revue explicite,
//     plafonnée (`ecritures_non_assistees`) et comptée par T9 : on ne peut pas y glisser une
//     écriture sans que le plafond, donc la PR, le montre.
// Une raison fait au moins 30 caractères (T3). Écrites par côté, comme `surfaces.ts`.
import type { EntreeInterne } from './types.ts';
import { ECRITURES_NON_ASSISTEES_BUREAU, INTERNE_BUREAU } from './interne-bureau.ts';
import { ECRITURES_NON_ASSISTEES_SALARIE, INTERNE_SALARIE } from './interne-salarie.ts';

export const INTERNE: EntreeInterne[] = [...INTERNE_BUREAU, ...INTERNE_SALARIE];
export const ECRITURES_NON_ASSISTEES: EntreeInterne[] = [...ECRITURES_NON_ASSISTEES_BUREAU, ...ECRITURES_NON_ASSISTEES_SALARIE];
