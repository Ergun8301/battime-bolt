// Contrôle de l'historique des migrations, PAR NOM (lot 0).
//
// Les numéros de version de la production ne correspondent jamais à ceux des
// fichiers (fichiers collés dans l'éditeur SQL, ou appliqués sous un autre
// horodatage) : on compare donc le NOM de chaque fichier de supabase/migrations
// avec les noms inscrits en production. Jamais de « supabase db push ».
//
//   1. En production (éditeur SQL ou outil Supabase), lire l'historique :
//        SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
//      et l'enregistrer dans un fichier (JSON, CSV ou texte « version nom »).
//   2. npm run check:migrations -- <fichier>     (ou « - » pour lire l'entrée standard)
//
// Résultat : ce qui reste À APPLIQUER, ce qui est inscrit sans fichier, et les
// écarts anciens connus (supabase/migrations-historique.json). Code de sortie 1
// s'il reste un fichier à appliquer ou une inscription inconnue.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SQL_HISTORIQUE = 'SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;';

// « 20261011090000_lot0_fermeture.sql » → { version, name, file }
export function parseFileName(file) {
  const m = /^(\d{14})_(.+)\.sql$/.exec(file);
  return m ? { version: m[1], name: m[2], file } : null;
}

// Accepte la sortie de l'outil Supabase ({ migrations: [...] }), un tableau JSON
// de lignes, un CSV « version,name » ou du texte « version nom » / « nom ».
export function parseHistory(text) {
  const t = text.trim();
  if (!t) return [];
  if (t.startsWith('{') || t.startsWith('[')) {
    const data = JSON.parse(t);
    const rows = Array.isArray(data) ? data : Array.isArray(data.migrations) ? data.migrations : [];
    return rows.filter((r) => r && typeof r.name === 'string').map((r) => ({ version: String(r.version ?? ''), name: r.name.trim() }));
  }
  return t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split(/[\s,;|]+/).filter(Boolean))
    .filter((p) => p.length && !/^version$/i.test(p[0]))
    .map((p) => (p.length > 1 && /^\d+$/.test(p[0]) ? { version: p[0], name: p[1] } : { version: '', name: p[p.length - 1] }));
}

export function compare(files, prod, hist = {}) {
  const aliases = hist.inscrit_sous_un_autre_nom || {};
  const noRecord = hist.fichier_sans_inscription || {};
  const noFile = hist.inscription_sans_fichier || {};
  const prodNames = new Set(prod.map((r) => r.name));
  const counts = new Map();
  for (const r of prod) counts.set(r.name, (counts.get(r.name) || 0) + 1);
  const claimed = new Set();
  const out = { ok: [], alias: [], connusSansInscription: [], aAppliquer: [], connusSansFichier: [], inconnus: [], doublons: [] };

  for (const f of files) {
    if (prodNames.has(f.name)) { out.ok.push(f); claimed.add(f.name); continue; }
    const al = (aliases[f.name] || []).filter((n) => prodNames.has(n));
    if (al.length) { out.alias.push({ ...f, sous: al }); al.forEach((n) => claimed.add(n)); continue; }
    if (noRecord[f.name]) { out.connusSansInscription.push({ ...f, note: noRecord[f.name] }); continue; }
    out.aAppliquer.push(f);
  }
  for (const name of [...prodNames].sort()) {
    if (claimed.has(name)) continue;
    if (noFile[name]) out.connusSansFichier.push({ name, note: noFile[name] });
    else out.inconnus.push({ name });
  }
  for (const [name, n] of counts) if (n > 1) out.doublons.push({ name, n });
  return out;
}

export function report(r) {
  const L = [];
  L.push('Historique des migrations — comparaison par nom');
  L.push(`  ✅ ${r.ok.length} fichier(s) inscrit(s) sous leur nom`);
  if (r.alias.length) L.push(`  ↔  ${r.alias.length} inscrit(s) sous un autre nom (écart ancien connu)`);
  if (r.connusSansInscription.length) L.push(`  ·  ${r.connusSansInscription.length} fichier(s) ancien(s) sans inscription (connu)`);
  if (r.connusSansFichier.length) L.push(`  ·  ${r.connusSansFichier.length} inscription(s) ancienne(s) sans fichier (connu)`);
  if (r.doublons.length) L.push(`  ·  ${r.doublons.length} nom(s) inscrit(s) plusieurs fois (sans conséquence) : ${r.doublons.map((d) => d.name).join(', ')}`);
  L.push(`  ${r.aAppliquer.length ? '⏳' : '✅'} À APPLIQUER : ${r.aAppliquer.length}`);
  for (const f of r.aAppliquer) L.push(`     ${f.file}`);
  if (r.inconnus.length) {
    L.push(`  ⚠️ INSCRIT EN PRODUCTION SANS FICHIER : ${r.inconnus.length}`);
    for (const x of r.inconnus) L.push(`     ${x.name}`);
  }
  return L.join('\n');
}

export function loadFiles(dir = path.join(ROOT, 'supabase', 'migrations')) {
  return fs.readdirSync(dir).map(parseFileName).filter(Boolean).sort((a, b) => a.file.localeCompare(b.file));
}

export function loadHistorique(file = path.join(ROOT, 'supabase', 'migrations-historique.json')) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const src = process.argv[2];
  if (!src) {
    console.log(`Usage : npm run check:migrations -- <fichier | ->\n\nLire d'abord l'historique en production :\n  ${SQL_HISTORIQUE}`);
    process.exit(2);
  }
  const text = src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
  const r = compare(loadFiles(), parseHistory(text), loadHistorique());
  console.log(report(r));
  process.exit(r.aAppliquer.length || r.inconnus.length ? 1 : 0);
}
