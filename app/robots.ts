import type { MetadataRoute } from 'next';

// robots.txt de BEMEXO. Ouvert à l'indexation, sauf les espaces privés de
// l'application (tableau de bord admin, espace poseur). Référence le sitemap.
export default function robots(): MetadataRoute.Robots {
  const disallow = ['/admin', '/poseur'];
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      // Bots IA / moteurs de réponse : autorisés EXPLICITEMENT (pour qu'un futur
      // changement du bloc générique ne les bloque pas par inadvertance), avec
      // les mêmes exclusions d'espaces privés.
      { userAgent: ['GPTBot', 'OAI-SearchBot', 'PerplexityBot', 'ClaudeBot'], allow: '/', disallow },
    ],
    sitemap: 'https://bemexo.com/sitemap.xml',
    host: 'https://bemexo.com',
  };
}
