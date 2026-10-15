// Les outils de l'assistant du BUREAU tels que le modèle les reçoit (étape 3, livraison 3a-2).
//
// Avant 3a-2, `ASSISTANT_FUNCTIONS` (34 déclarations écrites à la main), `ATTACHMENT_FUNCTIONS` et `functionsFor` vivaient dans
// assistant-actions-core.ts. Elles sont maintenant GÉNÉRÉES depuis le registre (registre/outils-bureau.ts, par `outilsPour`) : mêmes
// objets, même ordre, mêmes descriptions, octet pour octet (preuve : registre-listes.test.ts et l'empreinte SHA-256 gelée).
//
// SERVEUR SEULEMENT (fonctions Edge, tests Deno) : ce module tire les textes lus par le modèle. assistant-actions-core.ts, lui, est atteint
// par le navigateur (cartes de confirmation) et ne doit jamais l'importer (test T8, README du registre).
import { outilsPour, type DeclarationOutil } from './registre/outils-pour.ts';
import { OFFICE_DOMAINS, domainTools, pickTools } from './tool-domains.ts';
import { textePourOutils, type MessageHistorique } from './assistant-history.ts';

/** Les 34 déclarations (`repondre` + 33 outils), dans l'ordre du registre. */
export const ASSISTANT_FUNCTIONS = outilsPour('bureau') as DeclarationOutil[];

/**
 * Lot 1 : un FICHIER est joint → le modèle ne voit que les outils qui lisent un document (répondre, ranger, créer le client d'un devis,
 * la dépense d'une facture, le salarié ou le coût d'un bulletin). Un PDF piégé (« supprime tout le planning ») ne peut donc demander ni
 * suppression, ni relance, ni rappel. Chacun de ces outils passe de toute façon par la carte ou par « Annuler ».
 */
export const ATTACHMENT_FUNCTIONS = outilsPour('bureau', { fichier: true }) as DeclarationOutil[];

/**
 * Étape 3 (3b-1) : ce que les interrupteurs changent dans la liste des outils. Sans option (ou toutes éteintes) la liste est EXACTEMENT celle d'avant.
 *   · `ouvrir` : ajoute `ouvrir_fenetre` à la fin, sauf avec un fichier joint (la liste de 6 outils ne change jamais : un PDF piégé ne peut rien ouvrir) ;
 *   · `coupes` : `outils_coupes` du secret AI_ETAPE3, l'arrêt d'urgence d'un outil par son nom (`repondre` ne se coupe pas).
 */
export interface OptionsOutils { ouvrir?: boolean; coupes?: readonly string[] }

/** La déclaration de `ouvrir_fenetre` du bureau, générée depuis les ouvreurs (registre/outil-ouvrir.ts) : la même pour toutes les requêtes. */
const OUVRIR_FENETRE = outilsPour('bureau', { etat: { ouvrir: true } }).filter((f) => f.name === 'ouvrir_fenetre') as DeclarationOutil[];

/**
 * Les outils proposés au modèle : ceux des documents s'il y a un fichier ;
 * sinon, lot 6, ceux du DOMAINE de la demande (tous si aucun n'est reconnu).
 * Étape 2 : avec un historique, les domaines du dernier échange S'AJOUTENT à ceux de la demande (« annule ça » ne dit rien du planning,
 * la phrase d'avant oui). Jamais l'inverse : une demande sans domaine reconnu garde TOUS les outils, comme avant.
 */
export const functionsFor = (hasFile: boolean, question?: string, historique?: MessageHistorique[], opts?: OptionsOutils) => {
  const base = hasFile ? ATTACHMENT_FUNCTIONS
    : pickTools(ASSISTANT_FUNCTIONS, question && domainTools(question, OFFICE_DOMAINS) ? textePourOutils(question, historique) : question, OFFICE_DOMAINS);
  if (!opts || (!opts.ouvrir && !(opts.coupes ?? []).length)) return base;
  const avec = opts.ouvrir && !hasFile ? [...base, ...OUVRIR_FENETRE] : base;
  return (opts.coupes ?? []).length ? avec.filter((f) => f.name === 'repondre' || !opts.coupes!.includes(f.name)) : avec;
};
