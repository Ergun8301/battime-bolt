// Lot 7 — l'aide de l'Assistant reste VRAIE : chaque libellé cité entre « »
// dans les guides (bureau et salarié) doit exister dans le code des écrans.
// Si un bouton est renommé, ce test casse : on met l'aide à jour en même temps.
//   npm run test:assistant-aide
import { GUIDE, NAV_ACTIONS } from './assistant-actions-core.ts';
import { WORKER_GUIDE, WORKER_NAV } from './worker-assistant-core.ts';

const ROOTS = ['app', 'components'];
async function source(): Promise<string> {
  let all = '';
  const walk = async (dir: string) => {
    for await (const e of Deno.readDir(dir)) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory) await walk(p);
      else if (/\.(tsx|ts)$/.test(e.name)) all += `${await Deno.readTextFile(p)}\n`;
    }
  };
  for (const r of ROOTS) await walk(r);
  return all;
}
const N = (t: string) => t.replace(/&apos;/g, "'").replace(/[’]/g, "'").replace(/&nbsp;| /g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').toLowerCase();
const quoted = (t: string) => Array.from(t.matchAll(/«\s*([^»]+?)\s*»/g)).map((m) => m[1]);

// Ce qui est cité mais n'est pas un bouton (exemples de phrases, cases) :
const NOT_LABELS = new Set(['S-NN', 'Où sont mes collègues ?', 'Où est Paul demain ?', 'Autre']);

Deno.test('Aide : chaque libellé cité existe dans l’interface', async () => {
  const src = N(await source());
  const missing: string[] = [];
  for (const g of [...GUIDE, ...WORKER_GUIDE]) {
    for (const step of [g.titre, ...g.etapes]) {
      for (const label of quoted(step)) {
        if (NOT_LABELS.has(label)) continue;
        if (!src.includes(N(label))) missing.push(`${g.titre} → « ${label} »`);
      }
    }
  }
  if (missing.length) throw new Error(`Libellés introuvables dans le code :\n${missing.join('\n')}`);
});

Deno.test('Aide : couverture — au moins 45 fiches bureau, 25 salarié, 3 étapes au plus', () => {
  if (GUIDE.length < 45) throw new Error(`bureau : ${GUIDE.length} fiches`);
  if (WORKER_GUIDE.length < 25) throw new Error(`salarié : ${WORKER_GUIDE.length} fiches`);
  for (const g of [...GUIDE, ...WORKER_GUIDE]) if (g.etapes.length > 3 || !g.etapes.length) throw new Error(`${g.titre} : ${g.etapes.length} étapes`);
  for (const g of GUIDE) if (g.lien && !(g.lien in NAV_ACTIONS)) throw new Error(`${g.titre} : lien inconnu ${g.lien}`);
  for (const g of WORKER_GUIDE) if (g.lien && !(g.lien in WORKER_NAV)) throw new Error(`${g.titre} : lien inconnu ${g.lien}`);
});
