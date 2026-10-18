import type { Metadata } from 'next';

// Agence qui a conçu et réalisé le site (signature des pages publiques,
// données structurées, balise author). Un seul endroit à changer si l'URL ou
// le nom évoluent.
export const IPPYX_URL = 'https://ippyx.com';

/** Lien de signature, tracé par page (utm_campaign = la page d'origine). */
export function ippyxHref(campaign: string): string {
  return `${IPPYX_URL}/?utm_source=bemexo&utm_medium=signature&utm_campaign=${encodeURIComponent(campaign)}`;
}

/** Entité schema.org à placer en `creator` dans un JSON-LD. */
export const IPPYX_ORG = { '@type': 'Organization', name: 'IPPYX', url: IPPYX_URL };

/** À étaler dans le `metadata` des pages publiques : <meta name="author"> + <link rel="author">. */
export const IPPYX_METADATA: Pick<Metadata, 'authors' | 'creator'> = {
  authors: [{ name: 'IPPYX', url: IPPYX_URL }],
  creator: 'IPPYX',
};
