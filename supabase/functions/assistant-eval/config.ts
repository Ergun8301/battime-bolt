// Évaluation SANS TOUCHER LA PROD : le champ facultatif `aiConfig` du corps de la requête remplace AI_CONFIG
// pour la seule passe d'évaluation (essayer Claude pendant que la production reste sur Gemini).
//
// · validé par LA MÊME fonction de lecture que la production (lireAiConfig, ai-provider.ts) ;
// · un aiConfig invalide est une erreur 400 explicite, JAMAIS un repli sur le défaut : on ne croit pas avoir testé Claude quand on a testé Gemini ;
// · les clés restent celles de l'environnement (rien ne se passe par la requête) ; aucun secret n'est lu ni renvoyé, seulement « clé présente ou non » ;
// · l'authentification de la fonction (x-cron-secret) ne change pas.
import { cleDe, lireAiConfig, libelleModele, readConfig } from '../_shared/ai-provider.ts';

type Env = { get(key: string): string | undefined };

/** L'environnement de la passe : celui du serveur, avec AI_CONFIG remplacé si `aiConfig` est donné. */
export function envEvaluation(base: Env, aiConfig: unknown): { ok: true; env: Env; surcharge: boolean } | { ok: false; error: string } {
  if (aiConfig === undefined || aiConfig === null) return { ok: true, env: base, surcharge: false };
  // Une chaîne (JSON ou raccourci « payant »), ou directement l'objet JSON (corps envoyé par la base).
  const raw = typeof aiConfig === 'string' ? aiConfig.trim()
    : typeof aiConfig === 'object' && !Array.isArray(aiConfig) ? JSON.stringify(aiConfig) : '';
  if (!raw) return { ok: false, error: 'aiConfig invalide (chaîne JSON, objet ou raccourci attendu)' };
  const lu = lireAiConfig(raw);
  if (!lu.ok) return { ok: false, error: `aiConfig invalide (${lu.raison})` };
  return { ok: true, surcharge: true, env: { get: (k) => (k === 'AI_CONFIG' ? raw : base.get(k)) } };
}

/** Ce qui sert vraiment à la passe : « fournisseur:modèle » de chaque niveau, et si leur clé est posée (jamais la clé). */
export function resumeEvaluation(env: Env, surcharge: boolean) {
  const c = readConfig(env);
  return {
    surcharge,
    formule: c.formule,
    rapide: libelleModele(c.rapide), documents: libelleModele(c.documents), secours: libelleModele(c.secours),
    cles: { gemini: !!cleDe(env, 'gemini'), anthropic: !!cleDe(env, 'anthropic') },
  };
}
