// Compare deux dossiers de captures PNG, pixel à pixel, tolérance NULLE par défaut.
//
//   node scripts/tests/comparer-captures.mjs <dossier-reference> <dossier-apres> [tolerance-par-canal=0]
//
// Deux fichiers identiques à l'octet sont identiques ; sinon les deux images sont décodées
// par le navigateur (canvas) et chaque pixel est comparé canal par canal. Sortie : une ligne
// par capture (IDENTIQUE / DIFFÉRENTE avec le nombre de pixels qui changent / ABSENTE),
// puis le total. Code de sortie 1 s'il y a la moindre différence ou capture absente.
import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, REF, APRES, TOL = '0'] = process.argv;
if (!REF || !APRES) { console.error('usage : comparer-captures.mjs <dossier-reference> <dossier-apres> [tolerance]'); process.exit(2); }
const noms = fs.readdirSync(REF).filter((f) => f.endsWith('.png')).sort();
if (!noms.length) { console.error(`aucune capture PNG dans ${REF}`); process.exit(2); }

let browser; let page;
async function pixels(a, b) {
  if (!browser) {
    browser = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    page = await browser.newPage();
  }
  return page.evaluate(async ([ua, ub, tol]) => {
    const load = (b64) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = `data:image/png;base64,${b64}`; });
    const [ia, ib] = await Promise.all([load(ua), load(ub)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { taille: [ia.width, ia.height, ib.width, ib.height] };
    const data = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height).data; };
    const da = data(ia), db = data(ib); let diff = 0; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0; i < da.length; i += 4) {
      if (Math.abs(da[i] - db[i]) > tol || Math.abs(da[i + 1] - db[i + 1]) > tol || Math.abs(da[i + 2] - db[i + 2]) > tol || Math.abs(da[i + 3] - db[i + 3]) > tol) {
        diff++; const px = (i / 4) % ia.width, py = Math.floor(i / 4 / ia.width);
        x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
      }
    }
    return { diff, total: ia.width * ia.height, zone: diff ? [x0, y0, x1, y1] : null };
  }, [fs.readFileSync(a).toString('base64'), fs.readFileSync(b).toString('base64'), Number(TOL)]);
}

let identiques = 0; let ko = 0;
for (const nom of noms) {
  const a = path.join(REF, nom); const b = path.join(APRES, nom);
  if (!fs.existsSync(b)) { ko++; console.log(`❌ ${nom} : ABSENTE de ${APRES}`); continue; }
  if (fs.readFileSync(a).equals(fs.readFileSync(b))) { identiques++; console.log(`✅ ${nom} : IDENTIQUE (octet pour octet)`); continue; }
  const r = await pixels(a, b);
  if (r.taille) { ko++; console.log(`❌ ${nom} : tailles différentes ${r.taille.join(' ')}`); }
  else if (r.diff === 0) { identiques++; console.log(`✅ ${nom} : IDENTIQUE (0 pixel sur ${r.total}, fichiers différents)`); }
  else { ko++; console.log(`❌ ${nom} : DIFFÉRENTE, ${r.diff} pixel(s) sur ${r.total} dans le rectangle x ${r.zone[0]}–${r.zone[2]}, y ${r.zone[1]}–${r.zone[3]} (tolérance ${TOL})`); }
}
if (browser) await browser.close();
console.log(`\n${identiques} identique(s) / ${ko} différente(s) ou absente(s) sur ${noms.length} (tolérance ${TOL} par canal)`);
process.exit(ko ? 1 : 0);
