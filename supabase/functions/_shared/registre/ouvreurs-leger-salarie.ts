// GÉNÉRÉ par scripts/registre-ouvreurs-gen.ts d'après registre/ouvreurs.ts (étape 3, livraison 3b-1). NE PAS ÉDITER À LA MAIN :
// pour changer un ouvreur, changer registre/ouvreurs.ts, puis
//   npx -y deno@2 run --allow-read --allow-write scripts/registre-ouvreurs-gen.ts
// registre-ouvreurs.test.ts échoue tant que ce fichier n'est pas celui que le générateur écrirait.
//
// MODULE LÉGER, côté salarié : id, rôles, niveau, drapeaux et type de chaque paramètre. Aucun texte lu par le modèle, aucun nom d'état, aucun import.
// Seule la page /poseur l'importe (test T8 : jamais celui de l'autre côté). Syntaxe de la cible navigateur (T11).

/** Les ouvreurs du salarié livrés, dans l'ordre de l'enum de l'outil `ouvrir_fenetre`. */
export const OUVREURS_LEGER_SALARIE = [
  { id: 'jour.date', roles: ['worker', 'lead'], niveau: 1, params: { date: { kind: 'date' } } },
  { id: 'formations.ouvrir', roles: ['worker', 'lead'], niveau: 1, dispo: 'formations', params: {} },
] as const;
