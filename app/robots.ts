import type { MetadataRoute } from 'next';

// robots.txt de BEMEXO. Ouvert à l'indexation, sauf les espaces privés de
// l'application (tableau de bord admin, espace poseur). Référence le sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/poseur'],
    },
    sitemap: 'https://bemexo.com/sitemap.xml',
    host: 'https://bemexo.com',
  };
}
