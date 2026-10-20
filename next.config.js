// Garde-fou de build (production Cloudflare Pages) : `NEXT_PUBLIC_*` est INLINÉ par Next au build. Une variable absente
// ce jour-là ne casse rien et ne se voit pas : `process.env.NEXT_PUBLIC_PAYWALL_ENFORCED` reste une lecture d'un process
// vide dans le navigateur, donc `undefined`, et le blocage des essais expirés s'éteint sans un mot (vu le 20 oct. 2026 :
// variable posée dans le tableau de bord, mais ignorée tant qu'un wrangler.toml faisait foi). Sur la branche de
// production, on refuse donc de construire sans elle : un build en échec garde la version d'avant en ligne et se voit.
if (process.env.CF_PAGES === '1' && process.env.CF_PAGES_BRANCH === 'main') {
  if (!process.env.NEXT_PUBLIC_PAYWALL_ENFORCED) {
    throw new Error('NEXT_PUBLIC_PAYWALL_ENFORCED absente du build de production Cloudflare : le blocage des essais expirés serait éteint. La poser dans Pages → Settings → Variables (Production), puis relancer.');
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    console.warn('[build] NEXT_PUBLIC_VAPID_PUBLIC_KEY absente : les notifications push ne pourront pas être activées.');
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true },
};
module.exports = nextConfig;
