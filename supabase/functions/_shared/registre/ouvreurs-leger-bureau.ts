// GÉNÉRÉ par scripts/registre-ouvreurs-gen.ts d'après registre/ouvreurs.ts (étape 3, livraison 3b-1). NE PAS ÉDITER À LA MAIN :
// pour changer un ouvreur, changer registre/ouvreurs.ts, puis
//   npx -y deno@2 run --allow-read --allow-write scripts/registre-ouvreurs-gen.ts
// registre-ouvreurs.test.ts échoue tant que ce fichier n'est pas celui que le générateur écrirait.
//
// MODULE LÉGER, côté bureau : id, rôles, niveau, drapeaux et type de chaque paramètre. Aucun texte lu par le modèle, aucun nom d'état, aucun import.
// Seule la page /admin l'importe (test T8 : jamais celui de l'autre côté). Syntaxe de la cible navigateur (T11).

/** Les ouvreurs du bureau livrés, dans l'ordre de l'enum de l'outil `ouvrir_fenetre`. */
export const OUVREURS_LEGER_BUREAU = [
  { id: 'salaries.liste', roles: ['admin'], niveau: 1, params: { recherche: { kind: 'texte' } } },
  { id: 'salaries.importer', roles: ['admin'], niveau: 1, formulaire: true, params: {} },
  { id: 'clients.importer', roles: ['admin'], niveau: 1, formulaire: true, params: {} },
  { id: 'reserves.registre', roles: ['admin'], niveau: 1, params: {} },
  { id: 'conges.demandes', roles: ['admin'], niveau: 1, params: {} },
  { id: 'stats.equipe', roles: ['admin'], niveau: 1, params: {} },
  { id: 'planning.supprimees', roles: ['admin'], niveau: 1, dispo: 'traces', params: {} },
  { id: 'planning.versions', roles: ['admin'], niveau: 1, dispo: 'versions', params: { lundi: { kind: 'lundi' } } },
  { id: 'formations.gestion', roles: ['admin'], niveau: 1, dispo: 'formations', params: {} },
  { id: 'abonnement.choisir', roles: ['admin'], niveau: 1, params: {} },
  { id: 'relances.liste', roles: ['admin'], niveau: 1, params: {} },
  { id: 'planning.selection', roles: ['admin'], niveau: 1, params: {} },
  { id: 'borne.gestion', roles: ['admin'], niveau: 1, dispo: 'borne', params: {} },
  { id: 'clients.liste', roles: ['admin'], niveau: 1, params: { recherche: { kind: 'texte' } } },
  { id: 'planning.semaine', roles: ['admin'], niveau: 1, params: { lundi: { kind: 'lundi' }, jour: { kind: 'date' } } },
  { id: 'salarie.fiche', roles: ['admin'], niveau: 1, formulaire: true, params: { salarie: { kind: 'salarie' }, mode: { kind: 'enum', valeurs: ['hours', 'manage'] } } },
  { id: 'client.fiche', roles: ['admin'], niveau: 1, formulaire: true, params: { chantier: { kind: 'chantier' } } },
  { id: 'chantier.documents', roles: ['admin'], niveau: 1, formulaire: true, empile: true, params: { chantier: { kind: 'chantier' }, jour: { kind: 'date' } } },
  { id: 'client.nouveau', roles: ['admin'], niveau: 1, formulaire: true, params: { nom: { kind: 'texte' }, produit: { kind: 'texte' }, telephone: { kind: 'texte' }, email: { kind: 'texte' }, ville: { kind: 'texte' }, adresse: { kind: 'texte' }, description: { kind: 'texte' } } },
  { id: 'salarie.nouveau', roles: ['admin'], niveau: 1, formulaire: true, params: { prenom: { kind: 'texte' }, nom: { kind: 'texte' }, email: { kind: 'texte' }, telephone: { kind: 'texte' } } },
  { id: 'export.equipe', roles: ['admin'], niveau: 3, params: { du: { kind: 'date' }, au: { kind: 'date' } } },
  { id: 'cloture.mois', roles: ['admin'], niveau: 3, params: { mois: { kind: 'mois' } } },
  { id: 'planning.ajouter', roles: ['admin'], niveau: 1, formulaire: true, params: { salarie: { kind: 'salarie' }, date: { kind: 'date' }, chantier: { kind: 'chantier' }, debut: { kind: 'heure' }, fin: { kind: 'heure' }, note: { kind: 'texte' }, type: { kind: 'enum', valeurs: ['intervention', 'tache'] } } },
  { id: 'salarie.statut', roles: ['admin'], niveau: 1, params: { salarie: { kind: 'salarie' }, date: { kind: 'date' } } },
  { id: 'absence.poser', roles: ['admin'], niveau: 1, formulaire: true, params: { salarie: { kind: 'salarie' }, type: { kind: 'enum', valeurs: ['conge', 'maladie', 'intemperie'] }, du: { kind: 'date' }, au: { kind: 'date' } } },
  { id: 'export.salarie', roles: ['admin'], niveau: 1, params: { salarie: { kind: 'salarie' } } },
] as const;
