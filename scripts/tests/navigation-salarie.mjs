// Navigation commune des scripts qui pilotent l'écran salarié (/poseur) : UN seul point à changer quand le menu du
// compte, l'éditeur d'intervention ou les messages changeront de forme (plan d'intégration du design salarié,
// étape 0 : docs/design-brief/audit-salarie/03-plan-integration.md §5.2). Aujourd'hui : le menu déroulant du nom en
// haut à droite, la fiche d'intervention (`.bt-ed`) et les messages de Sonner. Même comportement que les gestes
// écrits à la main avant ce fichier : mêmes sélecteurs, mêmes attentes (les durées sont passées en options).
//
// Chaque fonction prend la page Playwright en premier argument.

/**
 * Ouvre le menu du compte : le bouton de l'avatar. Ancienne interface : « Mon compte et menu » ; nouvelle (navigation d'octobre 2026) : « Mon compte »
 * (+ « , 2 à voir » quand il y a des rubriques à voir) : un seul sélecteur pour les deux. `menu` : attend le menu ; `attente` : pause (ms) ensuite.
 */
export async function ouvrirMenuCompte(p, { menu = false, attente = 0 } = {}) {
  await p.locator(BOUTON_MENU_COMPTE).click();
  if (menu) await p.waitForSelector('[role=menu]');
  if (attente) await p.waitForTimeout(attente);
}

const ONGLETS_BAS = { 'Ma journée': 'day', 'Ma semaine': 'week', 'Mon mois': 'month' };

/**
 * Va sur une vue par le menu du compte (« Ma semaine », « Historique », « Mes congés »…).
 * `menu` / `attente` : comme ouvrirMenuCompte (avant de choisir l'entrée) ; `apres` : pause (ms) une fois l'entrée touchée.
 */
export async function ouvrirVue(p, nom, { menu = false, attente = 0, apres = 0 } = {}) {
  // Nouvelle interface : Journée · Semaine · Mois sont dans la barre du bas, plus dans le menu du compte (doublon retiré) : même destination, un autre geste.
  const onglet = ONGLETS_BAS[nom];
  if (onglet && await p.locator('[data-testid=dz-onglets]').count()) {
    await p.locator(`[data-testid=dz-onglet-${onglet}]`).click();
    if (apres) await p.waitForTimeout(apres);
    return;
  }
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
export const BOUTON_MENU_COMPTE = 'button[aria-label^="Mon compte"]';
