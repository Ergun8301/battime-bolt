// Lancer (après npm run build), depuis la racine du dépôt :
//   node scripts/tests/reglages-lot10.mjs out docs/captures-lot10 [port] [out-d-origine]
// Lot 10 — Réglages de l'entreprise rangés en 4 rubriques repliables, sur la VRAIE page
// /admin (base simulée, aucune écriture réelle), ouverts comme le fait l'utilisateur :
// menu du compte → « Réglages de l'entreprise ».
//  1) inventaire : chaque libellé, champ et bouton de l'écran D'ORIGINE (lu dans le fichier
//     source au commit cca24c8, pas recopié à la main) est présent dans le DOM, avant et
//     après avoir ouvert / fermé les rubriques — et rangé dans la bonne rubrique ;
//  2) la première rubrique est ouverte, les 3 autres fermées ; ouverture / fermeture au clic
//     et au clavier (Entrée, Espace), aria-expanded / aria-controls cohérents ;
//  3) une valeur tapée dans une rubrique survit à l'ouverture / fermeture des autres ;
//  4) mêmes validations, et « Enregistrer » appelle la même fonction (rpc update_company_info)
//     avec la même charge utile. Si [out-d-origine] (build du commit cca24c8) est fourni, le
//     même parcours y est rejoué et les deux requêtes sont comparées champ par champ.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const [,, OUT, SH, PORT = '4210', OUT_ORIG] = process.argv; fs.mkdirSync(SH, { recursive: true });
const BASE = 'cca24c82d3f4acd5cf82b9bb85bc80d401ceaa6a';

// ─── Inventaire extrait du code d'ORIGINE ──────────────────────────────────────
const src = (f) => execFileSync('git', ['show', `${BASE}:${f}`], { encoding: 'utf8' });
const ORIG = src('components/company-settings.tsx') + src('components/leave-fund-setting.tsx') + src('components/support-access.tsx');
const dec = (s) => s.replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ').trim();
const grab = (re) => [...new Set([...ORIG.matchAll(re)].map((m) => dec(m[1])))];
const LABELS = grab(/<label className="(?:bt-set-l|sa-l)">([^<{]+)<\/label>/g);
const PLACEHOLDERS = grab(/placeholder="([^"]+)"/g);
const ARIA = grab(/aria-label="([^"]+)"/g);
// Textes de boutons / interrupteurs : listés ici, mais chacun DOIT figurer dans la source d'origine.
const BUTTONS_ORIG = ['Ajouter un logo', 'Gérer mon abonnement', 'Gérer les bornes', 'Envoyer le récap maintenant', 'Vérifier les habilitations',
  'Autoriser le support BEMEXO', 'Enregistrer', 'h / semaine', 'Non payée', 'Activée', 'Activées', 'Tous les champs sont facultatifs.'];
const missingInSrc = BUTTONS_ORIG.filter((t) => !ORIG.includes(t));
// Lot 11 : seul changement voulu par le propriétaire — « Gérer les bornes » devient « Relier la tablette »
// (même bouton, même fenêtre des bornes). Le build d'origine, lui, est contrôlé avec le texte d'origine.
const RENAMED = { 'Gérer les bornes': 'Relier la tablette' };
const BUTTONS = BUTTONS_ORIG.map((t) => RENAMED[t] || t);
// Rubrique attendue pour chaque libellé (lot 10).
const SECTION_OF = {
  "Nom de l'entreprise": 'entreprise', SIRET: 'entreprise', 'TVA intracom.': 'entreprise', Adresse: 'entreprise', 'Code postal': 'entreprise',
  Ville: 'entreprise', 'Téléphone': 'entreprise', Email: 'entreprise', Abonnement: 'entreprise',
  'Horaire hebdomadaire de base': 'paie', 'Majoration des heures supplémentaires': 'paie', 'Temps de route entre deux chantiers': 'paie',
  'Adresse de votre comptable': 'paie', 'Caisse de congés BTP': 'paie',
  'Borne de pointage': 'borne', 'Endroit au pointage en direct': 'borne', 'Les salariés voient le planning de leurs collègues': 'borne',
  'Relance automatique des heures': 'notif', 'Alertes de budget chantier': 'notif', 'Notifications par email': 'notif',
  'Support BEMEXO': 'notif', 'Journal des accès': 'notif',
};
const SECTIONS = [['entreprise', 'Entreprise'], ['paie', 'Heures & paie'], ['borne', 'Borne & pointage'], ['notif', 'Notifications & support']];

// ─── Serveurs statiques ────────────────────────────────────────────────────────
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const serve = (dir, port) => new Promise((res) => {
  const s = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(dir, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
  s.listen(port, () => res(s));
});
const servers = [await serve(OUT, Number(PORT))];
if (OUT_ORIG) servers.push(await serve(OUT_ORIG, Number(PORT) + 1));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Base simulée : tous les réglages conditionnels visibles ───────────────────
const CO = 'c0000000-0000-0000-0000-000000000001';
const u = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@x.fr`, is_active: true, created_at: '2026-01-01' });
const D = {
  users: [u('u-admin', 'Paul', 'Martin', 'admin'), u('u-kevin', 'Kevin', 'Roussel')],
  companies: [{
    id: CO, name: 'K Habitat', siret: '123 456 789 00012', tva_intra: '', address: '12 rue des Artisans', postal_code: '13100', city: 'Aix-en-Provence',
    phone: '', email: 'contact@khabitat.fr', logo_url: '', subscription_status: 'active', trial_ends_at: '2030-01-01',
    auto_reminder_enabled: true, reminder_hour: 17, budget_alerts_enabled: true, travel_paid: false, weekly_hours: 35,
    accountant_email: 'compta@cabinet.fr', overtime_rate_1: 25, overtime_rate_2: 50,
    ai_enabled: true, kiosk_enabled: true, support_enabled: true, position_tracking_enabled: true /* lot 12 : réglage affiché seulement s'il est activé */, colleagues_planning_visible: false,
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
const setup = async (ctx, log) => {
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      log.rpc.push({ fn: url.pathname.replace('/rest/v1/rpc/', ''), body: JSON.parse(r.request().postData() || '{}') });
      return r.fulfill({ json: [] });
    }
    const t = url.pathname.replace('/rest/v1/', '');
    const m = r.request().method();
    if (m !== 'GET' && m !== 'HEAD') { log.writes.push(`${m} ${t}`); return r.fulfill({ status: 201, json: {} }); }
    const rows = filterRows(D[t] || [], url.searchParams);
    if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  });
};

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const norm = (s) => (s || '').replace(/\s+/g, ' ').replace(/[’]/g, "'").trim();

const openSettings = async (ctx, port) => {
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${port}/admin`);
  // Bureau : menu du compte (en haut à droite). Mobile : bouton « Menu » du bandeau.
  const desk = p.locator('.bt-pl-acct:visible'); const mob = p.locator('.bt-pl-m-ibtn[aria-label="Menu"]:visible');
  await desk.or(mob).first().waitFor({ timeout: 20000 }); await p.waitForTimeout(800);
  if (await desk.count()) await desk.first().click(); else await mob.first().click();
  await p.locator('button:visible', { hasText: "Réglages de l'entreprise" }).first().click();
  await p.waitForSelector('[role=dialog] .bt-set', { timeout: 10000 });
  // Les sous-réglages se chargent à part : on attend le dernier (journal du support).
  await p.waitForFunction(() => document.querySelector('[role=dialog]')?.textContent?.includes('Journal des accès'), null, { timeout: 10000 });
  await p.waitForTimeout(300);
  return p;
};
const dialogText = async (p) => norm(await p.locator('[role=dialog]').textContent());
const inventory = async (p, buttons = BUTTONS) => {
  const txt = await dialogText(p);
  const missing = [];
  for (const l of [...LABELS, ...buttons]) if (!txt.includes(norm(l))) missing.push(l);
  for (const ph of PLACEHOLDERS) if (await p.locator(`[role=dialog] [placeholder="${ph}"]`).count() < 1) missing.push(`placeholder « ${ph} »`);
  for (const a of ARIA) if (await p.locator(`[role=dialog] [aria-label="${a}"]`).count() < 1) missing.push(`aria-label « ${a} »`);
  return missing;
};
// Bloc d'un réglage (encadré .bt-set-sub, ou simple champ .bt-set-field) désigné par son libellé exact.
const sub = (p, label) => p.locator('[role=dialog] :is(.bt-set-sub, .bt-set-field)', { has: p.locator('label.bt-set-l', { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).first();
const secBtn = (p, key) => p.locator(`[data-testid=set-sec-${key}] > h3 > button`);
const cssId = (s) => s.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
const panelOf = async (p, key) => p.locator(`#${cssId(await secBtn(p, key).getAttribute('aria-controls'))}`);
const states = async (p) => Promise.all(SECTIONS.map(([k]) => secBtn(p, k).getAttribute('aria-expanded')));
// Rend visible la rubrique qui contient `label` (version lot 10 seulement).
const reveal = async (p, label, isNew) => {
  if (!isNew) return;
  const key = SECTION_OF[label];
  if ((await secBtn(p, key).getAttribute('aria-expanded')) !== 'true') await secBtn(p, key).click();
};

// Parcours commun aux deux versions : mêmes gestes, on garde la requête d'enregistrement.
const scenario = async (p, log, isNew) => {
  const tag = isNew ? 'lot 10' : 'origine';
  // Validation identique : adresse du comptable fautive → message, aucun appel.
  await reveal(p, 'Adresse de votre comptable', isNew);
  await sub(p, 'Adresse de votre comptable').locator('input').fill('pas-une-adresse');
  const n0 = log.rpc.length;
  await p.locator('[role=dialog] .bt-set-save').click(); await p.waitForTimeout(300);
  check(norm(await p.locator('[role=dialog] .bt-set-err').textContent().catch(() => '')) === 'Adresse du comptable invalide.' && log.rpc.length === n0,
    `[${tag}] validation : « Adresse du comptable invalide. » et rien n'est envoyé`);
  // Valeurs tapées dans plusieurs rubriques.
  await reveal(p, "Nom de l'entreprise", isNew);
  await p.locator('[role=dialog] .bt-set-namewrap input.bt-set-i').fill('K Habitat Rénovation');
  await sub(p, 'Ville').locator('input').fill('Marseille');
  await reveal(p, 'Horaire hebdomadaire de base', isNew);
  await sub(p, 'Horaire hebdomadaire de base').locator('input').fill('39');
  await sub(p, 'Majoration des heures supplémentaires').locator('input').nth(0).fill('20');
  await sub(p, 'Adresse de votre comptable').locator('input').fill('paie@cabinet-durand.fr');
  await sub(p, 'Temps de route entre deux chantiers').locator('input[type=checkbox]').check();
  await reveal(p, 'Relance automatique des heures', isNew);
  await sub(p, 'Relance automatique des heures').locator('select').selectOption('8');
  await sub(p, 'Alertes de budget chantier').locator('input[type=checkbox]').uncheck();
  if (isNew) {
    // Fermer puis rouvrir les rubriques ne perd rien.
    for (const [k] of SECTIONS) if ((await secBtn(p, k).getAttribute('aria-expanded')) === 'true') await secBtn(p, k).click();
    check((await states(p)).every((s) => s === 'false'), '[lot 10] toutes les rubriques refermées');
    await secBtn(p, 'notif').click(); await secBtn(p, 'borne').click(); await secBtn(p, 'entreprise').click();
    const name = await p.locator('[role=dialog] .bt-set-namewrap input.bt-set-i').inputValue();
    const city = await sub(p, 'Ville').locator('input').inputValue();
    check(name === 'K Habitat Rénovation' && city === 'Marseille', `[lot 10] rubrique Entreprise rouverte : nom « ${name} », ville « ${city} » conservés`);
    await secBtn(p, 'paie').click();
    const wh = await sub(p, 'Horaire hebdomadaire de base').locator('input').inputValue();
    const r1 = await sub(p, 'Majoration des heures supplémentaires').locator('input').nth(0).inputValue();
    const mail = await sub(p, 'Adresse de votre comptable').locator('input').inputValue();
    const route = await sub(p, 'Temps de route entre deux chantiers').locator('input[type=checkbox]').isChecked();
    check(wh === '39' && r1 === '20' && mail === 'paie@cabinet-durand.fr' && route, `[lot 10] Heures & paie rouverte : ${wh} h, ${r1} %, ${mail}, route payée — conservés`);
    const hour = await sub(p, 'Relance automatique des heures').locator('select').inputValue();
    const budget = await sub(p, 'Alertes de budget chantier').locator('input[type=checkbox]').isChecked();
    check(hour === '8' && !budget, `[lot 10] Notifications : relance à ${hour}h, alertes de budget désactivées — conservées`);
    check(norm(await p.locator('[role=dialog] .bt-set-err').textContent().catch(() => '')) === 'Adresse du comptable invalide.', '[lot 10] le message d’erreur reste affiché en bas (comme avant, jusqu’au prochain enregistrement)');
    // Les rubriques fermées ne gênent pas l'enregistrement : on referme tout sauf Borne.
    for (const k of ['entreprise', 'paie', 'notif']) await secBtn(p, k).click();
  }
  const n1 = log.rpc.length;
  await p.locator('[role=dialog] .bt-set-save').click();
  await p.waitForFunction(() => !document.querySelector('[role=dialog] .bt-set'), null, { timeout: 5000 }).catch(() => {});
  const calls = log.rpc.slice(n1).filter((c) => c.fn === 'update_company_info');
  check(calls.length === 1, `[${tag}] « Enregistrer » → 1 appel rpc/update_company_info`);
  check(await p.locator('[role=dialog] .bt-set').count() === 0, `[${tag}] la fenêtre se ferme après l'enregistrement`);
  return calls[0]?.body;
};

// ─── Version lot 10 ────────────────────────────────────────────────────────────
check(LABELS.length >= 20 && PLACEHOLDERS.length >= 8, `inventaire extrait de ${BASE.slice(0, 7)} : ${LABELS.length} libellés, ${PLACEHOLDERS.length} champs (placeholder), ${ARIA.length} aria-label`);
check(missingInSrc.length === 0, `les ${BUTTONS_ORIG.length} textes de boutons vérifiés figurent dans la source d'origine${missingInSrc.length ? ' — absents : ' + missingInSrc.join(', ') : ''}`);
check(Object.entries(RENAMED).every(([o, n]) => ORIG.includes(o) && !ORIG.includes(n)), `lot 11 : renommage voulu ${Object.entries(RENAMED).map(([o, n]) => `« ${o} » → « ${n} »`).join(', ')} (le texte d'origine existait, le nouveau non)`);
check(LABELS.every((l) => SECTION_OF[l]), `chaque libellé d'origine a une rubrique${LABELS.filter((l) => !SECTION_OF[l]).map((l) => ' — sans rubrique : ' + l).join('')}`);

const logN = { rpc: [], writes: [] };
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await setup(ctx, logN);
const p = await openSettings(ctx, PORT);

// 1) Inventaire, rubriques fermées.
let miss = await inventory(p);
check(miss.length === 0, `1) rubriques fermées : les ${LABELS.length + BUTTONS.length + PLACEHOLDERS.length + ARIA.length} éléments d'origine sont dans le DOM${miss.length ? ' — manquants : ' + miss.join(' | ') : ''}`);
for (const l of LABELS) {
  const key = SECTION_OF[l];
  const inSec = await p.locator(`[data-testid=set-sec-${key}]`).locator('label', { hasText: l }).count();
  if (!inSec) check(false, `1) « ${l} » devrait être dans la rubrique ${key}`);
}
check(true, '1) chaque libellé est rangé dans sa rubrique (contrôle ci-dessus)');

// 2) État de départ, a11y.
const titles = await Promise.all(SECTIONS.map(([k]) => p.locator(`[data-testid=set-sec-${k}] .bt-set-sec-t`).textContent()));
check(JSON.stringify(titles) === JSON.stringify(SECTIONS.map(([, t]) => t)), `2) 4 rubriques dans l'ordre : ${titles.join(' / ')}`);
check(JSON.stringify(await states(p)) === JSON.stringify(['true', 'false', 'false', 'false']), `2) ouverte / fermées au départ : ${(await states(p)).join(', ')}`);
let a11y = true;
for (const [k] of SECTIONS) {
  const btn = secBtn(p, k); const panel = await panelOf(p, k);
  const exp = (await btn.getAttribute('aria-expanded')) === 'true';
  a11y &&= (await btn.evaluate((e) => e.tagName)) === 'BUTTON' && (await panel.count()) === 1
    && (await panel.getAttribute('aria-labelledby')) === (await btn.getAttribute('id'))
    && (await panel.isVisible()) === exp && ((await panel.getAttribute('hidden')) !== null) === !exp;
}
check(a11y, '2) chaque en-tête est un <button> avec aria-expanded + aria-controls → panneau (role=region, aria-labelledby), masqué par hidden quand fermé');
check(await sub(p, 'SIRET').isVisible() && !(await sub(p, 'Horaire hebdomadaire de base').isVisible()) && !(await sub(p, 'Endroit au pointage en direct').isVisible()) && !(await sub(p, 'Notifications par email').isVisible()),
  '2) seul le contenu de « Entreprise » est visible');
await p.screenshot({ path: `${SH}/reglages-1280x800.png` });

// Clic.
await secBtn(p, 'paie').click();
check((await secBtn(p, 'paie').getAttribute('aria-expanded')) === 'true' && await sub(p, 'Horaire hebdomadaire de base').isVisible(), '2) clic : « Heures & paie » s’ouvre');
check((await secBtn(p, 'entreprise').getAttribute('aria-expanded')) === 'true', '2) clic : « Entreprise » reste ouverte (rubriques indépendantes)');
await secBtn(p, 'paie').click();
check((await secBtn(p, 'paie').getAttribute('aria-expanded')) === 'false' && !(await sub(p, 'Horaire hebdomadaire de base').isVisible()), '2) second clic : elle se referme');
// Clavier.
await secBtn(p, 'borne').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
check((await secBtn(p, 'borne').getAttribute('aria-expanded')) === 'true' && await sub(p, 'Endroit au pointage en direct').isVisible(), '2) clavier : Entrée ouvre « Borne & pointage »');
await p.keyboard.press('Space'); await p.waitForTimeout(100);
check((await secBtn(p, 'borne').getAttribute('aria-expanded')) === 'false', '2) clavier : Espace la referme');
await secBtn(p, 'paie').focus(); await p.keyboard.press('Tab');
check(await secBtn(p, 'borne').evaluate((e) => e === document.activeElement), '2) clavier : Tab passe d’un en-tête fermé au suivant (contenu masqué hors tabulation)');
await p.keyboard.press('Tab'); await p.keyboard.press('Space'); await p.waitForTimeout(100);
check((await secBtn(p, 'notif').getAttribute('aria-expanded')) === 'true' && await p.locator('[data-testid=support-access]').isVisible(), '2) clavier : Tab + Espace ouvre « Notifications & support » (support visible)');
await secBtn(p, 'notif').click();

miss = await inventory(p);
check(miss.length === 0, `1) après ouvertures / fermetures : tout est toujours dans le DOM${miss.length ? ' — manquants : ' + miss.join(' | ') : ''}`);
// Capture d'une autre rubrique ouverte (Entreprise refermée).
await secBtn(p, 'entreprise').click(); await secBtn(p, 'paie').click(); await p.mouse.move(5, 5); await p.waitForTimeout(400);
await p.screenshot({ path: `${SH}/reglages-1280x800-heures-paie.png` });

// Captures 1024×768 et mobile (fenêtre fraîche : première rubrique ouverte).
for (const [w, h, name, mobile] of [[1024, 768, 'reglages-1024x768.png', false], [390, 844, 'reglages-mobile-390x844.png', true]]) {
  const c = await b.newContext({ viewport: { width: w, height: h }, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(mobile ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  await setup(c, { rpc: [], writes: [] }); const pg = await openSettings(c, PORT);
  check(JSON.stringify(await states(pg)) === JSON.stringify(['true', 'false', 'false', 'false']), `${w}×${h} : première rubrique ouverte, les autres fermées`);
  const noHScroll = await pg.locator('[role=dialog]').evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
  const btnsFit = await Promise.all(SECTIONS.map(([k]) => secBtn(pg, k).evaluate((e) => e.scrollWidth <= e.clientWidth + 1)));
  check(noHScroll && btnsFit.every(Boolean), `${w}×${h} : rien ne déborde horizontalement (fenêtre et en-têtes)`);
  await pg.screenshot({ path: `${SH}/${name}` });
  await c.close();
}

// 3 + 4) Valeurs conservées et enregistrement.
const payloadNew = await scenario(p, logN, true);
check(logN.writes.length === 0, `aucune écriture de table (${logN.writes.join(', ') || '0'})`);
check(logN.rpc.every((c) => c.fn === 'update_company_info'), `seul rpc appelé : update_company_info (${[...new Set(logN.rpc.map((c) => c.fn))].join(', ')})`);
const EXPECTED = {
  p_name: 'K Habitat Rénovation', p_siret: '123 456 789 00012', p_tva_intra: '', p_address: '12 rue des Artisans', p_postal_code: '13100', p_city: 'Marseille',
  p_phone: '', p_email: 'contact@khabitat.fr', p_logo_url: '', p_auto_reminder_enabled: true, p_reminder_hour: 8, p_budget_alerts_enabled: false,
  p_travel_paid: true, p_weekly_hours: 39, p_accountant_email: 'paie@cabinet-durand.fr', p_overtime_rate_1: 20, p_overtime_rate_2: 50,
};
const sortObj = (o) => JSON.stringify(Object.fromEntries(Object.entries(o || {}).sort()));
check(sortObj(payloadNew) === sortObj(EXPECTED), `4) charge utile attendue : ${sortObj(payloadNew)}`);
await ctx.close();

// ─── Même parcours sur le build d'origine (si fourni) ─────────────────────────
if (OUT_ORIG) {
  const logO = { rpc: [], writes: [] };
  const co = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(co, logO);
  const po = await openSettings(co, Number(PORT) + 1);
  check(await po.locator('[data-testid^=set-sec-]').count() === 0, '[origine] build du commit cca24c8 (sans rubriques)');
  const missO = await inventory(po, BUTTONS_ORIG);
  check(missO.length === 0, `[origine] le même inventaire est présent dans l'écran d'origine${missO.length ? ' — manquants : ' + missO.join(' | ') : ''}`);
  const payloadOrig = await scenario(po, logO, false);
  check(sortObj(payloadOrig) === sortObj(payloadNew), '4) avant / après : même fonction, même charge utile, champ par champ');
  await co.close();
} else console.log('   (pas de build d’origine fourni : comparaison avant / après sautée, charge utile vérifiée contre la valeur attendue)');

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); servers.forEach((s) => s.close());
process.exit(ko ? 1 : 0);
