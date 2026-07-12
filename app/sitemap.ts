import type { MetadataRoute } from 'next';

// Sitemap public de BEMEXO (bemexo.com). N'expose que les pages destinées aux
// visiteurs / moteurs : vitrine, inscription, pages légales. Les espaces privés
// (/admin, /poseur, /connexion…) sont volontairement exclus (voir robots.ts).
const BASE = 'https://bemexo.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '/landing', priority: 1.0, changeFrequency: 'weekly' },
    { path: '/inscription', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/cgv', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/cgu', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/mentions-legales', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/confidentialite', priority: 0.3, changeFrequency: 'yearly' },
  ];
  return entries.map((e) => ({
    url: `${BASE}${e.path}`,
    lastModified: now,
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }));
}
