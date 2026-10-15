// Les outils de l'assistant du SALARIÉ tels que le modèle les reçoit (étape 3, livraison 3a-2).
//
// Avant 3a-2, `WORKER_FUNCTIONS` (19 déclarations écrites à la main), `WORKER_ATTACHMENT_FUNCTIONS` et `workerFunctionsFor` vivaient dans
// worker-assistant-core.ts. Elles sont maintenant GÉNÉRÉES depuis le registre (registre/outils-salarie.ts, par `outilsPour`) : mêmes
// objets, même ordre, mêmes descriptions, octet pour octet (preuve : registre-listes.test.ts et l'empreinte SHA-256 gelée).
//
// SERVEUR SEULEMENT (fonctions Edge, tests Deno) : ce module tire les textes lus par le modèle. worker-assistant-core.ts, lui, est atteint
// par le navigateur (/poseur) et ne doit jamais l'importer (test T8, README du registre).
import { outilsPour, type DeclarationOutil } from './registre/outils-pour.ts';
import { WORKER_DOMAINS, domainTools, pickTools } from './tool-domains.ts';
import { textePourOutils, type MessageHistorique } from './assistant-history.ts';

/** Les 19 déclarations (`repondre` + 18 outils), dans l'ordre du registre. */
export const WORKER_FUNCTIONS = outilsPour('salarie') as DeclarationOutil[];

/**
 * Lot 1 : un FICHIER est joint → le modèle ne voit que « ranger » et « répondre ». Un PDF piégé ne peut donc demander ni d'effacer des
 * heures, ni d'envoyer la journée, ni de retirer une demande de congé.
 */
export const WORKER_ATTACHMENT_FUNCTIONS = outilsPour('salarie', { fichier: true }) as DeclarationOutil[];

/**
 * Lot 6 : sans fichier, seulement les outils du DOMAINE de la phrase (tous si aucun n'est reconnu).
 * Étape 2 : avec un historique, les domaines du dernier échange s'ajoutent à ceux de la phrase, jamais l'inverse.
 */
export const workerFunctionsFor = (hasFile: boolean, text?: string, historique?: MessageHistorique[]) =>
  (hasFile ? WORKER_ATTACHMENT_FUNCTIONS
    : pickTools(WORKER_FUNCTIONS, text && domainTools(text, WORKER_DOMAINS) ? textePourOutils(text, historique) : text, WORKER_DOMAINS));
