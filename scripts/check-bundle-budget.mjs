// Budgets de poids des pages (lot 5 « site rapide 1 »).
//
// Lit le tableau de « next build » (colonne « First Load JS », JavaScript compressé que
// le téléphone télécharge au premier affichage) et échoue si une route dépasse son budget.
// Les budgets sont dans scripts/bundle-budgets.json : mesure du moment + une marge raisonnable.
//
//   npm run build 2>&1 | tee build.log
//   npm run budget -- build.log          (ou : npm run budget < build.log)
//
// Code de sortie : 0 tout est dans les budgets, 1 un budget est dépassé (ou le tableau est
// absent / incomplet), 2 usage ou fichier illisible.
//
// Quand une route grossit de plus de 10 kB par rapport à sa mesure, le script AVERTIT sans
// échouer : la croissance est à justifier dans la PR, puis à reporter dans bundle-budgets.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNITES = { B: 0.001, kB: 1, MB: 1000 }; // Next compte en base 1000
const REQUISES = ['/admin', '/poseur'];
const CROISSANCE_MAX = 10; // kB au-delà desquels une route doit être justifiée
// Une ligne de route : « ├ ○ /admin   273 kB   766 kB » (taille de la page, puis First Load JS).
const LIGNE = /^[┌├└│\s]*[○●ƒ◐λ ]?\s*(\/\S*)\s+([\d.]+)\s*(B|kB|MB)\s+([\d.]+)\s*(B|kB|MB)\s*$/;
const PARTAGE = /First Load JS shared by all\s+([\d.]+)\s*(B|kB|MB)/;
const IGNOREES = new Set(['/robots.txt', '/sitemap.xml']);

const enKo = (v, u) => Number(v) * UNITES[u];

/** Tableau de « next build » → { routes: { '/admin': 766, … } en kB, shared: 87.8 | null }. */
export function parseTable(text) {
  const routes = {};
  let shared = null;
  for (const brute of String(text).replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)) {
    const part = PARTAGE.exec(brute);
    if (part) { shared = enKo(part[1], part[2]); continue; }
    const m = LIGNE.exec(brute);
    if (m && !IGNOREES.has(m[1])) routes[m[1]] = enKo(m[4], m[5]); // 2ᵉ valeur = First Load JS
  }
  return { routes, shared };
}

export function loadBudgets(file = path.join(ROOT, 'scripts', 'bundle-budgets.json')) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Le budget d'une route : le sien, sinon celui de son groupe (« /apercu/* »), sinon le plafond par défaut. */
function budgetDe(route, budgets) {
  const propre = budgets.routes?.[route];
  if (propre) return { ...propre, propre: true };
  for (const [motif, b] of Object.entries(budgets.groupes ?? {})) {
    if (motif.endsWith('/*') && route.startsWith(motif.slice(0, -1))) return { ...b, propre: true, groupe: motif };
  }
  return { max: budgets.default ?? 150, propre: false };
}

/** Compare le tableau aux budgets. `ok` est faux dès qu'il y a une erreur. */
export function check(table, budgets) {
  const erreurs = [];
  const avertissements = [];
  const lignes = [];
  const noms = Object.keys(table.routes).sort();
  if (noms.length === 0) erreurs.push("aucun tableau « Route (app) » trouvé dans le journal du build (le build a-t-il échoué ?)");
  for (const r of REQUISES) {
    if (noms.length && !(r in table.routes)) erreurs.push(`la route ${r} est absente du tableau : impossible de la contrôler`);
  }
  for (const route of noms) {
    const taille = table.routes[route];
    const b = budgetDe(route, budgets);
    const ligne = { route, taille, max: b.max, mesure: b.mesure, objectif: b.objectif, statut: 'OK', note: '' };
    if (!b.propre) {
      ligne.statut = 'AVERT.';
      ligne.note = 'route sans budget propre : ajoutez-la à scripts/bundle-budgets.json';
      avertissements.push(`${route} : ${ligne.note}`);
    }
    if (taille > b.max) {
      ligne.statut = 'DÉPASSE';
      ligne.note = `${(taille - b.max).toFixed(1)} kB au-dessus du budget`;
      erreurs.push(`${route} : ${taille.toFixed(1)} kB pour un budget de ${b.max} kB (${ligne.note})`);
    } else if (b.mesure !== undefined && taille - b.mesure > CROISSANCE_MAX) {
      ligne.statut = 'AVERT.';
      ligne.note = `croissance de ${(taille - b.mesure).toFixed(1)} kB : à justifier dans la PR et à reporter dans bundle-budgets.json`;
      avertissements.push(`${route} : ${ligne.note}`);
    }
    lignes.push(ligne);
  }
  const partage = budgets.shared;
  if (table.shared !== null && partage) {
    if (table.shared > partage.max) erreurs.push(`JavaScript partagé : ${table.shared.toFixed(1)} kB pour un budget de ${partage.max} kB`);
    else if (partage.mesure !== undefined && table.shared - partage.mesure > CROISSANCE_MAX) {
      avertissements.push(`JavaScript partagé : croissance de ${(table.shared - partage.mesure).toFixed(1)} kB : à justifier dans la PR et à reporter dans bundle-budgets.json`);
    }
  } else if (noms.length && table.shared === null) {
    avertissements.push('ligne « First Load JS shared by all » introuvable : le partagé n\'est pas contrôlé');
  }
  return { ok: erreurs.length === 0, lignes, shared: table.shared, budgetPartage: partage, erreurs, avertissements };
}

const kb = (v) => `${v.toFixed(1)} kB`;

export function report(res) {
  const out = ['Poids du JavaScript du premier chargement (First Load JS, compressé)', ''];
  const large = Math.max(8, ...res.lignes.map((l) => l.route.length));
  for (const l of res.lignes) {
    const obj = l.objectif !== undefined ? `  objectif ${l.objectif} kB${l.taille <= l.objectif ? ' atteint' : ` (encore ${(l.taille - l.objectif).toFixed(1)} kB)`}` : '';
    out.push(`${l.statut.padEnd(7)} ${l.route.padEnd(large)}  ${kb(l.taille).padStart(9)}  max ${String(l.max).padStart(3)} kB${obj}${l.note ? `  — ${l.note}` : ''}`);
  }
  if (res.shared !== null && res.budgetPartage) {
    out.push('', `${res.shared > res.budgetPartage.max ? 'DÉPASSE' : 'OK     '} partagé par toutes les pages  ${kb(res.shared).padStart(9)}  max ${res.budgetPartage.max} kB`);
  }
  if (res.avertissements.length) out.push('', 'AVERTISSEMENTS', ...res.avertissements.map((a) => `  - ${a}`));
  if (res.erreurs.length) out.push('', 'BUDGET NON TENU', ...res.erreurs.map((e) => `  - ${e}`));
  else out.push('', 'Tous les budgets sont tenus.');
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const src = process.argv[2];
  if (!src && process.stdin.isTTY) {
    console.log('Usage : npm run budget -- <journal-du-build>\n\n  npm run build 2>&1 | tee build.log\n  npm run budget -- build.log');
    process.exit(2);
  }
  let text;
  try {
    // Sous « npm run », le dossier courant est la racine du dépôt : un chemin relatif se lit
    // depuis le dossier où la commande a été tapée (INIT_CWD).
    text = src ? fs.readFileSync(path.resolve(process.env.INIT_CWD || process.cwd(), src), 'utf8') : fs.readFileSync(0, 'utf8');
  } catch (e) {
    console.error(`Lecture impossible : ${e.message}`);
    process.exit(2);
  }
  const res = check(parseTable(text), loadBudgets());
  console.log(report(res));
  process.exit(res.ok ? 0 : 1);
}
