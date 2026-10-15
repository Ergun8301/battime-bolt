// Navigation commune des scripts qui pilotent l'écran salarié (/poseur) : UN seul point à changer quand le menu du
// compte, l'éditeur d'intervention ou les messages changeront de forme (plan d'intégration du design salarié,
// étape 0 : docs/design-brief/audit-salarie/03-plan-integration.md §5.2). Aujourd'hui : le menu déroulant du nom en
// haut à droite, la fiche d'intervention (`.bt-ed`) et les messages de Sonner. Même comportement que les gestes
// écrits à la main avant ce fichier : mêmes sélecteurs, mêmes attentes (les durées sont passées en options).
//
// Chaque fonction prend la page Playwright en premier argument.

/** Ouvre le menu du compte (le bouton « Mon compte et menu »). `menu` : attend le menu ; `attente` : pause (ms) ensuite. */
export async function ouvrirMenuCompte(p, { menu = false, attente = 0 } = {}) {
  await p.locator('button[aria-label="Mon compte et menu"]').click();
  if (menu) await p.waitForSelector('[role=menu]');
  if (attente) await p.waitForTimeout(attente);
}

/**
 * Va sur une vue par le menu du compte (« Ma semaine », « Historique », « Mes congés »…).
 * `menu` / `attente` : comme ouvrirMenuCompte (avant de choisir l'entrée) ; `apres` : pause (ms) une fois l'entrée touchée.
 */
export async function ouvrirVue(p, nom, { menu = false, attente = 0, apres = 0 } = {}) {
  await ouvrirMenuCompte(p, { menu, attente });
  await p.getByRole('menuitem', { name: nom }).click();
  if (apres) await p.waitForTimeout(apres);
}

/** Touche une carte (un locator : ligne saisie, carte prévue, « + »…) et attend la fiche d'intervention. */
export async function ouvrirEditeur(p, carte) {
  await carte.click();
  await p.waitForSelector('.bt-ed');
}

/** Les textes des messages affichés (Sonner) ; `type` : 'error' | 'success'… pour ne garder que ceux-là. */
export async function lireToasts(p, type) {
  return p.locator(`[data-sonner-toast]${type ? `[data-type="${type}"]` : ''}`).allInnerTexts();
}

/** Le sélecteur du bouton du menu du compte, pour les scripts qui ont leur propre mécanique de clic (fenetres-lot11 : `step`). */
export const BOUTON_MENU_COMPTE = 'button[aria-label="Mon compte et menu"]';
