// Ce que l'application sait de son hébergement.
//
// POURQUOI CE FICHIER EXISTE. Deux informations d'hébergement étaient écrites
// en dur, à plusieurs endroits, et auraient silencieusement menti après un
// changement d'hébergeur :
//
//   1. La reconnaissance d'une PREVIEW se faisait sur `deploy-preview-*`, la
//      forme des adresses Netlify. Sur un autre hébergeur, les écrans réservés
//      aux previews (le blocage d'essai, le planning de démonstration) se
//      seraient éteints sans bruit — et personne n'aurait su pourquoi.
//
//   2. Le nom de l'hébergeur figure dans les MENTIONS LÉGALES et dans la
//      politique de confidentialité. Ce n'est pas un détail de présentation :
//      c'est une déclaration sur le lieu de traitement des données
//      personnelles. La laisser périmée après une migration rendrait ces deux
//      pages fausses.
//
// Les deux vivent donc ici, à un seul endroit, pour que le changement soit une
// ligne et non une chasse.

/** L'hébergeur de l'interface web, tel que les pages légales le déclarent. */
export const WEB_HOST = {
  name: 'Netlify, Inc.',
  address: '44 Montgomery Street, Suite 300, San Francisco, CA 94104, États-Unis',
  url: 'https://www.netlify.com',
  label: 'netlify.com',
} as const;

/**
 * Sommes-nous sur une PREVIEW plutôt qu'en production ?
 *
 * ATTENTION AU PIÈGE, qui m'a eu : chez les deux hébergeurs, la PRODUCTION est
 * elle aussi servie sur une adresse du fournisseur. Se contenter du suffixe
 * traite donc le site réel comme une preview — et alors `?demo=5` mélange cinq
 * salariés fictifs au planning d'un vrai client, et un essai expiré est bloqué
 * alors que le paywall n'est pas activé.
 *
 *   PRODUCTION            PREVIEW
 *   battime.netlify.app   deploy-preview-42--battime.netlify.app
 *                         une-branche--battime.netlify.app
 *   bemexo.pages.dev      a1b2c3d4.bemexo.pages.dev
 *                         une-branche.bemexo.pages.dev
 *
 * Ce qui distingue vraiment les deux :
 *   - Netlify    : une preview porte `--` dans son nom d'hôte, la production non.
 *   - Cloudflare : une preview est un SOUS-domaine de `<projet>.pages.dev`, donc
 *                  au moins quatre étiquettes ; la production en a trois.
 *
 * Et le domaine propre (bemexo.com) n'est jamais une preview, ce qui est le bon
 * défaut : en cas de doute, on traite comme de la production. Se tromper dans
 * ce sens n'affiche rien de faux à personne.
 *
 * UN CAS CONNU, ASSUMÉ. Netlify publie aussi la branche `main` sous son alias
 * `main--battime.netlify.app`, qui porte donc `--` et passe ici pour une
 * preview alors qu'il sert le même contenu que la production. Personne n'y va :
 * les clients arrivent par bemexo.com. Je le note pour que le prochain qui lit
 * cette fonction ne croie pas avoir trouvé un oubli — et parce que resserrer la
 * règle (nommer `main` en dur) casserait la détection sur toute autre branche.
 */
export function isPreviewHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;

  if (h === 'localhost' || h === '127.0.0.1') return true;
  if (h.endsWith('.netlify.app')) return h.includes('--');
  if (h.endsWith('.pages.dev')) return h.split('.').length > 3;
  return false;
}
