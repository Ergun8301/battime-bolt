// Les modules LÉGERS des ouvreurs, un par côté (étape 3, livraison 3b-1) : fonction PURE qui écrit le texte exact de
// `ouvreurs-leger-bureau.ts` / `ouvreurs-leger-salarie.ts`, d'après `ouvreurs.ts`. Même méthode que `listes.ts` (3a-2) : le fichier est GÉNÉRÉ par
// `scripts/registre-ouvreurs-gen.ts` et `registre-ouvreurs.test.ts` le compare à l'octet.
//
// POURQUOI : le site est exporté en statique, tout le JavaScript d'un chunk est public. `ouvreurs.ts` porte les phrases lues par le modèle et les noms
// d'états de l'interface ; le navigateur ne lit que ceci : id, rôles, niveau, drapeaux, et pour chaque paramètre son type (et sa liste fermée).
// Aucun texte (titre, décrit, aide), aucun nom d'état ou de composant, aucun import.
import type { Cote, Ouvreur } from './types.ts';

const lit = (v: unknown): string => JSON.stringify(v).replace(/"/g, "'").replace(/,/g, ', ');

export function texteOuvreursLeger(cote: Cote, ouvreurs: readonly Ouvreur[]): string {
  const nomFichier = cote === 'bureau' ? 'bureau' : 'salarie';
  const entete = `// GÉNÉRÉ par scripts/registre-ouvreurs-gen.ts d'après registre/ouvreurs.ts (étape 3, livraison 3b-1). NE PAS ÉDITER À LA MAIN :
// pour changer un ouvreur, changer registre/ouvreurs.ts, puis
//   npx -y deno@2 run --allow-read --allow-write scripts/registre-ouvreurs-gen.ts
// registre-ouvreurs.test.ts échoue tant que ce fichier n'est pas celui que le générateur écrirait.
//
// MODULE LÉGER, côté ${cote === 'bureau' ? 'bureau' : 'salarié'} : id, rôles, niveau, drapeaux et type de chaque paramètre. Aucun texte lu par le modèle, aucun nom d'état, aucun import.
// Seule la page ${cote === 'bureau' ? '/admin' : '/poseur'} l'importe (test T8 : jamais celui de l'autre côté). Syntaxe de la cible navigateur (T11).
`;
  const lignes = ouvreurs.filter((o) => o.cote === cote).map((o) => {
    const params = Object.entries(o.params).map(([nom, p]) => `${nom}: { kind: ${lit(p.kind)}${p.valeurs ? `, valeurs: ${lit(p.valeurs)}` : ''} }`).join(', ');
    const champs = [`id: ${lit(o.id)}`, `roles: ${lit(o.roles)}`, `niveau: ${o.niveau}`];
    if (o.dispo) champs.push(`dispo: ${lit(o.dispo)}`);
    if (o.ecran) champs.push(`ecran: ${lit(o.ecran)}`);
    if (o.formulaire) champs.push('formulaire: true');
    if (o.empile) champs.push('empile: true');
    champs.push(params ? `params: { ${params} }` : 'params: {}');
    return `  { ${champs.join(', ')} },`;
  });
  return `${entete}
/** Les ouvreurs ${cote === 'bureau' ? 'du bureau' : 'du salarié'} livrés, dans l'ordre de l'enum de l'outil \`ouvrir_fenetre\`. */
export const OUVREURS_LEGER_${nomFichier.toUpperCase()} = [
${lignes.join('\n')}
] as const;
`;
}
