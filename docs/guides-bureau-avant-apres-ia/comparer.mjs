// Compare les sorties d'avant et d'après (npm run test:guides-bureau garde les mêmes verrous en test).
//   node docs/guides-bureau-avant-apres-ia/comparer.mjs
import { readFileSync } from 'node:fs';
const lire = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const liens = (v) => JSON.stringify(v?.links?.map((l) => l.action));

const la = lire('local-avant.json'), lb = lire('local-apres.json');
const local = Object.keys(la).filter((k) => JSON.stringify(la[k]) !== JSON.stringify(lb[k]));
console.log(`Voie locale (44 phrases sans fichier) : ${local.length} sortie(s) changée(s)`);
for (const k of local) console.log(`  ${k} : ${liens(la[k])} -> ${liens(lb[k])}`);

const ma = lire('modele-avant.json'), mb = lire('modele-apres.json');
const modele = [];
for (const k of Object.keys(ma).filter((x) => x !== '_count')) for (const v of Object.keys(ma[k])) {
  if (JSON.stringify(ma[k][v]) !== JSON.stringify(mb[k][v])) modele.push(`  ${k}/${v} : ${liens(ma[k][v])} -> ${liens(mb[k][v])}`);
}
console.log(`Voie modèle (47 phrases bureau x 3 réponses) : ${modele.length} sortie(s) changée(s)\n${modele.join('\n')}`);

const ba = lire('banc-avant.json'), bb = lire('banc-apres.json');
console.log(`Banc d'évaluation sans IA : ${JSON.stringify(ba) === JSON.stringify(bb) ? 'identique' : 'DIFFÉRENT'} (${bb.ok}/${bb.total}, parCas et catégories compris)`);
