// Lot 3bis (1) — LA PAUSE, partout où elle se note : fiche du salarié, question
// à l'envoi (lignes de la borne comprises), correction du bureau, carte de
// l'Assistant. Puces 0 / 15 / 30 / 45 min / 1 h / 1 h 30 / 2 h + « Autre »
// (h:mm), libellé « Total des pauses », indice « additionne-les ». Sur les
// VRAIES pages (/poseur et /admin), UNE base simulée partagée par les deux
// navigateurs (aucune vraie base, aucun e-mail : send-push est simulé).
//
// Lancer : npm run build, puis
//   node scripts/tests/pause-lot3bis.mjs out docs/captures-lot3bis [port]
// Captures « avant » (build de 5657373, captures seulement, aucune vérification) :
//   AVANT=1 node scripts/tests/pause-lot3bis.mjs <out-avant> docs/captures-lot3bis [port]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-lot3bis', PORT = '5131'] = process.argv;
const AVANT = process.env.AVANT === '1';
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
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Horloge : aujourd'hui, 19:30 à Paris (la journée est finie) ──────────────
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const parisOffset = (() => { const d = new Date(`${today}T12:00:00Z`); const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(d)); return h - 12; })();
const NOW = new Date(Date.parse(`${today}T19:30:00Z`) - parisOffset * 3600000);

// ─── Base simulée (noms fictifs neutres) ──────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-0000000000bb';
const ME = 'u-alex'; const ADMIN = 'u-admin';
const SITE = { id: 'w-test', company_id: CO, client_name: 'Chantier Test', city: 'Lyon', is_active: true, address: null, latitude: null, longitude: null };
const AUTRE = { id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true, address: null, latitude: null, longitude: null };
const USERS = [
  { id: ADMIN, company_id: CO, first_name: 'Admin', last_name: 'Test', role: 'admin', email: 'admin@exemple.fr', is_active: true, created_at: '2026-01-01' },
  { id: ME, company_id: CO, first_name: 'Alex', last_name: 'Martin', role: 'worker', email: 'alex@exemple.fr', is_active: true, created_at: '2026-01-01' },
];
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: null };
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const hh = (t) => String(t || '').slice(0, 5);
const generated = (r) => { let d = toMin(r.end_time) - toMin(r.start_time); if (d < 0) d += 1440; return d - (Number(r.break_minutes) || 0); };
let seq = 0;
const D = {};
const freshDb = () => {
  for (const k of Object.keys(D)) delete D[k];
  Object.assign(D, {
    users: USERS.map((x) => ({ ...x })), companies: [{ ...COMPANY }], worksites: [SITE, AUTRE].map((x) => ({ ...x })),
    planning: [], time_entries: [], active_sessions: [], time_entry_corrections: [], time_entry_edits: [],
    user_payroll: [{ user_id: ME, company_id: CO, payroll_id: '00001' }],
  });
};
freshDb();
const ws = (id) => D.worksites.find((w) => w.id === id) || null;
const nameOf = (id) => { const u = D.users.find((x) => x.id === id); return u ? { first_name: u.first_name, last_name: u.last_name } : null; };
/** Une ligne telle que la base la stockerait (total_minutes = colonne calculée). */
const row = (o) => {
  const r = {
    id: o.id || `e-${++seq}`, company_id: CO, user_id: ME, worksite_id: SITE.id, planning_id: null, work_date: today,
    break_minutes: 0, meal_allowance: false, status: 'draft', locked: false, exported_at: null, observation: null, reception: null,
    gap_before: null, source: null, exit_forgotten: false, corrected_at: null, modified_at: null, modified_by: null, submitted_at: null,
    client_id: null, created_at: NOW.toISOString(), ...o,
  };
  if (['submitted', 'validated'].includes(r.status) && !r.submitted_at) r.submitted_at = NOW.toISOString();
  r.start_time = r.start_time.length === 5 ? `${r.start_time}:00` : r.start_time;
  r.end_time = r.end_time.length === 5 ? `${r.end_time}:00` : r.end_time;
  r.total_minutes = generated(r);
  r.worksite = ws(r.worksite_id); r.user = nameOf(r.user_id);
  return r;
};
const plan = (id, s, e) => ({ id, company_id: CO, user_id: ME, worksite_id: SITE.id, work_date: today, absence_type: null,
  estimated_start: `${s}:00`, estimated_end: `${e}:00`, notes: null, created_at: NOW.toISOString(), worksite: ws(SITE.id), user: nameOf(ME) });

const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    const dot = v.indexOf('.'); const op = v.slice(0, dot); const val = v.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k];
      if (op === 'eq') return String(cur) === val;
      if (op === 'neq') return String(cur) !== val;
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      if (op === 'gte') return String(cur) >= val;
      if (op === 'lte') return String(cur) <= val;
      if (op === 'gt') return String(cur) > val;
      if (op === 'lt') return String(cur) < val;
      if (op === 'is') return val === 'null' ? cur == null : String(cur) === val;
      if (op === 'not' && val === 'is.null') return cur != null;
      return true;
    });
  }
  return rows;
};
const sortRows = (rows, order) => {
  if (!order) return rows;
  const keys = order.split(',').map((o) => { const [k, dir] = o.split('.'); return { k, desc: dir === 'desc' }; });
  return [...rows].sort((a, z) => { for (const { k, desc } of keys) { const x = String(a[k] ?? ''); const y = String(z[k] ?? ''); if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1); } return 0; });
};

// office_correct_entry rejouée (mêmes règles que le SQL du lot 2, voir bureau-lot2.mjs).
class Refus extends Error { constructor(message, code = 'P0001') { super(message); this.code = code; } }
const stateOf = (e) => ({ start_time: hh(e.start_time), end_time: hh(e.end_time), break_minutes: Number(e.break_minutes) || 0,
  meal_allowance: !!e.meal_allowance, gap_before: e.gap_before ?? null, status: e.status });
function officeCorrect(uid, { p_entry_id, p_changes: ch, p_reason }) {
  if (String(p_reason || '').trim().length < 3) throw new Refus('Indiquez un motif (3 caractères au moins).', '22023');
  const e = D.time_entries.find((x) => x.id === p_entry_id);
  const old = stateOf(e);
  const start = ch.start_time ? hh(ch.start_time) : old.start_time; const end = ch.end_time ? hh(ch.end_time) : old.end_time;
  const brk = 'break_minutes' in ch ? Number(ch.break_minutes) : old.break_minutes;
  let span = toMin(end) - toMin(start); if (span < 0) span += 1440;
  if (brk < 0 || brk >= span) throw new Refus('La pause doit être plus courte que la journée.', '22023');
  Object.assign(e, { start_time: `${start}:00`, end_time: `${end}:00`, break_minutes: brk, modified_at: NOW.toISOString(), modified_by: uid });
  e.total_minutes = generated(e);
  const x = { id: `x-${D.time_entry_edits.length + 1}`, company_id: CO, entry_id: e.id, worker_id: e.user_id, work_date: e.work_date, kind: 'correction',
    reason: String(p_reason).trim(), edited_by: uid, edited_at: NOW.toISOString(), old_values: old, new_values: stateOf(e), correction_id: null,
    was_exported: false, notified_at: null, notify_error: null };
  D.time_entry_edits.push(x);
  return [x];
}

// ─── Réseau simulé ────────────────────────────────────────────────────────────
const writes = []; // toutes les écritures (REST hors GET, RPC, fonctions)
let assistantReply = null;
let failInsert = false; // le réseau lâche à l'insertion : la saisie reste dans la file du téléphone
const sessionFor = (uid, email) => {
  const now = Math.floor(NOW.getTime() / 1000) + 3600; const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
  return { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: uid, email, aud: 'authenticated', role: 'authenticated' } };
};
const newCtx = async (uid, email, viewport) => {
  const ctx = await b.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const session = sessionFor(uid, email);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  // Chaque message affiché (sonner) est noté : on les lit sans toucher au DOM de React.
  await ctx.addInitScript(() => {
    window.__toasts = [];
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        const list = n.matches?.('[data-sonner-toast]') ? [n] : [...(n.querySelectorAll?.('[data-sonner-toast]') || [])];
        for (const t of list) setTimeout(() => window.__toasts.push((t.textContent || '').trim()), 60);
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await ctx.clock.setFixedTime(NOW);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const url = new URL(req.url()); const m = req.method();
    let body = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/')) {
      const fn = url.pathname.replace('/functions/v1/', '');
      writes.push({ m: 'FN', t: fn, body, by: uid });
      if (fn === 'send-push') return r.fulfill({ json: { mode: 'admin', sent: 1, failed: 0, purged: 0 } });
      if (fn === 'worker-assistant' && assistantReply) return r.fulfill({ json: assistantReply });
      return r.fulfill({ json: {} });
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.replace('/rest/v1/rpc/', '');
      writes.push({ m: 'RPC', t: fn, body, by: uid });
      try {
        if (fn === 'office_correct_entry') return r.fulfill({ json: officeCorrect(uid, body) });
      } catch (e) {
        return r.fulfill({ status: 400, json: { code: e.code || 'P0001', message: e.message, details: null, hint: null } });
      }
      if (fn === 'office_edit_mark_notified') {
        const hit = D.time_entry_edits.filter((x) => (body?.p_ids || []).includes(x.id));
        for (const x of hit) { if (body?.p_error == null) x.notified_at = NOW.toISOString(); else x.notify_error = String(body.p_error); }
        return r.fulfill({ json: hit.length });
      }
      if (fn === 'company_has_kiosk') return r.fulfill({ json: false });
      return r.fulfill({ json: [] });
    }
    const t = url.pathname.replace('/rest/v1/', '');
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const reply = (rows, status = 200) => {
      if (single) return rows.length ? r.fulfill({ status, json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none', details: null, hint: null } });
      return r.fulfill({ status, json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } });
    };
    if (m === 'GET' || m === 'HEAD') {
      let rows = sortRows(filterRows(D[t] || [], url.searchParams), url.searchParams.get('order'));
      const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
      if (off || lim) rows = rows.slice(off, lim ? off + Number(lim) : undefined);
      return reply(rows);
    }
    writes.push({ m, t, q: url.search, body, by: uid });
    if (m === 'POST') {
      if (t === 'time_entries' && failInsert) return r.abort('failed');
      const list = (Array.isArray(body) ? body : [body]).map((x) => ({ ...x }));
      if (t === 'time_entries') { const made = list.map((x) => row(x)); D.time_entries.push(...made); return reply(made, 201); }
      return reply(list, 201);
    }
    const hit = filterRows(D[t] || [], url.searchParams);
    if (m === 'PATCH') {
      for (const x of hit) {
        if (t === 'time_entries' && x.status === 'draft' && body?.status === 'submitted') x.submitted_at = NOW.toISOString();
        Object.assign(x, body);
        if (t === 'time_entries') { x.total_minutes = generated(x); x.worksite = ws(x.worksite_id); }
      }
      return reply(hit);
    }
    if (m === 'DELETE') { D[t] = (D[t] || []).filter((x) => !hit.includes(x)); return reply(hit); }
    return reply([]);
  });
  return ctx;
};

// ─── Outils ───────────────────────────────────────────────────────────────────
let ok = 0, ko = 0; const fails = [];
const check = (c, m) => { if (AVANT) return; if (c) { ok++; console.log('  ✅', m); } else { ko++; fails.push(m); console.log('  ❌', m); } };
const shot = async (loc, name) => { await loc.screenshot({ path: path.join(SH, `pause-${AVANT ? 'avant' : 'apres'}-${name}.png`) }).catch((e) => console.log('   (capture impossible :', e.message.split('\n')[0], ')')); };
const since = (n) => writes.slice(n);
const of = (list, m, t) => list.filter((w) => w.m === m && (t == null || w.t === t));
const bodyOf = (w) => (Array.isArray(w?.body) ? w.body[0] : w?.body) || {};
const txt = async (loc) => (await loc.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const noHScroll = async (pg) => pg.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);

const PAUSE_TOO_LONG = 'La pause doit être plus courte que la journée.';
const UNREADABLE = 'Durée non comprise. Ex. 1:15 ou 45 min.';
const BARE = 'Écris 1:00 pour une heure, ou 5 min.';
const CHIPS = ['15 min', '30 min', '45 min', '1 h', '1 h 30', '2 h', 'Autre'];
const IDS = ['0', '15', '30', '45', '60', '90', '120', 'autre'];
const HINT_FICHE = 'Pendant ces heures. Plusieurs pauses ? Additionne-les.';
const HINT_ENVOI = 'Pendant cette plage. Plusieurs pauses ? Additionne-les.';
const HINT_BUREAU = 'Pendant ces heures. Plusieurs pauses : additionnez-les.';

const worker = await newCtx(ME, 'alex@exemple.fr', { width: 390, height: 844 });
const office = await newCtx(ADMIN, 'admin@exemple.fr', { width: 1280, height: 800 });
const wp = await worker.newPage();
wp.on('pageerror', (e) => console.log('   [erreur page salarié]', e.message));
const op = await office.newPage();
op.on('pageerror', (e) => console.log('   [erreur page bureau]', e.message));

let wMark = 0;
const wToasts = async () => (await wp.evaluate((k) => (window.__toasts || []).slice(k), wMark)).join(' | ');
const wClear = async () => { wMark = await wp.evaluate(() => (window.__toasts || []).length); };
let oMark = 0;
const oToasts = async () => (await op.evaluate((k) => (window.__toasts || []).slice(k), oMark)).join(' | ');
const oClear = async () => { oMark = await op.evaluate(() => (window.__toasts || []).length); };

// ── Côté salarié (mêmes gestes que scripts/tests/heures-lot1.mjs) ──
const openWorker = async () => {
  await wp.goto(`http://localhost:${PORT}/poseur`); await wp.waitForSelector('.bt-total', { timeout: 20000 }); await wp.waitForTimeout(900);
  wMark = 0; await wClear();
};
const setWheel = async (hhmm) => {
  const [h, mm] = hhmm.split(':');
  const cols = wp.locator('.bt-molette .overflow-y-scroll');
  await cols.nth(0).evaluate((el, i) => { el.scrollTop = (3 * 24 + i) * 40; }, Number(h));
  await wp.waitForTimeout(350);
  await cols.nth(1).evaluate((el, i) => { el.scrollTop = (10 * 4 + i) * 40; }, ['00', '15', '30', '45'].indexOf(mm));
  await wp.waitForTimeout(350);
};
/** Début ET fin, depuis la fiche ouverte. */
const setTimes = async (start, end) => {
  await wp.locator('.bt-timecard').nth(0).click(); await wp.waitForTimeout(400); await setWheel(start);
  await wp.locator('.bt-segb').nth(1).click(); await wp.waitForTimeout(400); await setWheel(end);
  await wp.locator('button:has-text("Valider les heures")').click(); await wp.waitForTimeout(400);
};
/** La fin seule. */
const setEnd = async (end) => {
  await wp.locator('.bt-timecard').nth(1).click(); await wp.waitForTimeout(400); await setWheel(end);
  await wp.locator('button:has-text("Valider les heures")').click(); await wp.waitForTimeout(400);
};
/** « + » → chantier → heures, fiche laissée ouverte. */
const newLine = async (start, end) => {
  await wp.locator('.bt-fab').click();
  await wp.waitForSelector('.bt-ed');
  await wp.locator('.bt-site', { hasText: 'Chantier Test' }).first().click();
  await wp.waitForTimeout(250);
  await setTimes(start, end);
  const cards = await txt(wp.locator('.bt-times'));
  if (!cards.includes(start) || !cards.includes(end)) console.log(`   ⚠ molette : ${cards}`);
};
const pressOk = async () => { await wp.locator('.bt-save', { hasText: 'OK' }).click(); await wp.waitForTimeout(1300); };
const showPause = async () => { await wp.locator('[data-testid=ed-pause]').scrollIntoViewIfNeeded(); await wp.waitForTimeout(250); };
const dur = async () => txt(wp.locator('.bt-dur .v'));
const chipTexts = async (pg, id) => (await pg.locator(`[data-testid=${id}] .bt-pp-chips button`).allInnerTexts()).map((x) => x.trim());
const allIds = async (pg, id) => { for (const k of IDS) if (await pg.locator(`[data-testid=${id}-${k}]`).count() !== 1) return false; return true; };
const posted = (list) => of(list, 'POST', 'time_entries').map((w) => bodyOf(w).break_minutes);
/** « Envoyer ma journée » ; s'arrête sur la question de la pause (rendue à l'appelant). */
const startSend = async () => {
  await wp.locator('.bt-send', { hasText: 'Envoyer ma journée' }).click();
  for (let i = 0; i < 4; i++) {
    await wp.waitForTimeout(700);
    if (await wp.locator('[data-testid=pause-ask]').count()) return true;
    if (await wp.locator('[data-testid=planned-confirm-send]').count()) { await wp.locator('[data-testid=planned-confirm-send]').click(); continue; }
  }
  return false;
};
/** Après la réponse : la vérification éventuelle, puis l'envoi. */
const finishSend = async () => {
  for (let i = 0; i < 4; i++) {
    await wp.waitForTimeout(700);
    const c = wp.locator('button:has-text("Confirmer l\'envoi")');
    if (await c.count()) { await c.click(); continue; }
    break;
  }
  await wp.waitForTimeout(800);
};
const submittedIn = (list) => of(list, 'PATCH', 'time_entries').filter((w) => bodyOf(w).status === 'submitted');

// ── Côté bureau (mêmes gestes que scripts/tests/bureau-lot2.mjs) ──
let dlg = null;
const openSheet = async () => {
  await op.goto(`http://localhost:${PORT}/admin`);
  await op.locator('button:visible', { hasText: 'Alex Martin' }).first().waitFor({ timeout: 25000 });
  await op.waitForTimeout(800);
  await op.locator('button:visible', { hasText: 'Alex Martin' }).first().click();
  await op.getByRole('button', { name: /Feuille d.heures/ }).click();
  dlg = op.locator('[role=dialog]').filter({ has: op.locator('h2', { hasText: 'Alex Martin' }) });
  await dlg.waitFor();
  await op.waitForTimeout(1200);
  oMark = 0; await oClear();
};
const card = () => dlg.locator('.divide-y > div').filter({ hasText: 'Chantier Test' }).first();
// La souris s'écarte (comme une vraie) : un ⓘ arrivé sous elle s'ouvrirait au survol.
const openPanel = async (c) => { await c.getByRole('button', { name: /Corriger les heures/ }).click(); await op.mouse.move(2, 2); await op.waitForTimeout(300); return c.locator('[data-testid=correct-panel]'); };

// ── L'Assistant (carte « heures » en mode fiche) ──
const askAssistant = async (phrase) => {
  await wp.locator('.as-bar textarea').fill(phrase);
  await wp.locator('button[aria-label="Envoyer"]').click();
  await wp.waitForTimeout(1800);
};
const draftReply = (start, end) => ({
  kind: 'draft', remaining: 20, answer: 'Vérifiez, puis enregistrez.', chantiers: [{ id: SITE.id, nom: 'Chantier Test', ville: 'Lyon' }],
  draft: { date: today, errors: ['Horaires à vérifier.'], lines: [{ worksite_id: SITE.id, worksite_text: 'Chantier Test', start, end, break_minutes: 0 }] },
});

// ═══ AVANT : captures du build de 5657373 (aucune vérification) ══════════════
if (AVANT) {
  freshDb(); await openWorker();
  await newLine('07:00', '12:00');
  await wp.locator('.bt-sec', { hasText: 'Pause' }).scrollIntoViewIfNeeded(); await wp.waitForTimeout(250);
  await shot(wp, 'fiche-390');
  await wp.locator('.bt-ed-cancel').click();
  freshDb(); D.time_entries = [row({ id: 'e-jour', start_time: '07:00', end_time: '18:00' })];
  await openWorker(); await startSend(); await wp.waitForTimeout(300);
  await shot(wp.locator('[data-testid=pause-ask]'), 'question');
  freshDb(); D.time_entries = [row({ id: 'e-qr', start_time: '08:00', end_time: '17:00', source: 'qr' })];
  await openWorker(); await startSend(); await wp.waitForTimeout(300);
  await shot(wp.locator('[data-testid=pause-ask]'), 'question-borne');
  freshDb(); D.time_entries = [row({ id: 'e-jour', start_time: '08:00', end_time: '17:00', status: 'submitted' })];
  await openSheet(); { const c = card(); await openPanel(c); await shot(c, 'bureau-panneau'); }
  freshDb(); D.companies[0].ai_enabled = true; assistantReply = draftReply('08:00', '12:00');
  await openWorker(); await wp.locator('[data-testid=dock-assistant]').click(); await wp.waitForTimeout(500);
  await askAssistant('8h-12h chantier test');
  await shot(wp.locator('[data-testid=draft-card]').last(), 'assistant-carte');
  freshDb(); D.time_entries = [row({ id: 'e-75', start_time: '08:00', end_time: '17:00', break_minutes: 75 })];
  await openWorker();
  await shot(wp.locator('.bt-stats'), 'journee-stat');
  await wp.getByRole('button', { name: 'Mon compte et menu' }).click();
  await wp.getByRole('menuitem', { name: 'Ma semaine' }).click(); await wp.waitForTimeout(1500);
  await shot(wp, 'semaine');
  console.log(`Captures « avant » écrites dans ${SH}`);
  await b.close(); srv.close();
  process.exit(0);
}

// ═══ P1 · fiche « + » 07:00–12:00 : libellé, indice, 8 puces ; 45 min ═══════
console.log('\n═══ P1 · fiche du salarié : « Total des pauses », 8 puces, 45 min');
freshDb(); await openWorker();
await newLine('07:00', '12:00');
await showPause();
{
  const sec = await wp.locator('.bt-sec', { hasText: 'Total des pauses' }).count();
  const hint = wp.locator('[data-testid=ed-pause-hint]');
  check(sec === 1 && await wp.locator('.bt-sec', { hasText: 'Pause dans ces heures' }).count() === 0, 'P1 titre « Total des pauses » (plus « Pause dans ces heures »)');
  check(await hint.isVisible() && await txt(hint) === HINT_FICHE, `P1 indice visible : « ${await txt(hint)} »`);
  const chips = await chipTexts(wp, 'ed-pause');
  check(JSON.stringify(chips) === JSON.stringify(['0', ...CHIPS]), `P1 exactement 8 puces : ${chips.join(' · ')}`);
  check(await allIds(wp, 'ed-pause'), 'P1 testids ed-pause-0/15/30/45/60/90/120/autre');
  check(await wp.locator('[data-testid=ed-pause-0]').getAttribute('aria-pressed') === 'true', 'P1 « 0 » choisi par défaut');
  await shot(wp, 'fiche-390');
  // Grille 4 × 2 sur un petit téléphone, sans défilement horizontal.
  await wp.setViewportSize({ width: 360, height: 740 }); await wp.waitForTimeout(300); await showPause();
  const boxes = []; for (const k of IDS) boxes.push(await wp.locator(`[data-testid=ed-pause-${k}]`).boundingBox());
  const rowY = [...new Set(boxes.map((x) => Math.round(x.y)))];
  check(rowY.length === 2 && boxes.slice(0, 4).every((x) => Math.round(x.y) === rowY[0]) && boxes.every((x) => x.width >= 60), `P1 360 px : 2 rangées de 4 (${boxes.map((x) => Math.round(x.width)).join('/')} px)`);
  check(await noHScroll(wp), 'P1 360 px : pas de défilement horizontal');
  await shot(wp, 'fiche-360');
  await wp.setViewportSize({ width: 390, height: 844 }); await wp.waitForTimeout(300);
  await wp.locator('[data-testid=ed-pause-45]').click(); await wp.waitForTimeout(200);
  check(await dur() === '4h15', `P1 45 min : durée 5h00 → ${await dur()}`);
  const n = writes.length;
  await pressOk();
  check(JSON.stringify(posted(since(n))) === '[45]', `P1 OK : POST time_entries break_minutes 45 (${JSON.stringify(posted(since(n)))})`);
}

// ═══ P2 · « Autre » 1:15 ═════════════════════════════════════════════════════
console.log('\n═══ P2 · « Autre » 1:15');
freshDb(); await openWorker();
await newLine('07:00', '12:00'); await showPause();
{
  await wp.locator('[data-testid=ed-pause-autre]').click(); await wp.waitForTimeout(200);
  const focused = await wp.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  check(focused === 'ed-pause-input', `P2 « Autre » : le champ h:mm prend le curseur (${focused})`);
  await wp.locator('[data-testid=ed-pause-input]').fill('1:15'); await wp.waitForTimeout(200);
  check(await txt(wp.locator('[data-testid=ed-pause-preview]')) === '= 1 h 15', `P2 aperçu « = 1 h 15 » (${await txt(wp.locator('[data-testid=ed-pause-preview]'))})`);
  check(await dur() === '3h45', `P2 durée 3h45 (${await dur()})`);
  await shot(wp, 'fiche-autre');
  const n = writes.length;
  await pressOk();
  check(JSON.stringify(posted(since(n))) === '[75]', `P2 OK : break_minutes 75 (${JSON.stringify(posted(since(n)))})`);
}

// ═══ P3 · texte illisible, chiffre seul, « 30 minutes » ══════════════════════
console.log('\n═══ P3 · « 1:7 » et « 4 » refusés, « 30 minutes » accepté');
freshDb(); await openWorker();
await newLine('07:00', '12:00'); await showPause();
{
  await wp.locator('[data-testid=ed-pause-autre]').click();
  const input = wp.locator('[data-testid=ed-pause-input]');
  await input.fill('1:7'); await wp.waitForTimeout(200);
  check(await wp.locator('[data-testid=ed-pause-error]').count() === 0, 'P3 pendant la frappe : aucune erreur affichée');
  let n = writes.length; await wClear();
  await pressOk();
  check(posted(since(n)).length === 0 && of(since(n), 'PATCH', 'time_entries').length === 0, 'P3 « 1:7 » + OK : rien n’est écrit');
  check((await wToasts()).includes(UNREADABLE), `P3 message « ${UNREADABLE} » (${await wToasts()})`);
  check(await wp.locator('.bt-ed').count() === 1 && (await txt(wp.locator('[data-testid=ed-pause-error]'))) === UNREADABLE, 'P3 la fiche reste ouverte, erreur sous le champ');
  // Un chiffre seul : une heure ou une minute ? Refusé.
  await input.fill('4'); await wp.waitForTimeout(150);
  n = writes.length; await wClear();
  await pressOk();
  check(posted(since(n)).length === 0 && (await wToasts()).includes(BARE), `P3 « 4 » nu refusé : « ${await wToasts()} »`);
  check(await txt(wp.locator('[data-testid=ed-pause-error]')) === BARE, 'P3 « Écris 1:00 pour une heure, ou 5 min. » sous le champ');
  await input.fill('30 minutes'); await wp.waitForTimeout(150);
  check(await txt(wp.locator('[data-testid=ed-pause-preview]')) === '= 30 min' && await dur() === '4h30', `P3 « 30 minutes » : aperçu « = 30 min », durée ${await dur()}`);
  n = writes.length;
  await pressOk();
  check(JSON.stringify(posted(since(n))) === '[30]', `P3 « 30 minutes » accepté : break_minutes 30 (${JSON.stringify(posted(since(n)))})`);
}

// ═══ P4 · ligne d'1 h : puces trop longues grisées, « Autre » trop long ═════
console.log('\n═══ P4 · ligne 07:00–08:00');
freshDb(); await openWorker();
await newLine('07:00', '08:00'); await showPause();
{
  const dis = {}; for (const k of ['15', '30', '45', '60', '90', '120']) dis[k] = await wp.locator(`[data-testid=ed-pause-${k}]`).isDisabled();
  check(dis['60'] && dis['90'] && dis['120'] && !dis['45'] && !dis['15'] && !dis['30'], `P4 1 h / 1 h 30 / 2 h grisées, 15 / 30 / 45 actives ${JSON.stringify(dis)}`);
  check(await wp.locator('[data-testid=ed-pause-60]').getAttribute('title') === 'Plus long que la journée', 'P4 grisée : « Plus long que la journée »');
  await shot(wp, 'fiche-1h');
  await wp.locator('[data-testid=ed-pause-autre]').click();
  await wp.locator('[data-testid=ed-pause-input]').fill('1:30'); await wp.waitForTimeout(200);
  check(await txt(wp.locator('[data-testid=ed-pause-error]')) === PAUSE_TOO_LONG, `P4 « 1:30 » : « ${PAUSE_TOO_LONG} » tout de suite`);
  const n = writes.length; await wClear();
  await pressOk();
  check(posted(since(n)).length === 0 && (await wToasts()).includes(PAUSE_TOO_LONG) && await wp.locator('.bt-ed').count() === 1, 'P4 OK refusé, rien d’écrit, fiche ouverte');
}

// ═══ P5 · 2 h choisies, puis la fin raccourcie : plus de remise à 0 en silence ═
console.log('\n═══ P5 · heures raccourcies sous la pause');
freshDb(); await openWorker();
await newLine('07:00', '18:00'); await showPause();
{
  await wp.locator('[data-testid=ed-pause-120]').click(); await wp.waitForTimeout(150);
  check(await dur() === '9h00', `P5 07:00–18:00 − 2 h = 9h00 (${await dur()})`);
  await setEnd('08:30'); await showPause();
  check(await txt(wp.locator('[data-testid=ed-pause-error]')) === PAUSE_TOO_LONG, `P5 fin 08:30 : « ${PAUSE_TOO_LONG} » sous les puces`);
  check(await wp.locator('[data-testid=ed-pause-120]').isDisabled(), 'P5 la puce « 2 h » est grisée');
  await shot(wp, 'fiche-erreur');
  const n = writes.length; await wClear();
  await pressOk();
  check(posted(since(n)).length === 0 && (await wToasts()).includes(PAUSE_TOO_LONG) && await wp.locator('.bt-ed').count() === 1,
    `P5 OK bloqué (avant : pause remise à 0 sans un mot) — ${await wToasts()}`);
}

// ═══ P6 · une ligne rouverte garde sa pause ══════════════════════════════════
console.log('\n═══ P6 · 20 / 45 / 90 min rouvertes');
freshDb();
D.time_entries = [row({ id: 'e-20', start_time: '06:00', end_time: '09:00', break_minutes: 20 }), row({ id: 'e-45', start_time: '09:00', end_time: '12:00', break_minutes: 45 }),
  row({ id: 'e-90', start_time: '13:00', end_time: '18:00', break_minutes: 90 })];
await openWorker();
{
  const reopen = async (time) => {
    await wp.locator('[data-testid=card-entry]', { hasText: time }).first().click(); await wp.waitForTimeout(500);
    const cont = wp.locator('[role=dialog] button', { hasText: 'Continuer' }); if (await cont.count()) { await cont.first().click(); await wp.waitForTimeout(400); }
    await wp.waitForSelector('.bt-ed'); await showPause();
  };
  await reopen('06:00 → ');
  check(await wp.locator('[data-testid=ed-pause-autre]').getAttribute('aria-pressed') === 'true' && await wp.locator('[data-testid=ed-pause-input]').inputValue() === '0:20',
    `P6 20 min (notée par l’Assistant) : « Autre » ouvert sur « ${await wp.locator('[data-testid=ed-pause-input]').inputValue().catch(() => '—')} »`);
  await wp.locator('.bt-ed-cancel').click(); await wp.waitForTimeout(300);
  await reopen('09:00 → ');
  check(await wp.locator('[data-testid=ed-pause-45]').getAttribute('aria-pressed') === 'true' && await wp.locator('[data-testid=ed-pause-input]').count() === 0, 'P6 45 min : puce « 45 min » choisie, « Autre » fermé (rien ne reste de la ligne d’avant)');
  await wp.locator('.bt-ed-cancel').click(); await wp.waitForTimeout(300);
  await reopen('13:00 → ');
  check(await wp.locator('[data-testid=ed-pause-90]').getAttribute('aria-pressed') === 'true', 'P6 90 min : puce « 1 h 30 » choisie');
  await wp.locator('.bt-ed-cancel').click(); await wp.waitForTimeout(300);
}

// ═══ P7 · question à l'envoi : 8 puces, 45 min ═══════════════════════════════
console.log('\n═══ P7 · « Tu as pris une pause ? » (saisie à la main)');
freshDb(); D.time_entries = [row({ id: 'e-jour', start_time: '07:00', end_time: '18:00' })];
await openWorker();
{
  const n = writes.length;
  check(await startSend(), 'P7 07:00–18:00 : la question s’affiche');
  const dlgP = wp.locator('[data-testid=pause-ask]');
  const chips = await chipTexts(wp, 'pause');
  check(JSON.stringify(chips) === JSON.stringify(['Non', ...CHIPS]), `P7 exactement : ${chips.join(' · ')}`);
  check(await allIds(wp, 'pause'), 'P7 testids pause-0/15/30/45/60/90/120/autre (pause-0/30/60 gardés)');
  check(await txt(wp.locator('[data-testid=pause-label]')) === 'Total des pauses' && await wp.locator('[data-testid=pause-hint]').isVisible()
    && await txt(wp.locator('[data-testid=pause-hint]')) === HINT_ENVOI, `P7 libellé et indice : « ${await txt(wp.locator('[data-testid=pause-hint]'))} »`);
  check(submittedIn(since(n)).length === 0, 'P7 rien n’est envoyé avant la réponse');
  await shot(dlgP, 'question');
  await wp.setViewportSize({ width: 360, height: 740 }); await wp.waitForTimeout(300);
  check(await noHScroll(wp), 'P7 360 px : pas de défilement horizontal');
  await shot(dlgP, 'question-360');
  await wp.setViewportSize({ width: 390, height: 844 }); await wp.waitForTimeout(300);
  await wp.locator('[data-testid=pause-45]').click();
  await finishSend();
  const brk = of(since(n), 'PATCH', 'time_entries').find((w) => bodyOf(w).break_minutes === 45);
  check(!!brk && brk.q.includes('id=eq.e-jour'), `P7 « 45 min » : PATCH break_minutes 45 (${JSON.stringify(brk?.body)})`);
  check(submittedIn(since(n)).length === 1, 'P7 puis la journée part');
}

// ═══ P8 · « Autre » + OK ; illisible ; Échap dans le champ ══════════════════
console.log('\n═══ P8 · question à l’envoi : « Autre », OK, Échap');
freshDb(); D.time_entries = [row({ id: 'e-jour', start_time: '07:00', end_time: '18:00' })];
await openWorker();
{
  const n = writes.length;
  await startSend();
  await wp.locator('[data-testid=pause-autre]').click(); await wp.waitForTimeout(200);
  const input = wp.locator('[data-testid=pause-input]');
  await input.fill('1:7'); await wp.waitForTimeout(150);
  check(await wp.locator('[data-testid=pause-ok]').isDisabled(), 'P8 « 1:7 » : OK inactif');
  await input.press('Enter'); await wp.waitForTimeout(200);
  check(await txt(wp.locator('[data-testid=pause-error]')) === UNREADABLE && of(since(n), 'PATCH', 'time_entries').length === 0, 'P8 Entrée sur « 1:7 » : erreur affichée, rien d’envoyé');
  // Échap DANS le champ : la question reste, l'envoi n'est pas abandonné.
  await input.fill('1:15'); await input.focus();
  await wp.keyboard.press('Escape'); await wp.waitForTimeout(400);
  check(await wp.locator('[data-testid=pause-ask]').count() === 1 && submittedIn(since(n)).length === 0, 'P8 Échap dans « Autre » : la question reste ouverte (envoi pas abandonné)');
  check(await input.inputValue() === '1:15' && await txt(wp.locator('[data-testid=pause-preview]')) === '= 1 h 15', 'P8 … la saisie est gardée, aperçu « = 1 h 15 »');
  await shot(wp.locator('[data-testid=pause-ask]'), 'question-autre');
  await wp.locator('[data-testid=pause-ok]').click();
  await finishSend();
  const brk = of(since(n), 'PATCH', 'time_entries').find((w) => bodyOf(w).break_minutes === 75);
  check(!!brk && submittedIn(since(n)).length === 1, `P8 « 1:15 » + OK : PATCH 75 puis envoi (${JSON.stringify(brk?.body)})`);
}
// Témoin : Échap HORS du champ ferme toujours la question (le test ci-dessus discrimine).
freshDb(); D.time_entries = [row({ id: 'e-jour', start_time: '07:00', end_time: '18:00' })];
await openWorker();
{
  const n = writes.length;
  await startSend();
  await wp.locator('[data-testid=pause-ask-range]').click();
  await wp.keyboard.press('Escape'); await wp.waitForTimeout(500);
  check(await wp.locator('[data-testid=pause-ask]').count() === 0 && submittedIn(since(n)).length === 0, 'P8 témoin : Échap hors du champ ferme la question (comme avant)');
}

// ═══ P9 · BORNE : ligne QR 08:00–17:00 ═══════════════════════════════════════
console.log('\n═══ P9 · ligne de la borne (QR)');
freshDb(); D.time_entries = [row({ id: 'e-qr', start_time: '08:00', end_time: '17:00', source: 'qr' })];
await openWorker();
{
  const n = writes.length;
  check(await startSend(), 'P9 ligne QR de 9 h : la question s’affiche');
  check(JSON.stringify(await chipTexts(wp, 'pause')) === JSON.stringify(['Non', ...CHIPS]), 'P9 les mêmes 8 puces');
  await shot(wp.locator('[data-testid=pause-ask]'), 'question-borne');
  await wp.locator('[data-testid=pause-90]').click();
  await finishSend();
  const brk = of(since(n), 'PATCH', 'time_entries').find((w) => bodyOf(w).break_minutes === 90);
  check(!!brk && brk.q.includes('id=eq.e-qr') && submittedIn(since(n)).length === 1, `P9 « 1 h 30 » posée sur la ligne QR, journée envoyée (${JSON.stringify(brk?.body)})`);
}

// ═══ P10 · ligne restée sur le téléphone (file hors ligne) ═══════════════════
// Une ligne en file ne passe pas par la question à l'envoi (le bouton devient
// « Envoyer ce qui reste ») : sa pause se note dans la fiche (« Modifier »).
console.log('\n═══ P10 · ligne en file sur le téléphone');
freshDb(); failInsert = true;
await openWorker();
{
  const pe = { localId: 'local_pause_1', company_id: CO, user_id: ME, worksite_id: SITE.id, planning_id: null, work_date: today, start_time: '08:00', end_time: '17:00',
    break_minutes: 0, total_minutes: 540, meal_allowance: false, observation: null, reception: null, _worksite_name: 'Chantier Test', _worksite_city: 'Lyon', _saved_at: NOW.getTime() };
  await wp.evaluate(([k, v]) => localStorage.setItem(k, v), [`battime_offline_${ME}`, JSON.stringify([pe])]);
  await openWorker();
  await wp.locator('.bt-iv-mod', { hasText: 'Modifier' }).first().click();
  await wp.waitForSelector('.bt-ed'); await showPause();
  check(JSON.stringify(await chipTexts(wp, 'ed-pause')) === JSON.stringify(['0', ...CHIPS]), 'P10 ligne en file : la fiche a les mêmes puces');
  await wp.locator('[data-testid=ed-pause-autre]').click();
  await wp.locator('[data-testid=ed-pause-input]').fill('1:15'); await wp.waitForTimeout(150);
  await pressOk();
  const q = await wp.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), `battime_offline_${ME}`);
  const e = q.find((x) => x.start_time === '08:00' && x.end_time === '17:00');
  check(e?.break_minutes === 75 && e?.total_minutes === 465, `P10 file du téléphone : pause 75, total 465 (${JSON.stringify({ b: e?.break_minutes, t: e?.total_minutes })})`);
}
failInsert = false;
await wp.evaluate((k) => localStorage.removeItem(k), `battime_offline_${ME}`);

// ═══ P11 · prévu confirmé 08:00–17:00 → 15 min ═══════════════════════════════
console.log('\n═══ P11 · prévu du bureau confirmé');
freshDb(); D.planning = [plan('p-1', '08:00', '17:00')];
await openWorker();
{
  const n = writes.length;
  check(await startSend(), 'P11 prévu confirmé (9 h) : la question s’affiche');
  await wp.locator('[data-testid=pause-15]').click();
  await finishSend();
  const ins = of(since(n), 'POST', 'time_entries').map(bodyOf);
  check(ins.length === 1 && ins[0].break_minutes === 15 && ins[0].planning_id === 'p-1', `P11 ligne créée avec break_minutes 15 (${JSON.stringify(ins.map((x) => x.break_minutes))})`);
  check(submittedIn(since(n)).length === 1, 'P11 puis envoyée');
}

// ═══ P12 · bureau : puces compactes, « Autre », trop long ════════════════════
console.log('\n═══ P12 · correction du bureau');
freshDb(); D.time_entries = [row({ id: 'e-jour', start_time: '08:00', end_time: '17:00', status: 'submitted' })];
await openSheet();
{
  let c = card(); let panel = await openPanel(c);
  check(await panel.locator('select[data-testid=correct-break]').count() === 0 && await allIds(op, 'correct-break'), 'P12 plus de liste déroulante : les 8 puces (correct-break-0 … -autre)');
  check(JSON.stringify(await chipTexts(op, 'correct-break')) === JSON.stringify(['0', ...CHIPS]), `P12 puces : ${(await chipTexts(op, 'correct-break')).join(' · ')}`);
  check(await txt(panel.locator('[data-testid=correct-break-label]')) === 'Total des pauses' && await txt(panel.locator('[data-testid=correct-break-hint]')) === HINT_BUREAU, 'P12 libellé + indice au « vous »');
  const h = await panel.locator('[data-testid=correct-break-45]').boundingBox();
  check(h && h.height <= 30, `P12 variante compacte (puce de ${Math.round(h?.height || 0)} px de haut)`);
  // Comme A3 du lot 2 : 30 puis 0 = rien de changé → bouton inactif.
  await panel.locator('[data-testid=correct-break-30]').click();
  await panel.locator('[data-testid=correct-reason]').fill('pause oubliée');
  check(!(await panel.locator('[data-testid=correct-submit]').isDisabled()), 'P12 30 min + motif : « Corriger et prévenir » actif');
  await panel.locator('[data-testid=correct-break-0]').click();
  check(await panel.locator('[data-testid=correct-submit]').isDisabled(), 'P12 retour à 0 : rien de changé, bouton inactif');
  await panel.locator('[data-testid=correct-break-45]').click();
  await shot(c, 'bureau-45');
  let n = writes.length;
  await panel.locator('[data-testid=correct-submit]').click(); await op.waitForTimeout(1600);
  let rpc = of(since(n), 'RPC', 'office_correct_entry');
  check(rpc.length === 1 && JSON.stringify(rpc[0].body?.p_changes) === '{"break_minutes":45}', `P12 45 min : office_correct_entry {break_minutes:45} (${JSON.stringify(rpc[0]?.body?.p_changes)})`);
  check(/Journée corrigée/.test(await oToasts()), `P12 message : ${await oToasts()}`);
  check(/pause 45 min/.test(await txt(card().locator('[data-testid=line-break]'))), `P14 fiche bureau : « ${await txt(card().locator('[data-testid=line-break]'))} »`);
  // « Autre » 1:15
  c = card(); panel = await openPanel(c);
  check(await panel.locator('[data-testid=correct-break-45]').getAttribute('aria-pressed') === 'true', 'P12 rouvert : 45 min choisi');
  await panel.locator('[data-testid=correct-break-autre]').click();
  await panel.locator('[data-testid=correct-break-input]').fill('1:15'); await op.waitForTimeout(150);
  check(await txt(panel.locator('[data-testid=correct-break-preview]')) === '= 1 h 15', 'P12 aperçu « = 1 h 15 »');
  await panel.locator('[data-testid=correct-reason]').fill('pause réelle');
  await shot(c, 'bureau-autre');
  n = writes.length;
  await panel.locator('[data-testid=correct-submit]').click(); await op.waitForTimeout(1600);
  rpc = of(since(n), 'RPC', 'office_correct_entry');
  check(rpc.length === 1 && JSON.stringify(rpc[0].body?.p_changes) === '{"break_minutes":75}', `P12 « 1:15 » : {break_minutes:75} (${JSON.stringify(rpc[0]?.body?.p_changes)})`);
}
// Ligne de 4 h : « 4:00 » trop long → erreur, bouton inactif, aucun appel.
freshDb(); D.time_entries = [row({ id: 'e-court', start_time: '08:00', end_time: '12:00', status: 'submitted' })];
await openSheet();
{
  const c = card(); const panel = await openPanel(c);
  await panel.locator('[data-testid=correct-reason]').fill('pause oubliée');
  await panel.locator('[data-testid=correct-break-autre]').click();
  await panel.locator('[data-testid=correct-break-input]').fill('4:00'); await op.waitForTimeout(200);
  check(await txt(panel.locator('[data-testid=correct-break-error]')) === PAUSE_TOO_LONG, `P12 4 h sur 4 h : « ${PAUSE_TOO_LONG} »`);
  check(await panel.locator('[data-testid=correct-submit]').isDisabled(), 'P12 … « Corriger et prévenir » inactif');
  await shot(c, 'bureau-erreur');
  const n = writes.length;
  await panel.locator('[data-testid=correct-submit]').click({ force: true }).catch(() => {});
  await op.waitForTimeout(400);
  check(of(since(n), 'RPC', 'office_correct_entry').length === 0, 'P12 aucun appel au serveur');
  // Un chiffre seul, au « vous ».
  await panel.locator('[data-testid=correct-break-input]').fill('4'); await panel.locator('[data-testid=correct-break-input]').press('Enter'); await op.waitForTimeout(150);
  check(await txt(panel.locator('[data-testid=correct-break-error]')) === 'Écrivez 1:00 pour une heure, ou 5 min.', 'P12 « 4 » nu : « Écrivez 1:00 pour une heure, ou 5 min. »');
}

// ═══ P13 · carte de l'Assistant : « Total des pauses (h:mm) » ════════════════
console.log('\n═══ P13 · carte de l’Assistant');
freshDb(); D.companies[0].ai_enabled = true; assistantReply = draftReply('08:00', '12:00');
await openWorker();
{
  await wp.locator('[data-testid=dock-assistant]').click(); await wp.waitForTimeout(500);
  await askAssistant('8h-12h chantier test');
  const cardA = wp.locator('[data-testid=draft-card]').last();
  const field = cardA.locator('[data-testid=wd-pause-0]');
  check(await field.count() === 1 && await cardA.locator('.bt-pp-chips').count() === 0 && (await txt(cardA)).includes('Total des pauses (h:mm)'), 'P13 un champ « Total des pauses (h:mm) », pas de puces dans la bulle');
  await field.fill('0:20'); await wp.waitForTimeout(200);
  const save = cardA.locator('button.wd-save');
  check(!(await save.isDisabled()), 'P13 « 0:20 » : « Enregistrer » actif');
  await shot(cardA, 'assistant-carte');
  const n = writes.length;
  await save.click(); await wp.waitForTimeout(1500);
  check(JSON.stringify(posted(since(n))) === '[20]', `P13 enregistré : break_minutes 20 (${JSON.stringify(posted(since(n)))})`);
  await askAssistant('8h-12h chantier test');
  const card2 = wp.locator('[data-testid=draft-card]').last();
  await card2.locator('[data-testid=wd-pause-0]').fill('1:7'); await wp.waitForTimeout(150);
  check(await card2.locator('button.wd-save').isDisabled(), 'P13 « 1:7 » : « Enregistrer » inactif');
  await card2.locator('[data-testid=wd-pause-0]').press('Enter'); await wp.waitForTimeout(150);
  check(await txt(card2.locator('[data-testid=wd-pause-0-error]')) === UNREADABLE, `P13 … « ${UNREADABLE} »`);
  await card2.locator('[data-testid=wd-pause-0]').fill('5:00'); await wp.waitForTimeout(150);
  check(await card2.locator('button.wd-save').isDisabled() && (await txt(card2)).includes('Pause plus longue que le créneau 08:00 → 12:00.'), 'P13 « 5:00 » sur 4 h : refusé par le contrôle de l’Assistant');
  // Ligne retirée au-dessus : le champ pause illisible de la ligne suivante garde SON texte et son erreur.
  await card2.locator('[data-testid=wd-pause-0]').fill('1:30');
  await card2.locator('button.wd-add').click(); await wp.waitForTimeout(150);
  await card2.locator('[data-testid=wd-pause-1]').fill('1'); await wp.waitForTimeout(150);
  await card2.locator('button[aria-label="Retirer"]').first().click(); await wp.waitForTimeout(200);
  const left = card2.locator('[data-testid=wd-pause-0]');
  await left.press('Enter'); await wp.waitForTimeout(150);
  check(await left.inputValue() === '1' && await card2.locator('button.wd-save').isDisabled() && (await txt(card2.locator('[data-testid=wd-pause-0-error]'))).length > 0,
    `P13 ligne retirée au-dessus : le champ restant montre « 1 » et son erreur, « Enregistrer » inactif (texte « ${await left.inputValue()} »)`);
  assistantReply = null;
}

// ═══ P14 · affichages : « 1:15 » dans la journée, « pause 1 h 15 » dans la semaine ═
console.log('\n═══ P14 · affichages');
freshDb(); D.time_entries = [row({ id: 'e-75', start_time: '08:00', end_time: '17:00', break_minutes: 75 })];
await openWorker();
{
  const stat = wp.locator('.bt-stat', { hasText: 'pause' }).first();
  check(await txt(stat.locator('.bt-stat-n')) === '1:15', `P14 journée : « ${await txt(stat)} »`);
  await shot(wp.locator('.bt-stats'), 'journee-stat');
  await wp.getByRole('button', { name: 'Mon compte et menu' }).click();
  await wp.getByRole('menuitem', { name: 'Ma semaine' }).click(); await wp.waitForTimeout(1500);
  const body = await txt(wp.locator('body'));
  check(body.includes('pause 1 h 15') && !body.includes('pause 75min'), 'P14 semaine : « pause 1 h 15 » (avant : « pause 75min »)');
  await shot(wp, 'semaine');
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
if (fails.length) console.log(fails.map((f) => ` - ${f}`).join('\n'));
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
