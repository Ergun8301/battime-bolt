// La SECONDE variante du GUIDE du bureau (étape 3, livraison 3b-1) : pour les fiches dont un ouvreur existe maintenant, le bouton raccourci OUVRE le bon écran
// au lieu de ramener à la grille du planning (04 §1.4 point 1 : « M'y emmener » ne menait nulle part pour `borne`, `versions`, `selection`…).
//
// Servie SEULEMENT si l'interrupteur `ouvrir` est allumé ET que l'écran annonce `ouvrir1` (assistant/index.ts) ; sinon la fiche garde son lien d'avant, octet
// pour octet (etape3-eteint.test.ts). Une fiche qui n'est pas ici garde son lien : son ouvreur vient avec les vagues 3 à 5, ou n'existe pas.
//
// SERVEUR SEULEMENT (il lit ouvreurs.ts). Le navigateur ne connaît pas cette table : le serveur envoie le bouton déjà fabriqué (`ouvrir:<id>` + son libellé).
import { GUIDE, type GuideLiens } from './assistant-actions-core.ts';
import { trouverOuvreur } from './registre/ouvreurs.ts';

/** Fiche du GUIDE → id de l'ouvreur qui l'ouvre. Une ligne par fiche, avec la raison quand ce n'est pas évident. */
export const FICHE_VERS_OUVREUR: Readonly<Record<string, string>> = {
  ajouter_salarie: 'salarie.nouveau',
  importer_salaries: 'salaries.importer',
  creer_client: 'client.nouveau',
  importer_clients: 'clients.importer',
  demandes_conge: 'conges.demandes',
  export: 'export.equipe',      // niveau 3 : un bouton, la personne clique elle-même
  cloture: 'export.equipe',     // la clôture se choisit dans le même panneau (cloture.mois exige le mois : la fiche n'en nomme pas)
  reserves: 'reserves.registre',
  lever_reserve: 'reserves.registre',
  selection: 'planning.selection',
  versions: 'planning.versions',
  semaine: 'planning.semaine',
  rappel: 'relances.liste',
  abonnement: 'abonnement.choisir',
};

/** Les boutons de la variante, fabriqués depuis les ouvreurs (le libellé est leur titre). Jamais d'id inconnu : le test le vérifie. */
export const GUIDE_LIENS_ETAPE3: GuideLiens = Object.freeze(Object.fromEntries(
  GUIDE.filter((g) => FICHE_VERS_OUVREUR[g.id]).map((g) => {
    const o = trouverOuvreur(FICHE_VERS_OUVREUR[g.id], 'bureau');
    if (!o) throw new Error(`guide-etape3 : la fiche « ${g.id} » pointe vers un ouvreur inconnu « ${FICHE_VERS_OUVREUR[g.id]} »`);
    return [g.id, { id: o.id, label: o.titre }] as const;
  }),
));
