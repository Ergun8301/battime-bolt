// Point d'entrée du registre : pour les fonctions Edge et les tests Deno SEULEMENT.
//
// INTERDIT AU NAVIGATEUR. Le site est exporté en statique : tout le JavaScript d'un chunk est
// public, même sans compte. Ce module tire les textes lus par le modèle (capacites-*, outils-*),
// les noms de RPC et de tables (surfaces) et les raisons de sécurité (interne) : jamais depuis
// `app/`, `components/`, `lib/` ni `hooks/`, directement ou par imports transitifs (test T8).
// Le navigateur n'importe que les modules légers par côté, qui arrivent en 3b.
export * from './types.ts';
export * from './config.ts';
export * from './capacites-bureau.ts';
export * from './capacites-salarie.ts';
export * from './outils-bureau.ts';
export * from './outils-salarie.ts';
export * from './surfaces.ts';
export * from './interne.ts';
