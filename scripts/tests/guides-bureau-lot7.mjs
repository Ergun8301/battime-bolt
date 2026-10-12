// Lancer : node scripts/tests/guides-bureau-lot7.mjs out docs/captures-lot7-fin (après npm run build).
//   ONLY=a,b,c pour rejouer des parties (voir `run('x')` plus bas) ; PORT en 3ᵉ argument.
// Lot 7 (suite) — « Me guider pas à pas » côté BUREAU, sur la VRAIE page /admin (base simulée, horloge figée au
// mercredi 21 octobre 2026, 10:00 à Paris), aux largeurs 1280×800, 1100×800, 768×1024 (même mise en page que le
// téléphone) et 390×844 :
//  a) la réponse de l'assistant porte « Me guider pas à pas » ; un clic replie l'assistant et lance le guide ;
//     une action « guide:constructor » ou « guide: » ne fait rien ; « deplacer » sur petit écran = un message, pas de guide ;
//  b) parcours complets au vrai clic (anneau PILE sur la cible) : ajouter_salarie, creer_client, export, demandes_conge
//     (anneau sur la LISTE, jamais sur ✓), reglages, support, abonnement, borne (aucun appel kiosk), selection (mode PAS armé),
//     versions, absence, semaine ; cases vides (affecter), puce « Autre » sans client (attribuer), deplacer (« Suivant » seul) ;
//  c) « Suivant » seul sur TOUTES les fiches à 1280 et à 390 : aucune erreur JS, aucune écriture ;
//  d) saisies préservées (Précédent / Suivant ne vide ni « Nouveau salarié » ni « Réglages ») ; Échap ne ferme que le guide ;
//     réseau coupé après le démarrage ;
//  e) AUCUNE ÉCRITURE à partir de l'apparition de la carte du guide (liste blanche nommée des seules lectures par RPC).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { chromium } from 'playwright-core';
const [,, OUT, SH, PORT = '4431'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const run = (n) => !process.env.ONLY || process.env.ONLY.split(',').includes(String(n));
let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };

// Les fiches : lues dans le fichier lui-même (même source que le navigateur et la fonction).
const TOURS_SRC = fs.readFileSync(new URL('../../supabase/functions/_shared/admin-tours.ts', import.meta.url), 'utf8');
const TOUR_IDS = [...TOURS_SRC.matchAll(/^ {2}\{ id: '([a-z_]+)'/gm)].map((m) => m[1]);
check(TOUR_IDS.length === 48, `48 fiches lues dans admin-tours.ts (${TOUR_IDS.length})`);

// ─── Horloge figée : mercredi 21 octobre 2026, 10:00 (Paris) ─────────────────────
const NOW = new Date('2026-10-21T10:00:00+02:00');
const D_ = (d) => `2026-10-${String(d).padStart(2, '0')}`;
const CO = 'c0000000-0000-0000-0000-000000000001';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', address: '12 rue des Lilas', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Maison Martin', city: 'Vienne', is_active: true };
const WS = { w1: W1, w2: W2 };
const usr = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01' });
const slot = (id, user_id, work_date, ws, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: ws?.id ?? null, work_date, absence_type: null, estimated_start: null, estimated_end: null, notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: `${work_date}T06:00:00Z`, ...extra });
const entry = (id, user_id, work_date, ws, status, minutes, extra = {}) => ({ id, company_id: CO, user_id, work_date, worksite_id: ws?.id ?? null, planning_id: null, status, start_time: '08:00:00', end_time: `${String(8 + Math.floor(minutes / 60)).padStart(2, '0')}:00:00`, total_minutes: minutes, reception: null, reserve_resolved_at: null, reserve_fixed_at: null, observation: null, ...extra });
const ver = (id, number, created_at) => ({ id, company_id: CO, week_start: D_(19), number, kind: number === 1 ? 'initial' : 'manuel', request: null, note: null, created_by: 'u-admin', created_at, cells: [], user_ids: [] });
const fresh = () => ({
  users: [usr('u-admin', 'Paul', 'Martin', 'admin'), usr('u-dupont', 'Jean', 'Dupont'), usr('u-martin', 'Léa', 'Martin')],
  companies: [{ id: CO, name: 'Entreprise Exemple', ai_enabled: true, kiosk_enabled: true, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: 'compta@exemple.fr', support_enabled: true, colleagues_planning_visible: false }],
  worksites: [W1, W2],
  planning: [slot('p1', 'u-dupont', D_(19), W1), slot('p2', 'u-dupont', D_(20), W1), slot('p3', 'u-dupont', D_(21), W1), slot('p4', 'u-martin', D_(20), W2)],
  // Léa : heures hors planning, une chez un client (lundi), une SANS client (jeudi) — « Autre ».
  time_entries: [entry('e1', 'u-martin', D_(19), W1, 'submitted', 120), entry('e2', 'u-martin', D_(22), null, 'submitted', 120),
    entry('e3', 'u-dupont', D_(13), W2, 'submitted', 60, { reception: 'avec', observation: 'Joint à reprendre' })],
  active_sessions: [], month_closures: [], user_closures: [],
  leave_requests: [{ id: 'lr1', company_id: CO, user_id: 'u-dupont', type: 'conge', status: 'pending', start_date: D_(26), end_date: D_(27), created_at: '2026-10-10T08:00:00Z' }],
  invitations: [
    { id: 'i1', company_id: CO, email: 'marc@exemple.fr', first_name: 'Marc', last_name: 'Durand', role: 'worker', token: 't1', created_at: '2026-10-10T08:00:00Z', expires_at: '2030-01-01T00:00:00Z', accepted_at: null, created_by: 'u-admin' },
    { id: 'i2', company_id: CO, email: 'nina@exemple.fr', first_name: 'Nina', last_name: 'Morel', role: 'worker', token: 't2', created_at: '2026-10-11T08:00:00Z', expires_at: '2030-01-01T00:00:00Z', accepted_at: null, created_by: 'u-admin' },
  ],
  documents: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [], worksite_expenses: [], user_payroll: [], assistant_journal: [],
  planning_versions: [ver('v1', 1, '2026-10-19T05:30:00Z'), ver('v2', 2, '2026-10-20T09:10:00Z')],
});
let D = fresh();

// ─── Session simulée + routes Supabase (avec état, comme admin-lot11) ───────────
const now = Math.floor(NOW.getTime() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-admin', role: 'authenticated', exp: now + 864000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 864000, expires_in: 864000, token_type: 'bearer', user: { id: 'u-admin', email: 'paul@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    let neg = false; let w = v; if (w.startsWith('not.')) { neg = true; w = w.slice(4); }
    const dot = w.indexOf('.'); const op = w.slice(0, dot); const val = w.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k]; let r = true;
      if (op === 'eq') r = String(cur) === val; else if (op === 'neq') r = String(cur) !== val;
      else if (op === 'in') r = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      else if (op === 'gte') r = String(cur) >= val; else if (op === 'lte') r = String(cur) <= val;
      else if (op === 'gt') r = String(cur) > val; else if (op === 'lt') r = String(cur) < val;
      else if (op === 'is') r = val === 'null' ? cur == null : String(cur) === val;
      return neg ? !r : r;
    });
  }
  return rows;
};
const embed = (t, row, sel) => {
  const out = { ...row };
  if (sel.includes('worksite:worksites')) out.worksite = row.worksite_id ? WS[row.worksite_id] : null;
  if (sel.includes('user:users')) out.user = D.users.find((x) => x.id === row.user_id) || null;
  if (sel.includes('owner:users')) { const o = D.users.find((x) => x.id === row.user_id); out.owner = o ? { first_name: o.first_name, last_name: o.last_name } : null; }
  return out;
};
// Toutes les requêtes qui partent, dans l'ordre : { method, path, rpc, fn, t }.
const calls = [];
let REPLY = { id: 'ajouter_salarie', extra: [] };
const mark = () => calls.length;
// Les SEULES lectures par RPC (POST) que le guide a le droit de provoquer en ouvrant une fenêtre : ajoutées une à une, par nom.
const RPC_LECTURE = new Set(['my_worksite_labour']);
/** Tout ce qui n'est pas une lecture : un échec. */
const ecritures = (from) => calls.slice(from).filter((c) => {
  if (c.path.startsWith('/auth/v1/token')) return false;                 // renouvellement de session, pas un geste du guide
  if (c.rpc) return !RPC_LECTURE.has(c.rpc);                              // support_* (sauf lecture), set_*, kiosk_*… = écriture
  if (c.fn) return true;                                                  // kiosk, send-push, invite-worker, assistant…
  if (/\/auth\/v1\/factors/.test(c.path)) return true;
  return !['GET', 'HEAD'].includes(c.method);
});
const setup = async (ctx) => {
  await ctx.clock.install({ time: NOW });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url()); const m = r.request().method();
    const rec = { method: m, path: url.pathname, t: Date.now() };
    if (url.pathname.startsWith('/rest/v1/rpc/')) rec.rpc = url.pathname.slice('/rest/v1/rpc/'.length);
    if (url.pathname.startsWith('/functions/v1/')) rec.fn = url.pathname.slice('/functions/v1/'.length);
    calls.push(rec);
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/assistant')) {
      const link = { label: 'Me guider pas à pas', action: `guide:${REPLY.id}` };
      return r.fulfill({ json: { answer: 'Voici comment faire : suivez les étapes.', links: [{ label: 'Salariés', action: 'salaries' }, link, ...REPLY.extra], remaining: 40 } });
    }
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (url.pathname === '/rest/v1/rpc/my_worksite_labour') return r.fulfill({ json: [] });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', ''); D[t] = D[t] || [];
    const sel = url.searchParams.get('select') || '*';
    const single = (r.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    if (m === 'DELETE' || m === 'POST' || m === 'PATCH') return r.fulfill({ status: 201, json: single ? { id: 'x' } : [] });
    const all = filterRows(D[t], url.searchParams).map((x) => embed(t, x, sel));
    if (single) return all.length ? r.fulfill({ json: all[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
    const rows = all.slice(off, lim ? off + Number(lim) : undefined);
    return r.fulfill({ json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${all.length}`, 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' } });
  });
};

const QUESTION = { ajouter_salarie: 'Comment j’ajoute un salarié ?', creer_client: 'Comment je crée un client ?', export: 'Comment je fais l’export des heures ?', demandes_conge: 'Comment je réponds à une demande de congé ?', reglages: 'Où je change les réglages de l’entreprise ?', collegues: 'Comment je règle le planning des collègues ?', semaine: 'Comment je change de semaine ?', deplacer: 'Comment je déplace une intervention ?', selection: 'Comment je supprime plusieurs interventions ?' };
const G = { card: '[data-testid=guide-card]', ring: '[data-testid=guide-ring]', next: '[data-testid=guide-next]', prev: '[data-testid=guide-prev]', close: '[data-testid=guide-close]', text: '[data-testid=guide-text]', count: '[data-testid=guide-count]', root: '[data-testid=guide-root]' };
const errors = [];
const newPage = async (w, h, mobile = false) => {
  D = fresh();
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(mobile ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  await setup(ctx); const p = await ctx.newPage();
  p.on('pageerror', (e) => { errors.push(e.message); console.log('   [erreur page]', e.message); });
  await open(p, mobile ? '.bt-pl-m-card' : '[data-testid=stat-waiting]');
  return { ctx, p };
};
async function open(p, ready) {
  await p.goto(`http://localhost:${PORT}/admin`);
  await p.waitForSelector(ready, { timeout: 20000 }); await p.waitForTimeout(1800);
}
const narrowVp = (p) => p.evaluate(() => matchMedia('(max-width: 1023px)').matches);
const guideOpen = (p) => p.locator(G.card).count().then((n) => n > 0);
const assistantBtn = (p) => p.locator(':is([data-testid=bar-assistant],[data-testid=m-assistant]):visible').first();
/** Demande à l'assistant ; rend les libellés des boutons de la réponse. */
async function ask(p, id, extra = []) {
  REPLY = { id, extra };
  if ((await p.locator('[data-testid=assistant-panel]').count()) === 0) { await assistantBtn(p).click(); await p.waitForSelector('.as-bar textarea'); }
  const before = await p.locator('.as-bot .as-links').count();
  await p.fill('.as-bar textarea', QUESTION[id] ?? `Comment faire ${id.replace(/_/g, ' ')} ?`);
  await p.click('button[aria-label="Envoyer"]');
  await p.waitForFunction((n) => document.querySelectorAll('.as-bot .as-links').length > n, before, { timeout: 8000 });
  return (await p.locator('.as-bot .as-links').last().locator('button').allInnerTexts()).map((t) => t.trim());
}
/** Lance le guide par le bouton de la réponse. Rend l'index des requêtes AU MOMENT où la carte apparaît. */
async function startGuide(p, id) {
  await ask(p, id);
  await p.locator('.as-bot .as-links').last().locator('button', { hasText: 'Me guider pas à pas' }).click();
  await p.waitForSelector(G.card, { timeout: 5000 });
  return mark();
}

// ─── Mesures de l'anneau (comme guides-lot7) ──────────────────────────────────
const targetRect = (p, cible) => p.evaluate((c) => {
  const el = [...document.querySelectorAll(`[data-guide="${c}"]`)].find((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight, tag: el.tagName.toLowerCase() };
}, cible);
const boxOf = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
const near = (a, b, tol = 1.6) => Math.abs(a - b) <= tol;
const expectedRing = (t) => {
  const x = Math.max(t.x - 4, 3), y = Math.max(t.y - 4, 3);
  return { x, y, w: Math.max(Math.min(t.x + t.w + 4, t.vw - 3) - x, 8), h: Math.max(Math.min(t.y + t.h + 4, t.vh - 3) - y, 8) };
};
const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
async function waitPhase(p, want, timeout = 5000) {
  const sel = { ring: `${G.ring}:not([hidden])`, missing: '[data-testid=guide-missing]', covered: '[data-testid=guide-covered]' }[want];
  try { await p.waitForSelector(sel, { timeout }); return true; } catch { return false; }
}
/** Une étape avec anneau : sur la bonne cible, au pixel près, sans la recouvrir avec la carte. */
async function checkRing(p, cible, label) {
  const shown = await waitPhase(p, 'ring');
  check(shown, `${label} : anneau affiché`);
  if (!shown) return null;
  // Un menu qui glisse (☰) ou une fenêtre qui apparaît : on attend que la cible ne bouge plus.
  let t = null;
  for (let i = 0, prev = ''; i < 25; i++) { await p.waitForTimeout(120); t = await targetRect(p, cible); const k = JSON.stringify(t); if (k === prev) break; prev = k; }
  const r = await boxOf(p, G.ring), e = t && expectedRing(t);
  check(!!t && !!r && near(r.x, e.x) && near(r.y, e.y) && near(r.w, e.w) && near(r.h, e.h),
    `${label} : anneau pile sur « ${cible} » (cible ${t ? [t.x, t.y, t.w, t.h].map(Math.round) : '?'} → anneau ${r ? [r.x, r.y, r.w, r.h].map(Math.round) : '?'})`);
  check((await p.locator(G.ring).getAttribute('data-cible')) === cible, `${label} : l’anneau est celui de « ${cible} »`);
  const card = await boxOf(p, G.card);
  check(!!card && !!t && !intersects(card, { x: t.x, y: t.y, w: t.w, h: t.h }), `${label} : la carte ne cache pas la cible (carte en ${await p.locator(G.card).getAttribute('data-pos')})`);
  return t;
}
const stepText = (p) => p.locator(G.text).textContent().then((t) => t.replace(/\s+/g, ' ').replace(/^Étape \d+ sur \d+\. /, '').trim());
const count = (p) => p.locator(G.count).textContent().then((t) => t.trim());
const real = (p, cible) => p.locator(`[data-guide="${cible}"] >> visible=true`).first();
/**
 * Joue un guide de bout en bout. plan[i] = { cible, via: 'next' | 'touch', phase?: 'ring' | 'missing' | 'covered', after?, tag? }.
 * Le dernier pas se termine par « Terminer » (next) ou par le toucher de la cible (touch).
 */
async function walk(p, id, plan, tag) {
  const n = plan.length;
  for (let i = 0; i < n; i++) {
    const s = plan[i]; const label = `${tag} ${id} ${i + 1}/${n}`;
    check((await count(p)) === `Étape ${i + 1} sur ${n}`, `${label} : « Étape ${i + 1} sur ${n} » (${await count(p)})`);
    check((await stepText(p)).length > 5, `${label} : ${(await stepText(p)).slice(0, 100)}`);
    const phase = s.phase || 'ring';
    if (phase === 'ring') s.rect = await checkRing(p, s.cible, label);
    else {
      check(await waitPhase(p, phase, 6000), `${label} : « ${phase === 'missing' ? 'Je ne vois pas ce bouton sur votre écran.' : 'caché par une fenêtre'} »`);
      check((await p.locator(`${G.ring}:not([hidden])`).count()) === 0, `${label} : pas d’anneau sur un bouton qu’on ne voit pas`);
    }
    if (s.after) await s.after();
    const last = i === n - 1;
    if ((s.via || 'next') === 'touch') await real(p, s.cible).click();
    else {
      if (last) check((await p.locator(G.next).innerText()).trim() === 'Terminer', `${label} : dernier pas = « Terminer »`);
      await p.locator(G.next).click();
    }
    if (last) { await p.waitForTimeout(300); check(!(await guideOpen(p)), `${label} : le guide se ferme à la fin`); }
    else { try { await p.waitForFunction((t) => document.querySelector('[data-testid=guide-count]')?.textContent?.trim() === t, `Étape ${i + 2} sur ${n}`, { timeout: 3000 }); } catch { /* le contrôle suivant le dira */ } }
  }
}
/** Ferme les fenêtres laissées ouvertes, ou recharge la page. */
async function reset(p, ready) {
  for (let i = 0; i < 4 && (await p.locator('[role=dialog]:not([data-testid=guide-card])').count()) > 0; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(250); }
  if ((await p.locator('[role=dialog]:not([data-testid=guide-card])').count()) > 0 || (await p.locator('.bt-pl-ddbackdrop').count()) > 0 || (await p.locator('[data-testid=sel-bar]').count()) > 0) await open(p, ready);
}
const noWrite = (from, label) => { const w = ecritures(from); check(w.length === 0, `${label} : aucune écriture depuis l’apparition de la carte${w.length ? ` — ${w.map((c) => `${c.method} ${c.path}`).join(' ; ')}` : ''}`); };
const shot = (p, name) => p.screenshot({ path: `${SH}/${name}.png` });

// ═════════════════════════════════════════════════════════════════════════
// A · 1280×800 : le bouton, le lancement, les parcours au vrai clic
// ═════════════════════════════════════════════════════════════════════════
const VP = { w: 1280, h: 800 };
if (run('a')) {
  const { ctx, p } = await newPage(VP.w, VP.h);
  const READY = '[data-testid=stat-waiting]';
  const labels = await ask(p, 'ajouter_salarie');
  check(labels.includes('Salariés') && labels.includes('Me guider pas à pas') && labels.indexOf('Salariés') < labels.indexOf('Me guider pas à pas'), `A · réponse : « Salariés » puis « Me guider pas à pas » (${labels.join(' | ')})`);
  // Un id inconnu ne fait rien (ni carte, ni fermeture de l’assistant, ni erreur).
  const labels2 = await ask(p, 'ajouter_salarie', [{ label: 'Inconnu 1', action: 'guide:constructor' }, { label: 'Inconnu 2', action: 'guide:__proto__' }, { label: 'Inconnu 3', action: 'guide:' }]);
  for (const l of ['Inconnu 1', 'Inconnu 2', 'Inconnu 3']) {
    await p.locator('.as-bot .as-links').last().locator('button', { hasText: l }).click(); await p.waitForTimeout(300);
    check(!(await guideOpen(p)), `A · « ${l} » : aucun guide`);
  }
  check(labels2.length === 5, 'A · les trois faux liens étaient bien là');
  check(errors.length === 0, 'A · aucune erreur JS avec les ids inconnus');
  await p.locator('.as-bot .as-links').last().locator('button', { hasText: 'Me guider pas à pas' }).click();
  await p.waitForSelector(G.card);
  check((await p.locator('[data-testid=assistant-panel]').count()) === 0, 'A · l’assistant se replie quand le guide commence');
  check(await p.evaluate(() => document.activeElement === document.querySelector('[data-testid=guide-card]')), 'A · le focus est sur la carte');
  const from = mark();
  await walk(p, 'ajouter_salarie', [
    { cible: 'bureau-nav.salaries', via: 'touch' },
    { cible: 'bureau-salaries.nouveau', via: 'touch' },
    { cible: 'bureau-salaries.envoyer', via: 'next' },
  ], 'A ordi');
  noWrite(from, 'A ajouter_salarie');
  await reset(p, READY);

  // ── creer_client : le menu « Clients », puis la fenêtre, jusqu'au bouton (jamais cliqué)
  let f = await startGuide(p, 'creer_client');
  await walk(p, 'creer_client', [
    { cible: 'bureau-nav.clients', via: 'touch' }, { cible: 'bureau-clients.nouveau', via: 'touch' }, { cible: 'bureau-clients.creer', via: 'next' },
  ], 'A ordi'); noWrite(f, 'A creer_client'); await reset(p, READY);

  // ── export : le menu « Exporter » est entouré, jamais un format ; « verrouille » est dit
  f = await startGuide(p, 'export');
  await walk(p, 'export', [{ cible: 'bureau-nav.exporter', via: 'touch' }, { cible: 'bureau-export.menu', via: 'next' }, { cible: 'bureau-export.comptable', via: 'next' }], 'A ordi');
  noWrite(f, 'A export'); await reset(p, READY);

  // ── demandes_conge : l'anneau est sur la LISTE (une ligne), jamais sur ✓ ni ✗
  f = await startGuide(p, 'demandes_conge');
  await walk(p, 'demandes_conge', [
    { cible: 'bureau-nav.salaries', via: 'touch' }, { cible: 'bureau-salaries.conges', via: 'touch' },
    { cible: 'bureau-conges.liste', via: 'next', after: async () => {
      const t = await targetRect(p, 'bureau-conges.liste'); check(!!t && t.tag === 'div', `A · l’anneau des congés est sur la ligne de la demande (<${t?.tag}>), pas sur un bouton`);
      check((await p.locator('[data-guide="bureau-conges.liste"] button[title=Accepter]').count()) === 1, 'A · le bouton ✓ est DANS la ligne entourée, sans ancre propre');
    } },
  ], 'A ordi'); noWrite(f, 'A demandes_conge'); await reset(p, READY);

  // ── reglages (compte puis Réglages), support (rubrique repliée, ligne durée + bouton), abonnement
  f = await startGuide(p, 'reglages');
  await walk(p, 'reglages', [{ cible: 'bureau-nav.compte', via: 'touch' }, { cible: 'bureau-nav.reglages', via: 'touch' }, { cible: 'bureau-reglages.enregistrer', via: 'next' }], 'A ordi');
  noWrite(f, 'A reglages'); await reset(p, READY);
  f = await startGuide(p, 'support');
  await walk(p, 'support', [
    { cible: 'bureau-nav.compte', via: 'touch' }, { cible: 'bureau-nav.reglages', via: 'touch' },
    { cible: 'bureau-reglages.rub-notif', via: 'touch', after: async () => { check((await real(p, 'bureau-reglages.rub-notif').getAttribute('aria-expanded')) === 'false', 'A · la rubrique « Notifications & support » est repliée : le patron l’ouvre lui-même'); } },
    { cible: 'bureau-reglages.support', via: 'next', after: async () => {
      const t = await targetRect(p, 'bureau-reglages.support');
      check(!!t && t.tag === 'div' && (await real(p, 'bureau-reglages.support').locator('button', { hasText: 'Autoriser le support BEMEXO' }).count()) === 1, 'A · l’anneau du support est sur la ligne « durée + Autoriser », pas sur le bouton seul');
      await shot(p, '05-support-ligne-duree');
    } },
  ], 'A ordi'); noWrite(f, 'A support'); await reset(p, READY);
  f = await startGuide(p, 'abonnement');
  await walk(p, 'abonnement', [
    { cible: 'bureau-nav.abonner', via: 'next', phase: 'missing' }, { cible: 'bureau-nav.compte', via: 'touch' }, { cible: 'bureau-nav.reglages', via: 'touch' },
    { cible: 'bureau-reglages.abonnement', via: 'next' },
  ], 'A ordi'); noWrite(f, 'A abonnement'); await reset(p, READY);

  // ── borne : « Borne » entouré, rien d'ouvert, AUCUN appel kiosk
  f = await startGuide(p, 'borne');
  await walk(p, 'borne', [{ cible: 'bureau-nav.borne', via: 'next' }, { cible: 'bureau-borne.code', via: 'next', phase: 'missing' }, { cible: 'bureau-borne.deconnecter', via: 'next', phase: 'missing' }], 'A ordi');
  check(calls.slice(f).every((c) => !/kiosk/.test(c.path)), 'A · borne : aucun appel kiosk, aucun code d’appairage demandé');
  noWrite(f, 'A borne'); await reset(p, READY);

  // ── selection : « Sélectionner » entouré, le mode N'est PAS armé
  f = await startGuide(p, 'selection');
  await walk(p, 'selection', [
    { cible: 'bureau-nav.selection', via: 'next' }, { cible: 'bureau-planning.bulle', via: 'next' },
    { cible: 'bureau-selection.tout', via: 'next', phase: 'missing' }, { cible: 'bureau-selection.supprimer', via: 'next', phase: 'missing' },
  ], 'A ordi');
  check((await p.locator('[data-testid=sel-bar]').count()) === 0, 'A · selection : le mode « Sélectionner » n’est pas armé');
  noWrite(f, 'A selection'); await reset(p, READY);

  // ── versions (la fenêtre s'ouvre seule, « Voir » entouré, aucun retour)
  f = await startGuide(p, 'versions');
  await walk(p, 'versions', [
    { cible: 'bureau-nav.versions', via: 'next' }, { cible: 'bureau-versions.voir', via: 'next' },
    { cible: 'bureau-versions.liste', via: 'next', after: async () => { check((await targetRect(p, 'bureau-versions.liste'))?.tag === 'div', 'A · versions : la LISTE est entourée, pas « Revenir à cette version »'); } },
  ], 'A ordi'); noWrite(f, 'A versions'); await reset(p, READY);

  // ── absence : le nom du salarié, puis les choix (conteneur), puis « Enregistrer » absent tant que le calendrier n'est pas ouvert
  f = await startGuide(p, 'absence');
  await walk(p, 'absence', [
    { cible: 'bureau-planning.nom', via: 'touch' }, { cible: 'bureau-statut.absences', via: 'next' },
    { cible: 'bureau-absence.enregistrer', via: 'next', phase: 'missing' },
  ], 'A ordi'); noWrite(f, 'A absence'); await reset(p, READY);

  // ── affecter : l'anneau est sur une case VIDE (aucune bulle dedans)
  f = await startGuide(p, 'affecter');
  await checkRing(p, 'bureau-planning.case', 'A ordi affecter 1');
  const caseVide = await p.evaluate(() => { const el = [...document.querySelectorAll('[data-guide="bureau-planning.case"]')].find((e) => e.getClientRects().length); return !!el && el.querySelectorAll('[data-bub],.bt-pl-extra').length === 0; });
  check(caseVide, 'A · affecter : la case entourée est vide (ni bulle ni heures ajoutées)');
  await p.locator(G.close).click(); await reset(p, READY);

  // ── attribuer : seulement la puce SANS client (jeudi), pas celle du lundi qui a un client
  f = await startGuide(p, 'attribuer');
  const tA = await checkRing(p, 'bureau-planning.autre', 'A ordi attribuer 1');
  const chips = await p.evaluate(() => [...document.querySelectorAll('.bt-pl-extra')].filter((e) => e.getClientRects().length).map((e) => ({ guide: e.getAttribute('data-guide'), txt: e.textContent.trim().slice(0, 30) })));
  check(chips.length === 2 && chips.filter((c) => c.guide).length === 1, `A · attribuer : 2 puces hors planning, une seule ancrée (${JSON.stringify(chips)})`);
  check(!!tA, 'A · attribuer : l’anneau est posé');
  await p.locator(G.close).click(); await reset(p, READY);

  // ── deplacer : « Suivant » seul avance ; un vrai glisser sur la bulle n'ouvre pas la fenêtre de modification
  f = await startGuide(p, 'deplacer');
  const tb = await checkRing(p, 'bureau-planning.bulle', 'A ordi deplacer 1');
  if (tb) {
    await p.mouse.move(tb.x + tb.w / 2, tb.y + tb.h / 2); await p.mouse.down();
    await p.mouse.move(tb.x + tb.w / 2 + 40, tb.y + tb.h / 2 + 12, { steps: 6 }); await p.mouse.move(tb.x + tb.w / 2 + 8, tb.y + tb.h / 2, { steps: 4 }); await p.mouse.up();
    await p.waitForTimeout(500);
    check((await p.locator('[data-testid=edit-delete]').count()) === 0, 'A · deplacer : un glisser sur la bulle n’ouvre pas la fenêtre de modification');
    check((await count(p)) === 'Étape 1 sur 2', `A · deplacer : un glisser n’avance pas le guide (${await count(p)})`);
  }
  await p.locator(G.next).click(); await p.waitForFunction(() => document.querySelector('[data-testid=guide-count]')?.textContent?.trim() === 'Étape 2 sur 2');
  await checkRing(p, 'bureau-planning.case', 'A ordi deplacer 2');
  await p.locator(G.next).click(); await p.waitForTimeout(250); check(!(await guideOpen(p)), 'A · deplacer : « Terminer » ferme');
  await reset(p, READY);

  // ── Échap : ferme le guide SEUL (la fenêtre reste, le mode Sélectionner aussi)
  f = await startGuide(p, 'ajouter_salarie');
  await real(p, 'bureau-nav.salaries').click(); await p.waitForSelector('[role=dialog]:not([data-testid=guide-card])');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check(!(await guideOpen(p)) && (await p.locator('[role=dialog]:not([data-testid=guide-card])').count()) === 1, 'A · Échap ferme le guide, la fenêtre « Salariés » reste');
  await reset(p, READY);
  await p.locator('[data-testid=bar-select]').click(); await p.waitForSelector('[data-testid=sel-bar]');
  f = await startGuide(p, 'selection'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check(!(await guideOpen(p)) && (await p.locator('[data-testid=sel-bar]').count()) === 1, 'A · Échap ferme le guide, le mode « Sélectionner » n’est pas quitté');
  await reset(p, READY);
  // « Fermer » + focus rendu
  f = await startGuide(p, 'assistant'); await checkRing(p, 'bureau-nav.assistant', 'A ordi assistant 1');
  await p.locator(G.close).click(); await p.waitForTimeout(500);
  check(await p.evaluate(() => document.activeElement?.getAttribute('data-guide') === 'bureau-nav.assistant'), 'A · « Fermer » : le focus revient à l’étoile ✨');
  // aria-hidden de la racine avec une fenêtre ouverte (relevé)
  f = await startGuide(p, 'ajouter_salarie'); await real(p, 'bureau-nav.salaries').click(); await p.waitForTimeout(500);
  const ah = await p.evaluate(() => { const r = document.querySelector('[data-testid=guide-root]'); let n = r, hid = null; while (n && n !== document.body) { if (n.getAttribute?.('aria-hidden') === 'true') hid = n.tagName; n = n.parentElement; } return { rootHidden: r?.getAttribute('aria-hidden'), ancestorHidden: hid }; });
  console.log(`   relevé : aria-hidden de la racine du guide avec une fenêtre ouverte = ${JSON.stringify(ah)}`);
  await p.keyboard.press('Escape'); await reset(p, READY);
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// B · Saisies préservées, cible absente, réseau coupé
// ═════════════════════════════════════════════════════════════════════════
if (run('b')) {
  const READY = '[data-testid=stat-waiting]';
  const { ctx, p } = await newPage(VP.w, VP.h);
  // « Nouveau salarié » : taper, Précédent, Suivant → la valeur est toujours là
  let f = await startGuide(p, 'ajouter_salarie');
  await p.locator(G.next).click(); await p.waitForTimeout(300); await p.locator(G.next).click();
  await p.waitForFunction(() => document.querySelector('[data-testid=guide-count]')?.textContent?.trim() === 'Étape 3 sur 3');
  const formulaire = p.locator('[role=dialog]', { has: p.locator('h2', { hasText: /^Nouveau salarié$/ }) });
  const prenom = formulaire.locator('input').first(); await prenom.waitFor(); await prenom.fill('Pierrick');
  await p.locator(G.prev).click(); await p.waitForTimeout(600);
  check((await p.locator('h2', { hasText: /^Salariés$/ }).count()) === 1, 'B · « Précédent » rouvre « Salariés » (le formulaire reste ouvert, jamais fermé sous les doigts)');
  check(await waitPhase(p, 'covered', 4000), 'B · « Précédent » : la carte dit que le bouton est caché par une fenêtre (le formulaire, qu’on ne ferme pas)');
  await p.locator(G.next).click(); await p.waitForTimeout(600);
  check((await formulaire.locator('input').first().inputValue()) === 'Pierrick', 'B · « Nouveau salarié » : la valeur tapée est toujours là après Précédent puis Suivant');
  check((await p.locator('h2', { hasText: /^Salariés$/ }).count()) === 0, 'B · « Suivant » referme « Salariés » : le formulaire n’est pas recouvert');
  await checkRing(p, 'bureau-salaries.envoyer', 'B nouveau salarié 3');
  await p.locator(G.close).click(); await reset(p, READY);
  // « Réglages » : le nom de l'entreprise
  f = await startGuide(p, 'reglages');
  await p.locator(G.next).click(); await p.waitForTimeout(300); await p.locator(G.next).click();
  await p.waitForFunction(() => document.querySelector('[data-testid=guide-count]')?.textContent?.trim() === 'Étape 3 sur 3');
  const nom = p.locator('[role=dialog]:not([data-testid=guide-card]) input[value="Entreprise Exemple"]').first(); await nom.waitFor(); await nom.fill('Entreprise Exemple 2');
  await p.locator(G.prev).click(); await p.waitForTimeout(500); await p.locator(G.next).click(); await p.waitForTimeout(500);
  check((await p.locator('[role=dialog]:not([data-testid=guide-card]) input').evaluateAll((l) => l.some((i) => i.value === 'Entreprise Exemple 2'))), 'B · « Réglages » : le nom tapé est toujours là après Précédent puis Suivant');
  await p.locator(G.close).click(); await reset(p, READY);
  // fiche_salarie : « Précédent » depuis l'étape 3 : la fiche reste ouverte, la carte dit « caché par une fenêtre »
  f = await startGuide(p, 'fiche_salarie');
  await real(p, 'bureau-nav.salaries').click(); await p.waitForTimeout(300); await p.locator(G.next).click(); await p.waitForTimeout(300);
  await real(p, 'bureau-salaries.nom').click(); await p.waitForTimeout(500);
  await p.waitForFunction(() => document.querySelector('[data-testid=guide-count]')?.textContent?.trim() === 'Étape 3 sur 3', null, { timeout: 4000 }).catch(() => {});
  const champs = p.locator('[role=dialog]:not([data-testid=guide-card]) input:not([type=file]):not([type=hidden])');
  const fiche = champs.first(); await fiche.waitFor();
  const v0 = await fiche.inputValue(); await fiche.fill('Dupond-Test');
  await p.locator(G.prev).click(); await p.waitForTimeout(1800);
  check((await p.locator('[role=dialog]:not([data-testid=guide-card])').count()) >= 1, 'B · « Précédent » depuis la fiche : la fiche reste ouverte (rien n’est fermé sous les doigts)');
  // Selon l'ordre des fenêtres, « Salariés » passe devant la fiche (anneau) ou derrière (« caché par une fenêtre ») : dans les deux cas la fiche n'est pas touchée.
  check(await waitPhase(p, 'ring', 2500) || await waitPhase(p, 'covered', 3000), 'B · « Précédent » : anneau sur « Salariés » ou « caché par une fenêtre » (jamais de fiche fermée)');
  check((await champs.first().inputValue()) === 'Dupond-Test' && v0 !== 'Dupond-Test', 'B · la valeur modifiée dans la fiche est intacte');
  await p.locator(G.close).click(); await reset(p, READY);
  // budget : même chose depuis la fiche d'un client (le budget tapé n'est pas perdu par « Précédent »)
  f = await startGuide(p, 'budget');
  await real(p, 'bureau-nav.clients').click(); await p.waitForTimeout(300); await real(p, 'bureau-clients.crayon').click(); await p.waitForTimeout(600);
  await p.waitForFunction(() => document.querySelector('[data-testid=guide-count]')?.textContent?.trim() === 'Étape 3 sur 4', null, { timeout: 4000 }).catch(() => {});
  const heures = p.locator('[role=dialog]:not([data-testid=guide-card]) input[placeholder="ex. 48"]'); await heures.waitFor(); await heures.fill('48');
  await p.locator(G.prev).click(); await p.waitForTimeout(1500);
  check((await p.locator('[role=dialog]:not([data-testid=guide-card]) input[placeholder="ex. 48"]').count()) === 1 && (await heures.inputValue()) === '48', 'B · budget : « Précédent » ne ferme pas la fiche du client, le budget tapé est intact');
  noWrite(f, 'B budget'); await p.locator(G.close).click(); await reset(p, READY);
  // cible absente : « Voir la liste » des invitations quand il n'y en a plus → le message (comportement existant)
  D.invitations = []; await open(p, READY);
  f = await startGuide(p, 'relancer');
  check(await waitPhase(p, 'missing', 6000), 'B · invitations absentes : « Je ne vois pas ce bouton sur votre écran. »');
  check((await stepText(p)).startsWith('Je ne vois pas ce bouton sur votre écran.'), 'B · message exact puis la phrase de l’étape');
  await p.locator(G.close).click(); D = fresh(); await open(p, READY);
  // réseau coupé après le démarrage : aucune erreur JS, Fermer et Échap marchent
  const e0 = errors.length;
  f = await startGuide(p, 'reserves');
  await ctx.setOffline(true);
  await p.locator(G.next).click(); await p.waitForTimeout(2200);
  check(errors.length === e0, 'B · réseau coupé : aucune erreur JS');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check(!(await guideOpen(p)), 'B · réseau coupé : Échap ferme le guide');
  await ctx.setOffline(false); await reset(p, READY);
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// C · « Suivant » seul sur TOUTES les fiches : 1280 puis 390 (aucune erreur, aucune écriture, « Terminer » ferme)
// ═════════════════════════════════════════════════════════════════════════
for (const vp of [{ n: '1280', w: 1280, h: 800, m: false }, { n: '390', w: 390, h: 844, m: true }]) {
  if (!run('c') && !run(`c${vp.n}`)) continue;
  const READY = vp.m ? '.bt-pl-m-card' : '[data-testid=stat-waiting]';
  const { ctx, p } = await newPage(vp.w, vp.h, vp.m);
  const e0 = errors.length; let manquants = [];
  for (const id of TOUR_IDS) {
    if (id === 'deplacer' && vp.m) continue; // message « sur ordinateur » : voir D
    const f = await startGuide(p, id);
    const n = Number((await count(p)).replace(/^Étape 1 sur /, ''));
    check(n >= 1 && n <= 5, `C ${vp.n} · ${id} : ${n} étape(s)`);
    for (let i = 0; i < n; i++) {
      if (!(await waitPhase(p, 'ring', 1800))) manquants.push(`${id}#${i + 1}`);
      await p.locator(G.next).click(); await p.waitForTimeout(120);
    }
    await p.waitForTimeout(150);
    check(!(await guideOpen(p)), `C ${vp.n} · ${id} : « Terminer » ferme le guide`);
    noWrite(f, `C ${vp.n} ${id}`);
    await reset(p, READY);
  }
  check(errors.length === e0, `C ${vp.n} · aucune erreur JS sur les ${TOUR_IDS.length} fiches`);
  console.log(`   (${vp.n}) étapes sans anneau avec « Suivant » seul (attendu : celles qui demandent un clic du patron avant) : ${manquants.join(', ')}`);
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// D · Tablette 768 et téléphone 390 : le menu ☰, « Chantiers », « Semaine suivante », le message de « deplacer »
// ═════════════════════════════════════════════════════════════════════════
for (const vp of [{ n: 'tel-390', w: 390, h: 844 }, { n: 'tablette-768', w: 768, h: 1024 }]) {
  if (!run('d')) break;
  const READY = '.bt-pl-m-card';
  const { ctx, p } = await newPage(vp.w, vp.h, true);
  check(await narrowVp(p), `D ${vp.n} · mise en page « téléphone »`);
  // la réponse : deux boutons (capture à 390)
  const labels = await ask(p, 'ajouter_salarie');
  check(labels.includes('Me guider pas à pas'), `D ${vp.n} · la réponse porte « Me guider pas à pas »`);
  if (vp.n === 'tel-390') await shot(p, '01-reponse-deux-boutons');
  let f = mark();
  await p.locator('.as-bot .as-links').last().locator('button', { hasText: 'Me guider pas à pas' }).click(); await p.waitForSelector(G.card); f = mark();
  check((await p.locator('[data-testid=assistant-panel]').count()) === 0, `D ${vp.n} · l’assistant se replie`);
  await walk(p, 'ajouter_salarie', [
    { cible: 'bureau-nav.menu', via: 'touch' },
    { cible: 'bureau-nav.salaries', via: 'touch', after: async () => { if (vp.n === 'tel-390') await shot(p, '02-anneau-ligne-du-menu'); } },
    { cible: 'bureau-salaries.nouveau', via: 'touch', after: async () => { if (vp.n === 'tel-390') await shot(p, '03-anneau-fenetre-salaries'); } },
    { cible: 'bureau-salaries.envoyer', via: 'next' },
  ], `D ${vp.n}`);
  noWrite(f, `D ${vp.n} ajouter_salarie`); await reset(p, READY);
  // Réglages par le ☰, rubrique repliée
  f = await startGuide(p, 'collegues');
  await walk(p, 'collegues', [
    { cible: 'bureau-nav.menu', via: 'touch' }, { cible: 'bureau-nav.reglages', via: 'touch' },
    { cible: 'bureau-reglages.rub-borne', via: 'next', after: async () => { if (vp.n === 'tel-390') await shot(p, '04-reglages-rubrique-repliee'); } },
    { cible: 'bureau-reglages.collegues', via: 'next', phase: 'missing' },
  ], `D ${vp.n}`); noWrite(f, `D ${vp.n} collegues`); await reset(p, READY);
  // creer_client : « Chantiers » (écran mobile), la ligne s'appelle autrement
  f = await startGuide(p, 'creer_client');
  await walk(p, 'creer_client', [{ cible: 'bureau-nav.menu', via: 'touch' }, { cible: 'bureau-nav.clients', via: 'touch' }, { cible: 'bureau-clients.nouveau', via: 'touch' }, { cible: 'bureau-clients.creer', via: 'next' }], `D ${vp.n}`);
  noWrite(f, `D ${vp.n} creer_client`); await reset(p, READY);
  // semaine : l'anneau est sur « Semaine suivante », jamais sur « Déconnexion »
  f = await startGuide(p, 'semaine');
  const ts = await checkRing(p, 'bureau-semaine.nav', `D ${vp.n} semaine`);
  check(await p.locator(G.ring).getAttribute('data-cible') === 'bureau-semaine.nav' && (await real(p, 'bureau-semaine.nav').getAttribute('aria-label')) === 'Semaine suivante', `D ${vp.n} · semaine : l’anneau est sur « Semaine suivante »`);
  check(!!ts && ts.w < 80, `D ${vp.n} · semaine : un seul petit bouton (${ts ? Math.round(ts.w) : '?'} px), pas le bloc qui contient « Déconnexion »`);
  await p.locator(G.close).click(); await reset(p, READY);
  // selection par le ☰ : « Sélectionner des interventions », mode pas armé
  f = await startGuide(p, 'selection');
  await walk(p, 'selection', [{ cible: 'bureau-nav.menu', via: 'touch' }, { cible: 'bureau-nav.selection', via: 'next' }, { cible: 'bureau-planning.bulle', via: 'next' }, { cible: 'bureau-selection.tout', via: 'next', phase: 'missing' }, { cible: 'bureau-selection.supprimer', via: 'next', phase: 'missing' }], `D ${vp.n}`);
  check((await p.locator('[data-testid=sel-bar]').count()) === 0, `D ${vp.n} · selection : le mode n’est pas armé`);
  noWrite(f, `D ${vp.n} selection`); await reset(p, READY);
  // deplacer : un message, pas de guide
  await ask(p, 'deplacer');
  await p.locator('.as-bot .as-links').last().locator('button', { hasText: 'Me guider pas à pas' }).click(); await p.waitForTimeout(600);
  check(!(await guideOpen(p)) && (await p.getByText('Ce guide se fait sur ordinateur').count()) > 0, `D ${vp.n} · deplacer : message « sur ordinateur », aucun guide`);
  check((await p.locator('[data-testid=assistant-panel]').count()) === 0, `D ${vp.n} · deplacer : l’assistant se replie quand même`);
  await reset(p, READY);
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// E · 1100×800 (ordinateur étroit) : « Coûts »
// ═════════════════════════════════════════════════════════════════════════
if (run('e')) {
  const { ctx, p } = await newPage(1100, 800);
  const f = await startGuide(p, 'couts');
  await walk(p, 'couts', [{ cible: 'bureau-nav.couts', via: 'touch' }, { cible: 'bureau-cout.periodes', via: 'next' }], 'E 1100');
  noWrite(f, 'E couts'); await ctx.close();
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
