// Lancer (après npm run build), depuis la racine du dépôt :
//   node scripts/tests/reglages-lot11.mjs out docs/captures-lot11 [port]
// Lot 11 — item 10 : « Supprime tous les textes d'explication sous les listes déroulantes et sous les
// réglages : une ligne courte maximum, le détail dans une infobulle ⓘ au survol. »
// Sur la VRAIE page /admin (base simulée, aucune écriture réelle), Réglages de l'entreprise :
//  1) chaque ⓘ s'ouvre au SURVOL (souris), au CLIC (sans survol préalable) et au TOUCHER (téléphone),
//     montre un texte, tient dans l'écran, et n'est jamais DANS un libellé ni dans un autre bouton ;
//  2) chaque libellé d'origine (lu dans la source au commit cca24c8) est toujours là, texte exact ;
//  3) plus aucun paragraphe d'explication de plus de ~90 caractères sous un réglage — sauf le bloc
//     légal avant « Endroit au pointage », qui reste ENTIER (obligation, pas explication) ;
//  4) borne : une ligne + ⓘ, bouton « Relier la tablette » → même fenêtre des bornes ;
//  5) la feuille de style des réglages n'est jamais réécrite (objet figé, règle du lot 10) ;
//  6) rien ne déborde en largeur à 1280, 1024 et 390 ; aucune écriture.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const [,, OUT = 'out', SH = 'docs/captures-lot11', PORT = '0'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const BASE_COMMIT = 'cca24c82d3f4acd5cf82b9bb85bc80d401ceaa6a';
const MAX_LINE = 90;

// ─── Inventaire extrait du code d'ORIGINE (comme reglages-lot10) ───────────────
const src = (f) => execFileSync('git', ['show', `${BASE_COMMIT}:${f}`], { encoding: 'utf8' });
const ORIG = src('components/company-settings.tsx') + src('components/leave-fund-setting.tsx') + src('components/support-access.tsx');
const dec = (s) => s.replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ').trim();
const LABELS = [...new Set([...ORIG.matchAll(/<label className="(?:bt-set-l|sa-l)">([^<{]+)<\/label>/g)].map((m) => dec(m[1])))];
// Réglages qui ont une explication : chacun doit avoir son ⓘ (et une ligne courte au plus).
const TIPS = ['abonnement', 'horaire', 'majoration', 'route', 'comptable', 'caisse', 'borne', 'endroit', 'collegues', 'relance', 'budget', 'emails', 'support'];

// ─── Serveur statique + base simulée (celle de reglages-lot10 : tout est visible) ───
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const URL0 = `http://localhost:${srv.address().port}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const CO = 'c0000000-0000-0000-0000-000000000001';
const u = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@x.fr`, is_active: true, created_at: '2026-01-01' });
const D = {
  users: [u('u-admin', 'Paul', 'Martin', 'admin'), u('u-kevin', 'Kevin', 'Roussel')],
  companies: [{
    id: CO, name: 'K Habitat', siret: '123 456 789 00012', tva_intra: '', address: '12 rue des Artisans', postal_code: '13100', city: 'Aix-en-Provence',
    phone: '', email: 'contact@khabitat.fr', logo_url: '', subscription_status: 'active', trial_ends_at: '2030-01-01',
    auto_reminder_enabled: true, reminder_hour: 17, budget_alerts_enabled: true, travel_paid: false, weekly_hours: 35,
    accountant_email: 'compta@cabinet.fr', overtime_rate_1: 25, overtime_rate_2: 50,
    ai_enabled: true, kiosk_enabled: true, support_enabled: true, position_tracking_enabled: false, colleagues_planning_visible: false,
  }],
  worksites: [{ id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true }],
  planning: [], time_entries: [], active_sessions: [], month_closures: [], leave_requests: [], invitations: [], documents: [],
  certifications: [], push_subscriptions: [], company_cost_settings: [], support_grants: [], support_access_log: [], kiosks: [],
};
const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-admin', role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: 'u-admin', email: 'paul@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    const dot = v.indexOf('.'); const op = v.slice(0, dot); const val = v.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k];
      if (op === 'eq') return String(cur) === val;
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      if (op === 'is') return val === 'null' ? cur == null : String(cur) === val;
      return true;
    });
  }
  return rows;
};
const log = { writes: [], rpc: [], fns: [] };
const setup = async (ctx) => {
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/')) { log.fns.push(url.pathname.replace('/functions/v1/', '')); return r.fulfill({ json: {} }); }
    if (url.pathname.startsWith('/rest/v1/rpc/')) { log.rpc.push(url.pathname.replace('/rest/v1/rpc/', '')); return r.fulfill({ json: [] }); }
    const t = url.pathname.replace('/rest/v1/', '');
    const m = r.request().method();
    if (m !== 'GET' && m !== 'HEAD') { log.writes.push(`${m} ${t}`); return r.fulfill({ status: 201, json: {} }); }
    const all = filterRows(D[t] || [], url.searchParams);
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : Infinity;
    const rows = all.slice(off, off + lim);
    if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${all.length}` } });
  });
};

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const norm = (s) => (s || '').replace(/\s+/g, ' ').replace(/[’]/g, "'").trim();
const SET = '[role=dialog]:has(.bt-set)';               // la fenêtre des réglages
const POP = '[data-radix-popper-content-wrapper] [role=dialog]'; // une infobulle ouverte
const tip = (p, key) => p.locator(`${SET} [data-testid=set-tip-${key}]`);
const SECTION_OF_TIP = { abonnement: 'entreprise', horaire: 'paie', majoration: 'paie', route: 'paie', comptable: 'paie', caisse: 'paie', borne: 'borne', endroit: 'borne', collegues: 'borne', relance: 'notif', budget: 'notif', emails: 'notif', support: 'notif' };
const secBtn = (p, key) => p.locator(`[data-testid=set-sec-${key}] > h3 > button`);
const openSec = async (p, key) => { if ((await secBtn(p, key).getAttribute('aria-expanded')) !== 'true') { await secBtn(p, key).click(); await p.waitForTimeout(150); } };
const openSettings = async (ctx) => {
  const p = await ctx.newPage();
  await p.goto(`${URL0}/admin`);
  const desk = p.locator('.bt-pl-acct:visible'); const mob = p.locator('.bt-pl-m-ibtn[aria-label="Menu"]:visible');
  await desk.or(mob).first().waitFor({ timeout: 20000 }); await p.waitForTimeout(800);
  if (await desk.count()) await desk.first().click(); else await mob.first().click();
  await p.locator('button:visible', { hasText: "Réglages de l'entreprise" }).first().click();
  await p.waitForSelector(`${SET} .bt-set`, { timeout: 10000 });
  await p.waitForFunction((s) => document.querySelector(s)?.textContent?.includes('Journal des accès'), SET, { timeout: 10000 });
  await p.waitForTimeout(300);
  return p;
};
const popText = async (p) => norm(await p.locator(POP).first().textContent({ timeout: 1500 }).catch(() => ''));
const popOpen = async (p) => (await p.locator(POP).count()) > 0 && await p.locator(POP).first().isVisible().catch(() => false);
const waitPop = async (p, want) => { for (let i = 0; i < 20; i++) { if ((await popOpen(p)) === want) return true; await p.waitForTimeout(50); } return false; };
const noHScroll = (p) => p.locator(SET).evaluate((d) => {
  const innerR = d.getBoundingClientRect().left + d.clientLeft + d.clientWidth;
  const clipped = (el) => { for (let a = el.parentElement; a && a !== d; a = a.parentElement) if (getComputedStyle(a).overflowX !== 'visible') return true; return false; };
  const bad = [...d.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > innerR + 1 && !clipped(el); });
  return { ok: d.scrollWidth <= d.clientWidth + 1 && bad.length === 0, sw: d.scrollWidth, cw: d.clientWidth, bad: bad.slice(0, 3).map((e) => e.className || e.tagName) };
});

// ═════ Ordinateur 1280×800 (souris) ═════
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await setup(ctx);
const p = await openSettings(ctx);

// 5) Feuille de style figée : observée pendant toute la séance (frappes, rubriques, infobulles).
await p.evaluate((s) => {
  const st = document.querySelector(`${s} style`);
  window.__styleNode = st; window.__styleMuts = 0;
  new MutationObserver((ms) => { window.__styleMuts += ms.length; }).observe(st, { childList: true, characterData: true, subtree: true });
}, SET);

// 2) Libellés d'origine, texte exact.
for (const k of ['entreprise', 'paie', 'borne', 'notif']) await openSec(p, k);
const labelTexts = (await p.locator(`${SET} label.bt-set-l, ${SET} label.sa-l`).allTextContents()).map(norm);
const missingLabels = LABELS.filter((l) => !labelTexts.includes(norm(l)));
check(LABELS.length >= 20 && missingLabels.length === 0, `2) les ${LABELS.length} libellés d'origine (source ${BASE_COMMIT.slice(0, 7)}) sont là, au mot près${missingLabels.length ? ' — manquants : ' + missingLabels.join(' | ') : ''}`);
const dlgText = norm(await p.locator(SET).textContent());
check(['Tous les champs sont facultatifs.', 'Gérer mon abonnement', 'Envoyer le récap maintenant', 'Vérifier les habilitations', 'Autoriser le support BEMEXO', 'Enregistrer'].every((t) => dlgText.includes(norm(t))),
  '2) boutons d’origine toujours là (Gérer mon abonnement, Envoyer le récap maintenant, Vérifier les habilitations, Autoriser le support BEMEXO, Enregistrer)');

// 3) Une ligne courte au plus sous chaque réglage (le bloc légal n'est pas encore ouvert ici).
const longLines = async () => p.locator(SET).evaluate((d, max) => {
  const out = [];
  for (const el of d.querySelectorAll('p, .bt-set-substate, .sa-txt, .bt-set-hint, .bt-set-sec-hint, .bt-set-note')) {
    if (el.closest('[data-testid=set-legal]')) continue;
    if (el.getBoundingClientRect().width === 0) continue;
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (t.length > max) out.push(`${t.length} car. : « ${t.slice(0, 60)}… »`);
  }
  return out;
}, MAX_LINE);
const subs = (await p.locator(`${SET} .bt-set-substate, ${SET} .sa-txt`).allTextContents()).map(norm).filter(Boolean);
const tooLong = await longLines();
check(subs.length >= 12 && tooLong.length === 0, `3) ${subs.length} lignes sous les réglages, toutes ≤ ${MAX_LINE} caractères (la plus longue : ${Math.max(...subs.map((s) => s.length))})${tooLong.length ? ' — trop longues : ' + tooLong.join(' | ') : ''}`);
// Nombre de lignes réellement affichées (boîtes de ligne du texte).
const subLines = await p.locator(`${SET} .bt-set-substate`).evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => {
  const rg = document.createRange(); rg.selectNodeContents(e);
  return new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.bottom))).size;
}));
check(subLines.every((n) => n <= 2), `3) à 1280 px, chaque explication tient sur 1 ligne (2 au plus quand la commande est à côté) : ${subLines.join(', ')} ligne(s)`);

// 1) Chaque ⓘ : présent, à côté du libellé (jamais dedans), s'ouvre au survol et au clic.
const present = [];
for (const key of TIPS) if (await tip(p, key).count()) present.push(key);
check(JSON.stringify(present) === JSON.stringify(TIPS), `1) un ⓘ par réglage expliqué (${present.length}/${TIPS.length}) : ${present.join(', ')}${TIPS.filter((k) => !present.includes(k)).map((k) => ' — manque ' + k).join('')}`);
const placement = await p.locator(`${SET} [data-testid^=set-tip-]`).evaluateAll((els) => els.map((e) => ({ id: e.dataset.testid, inLabel: !!e.parentElement.closest('label'), inButton: !!e.parentElement.closest('button'), nextToLabel: !!e.parentElement.querySelector(':scope > label') })));
check(placement.every((x) => !x.inLabel && !x.inButton && x.nextToLabel), `1) chaque ⓘ est À CÔTÉ de son libellé, jamais dans un <label> ni dans un bouton${placement.filter((x) => x.inLabel || x.inButton || !x.nextToLabel).map((x) => ' — ' + x.id).join('')}`);
const hoverOk = []; const clickOk = []; const texts = {};
for (const key of present) {
  await openSec(p, SECTION_OF_TIP[key]);
  const t = tip(p, key);
  await t.scrollIntoViewIfNeeded();
  // Survol (souris) : s'ouvre, puis se referme quand la souris s'en va.
  await p.mouse.move(5, 5); await waitPop(p, false);
  await t.hover();
  const opened = await waitPop(p, true);
  texts[key] = await popText(p);
  await p.mouse.move(5, 5);
  const closed = await waitPop(p, false);
  if (opened && closed && texts[key].length > 10) hoverOk.push(key);
  // Clic sans survol (clavier, lecteur d'écran, stylet) : s'ouvre, un second clic referme.
  await t.dispatchEvent('click');
  const o2 = await waitPop(p, true); const t2 = await popText(p);
  await t.dispatchEvent('click');
  const c2 = await waitPop(p, false);
  if (o2 && c2 && t2 === texts[key]) clickOk.push(key);
}
check(hoverOk.length === present.length, `1) survol : les ${hoverOk.length}/${present.length} ⓘ s'ouvrent et se referment${present.filter((k) => !hoverOk.includes(k)).map((k) => ' — échec ' + k).join('')}`);
check(clickOk.length === present.length, `1) clic : les ${clickOk.length}/${present.length} ⓘ s'ouvrent, et se referment au second clic${present.filter((k) => !clickOk.includes(k)).map((k) => ' — échec ' + k).join('')}`);
check(texts.horaire?.includes('lundi au dimanche') && texts.endroit?.includes('12 mois') && texts.relance?.includes('3 au total') && texts.support?.includes("retirer l'accès"),
  `1) le détail est bien dans l'infobulle (horaire : « ${texts.horaire?.slice(0, 50)}… »)`);
// Information (non comptée) : à la souris, un CLIC juste après le survol. Le composant partagé
// components/ui/info-tip.tsx (hors de cette zone) bascule l'état au clic : le survol l'a ouverte,
// le clic la referme. Signalé ; la ligne passera à « reste ouverte » quand il sera corrigé.
{
  await openSec(p, 'paie'); const t = tip(p, 'horaire'); await t.scrollIntoViewIfNeeded();
  await p.mouse.move(5, 5); await waitPop(p, false);
  await t.click(); await p.waitForTimeout(250);
  const still = await popOpen(p);
  console.log(`ℹ️  souris, survol puis clic sur un ⓘ : l'infobulle ${still ? 'reste ouverte' : 'se referme (bascule de components/ui/info-tip.tsx, hors zone — signalé)'}`);
  if (still) await t.click();
  await p.mouse.move(5, 5); await waitPop(p, false);
}
// Capture : une infobulle ouverte au survol.
await openSec(p, 'paie'); await tip(p, 'horaire').scrollIntoViewIfNeeded(); await tip(p, 'horaire').hover(); await waitPop(p, true);
await p.waitForTimeout(400); // fin du fondu d'ouverture
await p.screenshot({ path: `${SH}/reglages-infobulle-1280x800.png` });
await p.mouse.move(5, 5); await waitPop(p, false);

// 4) Borne : une ligne + ⓘ, « Relier la tablette » → la même fenêtre des bornes.
await openSec(p, 'borne');
const borneSub = p.locator(`${SET} .bt-set-sub`, { has: p.locator('label.bt-set-l', { hasText: /^Borne de pointage$/ }) });
check(norm(await borneSub.locator('.bt-set-substate').textContent()) === "Tablette à l'entrée : planning de la semaine et QR pour pointer.", '4) borne : une ligne « Tablette à l’entrée : planning de la semaine et QR pour pointer. »');
check(await borneSub.getByRole('button', { name: 'Relier la tablette' }).count() === 1 && !dlgText.includes('Gérer les bornes'), '4) bouton « Relier la tablette » (plus de « Gérer les bornes »)');
await borneSub.getByRole('button', { name: 'Relier la tablette' }).click();
const kioskOk = await p.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].some((d) => !d.querySelector('.bt-set') && /born|tablette/i.test(d.querySelector('h2')?.textContent || '')), null, { timeout: 5000 }).then(() => true).catch(() => false);
check(kioskOk, '4) « Relier la tablette » ouvre la fenêtre des bornes (KioskAdmin)');
// Échap ne ferme QUE la fenêtre du dessus : les réglages restent ouverts derrière.
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
const settingsKept = (await p.locator(SET).count()) === 1;
check(settingsKept, '4) Échap referme la fenêtre des bornes, les réglages restent ouverts');
const p2 = settingsKept ? p : await openSettings(ctx);

// 3 bis) Le bloc légal avant « Endroit au pointage » reste ENTIER.
await openSec(p2, 'borne');
const posSub = p2.locator(`${SET} .bt-set-sub`, { has: p2.locator('label.bt-set-l', { hasText: /^Endroit au pointage en direct$/ }) });
await posSub.getByRole('button', { name: 'Activer' }).click();
const legal = p2.locator(`${SET} [data-testid=set-legal]`);
await legal.waitFor({ timeout: 3000 }).catch(() => {});
const legalTxt = norm(await legal.textContent().catch(() => ''));
check(await legal.isVisible().catch(() => false)
  && ['chacun de vos salariés', 'CSE', 'registre', 'ne vaudront rien comme preuve', 'ne remplace pas votre information individuelle', "C'est fait, activer"].every((t) => legalTxt.includes(t)),
  `3) bloc légal ENTIER et visible avant d'activer (${legalTxt.length} caractères : salariés, CSE, registre, preuve, information individuelle, « C'est fait, activer »)`);
check(await legal.locator('[data-testid^=set-tip-], [data-testid=info-tip]').count() === 0, '3) aucune partie du bloc légal n’est cachée dans une infobulle');
const tooLong2 = await (async () => p2.locator(SET).evaluate((d, max) => [...d.querySelectorAll('p, .bt-set-substate, .sa-txt')].filter((el) => !el.closest('[data-testid=set-legal]') && el.getBoundingClientRect().width > 0 && (el.textContent || '').replace(/\s+/g, ' ').trim().length > max).length, MAX_LINE))();
check(tooLong2 === 0, `3) bloc légal ouvert : hors de lui, toujours aucune ligne > ${MAX_LINE} caractères`);
await legal.screenshot({ path: `${SH}/reglages-bloc-legal-1280x800.png` }).catch(() => {});
await legal.getByRole('button', { name: 'Annuler' }).click();

// 5) Feuille de style jamais réécrite : on tape dans plusieurs champs (= nouveaux rendus).
await openSec(p2, 'entreprise');
if (p2 === p) {
  await p.locator(`${SET} .bt-set-namewrap input.bt-set-i`).fill('K Habitat Rénovation');
  await p.locator(`${SET} .bt-set-field:has(label:text-is("Ville")) input`).fill('Marseille');
  await p.waitForTimeout(300);
  const st = await p.evaluate((s) => ({ same: document.querySelector(`${s} style`) === window.__styleNode, muts: window.__styleMuts }), SET);
  check(st.same && st.muts === 0, `5) feuille de style des réglages figée : même nœud, ${st.muts} réécriture(s) pendant frappes, rubriques et infobulles`);
} else check(false, '5) feuille de style : séance interrompue (Échap a fermé les réglages)');

// 6) Largeur.
const hs = await noHScroll(p2);
check(hs.ok, `6) 1280×800 : rien ne déborde en largeur (scrollWidth ${hs.sw} / ${hs.cw})${hs.bad.length ? ' — ' + hs.bad.join(', ') : ''}`);
for (const k of ['entreprise', 'paie', 'borne', 'notif']) if ((await secBtn(p2, k).getAttribute('aria-expanded')) === 'true') await secBtn(p2, k).click();
await openSec(p2, 'paie'); await p2.mouse.move(5, 5); await p2.waitForTimeout(300);
await p2.screenshot({ path: `${SH}/reglages-1280x800.png` });
await ctx.close();

// ═════ Tablette 1024×768 et téléphone 390×844 (toucher) ═════
for (const [w, h, mobile] of [[1024, 768, false], [390, 844, true]]) {
  const c = await b.newContext({ viewport: { width: w, height: h }, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true, ...(mobile ? { deviceScaleFactor: 2, isMobile: true } : {}) });
  await setup(c); const pg = await openSettings(c);
  for (const k of ['paie', 'borne', 'notif']) await openSec(pg, k);
  const hsx = await noHScroll(pg);
  check(hsx.ok, `6) ${w}×${h} : rien ne déborde en largeur, 4 rubriques ouvertes (scrollWidth ${hsx.sw} / ${hsx.cw})${hsx.bad.length ? ' — ' + hsx.bad.join(', ') : ''}`);
  // Toucher : chaque ⓘ s'ouvre au doigt, tient dans l'écran, et se referme d'un second toucher.
  const tapOk = []; const fit = [];
  for (const key of TIPS) {
    const t = tip(pg, key);
    if (!(await t.count())) continue;
    await openSec(pg, SECTION_OF_TIP[key]);
    await t.scrollIntoViewIfNeeded();
    await t.tap();
    const o = await waitPop(pg, true);
    const box = o ? await pg.locator(POP).first().boundingBox() : null;
    if (box && box.x >= 0 && box.x + box.width <= w + 1) fit.push(key);
    if (o && key === 'endroit' && mobile) { await pg.waitForTimeout(400); await pg.screenshot({ path: `${SH}/reglages-infobulle-390x844.png` }); }
    await t.tap();
    const cl = await waitPop(pg, false);
    if (o && cl) tapOk.push(key);
  }
  check(tapOk.length === TIPS.length, `1) ${w}×${h}, toucher : les ${tapOk.length}/${TIPS.length} ⓘ s'ouvrent au doigt et se referment${TIPS.filter((k) => !tapOk.includes(k)).map((k) => ' — échec ' + k).join('')}`);
  check(fit.length === TIPS.length, `1) ${w}×${h} : chaque infobulle tient dans l'écran (${fit.length}/${TIPS.length})`);
  for (const k of ['paie', 'borne', 'notif']) await secBtn(pg, k).click();
  await openSec(pg, mobile ? 'borne' : 'paie'); await pg.waitForTimeout(250);
  await pg.screenshot({ path: `${SH}/reglages-${w}x${h}.png` });
  await c.close();
}

check(log.writes.length === 0 && log.rpc.length === 0, `aucune écriture (tables : ${log.writes.join(', ') || '0'} ; rpc : ${log.rpc.join(', ') || '0'})`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
