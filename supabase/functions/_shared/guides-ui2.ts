// L'INTERRUPTEUR UNIQUE des guides du nouveau design (?ui=2) : voir worker-tours-v2.ts et docs/design-brief/integration/guides-v2.md.
// `false` = les guides et fiches d'aide d'avant (v1, en production). La bascule (étape 11, v2 pour tous) le passe à `true`.
// Ce fichier ne contient QUE ce drapeau : il est lu par la page du salarié sans tirer les textes de la v2.
export const GUIDES_UI2 = false;
