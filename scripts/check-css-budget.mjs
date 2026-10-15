// Budget CSS des pages salarié (étape 0 du plan d'intégration du nouveau design salarié).
//
// Le budget « First Load JS » (check-bundle-budget.mjs) ne voit PAS le CSS : jusqu'ici celui de
// l'écran salarié était écrit dans le TSX (donc compté en JavaScript). Dès qu'il passe en fichiers
// .css (étape 1), il bloque le rendu sans être compté nulle part : ce script le mesure.
//
//   npm run build && npm run budget:css          (lit le dossier out/ de l'export statique)
//   node scripts/check-css-budget.mjs <dossier-out>
//
// Pour chaque route de `css.routes` dans scripts/bundle-budgets.json, on lit la page exportée
// (out/poseur.html), on relève ses <link rel="stylesheet"> servis par Next (/_next/static/css/…)
// et on additionne leur taille compressée (gzip niveau 9, en kB de 1 000 octets, comme le reste).
// Les feuilles publiques (/fonts/fonts.css, /cookies/…) sont hors mesure : elles ne bougent pas.
// Code de sortie : 0 tout est tenu, 1 un budget est dépassé ou une page est illisible, 2 usage.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CROISSANCE_MAX = 4; // kB : au-delà de la mesure, avertissement « à justifier puis à reporter ici »

/** Les feuilles Next (/_next/static/css/xxx.css) d'une page exportée, dans l'ordre du document. */
export function feuillesDe(html) {
  const out = [];
  for (const m of String(html).matchAll(/<link\b[^>]*>/g)) {
    const tag = m[0];
    if (!/rel="stylesheet"/.test(tag)) continue;
    const href = /href="([^"]+)"/.exec(tag)?.[1];
    if (href && href.startsWith('/_next/static/css/')) out.push(href);
  }
  return out;
}

/** Taille gzip (niveau 9) et brute d'une feuille, en kB. */
export function poidsDe(buf) {
  return { gz: zlib.gzipSync(buf, { level: 9 }).length / 1000, brut: buf.length / 1000 };
}

/** Mesure une route dans le dossier d'export : { gz, brut, feuilles } ou lève une erreur lisible. */
export function mesure(route, out) {
  const page = path.join(out, `${route === '/' ? 'index' : route.slice(1)}.html`);
  if (!fs.existsSync(page)) throw new Error(`page exportée introuvable : ${page} (le build a-t-il été fait ?)`);
  const feuilles = feuillesDe(fs.readFileSync(page, 'utf8'));
  let gz = 0; let brut = 0;
  for (const f of feuilles) {
    const fichier = path.join(out, f);
    if (!fs.existsSync(fichier)) throw new Error(`feuille introuvable : ${fichier}`);
    const p = poidsDe(fs.readFileSync(fichier));
    gz += p.gz; brut += p.brut;
  }
  return { gz, brut, feuilles };
}

/** Compare les mesures aux budgets : { ok, lignes, erreurs, avertissements }. */
export function check(mesures, budgets) {
  const routes = budgets.css?.routes ?? {};
  const erreurs = []; const avertissements = []; const lignes = [];
  if (!Object.keys(routes).length) erreurs.push('aucune route dans « css.routes » de scripts/bundle-budgets.json');
  for (const [route, b] of Object.entries(routes)) {
    const m = mesures[route];
    if (!m) { erreurs.push(`${route} : pas de mesure`); continue; }
    const ligne = { route, gz: m.gz, brut: m.brut, max: b.max, mesure: b.mesure, statut: 'OK', note: '' };
    if (m.gz > b.max) {
      ligne.statut = 'DÉPASSE'; ligne.note = `${(m.gz - b.max).toFixed(1)} kB au-dessus du budget`;
      erreurs.push(`${route} : CSS ${m.gz.toFixed(1)} kB gzip pour un budget de ${b.max} kB (${ligne.note})`);
    } else if (b.mesure !== undefined && m.gz - b.mesure > CROISSANCE_MAX) {
      ligne.statut = 'AVERT.'; ligne.note = `+${(m.gz - b.mesure).toFixed(1)} kB depuis la mesure (${b.mesure}) : à justifier puis à reporter`;
      avertissements.push(`${route} : ${ligne.note}`);
    }
    lignes.push(ligne);
  }
  return { ok: erreurs.length === 0, lignes, erreurs, avertissements };
}

export function report(r) {
  const out = ['Poids du CSS du premier chargement (feuilles Next de la page, gzip niveau 9)', ''];
  for (const l of r.lignes) {
    out.push(`${l.statut.padEnd(7)} ${l.route.padEnd(12)} ${l.gz.toFixed(1).padStart(6)} kB gzip (${l.brut.toFixed(1)} kB brut)  max ${l.max} kB${l.mesure !== undefined ? `  mesure ${l.mesure}` : ''}${l.note ? `  — ${l.note}` : ''}`);
  }
  for (const a of r.avertissements) out.push(`avertissement : ${a}`);
  for (const e of r.erreurs) out.push(`ERREUR : ${e}`);
  out.push('', r.ok ? 'Tous les budgets CSS sont tenus.' : 'Un budget CSS est dépassé.');
  return out.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const out = path.resolve(process.argv[2] ?? path.join(ROOT, 'out'));
  const budgets = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'bundle-budgets.json'), 'utf8'));
  const mesures = {};
  try {
    for (const route of Object.keys(budgets.css?.routes ?? {})) mesures[route] = mesure(route, out);
  } catch (e) { console.error(`ERREUR : ${e.message}`); process.exit(1); }
  const r = check(mesures, budgets);
  console.log(report(r));
  process.exit(r.ok ? 0 : 1);
}
