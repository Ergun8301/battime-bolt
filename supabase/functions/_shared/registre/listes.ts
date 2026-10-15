// Registre : les LISTES D'IDENTIFIANTS que le code lit à la place de listes écrites à la main (étape 3, livraison 3a-2).
//
// Contrat : docs/ia-etape3/00-conception-etape3.md §2.1 (« 3a-2 »). Avant 3a-2, six listes étaient tenues à la main à côté du
// registre : ACTION_TYPES, REMOVAL_TYPES, ATTACHMENT_ACTIONS (assistant-actions-core.ts), WORKER_REMOVAL_TYPES, WORKER_ATTACHMENT_ACTIONS
// (worker-assistant-core.ts) et les listes `tools` des domaines (tool-domains.ts). Elles se déduisent des outils :
//   · types d'écriture  = les outils d'écriture ;      · retraits = les outils d'écriture marqués `retrait` (+ TYPES_SANS_OUTIL) ;
//   · pièces jointes    = les outils marqués `pieceJointe` ;  · domaine d = les outils dont `domaines` contient d.
//
// POURQUOI UN FICHIER ÉCRIT ET NON CALCULÉ À L'IMPORT : ces listes sont lues par le NAVIGATEUR (isRemoval, ABSENCE_KINDS… dans les
// cartes de confirmation), qui n'a pas le droit d'importer registre/outils-*.ts : ce fichier contient les textes lus par le modèle, et le
// site est exporté en statique (tout le JavaScript d'un chunk est public ; test T8). Le registre reste la SEULE source ; on en tire,
// par ce module pur, deux fichiers légers par côté (`_shared/outils-listes-bureau.ts`, `…-salarie.ts` : des noms, rien d'autre), que le
// test `registre-listes.test.ts` régénère en mémoire et compare à l'octet. Ajouter un outil au registre sans régénérer échoue.
//
// L'ORDRE est celui du registre (celui de la liste envoyée au modèle). Les anciennes listes avaient leur ordre propre, regroupé par lot ;
// aucun code n'en dépend (tout est `includes` ou `Set`), et registre-listes.test.ts le prouve en comparant les ensembles.
import { DOMAINES_ORDRE, TYPES_SANS_OUTIL } from './config.ts';
import type { Cote, Outil } from './types.ts';

export interface Listes {
  /** Les types d'écriture (bureau seulement : le salarié n'exportait pas cette liste). */
  actionTypes: string[];
  retraits: string[];
  piecesJointes: string[];
  domaines: Record<string, string[]>;
}

/** Les listes d'un côté, déduites de ses outils. Pure : même entrée, même sortie. */
export function listesDe(cote: Cote, outils: readonly Outil[]): Listes {
  const duCote = outils.filter((o) => o.cote === cote);
  const ecritures = duCote.filter((o) => o.kind === 'ecriture');
  const domaines: Record<string, string[]> = {};
  for (const d of DOMAINES_ORDRE[cote]) domaines[d] = duCote.filter((o) => o.domaines.indexOf(d) >= 0).map((o) => o.id);
  for (const o of duCote) for (const d of o.domaines) if (!(d in domaines)) throw new Error(`${cote}/${o.id} : domaine « ${d} » absent de DOMAINES_ORDRE (registre/config.ts)`);
  return {
    actionTypes: ecritures.map((o) => o.id),
    retraits: [...ecritures.filter((o) => o.kind === 'ecriture' && o.retrait).map((o) => o.id), ...TYPES_SANS_OUTIL[cote].retrait],
    piecesJointes: duCote.filter((o) => o.pieceJointe).map((o) => o.id),
    domaines,
  };
}

/** Le fichier tel qu'il doit être écrit (texte exact : le test le compare à l'octet). */
export function texteListes(cote: Cote, outils: readonly Outil[]): string {
  const l = listesDe(cote, outils);
  const liste = (ids: readonly string[]) => (ids.length ? `[\n${ids.map((i) => `  '${i}',`).join('\n')}\n]` : '[]');
  const nomOutils = cote === 'bureau' ? 'registre/outils-bureau.ts' : 'registre/outils-salarie.ts';
  const retrait = cote === 'bureau' ? 'REMOVAL_TYPES' : 'WORKER_REMOVAL_TYPES';
  const joint = cote === 'bureau' ? 'ATTACHMENT_ACTIONS' : 'WORKER_ATTACHMENT_ACTIONS';
  const entete = `// GÉNÉRÉ par scripts/registre-listes-gen.ts d'après ${nomOutils} (étape 3, livraison 3a-2). NE PAS ÉDITER À LA MAIN :
// pour changer une de ces listes, changer l'outil au registre (\`retrait\`, \`pieceJointe\`, \`domaines\`, ou l'outil lui-même), puis
//   npx -y deno@2 run --allow-read --allow-write scripts/registre-listes-gen.ts
// registre-listes.test.ts échoue tant que ce fichier n'est pas celui que le générateur écrirait.
//
// MODULE LÉGER, côté ${cote === 'bureau' ? 'bureau' : 'salarié'} : des identifiants d'outils, aucun texte lu par le modèle, aucun import. Le navigateur peut l'importer
// (cartes de confirmation) ; il n'importe jamais registre/outils-*.ts (test T8). L'ordre est celui du registre.
`;
  const corps: string[] = [];
  if (cote === 'bureau') {
    corps.push(`/** Les types d'écriture de l'assistant du bureau (= les outils d'écriture du registre). */\nexport const ACTION_TYPES = ${liste(l.actionTypes)} as const;`);
  }
  corps.push(`/** Ce qui RETIRE ou REMPLACE quelque chose : jamais fait d'office, toujours par la carte de confirmation (lot 1, décision D3). */\nexport const ${retrait} = ${liste(l.retraits)} as const;`);
  corps.push(`/** Les outils proposés quand un fichier est joint (lot 1) : les seuls qui lisent un document. */\nexport const ${joint} = ${liste(l.piecesJointes)} as const;`);
  const doms = Object.keys(l.domaines).map((d) => `  ${d}: ${liste(l.domaines[d]).replace(/\n/g, '\n  ')},`).join('\n');
  corps.push(`/** Les outils de chaque domaine de tool-domains.ts (les mots qui déclenchent un domaine y restent écrits à la main). */\nexport const DOMAINES_OUTILS = {\n${doms}\n} as const;`);
  return `${entete}\n${corps.join('\n\n')}\n`;
}
