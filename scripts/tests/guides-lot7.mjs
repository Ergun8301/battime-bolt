// Lot 7 — guides pas à pas du salarié : le bouton « Me guider pas à pas » de l'assistant,
// l'anneau exactement sur le vrai bouton, « Suivant » / « Précédent » / « Fermer » / Échap,
// le toucher du vrai bouton qui fait avancer le guide, le menu du compte qui s'ouvre et se
// referme, la cible absente ou cachée (jamais de blocage), et AUCUNE écriture pendant un guide.
//
// Lancer : npm run build, puis
//   node scripts/tests/guides-lot7.mjs out docs/captures-lot7b [port]
// (ou : node --import …/resolve-pw.mjs scripts/tests/guides-lot7.mjs out <dossier> <port>)
// Vraie page /poseur?demo=salarie (export statique), base Supabase SIMULÉE, assistant de démo
// (le vrai lecteur de phrases, sur des chantiers fictifs). Téléphone 390×844 et 360×640, tablette
// 768 et ordinateur 1280.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
// playwright-core du projet s'il est là, sinon celui installé globalement avec playwright.
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-lot7b', PORT = '4217'] = process.argv;
fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  for (const c of [p, `${p}.html`, path.join(p, 'index.html')]) {
    const f = path.join(OUT, c);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); }
  }
  r.writeHead(404); r.end();
});
await new Promise((r) => srv.listen(Number(PORT), r));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const CO = 'c0000000-0000-0000-0000-000000000001';
const ME = 'u-karim';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Maison Martin', city: 'Villeurbanne', is_active: true };
const W3 = { id: 'w3', company_id: CO, client_name: 'Dépôt Gerland', city: 'Lyon', is_active: true };
const AUTRE = { id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true };
const entry = (id, ws, s, e, extra = {}) => {
  const [sh, sm] = s.split(':').map(Number); const [eh, em] = e.split(':').map(Number);
  return { id, company_id: CO, user_id: ME, worksite_id: ws.id, planning_id: null, work_date: today, start_time: `${s}:00`, end_time: `${e}:00`,
    break_minutes: 0, total_minutes: (eh * 60 + em) - (sh * 60 + sm), meal_allowance: false, status: 'draft', locked: false, exported_at: null,
    observation: null, reception: null, gap_before: null, worksite: ws, ...extra };
};

// ── La base simulée (état modifiable par scénario) ──
let role = 'worker';
const base = () => ({
  users: [
    { id: ME, company_id: CO, first_name: 'Karim', last_name: 'Benali', role, email: 'karim@exemple.fr', is_active: true, created_at: '2026-01-01' },
    { id: 'u-lucas', company_id: CO, first_name: 'Lucas', last_name: 'Petit', role: 'worker', email: 'lucas@exemple.fr', is_active: true, created_at: '2026-01-01' },
    { id: 'u-nina', company_id: CO, first_name: 'Nina', last_name: 'Roux', role: 'worker', email: 'nina@exemple.fr', is_active: true, created_at: '2026-01-01' },
  ],
  companies: [{ id: CO, name: 'Benali Rénovation', ai_enabled: true, kiosk_enabled: true, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
  worksites: [W1, W2, W3, AUTRE],
  planning: [{ id: 'p1', company_id: CO, user_id: ME, worksite_id: 'w1', work_date: today, absence_type: null, estimated_start: '08:00:00', estimated_end: '12:00:00', notes: null, worksite: W1 }],
  time_entries: [entry('e1', W2, '13:00', '16:30')],
  active_sessions: [], month_closures: [], documents: [], time_entry_corrections: [], time_entry_positions: [], push_subscriptions: [],
  leave_requests: [{ id: 'l1', user_id: ME, company_id: CO, type: 'conge', start_date: today, end_date: today, status: 'pending', note: '', decision_note: null, created_at: `${yesterday}T10:00:00Z` }],
});
let D = base();
const calls = [];
let fnReply = null; // réponse de la fonction worker-assistant (hors démo)
const mark = () => calls.length;
const match = (rows, sp) => {
  let out = rows;
  for (const [k, v] of sp) {
    if (v.startsWith('eq.')) { const val = v.slice(3); out = out.filter((x) => !(k in x) || String(x[k]) === val); }
    if (v.startsWith('neq.')) { const val = v.slice(4); out = out.filter((x) => !(k in x) || String(x[k]) !== val); }
  }
  return out;
};
const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: ME, email: 'karim@exemple.fr', aud: 'authenticated', role: 'authenticated' } };

async function newCtx(viewport, extra = {}) {
  const phone = viewport.width <= 500;
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...extra });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const u = new URL(req.url()); const method = req.method();
    let body = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
    if (u.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (u.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    calls.push({ method, path: u.pathname, search: u.search, body });
    if (u.pathname.startsWith('/functions/v1/worker-assistant') && fnReply) return r.fulfill({ json: fnReply });
    if (u.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (u.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = u.pathname.replace('/rest/v1/', '');
    const rows = match(D[t] || [], u.searchParams);
    if (method === 'GET' || method === 'HEAD') return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
    return r.fulfill({ status: 201, json: rows.length ? rows[0] : { id: 'new-1' } });
  });
  return ctx;
}

const run = (n) => !process.env.ONLY || process.env.ONLY.split(',').includes(String(n)); // ONLY=2,3 pour rejouer des parties
let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const G = { card: '[data-testid=guide-card]', ring: '[data-testid=guide-ring]', next: '[data-testid=guide-next]', prev: '[data-testid=guide-prev]', close: '[data-testid=guide-close]', text: '[data-testid=guide-text]', count: '[data-testid=guide-count]' };

/** Ouvre /poseur (assistant de démo) et attend la journée. */
async function open(p) {
  await p.goto(`http://localhost:${PORT}/poseur?demo=salarie`);
  await p.waitForSelector('.bt-total', { timeout: 15000 });
  await p.waitForTimeout(900);
}
/** Demande à l'assistant ; rend les libellés des boutons de la réponse. */
async function ask(p, question) {
  await p.click('[data-testid=dock-assistant]');
  await p.waitForSelector('.as-bar textarea');
  const before = await p.locator('.as-bot .as-links').count();
  await p.fill('.as-bar textarea', question);
  await p.click('button[aria-label="Envoyer"]');
  await p.waitForFunction((n) => document.querySelectorAll('.as-bot .as-links').length > n, before, { timeout: 8000 });
  const links = p.locator('.as-bot .as-links').last().locator('button');
  return (await links.allInnerTexts()).map((t) => t.trim());
}
async function startGuide(p, question) {
  const labels = await ask(p, question);
  await p.locator('.as-bot .as-links').last().locator('button', { hasText: 'Me guider pas à pas' }).click();
  await p.waitForSelector(G.card, { timeout: 5000 });
  return labels;
}
const guideOpen = (p) => p.locator(G.card).count().then((n) => n > 0);

/** Premier élément visible portant l'ancre : son rectangle (ce que le guide doit entourer). */
const targetRect = (p, cible) => p.evaluate((c) => {
  const el = [...document.querySelectorAll(`[data-guide="${c}"]`)].find((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
}, cible);
const boxOf = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
const near = (a, b, tol = 1.6) => Math.abs(a - b) <= tol;
/** Le rectangle attendu de l'anneau : la cible + 4 px, gardée dans l'écran. */
const expectedRing = (t) => {
  const x = Math.max(t.x - 4, 3), y = Math.max(t.y - 4, 3);
  return { x, y, w: Math.max(Math.min(t.x + t.w + 4, t.vw - 3) - x, 8), h: Math.max(Math.min(t.y + t.h + 4, t.vh - 3) - y, 8) };
};
const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Attend un état de l'étape : 'ring' | 'missing' | 'covered'. */
async function waitPhase(p, want, timeout = 5000) {
  const sel = { ring: `${G.ring}:not([hidden])`, missing: '[data-testid=guide-missing]', covered: '[data-testid=guide-covered]' }[want];
  try { await p.waitForSelector(sel, { timeout }); return true; } catch { return false; }
}
/** Étape avec anneau : sur la bonne cible, au pixel près, sans recouvrir la cible avec la carte. */
async function checkRing(p, cible, label) {
  const shown = await waitPhase(p, 'ring');
  check(shown, `${label} : anneau affiché`);
  if (!shown) return;
  await p.waitForTimeout(250); // fin des animations / du défilement
  const t = await targetRect(p, cible), r = await boxOf(p, G.ring), e = t && expectedRing(t);
  check(!!t && !!r && near(r.x, e.x) && near(r.y, e.y) && near(r.w, e.w) && near(r.h, e.h),
    `${label} : anneau pile sur « ${cible} » (cible ${t ? [t.x, t.y, t.w, t.h].map(Math.round) : '?'} → anneau ${r ? [r.x, r.y, r.w, r.h].map(Math.round) : '?'})`);
  check((await p.locator(G.ring).getAttribute('data-cible')) === cible, `${label} : l’anneau est celui de « ${cible} »`);
  check((await p.evaluate((s) => getComputedStyle(document.querySelector(s)).pointerEvents, G.ring)) === 'none', `${label} : l’anneau laisse passer les touchers`);
  const card = await boxOf(p, G.card);
  check(!!card && !!t && !intersects(card, { x: t.x, y: t.y, w: t.w, h: t.h }), `${label} : la carte ne cache pas la cible (carte en ${await p.locator(G.card).getAttribute('data-pos')})`);
}
const stepText = (p) => p.locator(G.text).textContent().then((t) => t.replace(/\s+/g, ' ').replace(/^Étape \d+ sur \d+\. /, '').trim());
const count = (p) => p.locator(G.count).textContent().then((t) => t.trim());
/** Vrai bouton visible portant l'ancre (celui que le salarié touche). */
const real = (p, cible) => p.locator(`[data-guide="${cible}"] >> visible=true`).first();
const writes = (from) => calls.slice(from).filter((c) => !['GET', 'HEAD'].includes(c.method) && !c.path.startsWith('/rest/v1/rpc/'));
const menuOpen = (p) => p.locator('[role=menu]').count().then((n) => n > 0);
const topAt = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && !!e.closest(s); }, sel);

/**
 * Joue un guide de bout en bout. plan[i] = { cible, via: 'next' | 'touch' | 'none', phase?: 'ring' | 'missing' | 'covered', before?, after? }.
 * Le dernier pas se termine par « Terminer » (next) ou par le toucher de la cible (touch).
 */
async function walk(p, id, plan, tag) {
  const w0 = mark();
  const n = plan.length;
  for (let i = 0; i < n; i++) {
    const s = plan[i];
    const label = `${tag} ${id} ${i + 1}/${n}`;
    check((await count(p)) === `Étape ${i + 1} sur ${n}`, `${label} : « Étape ${i + 1} sur ${n} »`);
    check((await stepText(p)).length > 5, `${label} : une phrase — ${(await stepText(p)).slice(0, 90)}`);
    if (s.before) await s.before();
    const phase = s.phase || 'ring';
    if (phase === 'ring') await checkRing(p, s.cible, label);
    else {
      const t0 = Date.now();
      check(await waitPhase(p, phase, 6000), `${label} : « ${phase === 'missing' ? 'Je ne vois pas ce bouton sur votre écran.' : 'caché par une fenêtre'} »`);
      check(Date.now() - t0 > 600, `${label} : après un temps d’essai (pas tout de suite : ${Date.now() - t0} ms)`);
      check((await p.locator(`${G.ring}:not([hidden])`).count()) === 0, `${label} : pas d’anneau sur un bouton qu’on ne voit pas`);
      if (phase === 'missing') check((await stepText(p)).startsWith('Je ne vois pas ce bouton sur votre écran.'), `${label} : message exact puis la phrase de l’étape`);
    }
    if (s.after) await s.after();
    const last = i === n - 1;
    if (s.via === 'touch') await real(p, s.cible).click();
    else if (s.via === 'next') {
      if (last) check((await p.locator(G.next).innerText()).trim() === 'Terminer', `${label} : dernier pas = « Terminer »`);
      await p.locator(G.next).click();
    }
    if (last) { await p.waitForTimeout(250); check(!(await guideOpen(p)), `${label} : le guide se ferme à la fin`); }
    else { try { await p.waitForFunction((t) => document.querySelector('[data-testid=guide-count]')?.textContent?.trim() === t, `Étape ${i + 2} sur ${n}`, { timeout: 3000 }); } catch { /* le contrôle suivant le dira */ } }
  }
  return writes(w0);
}

// ═════════════════════════════════════════════════════════════════════════
// 1 · Téléphone 390×844 : le guide « congé », de bout en bout, avec de vrais toucher
// ═════════════════════════════════════════════════════════════════════════
const PHONES = [{ width: 390, height: 844, name: 'tel-390' }, { width: 360, height: 640, name: 'petit-360' }, { width: 768, height: 1024, name: 'tablette-768' }, { width: 1280, height: 800, name: 'bureau-1280' }];
for (const vp of PHONES) {
  if (!run(1)) break;
  D = base(); role = 'worker'; D = base();
  const ctx = await newCtx({ width: vp.width, height: vp.height });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await open(p);
  const baseline = errors.length;
  console.log(`\n── ${vp.name} (${vp.width}×${vp.height}) ──`);

  // 1a · la réponse montre les DEUX boutons, le raccourci d'abord
  const labels = await ask(p, 'comment je demande un congé');
  check(labels.length === 2 && labels[0] === 'Mes congés' && labels[1] === 'Me guider pas à pas', `${vp.name} : la réponse montre « Mes congés » PUIS « Me guider pas à pas » : ${labels.join(' | ')}`);
  await p.screenshot({ path: `${SH}/${vp.name}-1-reponse.png` });
  const w0 = mark();
  await p.locator('.as-bot .as-links').last().locator('button', { hasText: 'Me guider pas à pas' }).click();
  await p.waitForSelector(G.card);
  check((await p.locator('[data-testid=assistant-panel]').count()) === 0, `${vp.name} : l’assistant se replie quand le guide commence`);
  check(await p.evaluate(() => { const c = document.querySelector('[data-testid=guide-card]'); return document.activeElement === c; }), `${vp.name} : le focus est sur la carte du guide`);
  const card = await p.locator(G.card).evaluate((el) => ({ role: el.getAttribute('role'), modal: el.getAttribute('aria-modal') }));
  const live = await p.locator(G.text).getAttribute('aria-live');
  check(card.role === 'dialog' && card.modal === 'false' && live === 'polite', `${vp.name} : role=dialog non modal, phrase en aria-live=polite`);
  for (const sel of [G.next, G.prev, G.close]) {
    const bx = await boxOf(p, sel);
    check(bx.h >= 44 && bx.w >= 44, `${vp.name} : bouton ${sel.match(/guide-(\w+)/)[1]} ≥ 44 px (${Math.round(bx.w)}×${Math.round(bx.h)})`);
  }
  await p.waitForTimeout(400);
  const cb = await boxOf(p, G.card);
  check(cb.x >= 0 && cb.x + cb.w <= vp.width && cb.y + cb.h <= vp.height && cb.y >= 0, `${vp.name} : la carte tient dans l’écran, sans défilement horizontal`);
  check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${vp.name} : pas de défilement horizontal de la page`);
  check(!(await p.locator(`${G.prev}`).isEnabled()), `${vp.name} : « Précédent » désactivé à la première étape`);
  await p.screenshot({ path: `${SH}/${vp.name}-2-etape1-menu.png` });

  // 1b · pas à pas avec de VRAIS toucher : le nom → « Mes congés » → « Faire une demande »
  const writesDuring = await walk(p, 'conge', [
    { cible: 'menu.compte', via: 'touch' },
    { cible: 'menu.conges', via: 'touch', before: async () => { check(await menuOpen(p), `${vp.name} conge 2 : le menu du compte est ouvert (touché par le salarié)`); await p.screenshot({ path: `${SH}/${vp.name}-3-etape2-mes-conges.png` }); } },
    { cible: 'conges.faire', via: 'touch', before: async () => {
      await p.waitForFunction(() => !document.querySelector('[role=menu]'), null, { timeout: 2000 }).catch(() => {});
      check(!(await menuOpen(p)), `${vp.name} conge 3 : le menu s’est refermé`);
      check(await topAt(p, G.card), `${vp.name} conge 3 : la carte du guide est AU-DESSUS de la fenêtre « Mes congés »`);
      await p.screenshot({ path: `${SH}/${vp.name}-4-etape3-faire-une-demande.png` });
    } },
    { cible: 'conges.type', via: 'next', before: async () => { await p.screenshot({ path: `${SH}/${vp.name}-5-etape4-type-et-dates.png` }); } },
    { cible: 'conges.envoyer', via: 'next' },
  ], vp.name);
  check(writesDuring.length === 0, `${vp.name} : aucune écriture pendant tout le guide (${writesDuring.length}) ${writesDuring.map((c) => c.method + c.path).join(' ')}`);
  check(await p.locator('[role=dialog]:has-text("Mes congés")').count() === 1, `${vp.name} : la fenêtre « Mes congés » reste ouverte à la fin (rien n’est refermé à la place du salarié)`);
  check(errors.length === baseline, `${vp.name} : aucune erreur console pendant le guide ${errors.slice(baseline).join(' // ')}`);

  if (vp.name === 'tel-390' || vp.name === 'bureau-1280') {
    // 1c · Échap : ferme le guide SEUL (la fenêtre dessous reste), puis une 2e fois la fenêtre
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    check(await p.locator('[role=dialog]:has-text("Mes congés")').count() === 0, `${vp.name} : (le guide est déjà fini) Échap ferme la fenêtre ouverte`);
    await open(p);
    await startGuide(p, 'comment je demande un congé');
    await p.locator(G.next).click(); await p.locator(G.next).click();   // étape 3 : fenêtre « Mes congés » ouverte par le guide
    await p.waitForSelector('[role=dialog]:has-text("Mes congés")');
    check(await count(p) === 'Étape 3 sur 5', `${vp.name} : « Suivant » ×2 → étape 3 ; le guide a ouvert « Mes congés » (navigation seulement)`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    check(!(await guideOpen(p)), `${vp.name} : Échap ferme le guide`);
    check(await p.locator('[role=dialog]:has-text("Mes congés")').count() === 1, `${vp.name} : …mais PAS la fenêtre « Mes congés » qui était dessous`);
    check(await p.evaluate(() => document.activeElement?.closest('[role=dialog]') != null || document.activeElement?.getAttribute('data-guide') === 'journee.assistant'), `${vp.name} : focus rendu (dans la fenêtre restée ouverte ou au bouton ✨)`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    check(await p.locator('[role=dialog]:has-text("Mes congés")').count() === 0, `${vp.name} : un 2e Échap ferme la fenêtre`);

    // 1d · « Fermer », « Précédent », et le focus rendu au bouton ✨
    await open(p);
    await startGuide(p, 'comment je demande un congé');
    await p.locator(G.next).click();
    check(await count(p) === 'Étape 2 sur 5' && await menuOpen(p), `${vp.name} : « Suivant » → étape 2, le menu du compte s’ouvre tout seul (c’est le guide qui l’ouvre)`);
    await checkRing(p, 'menu.conges', `${vp.name} fermer 2`);
    await p.locator(G.prev).click();
    await p.waitForTimeout(500);
    check(await count(p) === 'Étape 1 sur 5' && !(await menuOpen(p)), `${vp.name} : « Précédent » → étape 1, le menu se referme`);
    await p.locator(G.next).click(); await p.waitForTimeout(300);
    check(await menuOpen(p), `${vp.name} : étape 2 : menu rouvert`);
    await p.locator(G.close).click();
    await p.waitForTimeout(500);
    await p.waitForTimeout(700);
    check(!(await guideOpen(p)) && !(await menuOpen(p)), `${vp.name} : « Fermer » : le guide s’arrête et le menu qu’il avait ouvert aussi`);
    check(await p.evaluate(() => document.activeElement?.getAttribute('data-guide') === 'journee.assistant'), `${vp.name} : le focus revient au bouton ✨ de la barre du bas`);
    check((await p.locator('[data-testid=assistant-panel]').count()) === 0, `${vp.name} : l’assistant reste fermé`);
  }
  check(errors.length === baseline, `${vp.name} : aucune erreur console (au total) ${errors.slice(baseline).join(' // ')}`);
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// 2 · Plusieurs guides de bout en bout (téléphone 390×844)
// ═════════════════════════════════════════════════════════════════════════
if (run(2)) {
  role = 'worker'; D = base();
  const ctx = await newCtx({ width: 390, height: 844 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const fresh = async (q, tweak) => { D = base(); if (tweak) tweak(D); await open(p); errors.length = 0; return startGuide(p, q); };

  // 2a · envoyer sa journée : la carte passe EN HAUT pour ne pas cacher le bouton collé en bas
  await fresh('comment envoyer ma journée');
  let w = await walk(p, 'envoyer-journee', [
    { cible: 'journee.chantier', via: 'next' },
    { cible: 'journee.envoyer', via: 'next', before: async () => { await p.waitForTimeout(300); check((await p.locator(G.card).getAttribute('data-pos')) === 'top', 'tel envoyer-journee 2 : la carte se met EN HAUT (« Envoyer ma journée » est collé en bas)'); await p.screenshot({ path: `${SH}/tel-6-envoyer-journee.png` }); } },
  ], 'tel');
  check(w.length === 0 && errors.length === 0, `tel envoyer-journee : aucune écriture, aucune erreur ${errors.join(' // ')}`);

  // 2b · pointer : l'icône du scanner ; « Terminer ma journée » absent (rien en cours) → message, puis « + »
  await fresh('comment pointer');
  w = await walk(p, 'pointer', [
    { cible: 'entete.scanner', via: 'next' },
    { cible: 'journee.terminer', via: 'next', phase: 'missing' },
    { cible: 'journee.plus', via: 'next' },
  ], 'tel');
  check(w.length === 0 && errors.length === 0, `tel pointer : aucune écriture, aucune erreur ${errors.join(' // ')}`);

  // 2c · sortie oubliée : un pointage en cours, une ligne « Sortie oubliée », la fiche, la molette cache « OK »
  await fresh('comment sortie oubliée', (d) => {
    d.active_sessions = [{ user_id: ME, company_id: CO, worksite_id: 'w1', planning_id: 'p1', work_date: today, started_at: new Date(Date.now() - 95 * 60000).toISOString() }];
    d.time_entries = [entry('e2', W2, '07:00', '12:00', { exit_forgotten: true })];
  });
  w = await walk(p, 'sortie-oubliee', [
    { cible: 'journee.terminer', via: 'next' },
    { cible: 'journee.sortie-oubliee', via: 'touch' },
    { cible: 'editeur.horaires', via: 'touch' },
    { cible: 'editeur.ok', via: 'next', phase: 'covered', after: async () => {
      await p.screenshot({ path: `${SH}/tel-7-ok-cache-par-la-molette.png` });
      await p.locator('button:has-text("Valider les heures")').click();   // le salarié referme la molette
      await checkRing(p, 'editeur.ok', 'tel sortie-oubliee 4 (molette fermée)');
    } },
    { cible: 'journee.envoyer', via: 'next', phase: 'covered' },
  ], 'tel');
  check(w.length === 0, `tel sortie-oubliee : aucune écriture (la fiche n’est jamais enregistrée par le guide)`);

  // 2d · planning : le menu s'ouvre tout seul, « Ma semaine » s'ouvre au toucher, un jour de la semaine
  await fresh('comment voir mon planning');
  w = await walk(p, 'planning', [
    { cible: 'menu.compte', via: 'next' },
    { cible: 'menu.semaine', via: 'touch', before: async () => { check(await menuOpen(p), 'tel planning 2 : menu ouvert par le guide'); } },
    { cible: 'semaine.jour', via: 'touch', before: async () => {
      check((await p.locator('.bt-phdr-date').innerText()).trim().toLowerCase() === 'ma semaine', 'tel planning 3 : l’écran « Ma semaine » est ouvert');
      await p.screenshot({ path: `${SH}/tel-8-planning-semaine.png` });
    } },
  ], 'tel');
  check(w.length === 0 && errors.length === 0, `tel planning : aucune écriture, aucune erreur ${errors.join(' // ')}`);
  check((await p.locator('.bt-phdr-date').innerText()).trim().length > 0 && !(await guideOpen(p)), 'tel planning : toucher le vrai jour a ouvert le jour et fermé le guide (dernier pas)');

  // 2e · changer sa photo (menu) : le guide ouvre le menu et ne touche à rien ; « Terminer » le referme
  await fresh('comment changer ma photo');
  const chooser = []; p.on('filechooser', (f) => chooser.push(f));
  w = await walk(p, 'photo-profil', [
    { cible: 'menu.compte', via: 'next' },
    { cible: 'menu.photo', via: 'next', before: async () => { check(await menuOpen(p), 'tel photo-profil 2 : menu ouvert'); await p.screenshot({ path: `${SH}/tel-9-changer-ma-photo.png` }); } },
  ], 'tel');
  check(!(await menuOpen(p)), 'tel photo-profil : à la fin le menu que le guide avait ouvert est refermé');
  check(chooser.length === 0 && w.length === 0, 'tel photo-profil : aucun sélecteur de fichier ouvert, aucune écriture (le salarié touche lui-même)');

  // 2f · notifications : l'entrée du menu existe seulement si le téléphone sait le faire → sinon le message, sans blocage
  await fresh('comment activer les notifications');
  await p.locator(G.next).click(); await p.waitForTimeout(600);
  const hasNotif = (await p.locator('[data-guide="menu.notifications"]').count()) > 0;
  console.log(`   (notifications : entrée du menu ${hasNotif ? 'présente' : 'absente sur ce navigateur'})`);
  if (hasNotif) await checkRing(p, 'menu.notifications', 'tel notifications 2'); else check(await waitPhase(p, 'missing', 6000), 'tel notifications 2 : entrée absente → « Je ne vois pas ce bouton sur votre écran. »');
  await p.locator(G.next).click(); await p.waitForTimeout(300);
  check(!(await guideOpen(p)) && !(await menuOpen(p)), 'tel notifications : « Terminer » ferme le guide et le menu');

  // 2g · signaler une réserve : la carte ouvre la fiche, « Avec réserve », le détail, « Documents » ouvre une fenêtre qui cache « OK »
  await fresh('comment signaler une réserve');
  w = await walk(p, 'reserve', [
    { cible: 'journee.chantier', via: 'touch' },
    { cible: 'editeur.reserve', via: 'touch' },
    { cible: 'editeur.note', via: 'next', before: async () => { await p.screenshot({ path: `${SH}/tel-10-reserve-detail.png` }); } },
    { cible: 'editeur.documents', via: 'touch' },
    { cible: 'editeur.ok', via: 'next', phase: 'covered', after: async () => {
      check(await topAt(p, G.card), 'tel reserve 5 : la carte du guide reste lisible au-dessus de la fenêtre « Documents » (on peut toujours continuer)');
      await p.locator('[role=dialog]:has-text("Documents") button:has-text("Close")').click();
      await checkRing(p, 'editeur.ok', 'tel reserve 5 (fenêtre fermée)');
    } },
  ], 'tel');
  check(w.length === 0, `tel reserve : aucune écriture (« OK » n’est jamais touché par le guide) ${w.map((c) => c.method + c.path)}`);

  // 2h · chef d'équipe : « Mon équipe », jour, salarié, « Corriger », « Ajouter des heures », « OK — envoyer au bureau »
  role = 'lead';
  await fresh('comment chef d equipe', (d) => { d.time_entries = [entry('e1', W2, '13:00', '16:30'), entry('e-lucas', W1, '08:00', '12:00', { user_id: 'u-lucas' })]; });
  w = await walk(p, 'equipe', [
    { cible: 'equipe.jour', via: 'next' },
    { cible: 'equipe.salarie', via: 'next' },
    { cible: 'equipe.corriger', via: 'next' },
    { cible: 'equipe.ajouter', via: 'touch' },
    { cible: 'equipe.ok', via: 'next', before: async () => { await p.screenshot({ path: `${SH}/tel-11-chef-equipe-ok.png` }); } },
  ], 'tel');
  check(w.length === 0, `tel equipe : aucune écriture, rien n’est envoyé au bureau ${w.map((c) => c.method + c.path)}`);
  role = 'worker';

  // 2i · lever une réserve : le bandeau jaune, la liste, le formulaire
  await fresh('comment lever la réserve', (d) => { d.time_entries = [entry('e1', W2, '13:00', '16:30'), entry('er', W1, '08:00', '12:00', { work_date: yesterday, reception: 'avec', status: 'submitted', observation: 'Joint à reprendre', reserve_resolved_at: null, reserve_fixed_at: null })]; });
  w = await walk(p, 'lever-reserve', [
    { cible: 'reserves.bandeau', via: 'touch' },
    { cible: 'reserves.lever', via: 'touch' },
    { cible: 'reserves.valider', via: 'next', before: async () => { await p.screenshot({ path: `${SH}/tel-12-lever-reserve.png` }); } },
  ], 'tel');
  check(w.length === 0, 'tel lever-reserve : aucune écriture (la réserve n’est pas levée par le guide)');

  // 2j · informations (fenêtre tout en haut de la pile) : la carte passe AU-DESSUS
  await fresh('comment informations');
  w = await walk(p, 'infos', [
    { cible: 'menu.compte', via: 'next' },
    { cible: 'menu.infos', via: 'touch' },
    { cible: 'infos.fermer', via: 'touch', before: async () => { check(await topAt(p, G.card), 'tel infos 3 : la carte est au-dessus de la fenêtre « Informations » (la plus haute)'); await p.screenshot({ path: `${SH}/tel-13-informations.png` }); } },
  ], 'tel');
  check(w.length === 0 && (await p.locator('[aria-label="Informations"]').count()) === 0, 'tel infos : « Fermer » touché → fenêtre fermée et guide terminé');

  // 2k · noter ses heures à la main (« + », chantier, heures, « OK » caché par la molette)
  await fresh('comment noter heure');
  w = await walk(p, 'noter-heures', [
    { cible: 'journee.plus', via: 'touch' },
    { cible: 'editeur.chantier', via: 'touch' },
    { cible: 'editeur.horaires', via: 'touch' },
    { cible: 'editeur.ok', via: 'next', phase: 'covered', after: async () => { await p.locator('button:has-text("Valider les heures")').click(); await checkRing(p, 'editeur.ok', 'tel noter-heures 4 (molette fermée)'); } },
    { cible: 'journee.envoyer', via: 'next', phase: 'covered' },
  ], 'tel');
  check(w.length === 0, `tel noter-heures : aucune écriture ${w.map((c) => c.method + c.path)}`);
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// 3 · Tous les guides : chacun s'ouvre depuis l'assistant, chaque étape a un anneau pile sur sa cible OU un message (jamais de blocage)
// ═════════════════════════════════════════════════════════════════════════
if (run(3)) {
  const QUESTIONS = {
    reserve: 'comment signaler reserve', 'photo-document': 'comment ajouter photo', conge: 'comment demander conge', pointer: 'comment pointer',
    'envoyer-journee': 'comment envoyer journee', 'noter-heures': 'comment noter heure', planning: 'comment planning', historique: 'comment historique',
    'copier-journee': 'comment copier', notifications: 'comment notification', 'photo-profil': 'comment photo de profil', panier: 'comment panier',
    'modifier-heures': 'comment modifier mes heures', 'retirer-ligne': 'comment enlever un chantier', 'route-pause': 'comment pause entre',
    'lever-reserve': 'comment leve reserve', 'annuler-conge': 'comment annuler conge', 'sortie-oubliee': 'comment sortie oubliee',
    'autre-chantier': 'comment nouveau chantier', 'envoyer-client': 'comment envoyer au client', borne: 'comment borne', equipe: 'comment chef d equipe', infos: 'comment informations',
  };
  role = 'lead';
  const ctx = await newCtx({ width: 390, height: 844 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  let nSteps = 0, nRing = 0, nMissing = 0, nCovered = 0, nGuides = 0;
  for (const [id, q] of Object.entries(QUESTIONS)) {
    D = base();
    D.time_entries = [entry('e1', W2, '13:00', '16:30'), entry('e-lucas', W1, '08:00', '12:00', { user_id: 'u-lucas' })];
    await open(p); errors.length = 0;
    const w0 = mark();
    let labels;
    try { labels = await ask(p, q); } catch (e) { check(false, `${id} : pas de réponse à « ${q} »`); continue; }
    check(labels.includes('Me guider pas à pas') && labels[labels.length - 1] === 'Me guider pas à pas', `${id} : « ${q} » → ${labels.join(' | ')}`);
    await p.locator('.as-bot .as-links').last().locator('button', { hasText: 'Me guider pas à pas' }).click();
    await p.waitForSelector(G.card);
    nGuides++;
    const total = Number((await count(p)).split(' sur ')[1]);
    for (let i = 0; i < total; i++) {
      nSteps++;
      // Où en est-on : anneau, message « introuvable » ou « caché » (le plus tôt possible, jamais de blocage)
      const res = await Promise.race([
        waitPhase(p, 'ring', 6000).then((x) => x && 'ring'),
        waitPhase(p, 'missing', 6000).then((x) => x && 'missing'),
        waitPhase(p, 'covered', 6000).then((x) => x && 'covered'),
      ]);
      const cible = await p.locator(G.ring).getAttribute('data-cible');
      if (res === 'ring') {
        nRing++;
        await p.waitForTimeout(250);
        const t = await targetRect(p, cible), r = await boxOf(p, G.ring), e = t && expectedRing(t);
        check(!!t && !!r && near(r.x, e.x) && near(r.y, e.y) && near(r.w, e.w) && near(r.h, e.h), `${id} ${i + 1}/${total} « ${cible} » : anneau pile sur la cible`);
      } else if (res === 'missing') { nMissing++; console.log(`   · ${id} ${i + 1}/${total} « ${cible} » : cible absente → message de repli (attendu selon l’état de l’écran)`); }
      else if (res === 'covered') { nCovered++; console.log(`   · ${id} ${i + 1}/${total} « ${cible} » : cible cachée par une fenêtre → message`); }
      else check(false, `${id} ${i + 1}/${total} « ${cible} » : ni anneau ni message après 6 s (blocage !)`);
      await p.locator(G.next).click();
      await p.waitForTimeout(200);
    }
    check(!(await guideOpen(p)), `${id} : le guide se termine après ${total} « Suivant »`);
    const w = writes(w0);
    check(w.length === 0 && errors.length === 0, `${id} : aucune écriture, aucune erreur console ${w.map((c) => c.method + c.path)} ${errors.join(' // ')}`);
  }
  console.log(`\n   ${nGuides} guides joués, ${nSteps} étapes : ${nRing} avec anneau, ${nMissing} cible absente, ${nCovered} cible cachée`);
  check(nGuides === Object.keys(QUESTIONS).length, `3) ${nGuides} guides joués de bout en bout`);
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// 4 · Suivi : défilement, rotation de l'écran ; mouvement réduit
// ═════════════════════════════════════════════════════════════════════════
if (run(4)) {
  role = 'worker';
  D = base();
  D.time_entries = Array.from({ length: 9 }, (_, i) => entry(`ex${i}`, [W1, W2, W3][i % 3], `${String(6 + i).padStart(2, '0')}:00`, `${String(6 + i).padStart(2, '0')}:45`));
  const ctx = await newCtx({ width: 390, height: 844 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await open(p); errors.length = 0;
  await startGuide(p, 'comment modifier mes heures');
  await checkRing(p, 'journee.chantier', 'suivi 1');
  // Défilement : l'anneau suit la ligne
  await p.evaluate(() => { const s = document.querySelector('.bt-day-scroll'); s.scrollTop = s.scrollTop + 70; });
  await p.waitForTimeout(500);
  let t = await targetRect(p, 'journee.chantier'), r = await boxOf(p, G.ring), e = t && expectedRing(t);
  check(!!t && !!r && near(r.x, e.x) && near(r.y, e.y) && near(r.w, e.w) && near(r.h, e.h), `suivi : après un défilement de 70 px, l’anneau suit (cible y=${Math.round(t?.y)}, anneau y=${Math.round(r?.y)})`);
  // Rotation : paysage puis retour
  await p.setViewportSize({ width: 844, height: 390 });
  await p.waitForTimeout(700);
  const landscape = await p.locator(`${G.ring}:not([hidden])`).count();
  t = await targetRect(p, 'journee.chantier'); r = await boxOf(p, G.ring); e = t && expectedRing(t);
  check(landscape === 1 && !!t && !!r && near(r.x, e.x) && near(r.y, e.y) && near(r.w, e.w) && near(r.h, e.h), 'suivi : après la rotation (844×390), l’anneau est toujours sur la cible');
  const cb = await boxOf(p, G.card);
  check(cb.x >= 0 && cb.x + cb.w <= 844 && cb.y >= 0 && cb.y + cb.h <= 390, `suivi : la carte tient dans l’écran en paysage (${Math.round(cb.w)}×${Math.round(cb.h)})`);
  await p.screenshot({ path: `${SH}/suivi-paysage.png` });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(700);
  t = await targetRect(p, 'journee.chantier'); r = await boxOf(p, G.ring); e = t && expectedRing(t);
  check(!!t && !!r && near(r.x, e.x) && near(r.y, e.y), 'suivi : retour en portrait, l’anneau est toujours sur la cible');
  // Cible tout en bas d'une longue liste (hors écran) : le guide fait défiler pour la montrer
  await p.locator(G.close).click();
  await p.evaluate(() => { document.querySelector('.bt-day-scroll').scrollTop = 0; });
  await startGuide(p, 'comment copier');
  const scrolled = await p.evaluate(() => document.querySelector('.bt-day-scroll').scrollTop);
  await checkRing(p, 'journee.copier', 'défilement auto');
  const after = await p.evaluate(() => document.querySelector('.bt-day-scroll').scrollTop);
  check(after > 100, `défilement auto : la liste a défilé pour montrer « Dupliquer cette journée » (scrollTop ${Math.round(after)})`);
  await p.screenshot({ path: `${SH}/tel-15-defilement-auto.png` });
  check(errors.length === 0, `suivi : aucune erreur console ${errors.join(' // ')}`);
  await p.locator(G.close).click();

  // Mouvement réduit : pas d'animation
  const ctxR = await newCtx({ width: 390, height: 844 }, { reducedMotion: 'reduce' });
  const pr = await ctxR.newPage();
  await open(pr);
  await startGuide(pr, 'comment envoyer journee');
  await waitPhase(pr, 'ring');
  const an = await pr.evaluate(() => [getComputedStyle(document.querySelector('[data-testid=guide-ring]')).animationName, getComputedStyle(document.querySelector('[data-testid=guide-card]')).animationName]);
  check(an[0] === 'none' && an[1] === 'none', `mouvement réduit : ni pulsation de l’anneau ni entrée animée de la carte (${an.join(', ')})`);
  await ctxR.close();
  const ctxN = await newCtx({ width: 390, height: 844 });
  const pn = await ctxN.newPage();
  await open(pn);
  await startGuide(pn, 'comment envoyer journee');
  await waitPhase(pn, 'ring');
  const an3 = await pn.evaluate(() => getComputedStyle(document.querySelector('[data-testid=guide-ring]')).animationName);
  check(an3 === 'gt-pulse', `mouvement normal : l’anneau pulse (${an3})`);
  await ctxN.close();

  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// 5 · Boîte de confirmation : le guide se met SOUS elle ; compatibilité front / fonction
// ═════════════════════════════════════════════════════════════════════════
if (run(5)) {
  role = 'worker'; D = base();
  const ctx = await newCtx({ width: 390, height: 844 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await open(p); errors.length = 0;

  // 5a · une boîte de confirmation s'ouvre PENDANT le guide : elle reste au-dessus, lisible et cliquable
  await startGuide(p, 'comment modifier mes heures');
  await waitPhase(p, 'ring');
  check(await topAt(p, G.card), 'confirmation : (avant) la carte du guide est visible');
  await p.locator('.bt-send:not([disabled])').click({ force: true });
  await p.waitForSelector('[data-guide-confirm]');
  await p.waitForTimeout(500);
  check(!(await topAt(p, G.card)), 'confirmation : la boîte « Horaires prévus par le bureau » est AU-DESSUS de la carte du guide');
  await p.screenshot({ path: `${SH}/tel-14-confirmation-au-dessus.png` });
  await p.locator('[data-testid=planned-confirm-fix]').click();     // « Non, je corrige mes heures » : un vrai toucher du salarié
  await p.waitForTimeout(500);
  check((await guideOpen(p)) && (await topAt(p, G.card)), 'confirmation : la boîte fermée, le guide est de nouveau au-dessus');
  await p.locator(G.close).click();

  // 5b · fonction NOUVELLE : « Me guider pas à pas » ; id inconnu ignoré sans erreur
  await p.goto(`http://localhost:${PORT}/poseur`); await p.waitForSelector('.bt-total'); await p.waitForTimeout(700); errors.length = 0;
  const reply = (links) => ({ kind: 'guide', answer: 'Demander un congé :\n1. Menu.', links, remaining: 10 });
  const askFn = async () => { await p.click('[data-testid=dock-assistant]'); await p.fill('.as-bar textarea', 'comment je demande un congé'); await p.click('button[aria-label="Envoyer"]'); await p.waitForSelector('.as-bot .as-links'); };
  fnReply = reply([{ label: 'Mes congés', action: 'conges' }, { label: 'Me guider pas à pas', action: 'guide:inconnu' }]);
  await askFn();
  await p.locator('.as-bot .as-links button', { hasText: 'Me guider pas à pas' }).click();
  await p.waitForTimeout(500);
  check(!(await guideOpen(p)) && errors.length === 0, `id inconnu (guide:inconnu) : ignoré, aucun guide, aucune erreur ${errors.join(' // ')}`);

  // 5c · FRONT NOUVEAU + fonction ANCIENNE (pas de bouton guide) : rien ne casse, « Mes congés » marche
  await p.goto(`http://localhost:${PORT}/poseur`); await p.waitForSelector('.bt-total'); await p.waitForTimeout(700); errors.length = 0;
  fnReply = reply([{ label: 'Mes congés', action: 'conges' }]);
  await askFn();
  check((await p.locator('.as-bot .as-links button').allInnerTexts()).map((x) => x.trim()).join('|') === 'Mes congés', 'ancienne fonction : seulement « Mes congés » (pas de « Me guider pas à pas »)');
  await p.locator('.as-bot .as-links button', { hasText: 'Mes congés' }).click();
  await p.waitForSelector('[role=dialog]:has-text("Mes congés")');
  check(errors.length === 0, 'ancienne fonction : « Mes congés » ouvre la fenêtre, aucune erreur');

  // 5d · NOUVELLE fonction (hors démo) : le vrai bouton ouvre le vrai guide
  await p.goto(`http://localhost:${PORT}/poseur`); await p.waitForSelector('.bt-total'); await p.waitForTimeout(700); errors.length = 0;
  fnReply = reply([{ label: 'Mes congés', action: 'conges' }, { label: 'Me guider pas à pas', action: 'guide:conge' }]);
  await askFn();
  await p.locator('.as-bot .as-links button', { hasText: 'Me guider pas à pas' }).click();
  await p.waitForSelector(G.card);
  check(await count(p) === 'Étape 1 sur 5' && errors.length === 0, 'nouvelle fonction : « Me guider pas à pas » ouvre le guide du congé (5 étapes)');
  fnReply = null;
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
