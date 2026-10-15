// Registre : ce que reçoit le modèle (étape 3, livraison 3a-2). Contrat : docs/ia-etape3/00-conception-etape3.md §2.3.
//
// `outilsPour(cote, { fichier, livraison })` rend les déclarations { name, description, parameters } d'un côté, dans l'ordre du
// registre, exactement celles que `callFunction` envoie. C'est la SEULE source de ASSISTANT_FUNCTIONS et de WORKER_FUNCTIONS
// (assistant-outils.ts, worker-outils.ts) : plus aucune description n'est écrite ailleurs que dans outils-*.ts.
//
// SERVEUR SEULEMENT (fonctions Edge, tests Deno) : ce module importe les textes lus par le modèle ; le navigateur n'y touche jamais (T8).
import { LIVRAISON_COURANTE, livraisonAtteinte } from './config.ts';
import { OUTILS_BUREAU } from './outils-bureau.ts';
import { OUTILS_SALARIE } from './outils-salarie.ts';
import type { Cote, FunctionDecl, Livraison, Outil, OutilsPour } from './types.ts';

/**
 * Une déclaration avec la forme que tous les outils ont (objet à propriétés) : `FunctionDecl` laisse `parameters` ouvert (il est partagé avec
 * ai-provider.ts), alors que le code et les tests lisent `parameters.properties`. Même objet, vu avec plus de précision.
 */
export type DeclarationOutil = { name: string; description: string; parameters: { type: string; properties: Record<string, unknown>; required?: string[] } };

type Variante = NonNullable<Outil['variantes']>[number];

/**
 * La déclaration d'UN outil à une livraison donnée. Une variante (extension d'un outil existant : nouveau paramètre) ne s'applique que si
 * sa livraison est atteinte ; sinon la déclaration est celle de l'outil gelé, mot pour mot. L'ordre des clés est celui de l'empreinte
 * (name, description, parameters) : JSON.stringify en dépend.
 */
export function declarer(o: Outil, livraison: Livraison): FunctionDecl {
  let description = o.description;
  let parameters = o.parametres;
  for (const v of (o.variantes ?? []) as Variante[]) {
    if (!livraisonAtteinte(v.livraison, livraison)) continue;
    if (v.description !== undefined) description = v.description;
    if (v.parametres) {
      const base = parameters as { properties?: Record<string, unknown>; required?: string[] };
      const plus = v.parametres as { properties?: Record<string, unknown>; required?: string[] };
      parameters = { ...base, ...plus, properties: { ...(base.properties ?? {}), ...(plus.properties ?? {}) }, ...(base.required || plus.required ? { required: [...(base.required ?? []), ...(plus.required ?? [])] } : {}) };
    }
  }
  return { name: o.id, description, parameters };
}

/** Les outils d'un côté servis à `livraison` (les suivants restent éteints), avec `fichier` : ceux qui lisent un document joint. */
export function outilsServisPour(outils: readonly Outil[], cote: Cote, o: { fichier?: boolean; livraison?: Livraison } = {}): FunctionDecl[] {
  const livraison = o.livraison ?? LIVRAISON_COURANTE;
  return outils
    .filter((x) => x.cote === cote && livraisonAtteinte(x.livraison, livraison) && (!o.fichier || !!x.pieceJointe))
    .map((x) => declarer(x, livraison));
}

/** Ce que reçoit `callFunction` : voir l'en-tête. */
export const outilsPour: OutilsPour = (cote, o) => outilsServisPour(cote === 'bureau' ? OUTILS_BUREAU : OUTILS_SALARIE, cote, o);
