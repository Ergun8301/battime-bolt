// Lot 7 sécurité — captures de la PREUVE (aucun écran ne change dans ce lot).
// Lance le test PGlite (supabase/tests/lot7_invitation_entreprise.mjs, Postgres
// jetable, jamais une vraie base), met son compte rendu en page et le
// photographie :
//   1-avant-faille.png  : fonctions de PRODUCTION, chaque attaque qui marche
//                         aujourd'hui en rouge « FAILLE PROUVÉE » ;
//   2-apres-corrige.png : migration appliquée, les mêmes attaques échouent en
//                         vert « corrigé », les parcours normaux marchent.
//
// Lancer (PGlite installé comme pour le test, voir son en-tête) :
//   PGLITE_DIR=/tmp/pglite-test node scripts/tests/captures-lot7.mjs docs/captures-lot7
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [,, SH = 'docs/captures-lot7'] = process.argv;
fs.mkdirSync(SH, { recursive: true });

// ── Le test, et son compte rendu découpé par section ─────────────────────────
const run = spawnSync(process.execPath, [path.join(root, 'supabase', 'tests', 'lot7_invitation_entreprise.mjs')], { encoding: 'utf8', env: process.env });
if (run.status !== 0) {
  console.error(run.stdout, run.stderr);
  console.error('Le test a échoué : pas de capture.');
  process.exit(1);
}
const sections = [];
let summary = '';
for (const raw of run.stdout.split('\n')) {
  const head = /^═══ (.+) ═══$/.exec(raw);
  if (head) { sections.push({ title: head[1], lines: [] }); continue; }
  const m = /^(ok|ÉCHEC) — (?:(FAILLE PROUVÉE|corrigé|parcours normal) — )?(.*)$/.exec(raw);
  const cur = sections[sections.length - 1];
  if (m && cur) { cur.lines.push({ ok: m[1] === 'ok', tag: m[2] || '', text: m[3], details: [] }); continue; }
  if (/^ {3}\S/.test(raw) && cur?.lines.length) { cur.lines[cur.lines.length - 1].details.push(raw.trim()); continue; }
  const sum = /^(\d+) ok, (\d+) échec/.exec(raw);
  if (sum) summary = `test complet : ${sum[1]} vérifications réussies, ${sum[2]} échec`;
}
const find = (prefix) => sections.find((s) => s.title.startsWith(prefix)) || { title: prefix, lines: [] };
const avant = find('AVANT');
const apres = find('APRÈS');
const sans4 = find('SANS BLOC 4');
const others = sections.filter((s) => ![avant, apres, sans4].includes(s) && s.lines.length);

// ── Mise en page ─────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const BADGE = {
  'FAILLE PROUVÉE': ['faille', 'FAILLE PROUVÉE'],
  'corrigé': ['corrige', 'corrigé'],
  'parcours normal': ['normal', 'parcours normal'],
  '': ['verifie', 'vérifié'],
};
const row = (l) => {
  const [cls, label] = l.ok ? BADGE[l.tag] : ['echec', 'ÉCHEC'];
  return `<li class="${cls}"><span class="badge">${esc(label)}</span><span class="txt">${esc(l.text)}${
    l.details.map((d) => `<code>${esc(d)}</code>`).join('')}</span></li>`;
};
const list = (lines) => `<ul>${lines.map(row).join('')}</ul>`;
const page = (tone, title, lead, body) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  :root { --rouge: #b42318; --rouge-fond: #fef3f2; --vert: #067647; --vert-fond: #ecfdf3; --gris: #475467; --trait: #e4e7ec; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f2f4f7; font: 15px/1.45 "DejaVu Sans", system-ui, sans-serif; color: #101828; }
  main { width: 1040px; margin: 0 auto; padding: 28px 32px 24px; }
  header { border-left: 8px solid var(--${tone}); background: var(--${tone}-fond); padding: 16px 20px; border-radius: 8px; }
  h1 { margin: 0 0 6px; font-size: 24px; color: var(--${tone}); }
  header p { margin: 0; color: #344054; }
  h2 { font-size: 16px; margin: 22px 0 8px; color: var(--gris); text-transform: uppercase; letter-spacing: .04em; }
  ul { list-style: none; margin: 0; padding: 0; background: #fff; border: 1px solid var(--trait); border-radius: 8px; }
  li { display: flex; gap: 12px; align-items: flex-start; padding: 9px 14px; border-top: 1px solid var(--trait); }
  li:first-child { border-top: 0; }
  .badge { flex: 0 0 auto; min-width: 136px; text-align: center; font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: 999px; margin-top: 1px; }
  .faille .badge { background: var(--rouge); color: #fff; }
  .corrige .badge { background: var(--vert); color: #fff; }
  .normal .badge { background: var(--vert-fond); color: var(--vert); border: 1px solid #abefc6; }
  .verifie .badge { background: #f2f4f7; color: var(--gris); border: 1px solid var(--trait); }
  .echec .badge { background: #101828; color: #fff; }
  .faille .txt { color: #7a271a; }
  code { display: block; margin-top: 4px; font: 12px/1.4 "DejaVu Sans Mono", monospace; color: var(--gris); word-break: break-all; }
  footer { margin-top: 16px; color: var(--gris); font-size: 13px; }
</style></head><body><main><header><h1>${esc(title)}</h1><p>${lead}</p></header>${body}
<footer>Lot 7 sécurité · supabase/tests/lot7_invitation_entreprise.mjs (npm run test:invitation-entreprise) · Postgres jetable (PGlite), aucune vraie base · ${esc(summary)}</footer>
</main></body></html>`;

const count = (s) => `${s.lines.filter((l) => l.ok).length}/${s.lines.length}`;
const html1 = page('rouge', 'AVANT — la faille, sur les fonctions de production',
  'Les fonctions de production (lues le 10/10/2026, recopiées mot pour mot : mêmes md5), rejouées avec la règle d’accès et les droits de production. '
  + 'Chaque ligne rouge est une attaque qui <b>marche aujourd’hui</b> : une entreprise capte le salarié qu’une autre invite.',
  `<h2>Ce que le test prouve</h2>${list(avant.lines)}`);
const html2 = page('vert', 'APRÈS — migration lot 7 sécurité : corrigé',
  'Même base, migration appliquée telle quelle. L’invité rejoint l’entreprise qui l’a <b>invité</b>, et aucune autre : '
  + 'les attaques échouent (« corrigé »), les parcours normaux marchent (« parcours normal »).',
  `<h2>Ce que le test prouve (dans l’ordre du test)</h2>${list(apres.lines)}`
  + `<h2>Pourquoi le bloc 4 (écriture côté serveur seulement) est obligatoire</h2>${list(sans4.lines)}`
  + `<h2>Aussi vérifié</h2><ul>${others.map((s) => `<li class="verifie"><span class="badge">${esc(count(s))}</span><span class="txt">${esc(s.title)}</span></li>`).join('')}</ul>`);

// ── Photos ───────────────────────────────────────────────────────────────────
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1040, height: 300 }, deviceScaleFactor: 2, locale: 'fr-FR' });
const p = await ctx.newPage();
await p.route('**/*', (r) => (r.request().url().startsWith('data:') ? r.continue() : r.abort()));
for (const [file, html] of [['1-avant-faille.png', html1], ['2-apres-corrige.png', html2]]) {
  await p.setContent(html, { waitUntil: 'load' });
  await p.screenshot({ path: path.join(SH, file), fullPage: true });
  console.log(`  ${path.join(SH, file)}`);
}
await b.close();
const failles = avant.lines.filter((l) => l.ok && l.tag === 'FAILLE PROUVÉE').length;
const corriges = apres.lines.filter((l) => l.ok).length;
console.log(`${failles} failles prouvées avant, ${corriges}/${apres.lines.length} lignes vertes après · ${summary}`);
if (!failles || corriges !== apres.lines.length) process.exit(1);
