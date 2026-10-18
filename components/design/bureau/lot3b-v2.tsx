'use client';

// Design du bureau · lot 3, partie B : UN SEUL morceau différé pour toutes les vues v2 de ce lot (coque des fenêtres, coût chantiers, question
// « Déconnecter la tablette ? », support BEMEXO, abonnement : le panneau de paiement lui est passé par app/admin/page.tsx, jamais importé ici). Chaque composant existant l'importe à la demande (`import(...).then((m) => ({ default: m.X }))`),
// seulement avec `?ui=2` : un morceau de plus au lieu de cinq, donc une seule entrée de plus dans le chargeur partagé par toutes les pages (budget de poids).
export { default as CoqueL3 } from './coque-l3';
export { default as CoutV2 } from './cout-v2';
export { default as DeconnecterV2 } from './borne-v2';
export { default as SupportV2 } from './support-v2';
export { default as AbonnementV2 } from './abonnement-v2';
