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
  'pause-lot3bis': [],
  'pointage-lot10': [],
  'heures-lot1': [],
  'heures-sures': [],
  'brouillons-lot2': [],
  'documents-lot24': [],
  'salarie-lot12': [],
  'chantier-termine-lot23': [],
  'fenetres-lot11': [],
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
