// L'INTERRUPTEUR UNIQUE des guides du BUREAU pour le nouveau design (v2) : voir admin-tours-v2.ts et docs/design-brief/integration/guides-bureau-v2.md.
// `false` (état de la livraison du lot 1) = les guides pas à pas du bureau sont ceux d'AVANT, octet pour octet (empreinte guideForPrompt du bureau inchangée).
// `true` = ils décrivent le planning v2 (« Plus ⋯ » pour Coût chantiers et Versions du planning). À ne mettre à `true` qu'à la BASCULE du bureau
// (BUREAU_UI2_PAR_DEFAUT dans lib/use-bureau-ui2.ts), puis à redéployer la fonction `assistant` (les fiches d'aide sont dans la consigne du modèle).
export const GUIDES_BUREAU_UI2 = false;
