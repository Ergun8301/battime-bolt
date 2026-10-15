// Surfaces : capacité → clés de code (rpc:, fn:, table:, fenetre:, dialogue:, ecriture:, ancre:, nav:, guide:, route:).
// C'est ce que parcourt le test de couverture (T1 : toute clé du code est ici ou dans `interne.ts` ;
// T2 : toute clé déclarée existe encore). Une seule table pour les deux côtés, écrite dans
// deux fichiers pour qu'on ne se marche pas dessus ; les ids (B…, S…) ne se recoupent jamais.
import { SURFACES_BUREAU } from './surfaces-bureau.ts';
import { SURFACES_SALARIE } from './surfaces-salarie.ts';

export const SURFACES: Record<string, string[]> = { ...SURFACES_BUREAU, ...SURFACES_SALARIE };

/**
 * `true` tant que le redesign du bureau (tâche n°70) remanie l'interface et que
 * ce fichier est en cours de migration : T2 (clé périmée) n'est alors qu'un
 * avertissement. Remis à `false` dès que `SURFACES` est de nouveau juste.
 */
export const SURFACES_EN_MIGRATION = false;
