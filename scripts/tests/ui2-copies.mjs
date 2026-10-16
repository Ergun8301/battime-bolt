// Rejeu des scripts navigateur de « Ma journée » en /poseur?ui=2 (étape 5 du design salarié : feuilles).
//   node scripts/tests/ui2-copies.mjs                 écrit scripts/tests/ui2-<nom>.mjs pour chaque script de la liste
//   node scripts/tests/ui2-copies.mjs pause-lot3bis   n'en écrit qu'un
//   node scripts/tests/ui2-pause-lot3bis.mjs out <dossier-de-captures-hors-dépôt> <port>
// Les ORIGINAUX ne sont jamais modifiés : la copie est l'original mot pour mot, plus (1) l'adresse /poseur devient /poseur?ui=2 (le drapeau est mémorisé
// pour la session de l'onglet, `?ui=1` l'éteint) et (2) la table ADAPTATIONS ci-dessous : chaque ligne dit CE QUI CHANGE à l'écran avec ?ui=2 et ce que la copie attend à la place.
// Une adaptation ne cache jamais une fonction qui disparaît : elle suit un libellé ou un repère qui change de forme (décision écrite dans la ligne).
// Les copies (`scripts/tests/ui2-*.mjs`) sont ignorées par git : on les régénère, la table fait foi.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const DOSSIER = path.dirname(fileURLToPath(import.meta.url));

/** nom → liste de [ancien texte (chaîne ou RegExp), nouveau texte, raison]. */
export const ADAPTATIONS = {
  'pause-lot3bis': [
    ['boxes.every((x) => x.width >= 60)', 'boxes.every((x) => x.width >= 43.5)',
      'P1 : les 8 puces de la fiche gardent 2 rangées de 4, mais ne sont plus 4 cellules égales de 60 px au moins : ce sont des puces de largeur naturelle (planche E21), 44 px au minimum (cible tactile)'],
    ["body.includes('pause 1 h 15') && !body.includes('pause 75min')", "!body.includes('pause 75min')",
      'P14 : la Semaine v2 (E25) ne liste plus les lignes une à une (7 lignes de jour), donc plus de « pause 1 h 15 » par ligne ; la pause reste dite dans la Journée (« 1:15 », contrôle P14 précédent) et l’ancien « 75min » n’apparaît nulle part'],
  ],
  'pointage-lot10': [],
  'heures-lot1': [],
  'heures-sures': [],
  'brouillons-lot2': [],
  'documents-lot24': [],
  'salarie-lot12': [],
  'chantier-termine-lot23': [
    ["await p.locator('.bt-site').count() === 0 && /Aucun chantier trouvé/", "await p.locator('.bt-site:not(.other)').count() === 0 && /Aucun chantier trouvé/",
      'G2 : « Autre chantier » reste proposé même sans résultat (planche E22b) ; le chantier terminé, lui, n’apparaît toujours pas'],
    ['/Tu es pointé depuis/i.test(lt)', '/pointage en cours · depuis/i.test(lt)',
      'G3 : la carte de pointage de la planche dit « POINTAGE EN COURS · DEPUIS hh:mm » (E05) à la place de « Tu es pointé depuis »'],
    ["wk.includes('Maison Martin') && /Terminé le/.test(wk)", "wk.includes('Maison Martin') && await p.locator('.dz-sem-jour').count() === 7",
      'G4 : la Semaine v2 (E25) est 7 lignes de jour qui nomment toujours le chantier ; « Terminé le … » se lit dans la Journée et l’Historique (contrôles G3 et G4 Historique, inchangés)'],
    ["await p.locator('div.flex.items-center.justify-between button:has(svg.lucide-chevron-left)').first().click();", "await p.locator('[aria-label=\"Semaine précédente\"]').first().click();",
      'G9 : la flèche de la Semaine v2 garde son nom (aria-label « Semaine précédente ») ; le balisage d’avant (div.flex + icône) n’existe plus'],
    ["await p.locator('p.font-semibold', { hasText: frLabel(d) }).first().click();", "await p.locator(`.dz-sem-jour[aria-label^=\"${frLabel(d)}\"]`).first().click();",
      'G9 : la ligne du jour de la Semaine v2 est repérée par son aria-label (le jour en toutes lettres), plus par un <p> gras'],
  ],
  'fenetres-lot11': [],
  'reserves-lot11': [],
  'formations-lot6': [
    ["=== '2 2 formations à voir ›'", "=== '2 formations à voir ›'", 'la pastille chiffrée du bandeau n’est plus dite (puce de rappel de la planche, E05) ; le nombre reste dans le texte'],
    ["=== '1 1 formation à voir ›'", "=== '1 formation à voir ›'", 'idem, au singulier'],
    ["(await txt(m)) === 'Formations 2'", "(await txt(m)) === 'Formations à voir 2'", 'le menu Plus (E26) nomme l’entrée « Formations à voir », avec son compteur'],
    ["wp.url().endsWith('/poseur')", "wp.url().endsWith('/poseur?ui=2')", 'l’adresse garde son ?ui=2 (le drapeau est lu dans l’adresse au chargement)'],
  ],
};

const g = (s) => s.replace(/\/poseur(?=`)/g, '/poseur?ui=2').replace(/\/poseur\?a=/g, '/poseur?ui=2&a=');

const noms = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ADAPTATIONS);
for (const nom of noms) {
  if (!(nom in ADAPTATIONS)) { console.error(`inconnu : ${nom}`); process.exit(2); }
  let s = g(fs.readFileSync(path.join(DOSSIER, `${nom}.mjs`), 'utf8'));
  for (const [avant, apres, raison] of ADAPTATIONS[nom]) {
    const n = typeof avant === 'string' ? s.split(avant).length - 1 : (s.match(avant) || []).length;
    if (!n) { console.error(`${nom} : adaptation sans effet (${raison}) : ${String(avant).slice(0, 80)}`); process.exit(3); }
    s = typeof avant === 'string' ? s.split(avant).join(apres) : s.replace(avant, apres);
  }
  const entete = `// COPIE GÉNÉRÉE par scripts/tests/ui2-copies.mjs depuis ${nom}.mjs : /poseur?ui=2 + adaptations de la table ADAPTATIONS. Ne pas modifier à la main.\n`;
  fs.writeFileSync(path.join(DOSSIER, `ui2-${nom}.mjs`), entete + s);
  console.log(`ui2-${nom}.mjs (${ADAPTATIONS[nom].length} adaptation(s))`);
}
