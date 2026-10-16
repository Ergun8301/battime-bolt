// L'INTERRUPTEUR UNIQUE des guides du nouveau design (v2) : voir worker-tours-v2.ts et docs/design-brief/integration/guides-v2.md.
// `true` (BASCULE, étape 11) = les guides pas à pas et les fiches d'aide de l'Assistant décrivent le nouveau design, pour tous les salariés.
// `false` = les guides et fiches d'avant (v1). Pour revenir en arrière : remettre `false` ici (et `UI2_PAR_DEFAUT` dans lib/use-ui2.ts), puis redéployer worker-assistant.
// Ce fichier ne contient QUE ce drapeau : il est lu par la page du salarié sans tirer les textes de la v2.
export const GUIDES_UI2 = true;
