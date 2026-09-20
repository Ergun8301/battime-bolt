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
 * Reconnaît les deux hébergeurs, parce que la bascule ne se fait pas en un
 * instant : pendant la transition, des previews des deux côtés doivent
 * fonctionner. Et un développement local compte aussi comme une preview —
 * sinon il faut déployer pour tester un écran de preview.
 *
 *   Netlify     deploy-preview-42--battime.netlify.app
 *   Cloudflare  <branche|hash>.<projet>.pages.dev
 *   Local       localhost / 127.0.0.1
 *
 * La production, elle, est le domaine propre (bemexo.com) : tout ce qui n'est
 * reconnu ici est traité comme de la production, ce qui est le bon défaut —
 * une preview prise pour la production affiche des données de démonstration à
 * un vrai client.
 */
export function isPreviewHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h.startsWith('deploy-preview-')
      || h.endsWith('.netlify.app')
      || h.endsWith('.pages.dev')
      || h === 'localhost'
      || h === '127.0.0.1';
}
