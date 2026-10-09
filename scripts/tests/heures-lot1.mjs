// Lot 1 — le calcul des heures, de bout en bout, sur les VRAIES pages :
// écran du salarié (/poseur), planning du bureau (/admin) et export CSV de la
// fiche salarié. UNE base simulée partagée par les deux navigateurs (aucune
// vraie base, aucun e-mail). Entreprise de test : un chantier « Salle », la
// case « Autre », pas de borne, route non payée (comme TEST).
//
// Lancer : npm run build, puis
//   node scripts/tests/heures-lot1.mjs out docs/captures-heures
// Chaque scénario affiche : écran salarié avant envoi, après envoi, planning
// bureau, fiche bureau, CSV. Les trois derniers doivent être identiques, et
// égaux aux heures réellement travaillées.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-heures', PORT = '4241'] = process.argv;
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

// ─── Horloge : aujourd'hui, 19:30 à Paris (toute la journée est passée) ───────
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const parisOffset = (() => { const d = new Date(`${today}T12:00:00Z`); const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(d)); return h - 12; })();
const NOW = new Date(Date.parse(`${today}T19:30:00Z`) - parisOffset * 3600000);

// ─── Base simulée ─────────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-0000000000aa';
const ME = 'u-sam'; const ADMIN = 'u-admin';
const SALLE = { id: 'w-salle', company_id: CO, client_name: 'Salle', city: 'Lyon', is_active: true, address: null, latitude: null, longitude: null };
const AUTRE = { id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true, address: null, latitude: null, longitude: null };
const USERS = [
  { id: ADMIN, company_id: CO, first_name: 'Admin', last_name: 'Test', role: 'admin', email: 'admin@exemple.fr', is_active: true, created_at: '2026-01-01' },
  { id: ME, company_id: CO, first_name: 'Sam', last_name: 'Test', role: 'worker', email: 'sam@exemple.fr', is_active: true, created_at: '2026-01-01' },
];
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: null };
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const generated = (r) => { let d = toMin(r.end_time) - toMin(r.start_time); if (d < 0) d += 1440; return d - (Number(r.break_minutes) || 0); };
let seq = 0;
const D = {};
const freshDb = () => {
  Object.assign(D, {
    users: USERS.map((x) => ({ ...x })), companies: [{ ...COMPANY }], worksites: [SALLE, AUTRE].map((x) => ({ ...x })),
    planning: [], time_entries: [], active_sessions: [], user_payroll: [{ user_id: ME, company_id: CO, payroll_id: '00001' }],
  });
};
freshDb();
const ws = (id) => D.worksites.find((w) => w.id === id) || null;
const nameOf = (id) => { const u = D.users.find((x) => x.id === id); return u ? { first_name: u.first_name, last_name: u.last_name } : null; };
/** Une ligne telle que la base la stockerait (total_minutes = colonne calculée). */
const row = (o) => {
  const r = {
    id: o.id || `e-${++seq}`, company_id: CO, user_id: ME, worksite_id: SALLE.id, planning_id: null, work_date: today,
    break_minutes: 0, meal_allowance: false, status: 'draft', locked: false, exported_at: null, observation: null, reception: null,
    gap_before: null, source: null, exit_forgotten: false, corrected_at: null, modified_at: null, client_id: null, created_at: NOW.toISOString(), ...o,
  };
  r.start_time = r.start_time.length === 5 ? `${r.start_time}:00` : r.start_time;
  r.end_time = r.end_time.length === 5 ? `${r.end_time}:00` : r.end_time;
  r.total_minutes = generated(r);
  r.worksite = ws(r.worksite_id); r.user = nameOf(r.user_id);
  return r;
};
const plan = (id, worksite_id, s, e) => ({ id, company_id: CO, user_id: ME, worksite_id, work_date: today, absence_type: null,
  estimated_start: s ? `${s}:00` : null, estimated_end: e ? `${e}:00` : null, notes: null, created_at: NOW.toISOString(), worksite: ws(worksite_id), user: nameOf(ME) });

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
  return [...rows].sort((a, b) => { for (const { k, desc } of keys) { const x = String(a[k] ?? ''); const y = String(b[k] ?? ''); if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1); } return 0; });
};
const writes = [];
const sessionFor = (uid, email) => {
  const now = Math.floor(NOW.getTime() / 1000) + 3600; const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
  return { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: uid, email, aud: 'authenticated', role: 'authenticated' } };
};
const newCtx = async (uid, email, viewport) => {
  const ctx = await b.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true, ...(viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const session = sessionFor(uid, email);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.clock.setFixedTime(NOW);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const url = new URL(req.url()); const m = req.method();
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/')) { writes.push({ m: 'FN', t: url.pathname }); return r.fulfill({ json: {} }); }
    if (url.pathname === '/rest/v1/rpc/company_has_kiosk') return r.fulfill({ json: false });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
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
    let body = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
    writes.push({ m, t, q: url.search, body, by: uid });
    if (m === 'POST') {
      const list = (Array.isArray(body) ? body : [body]).map((x) => ({ ...x }));
      if (t === 'time_entries') {
        for (const x of list) {
          if (x.client_id && D.time_entries.some((e) => e.client_id === x.client_id && e.user_id === x.user_id)) {
            return r.fulfill({ status: 409, json: { code: '23505', message: 'duplicate key value violates unique constraint', details: null, hint: null } });
          }
        }
        const made = list.map((x) => row(x));
        D.time_entries.push(...made);
        return reply(made, 201);
      }
      if (t === 'active_sessions') { D.active_sessions = list; return reply(list, 201); }
      return reply(list, 201);
    }
    const hit = filterRows(D[t] || [], url.searchParams);
    if (m === 'PATCH') {
      for (const x of hit) {
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
const hm = (min) => (min == null ? '—' : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`);
const parseHM = (txt) => { const m = String(txt || '').match(/(\d+)\s*[h:]\s*(\d{1,2})?/); return m ? Number(m[1]) * 60 + Number(m[2] || 0) : null; };
const parseCenti = (txt) => (txt == null ? null : Math.round(Number(String(txt).replace(',', '.')) * 60));
let ok = 0, ko = 0; const fails = [];
const check = (c, m) => { if (c) { ok++; console.log('  ✅', m); } else { ko++; fails.push(m); console.log('  ❌', m); } };

const worker = await newCtx(ME, 'sam@exemple.fr', { width: 390, height: 844 });
const office = await newCtx(ADMIN, 'admin@exemple.fr', { width: 1280, height: 900 });
const wp = await worker.newPage();
wp.on('pageerror', (e) => console.log('   [erreur page salarié]', e.message));

const openWorker = async () => { await wp.goto(`http://localhost:${PORT}/poseur`); await wp.waitForSelector('.bt-total', { timeout: 20000 }); await wp.waitForTimeout(900); };
const workerTotal = async () => parseHM(await wp.locator('.bt-total-big').innerText());
const workerText = () => wp.locator('body').innerText();

/** La molette : heures (7 copies de 24) puis minutes (21 copies de 4), une colonne à la fois. */
const setWheel = async (hhmm) => {
  const [h, mm] = hhmm.split(':');
  const cols = wp.locator('.bt-molette .overflow-y-scroll');
  await cols.nth(0).evaluate((el, i) => { el.scrollTop = (3 * 24 + i) * 40; }, Number(h));
  await wp.waitForTimeout(350);
  await cols.nth(1).evaluate((el, i) => { el.scrollTop = (10 * 4 + i) * 40; }, ['00', '15', '30', '45'].indexOf(mm));
  await wp.waitForTimeout(350);
};
const setTimesInEditor = async (start, end) => {
  if (start) { await wp.locator('.bt-timecard').nth(0).click(); await wp.waitForTimeout(400); await setWheel(start); }
  if (end) { await wp.locator('.bt-segb').nth(1).click().catch(async () => { await wp.locator('.bt-timecard').nth(1).click(); }); await wp.waitForTimeout(400); await setWheel(end); }
  await wp.locator('button:has-text("Valider les heures")').click();
  await wp.waitForTimeout(300);
  const cards = (await wp.locator('.bt-timecard').allInnerTexts()).join(' ');
  return cards;
};
const pressOk = async () => {
  await wp.locator('.bt-save', { hasText: 'OK' }).click();
  await wp.waitForTimeout(1300);
};
/** « + » → chantier → début / fin → OK (exactement les gestes du salarié). */
const addLine = async (siteLabel, start, end) => {
  await wp.locator('.bt-fab').click();
  await wp.waitForSelector('.bt-ed');
  await wp.locator('.bt-site', { hasText: siteLabel }).first().click();
  await wp.waitForTimeout(250);
  const cards = await setTimesInEditor(start, end);
  if (!cards.includes(start) || !cards.includes(end)) console.log(`   ⚠ molette : ${cards.replace(/\s+/g, ' ')}`);
  await pressOk();
};
/** Touche une carte (prévue ou ligne) → règle les heures → OK. */
const editCard = async (locator, start, end) => {
  await locator.click();
  await wp.waitForTimeout(500);
  const cont = wp.locator('[role=dialog] button', { hasText: 'Continuer' });
  if (await cont.count()) { await cont.first().click(); await wp.waitForTimeout(500); }
  await wp.waitForSelector('.bt-ed');
  if (start || end) await setTimesInEditor(start, end);
  await pressOk();
};
/** « Envoyer ma journée », en répondant aux questions qui s'affichent. */
const send = async ({ pause = null, confirmPlanned = true } = {}) => {
  const seen = [];
  await wp.locator('.bt-send', { hasText: 'Envoyer ma journée' }).click();
  for (let i = 0; i < 6; i++) {
    await wp.waitForTimeout(700);
    if (await wp.locator('[data-testid=pause-ask]').count()) {
      seen.push('pause');
      await wp.waitForTimeout(300); await wp.screenshot({ path: path.join(SH, `${current}-question-pause.png`) });
      const id = pause == null ? 'pause-0' : `pause-${pause}`;
      await wp.locator(`[data-testid=${id}]`).click();
      continue;
    }
    if (await wp.locator('[data-testid=planned-confirm]').count()) {
      seen.push('prévu');
      await wp.waitForTimeout(300); await wp.screenshot({ path: path.join(SH, `${current}-confirmation-prevu.png`) });
      await wp.locator(`[data-testid=${confirmPlanned ? 'planned-confirm-send' : 'planned-confirm-fix'}]`).click();
      continue;
    }
    const c = wp.locator('button:has-text("Confirmer l\'envoi")');
    if (await c.count()) { seen.push(`vérif: ${(await wp.locator('[role=dialog]').last().innerText()).replace(/\s+/g, ' ').slice(0, 120)}`); await c.click(); continue; }
    break;
  }
  await wp.waitForTimeout(900);
  return seen;
};

/** Le bureau : planning de la semaine (bulles) + fiche « Aujourd'hui » + CSV de la fiche. */
const readOffice = async (tag) => {
  const pg = await office.newPage();
  pg.on('pageerror', (e) => console.log('   [erreur page bureau]', e.message));
  await pg.goto(`http://localhost:${PORT}/admin`);
  await pg.locator('button:visible', { hasText: 'Sam Test' }).first().waitFor({ timeout: 25000 });
  await pg.waitForTimeout(1200);
  const bubbles = await pg.locator('.bt-pl-real-txt:visible').allInnerTexts();
  const extras = await pg.locator('.bt-pl-extra-by:visible').allInnerTexts();
  const gridShown = [...bubbles, ...extras.filter((x) => !x.includes('à envoyer'))];
  const gridSum = gridShown.reduce((s, x) => { const m = x.match(/(\d+)h(\d{2})/); return s + (m ? Number(m[1]) * 60 + Number(m[2]) : 0); }, 0);
  await pg.screenshot({ path: path.join(SH, `${tag}-bureau-planning.png`) });
  await pg.locator('button:visible', { hasText: 'Sam Test' }).first().click();
  await pg.getByRole('button', { name: /Feuille d.heures/ }).click();
  const dlg = pg.locator('[role=dialog]').filter({ has: pg.locator('h2', { hasText: 'Sam Test' }) });
  await dlg.waitFor();
  await dlg.getByRole('button', { name: "Aujourd'hui" }).click();
  await pg.waitForTimeout(1200);
  const sheetTxt = await dlg.locator('div:has(> span:text("Total de la période")) > span').nth(1).innerText().catch(() => '');
  await pg.screenshot({ path: path.join(SH, `${tag}-bureau-fiche.png`) });
  let csv = null;
  try {
    await dlg.locator('[data-testid=export-menu]').click();
    const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 10000 }), pg.locator('[data-testid=export-menu-csv]').click()]);
    const text = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).map((l) => l.split(';'));
    csv = text[1] ? parseCenti(text[1][9]) : 0;
  } catch (e) { console.log('   (CSV indisponible :', e.message.split('\n')[0], ')'); }
  await pg.close();
  return { grid: gridSum, gridShown, sheet: parseHM(sheetTxt), csv };
};

const results = [];
let current = '';
/**
 * Un scénario : `setup` prépare la base, `act` fait les gestes du salarié.
 * `real` = les heures RÉELLEMENT travaillées (ce que les trois écrans doivent dire).
 */
const scenario = async (code, label, real, setup, act, opts = {}) => {
  console.log(`\n═══ ${code} · ${label}`);
  current = code;
  freshDb(); writes.length = 0; setup();
  await openWorker();
  const shownAtStart = await workerTotal();
  const notes = [];
  if (act) notes.push(...((await act()) || []));
  const shownBeforeSend = await workerTotal();
  await wp.screenshot({ path: path.join(SH, `${code}-salarie-avant-envoi.png`) });
  const asked = opts.noSend ? [] : await send(opts.send || {});
  if (opts.after) notes.push(...((await opts.after()) || []));
  await openWorker();
  const shownAfterSend = await workerTotal();
  await wp.screenshot({ path: path.join(SH, `${code}-salarie-apres-envoi.png`) });
  const o = await readOffice(code);
  const sent = D.time_entries.filter((e) => ['submitted', 'validated'].includes(e.status));
  const res = { code, label, real, shownAtStart, shownBeforeSend, shownAfterSend, ...o, asked, notes,
    lines: sent.map((e) => `${e.start_time.slice(0, 5)}–${e.end_time.slice(0, 5)}${e.break_minutes ? ` −${e.break_minutes}` : ''}${e.client_id?.startsWith('plan_') ? ' (prévu)' : ''}`) };
  results.push(res);
  console.log(`  salarié : début ${hm(shownAtStart)} · avant envoi ${hm(shownBeforeSend)} · après envoi ${hm(shownAfterSend)}`);
  console.log(`  bureau  : planning ${hm(o.grid)} [${o.gridShown.join(' | ')}] · fiche ${hm(o.sheet)} · CSV ${hm(o.csv)}`);
  console.log(`  envoyé  : ${res.lines.join(' + ') || '(rien)'} · questions : ${asked.join(' / ') || 'aucune'}`);
  for (const n of notes) console.log(`  note    : ${n}`);
  const same = [shownAfterSend, o.grid, o.sheet, o.csv];
  check(same.every((x) => x === same[0]), `${code} trois écrans identiques (salarié ${hm(shownAfterSend)}, planning ${hm(o.grid)}, fiche ${hm(o.sheet)}, CSV ${hm(o.csv)})`);
  check(same.every((x) => x === real), `${code} = heures réellement travaillées ${hm(real)}`);
  if (opts.checks) await opts.checks(res);
  return res;
};

// Préréglages du bureau « Matin » et « Après-midi » (lib/time-input.ts).
const MATIN = ['08:00', '12:00']; const APREM = ['13:30', '17:00'];

// ═══ S1 · journée simple ══════════════════════════════════════════════════════
await scenario('S1a', 'journée simple 07:00–18:00 saisie au « + », sans planning, pause 1 h', 600,
  () => {},
  async () => { await addLine('Salle', '07:00', '18:00'); },
  { send: { pause: 60 }, checks: async (r) => check(r.asked.includes('pause'), 'S1a la pause est demandée (journée de plus de 6 h)') });

// LE cas du client : 07:00–18:00 réellement, Matin + Après-midi prévus, il appuie
// sur « Envoyer » sans rien saisir. Avant : 7h30 « travaillées » et 7h30 envoyées.
// Maintenant : 0h00 + « 7:30 prévues », l'envoi demande « tu as fait ces horaires ? »,
// il répond « Non, je corrige », corrige la carte Matin en 07:00–18:00 et renvoie.
let prevuTxt = '';
await scenario('S1b', 'bureau a prévu Matin + Après-midi ; le salarié a fait 07:00–18:00 et appuie sur « Envoyer » sans rien saisir', 600,
  () => { D.planning = [plan('p-matin', SALLE.id, ...MATIN), plan('p-aprem', SALLE.id, ...APREM)]; },
  async () => { prevuTxt = await wp.locator('[data-testid=total-prevu]').innerText().catch(() => ''); return [`sous le total : « ${prevuTxt} »`]; },
  {
    send: { pause: 60, confirmPlanned: false },
    after: async () => {
      const sentBefore = D.time_entries.filter((e) => e.status === 'submitted').length;
      if (!(await wp.locator('[data-testid=card-planned]').count())) return [`(pas de carte prévue : ${sentBefore} ligne(s) déjà envoyée(s))`];
      await editCard(wp.locator('[data-testid=card-planned]').first(), '07:00', '18:00');
      const asked = await send({ pause: 60 });
      return [`« Non, je corrige » : ${sentBefore} ligne envoyée ; puis carte Matin → 07:00–18:00, renvoi (${asked.join(' / ') || 'aucune question'})`];
    },
    checks: async (r) => {
      check(r.shownAtStart === 0, `S1b rien de saisi : l'écran affiche 0h00 travaillées, pas les heures prévues (${hm(r.shownAtStart)})`);
      check(/7:30 prévues/.test(prevuTxt), `S1b le prévu est affiché à part : « ${prevuTxt} »`);
      check(r.asked.includes('prévu'), 'S1b « Envoyer » demande d’abord si les horaires prévus ont été faits');
      check(!r.lines.some((x) => x.includes('(prévu)')), `S1b aucune heure prévue partie sans « oui » (${r.lines.join(' + ')})`);
    },
  });

await scenario('S1c', 'bureau a prévu Matin + Après-midi ; le salarié corrige la carte Matin en 07:00–18:00', 600,
  () => { D.planning = [plan('p-matin', SALLE.id, ...MATIN), plan('p-aprem', SALLE.id, ...APREM)]; },
  async () => { await editCard(wp.locator('[data-testid=card-planned]').first(), '07:00', '18:00'); },
  { send: { pause: 60 } });

await scenario('S1d', 'bureau a prévu Matin + Après-midi, le salarié les a faits tels quels : « Oui, envoyer ces horaires »', 450,
  () => { D.planning = [plan('p-matin', SALLE.id, ...MATIN), plan('p-aprem', SALLE.id, ...APREM)]; },
  null,
  { send: { confirmPlanned: true }, checks: async (r) => {
    check(r.asked.includes('prévu') && !r.asked.includes('pause'), `S1d confirmation demandée, pas de pause (trou de 1h30 à midi) : ${r.asked.join(' / ')}`);
    check(r.lines.filter((x) => x.includes('(prévu)')).length === 2, `S1d les deux créneaux partent après le « oui » (${r.lines.join(' + ')})`);
  } });

// Deux créneaux prévus qui se chevauchent (deux chantiers 08–12 et 11–15) : « Oui » ne doit pas envoyer 8 h pour 7 h.
console.log('\n═══ S1f · deux créneaux prévus qui se chevauchent, le salarié répond « Oui »');
freshDb(); D.planning = [plan('p-a', SALLE.id, '08:00', '12:00'), plan('p-b', AUTRE.id, '11:00', '15:00')];
await openWorker();
{
  const asked = await send({ confirmPlanned: true });
  const txt = await workerText();
  console.log(`  questions : ${asked.join(' / ')} · lignes : ${D.time_entries.length}`);
  check(asked.includes('prévu') && D.time_entries.length === 0 && /se chevauchent/.test(txt), 'S1f « Oui » sur deux prévus qui se chevauchent : refusé, rien n’est envoyé');
}

// Créneau « à 09:30 » sans fin : plus de 09:30–17:00 inventé en silence.
console.log('\n═══ S1e · créneau prévu « à 09:30 » sans heure de fin');
freshDb(); D.planning = [plan('p-930', SALLE.id, '09:30', null)];
await openWorker();
{
  const card = (await wp.locator('[data-testid=card-planned]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const prevu = await wp.locator('[data-testid=total-prevu]').count();
  const sendable = await wp.locator('.bt-send', { hasText: 'Envoyer ma journée' }).isEnabled().catch(() => false);
  console.log(`  carte : ${card} · total ${hm(await workerTotal())} · « prévues » affiché : ${prevu} · Envoyer actif : ${sendable}`);
  check(await workerTotal() === 0 && prevu === 0, 'S1e rien n’est compté (ni travaillé, ni prévu) tant que la fin manque');
  check(/fin à préciser/i.test(card), `S1e la carte dit « fin à préciser » (${card})`);
  if (sendable) { await send({ confirmPlanned: true }); }
  check(D.time_entries.length === 0, `S1e « Envoyer » n’invente aucune ligne (${D.time_entries.length})`);
}

// ═══ S2 · journée avec pause ══════════════════════════════════════════════════
await scenario('S2a', 'deux lignes 07:00–12:00 + 13:00–18:00, trou répondu « Pause »', 600,
  () => {},
  async () => {
    await addLine('Salle', '07:00', '12:00'); await addLine('Salle', '13:00', '18:00');
    const b = wp.locator('.bt-gap-b', { hasText: 'Pause' }); if (await b.count()) { await b.first().click(); await wp.waitForTimeout(800); }
    return [`tuile pause : ${(await wp.locator('.bt-stat').nth(1).innerText()).replace(/\s+/g, ' ')}`];
  });

await scenario('S2b', 'une ligne 07:00–18:00, pause de 30 min déclarée', 630,
  () => {},
  async () => { await addLine('Salle', '07:00', '18:00'); },
  { send: { pause: 30 } });

// ═══ S3 · journée coupée en deux ══════════════════════════════════════════════
await scenario('S3a', 'coupée en deux au « + » : 07:00–12:30 puis 12:30–18:00 (Matin + Après-midi prévus)', 600,
  () => { D.planning = [plan('p-matin', SALLE.id, ...MATIN), plan('p-aprem', SALLE.id, ...APREM)]; },
  async () => { await addLine('Salle', '07:00', '12:30'); await addLine('Salle', '12:30', '18:00'); },
  { send: { pause: 60 } });

await scenario('S3b', 'coupée en deux sur les cartes prévues : Matin → 07:00–12:00, Après-midi → 13:00–18:00', 600,
  () => { D.planning = [plan('p-matin', SALLE.id, ...MATIN), plan('p-aprem', SALLE.id, ...APREM)]; },
  async () => {
    await editCard(wp.locator('[data-testid=card-planned]').first(), '07:00', '12:00');
    await editCard(wp.locator('[data-testid=card-planned]').first(), '13:00', '18:00');
  });

await scenario('S3c', 'un seul « + » 07:00–18:00 alors que Matin + Après-midi sont prévus', 600,
  () => { D.planning = [plan('p-matin', SALLE.id, ...MATIN), plan('p-aprem', SALLE.id, ...APREM)]; },
  async () => { await addLine('Salle', '07:00', '18:00'); },
  { send: { pause: 60 } });

// ═══ S4 · créneaux qui se chevauchent ═════════════════════════════════════════
await scenario('S4', 'chevauchement : 07:00–13:00 puis 12:00–18:00 (réel : 07:00–18:00, pause 1 h)', 600,
  () => {},
  async () => {
    await addLine('Salle', '07:00', '13:00'); await addLine('Salle', '12:00', '18:00');
    const txt = await workerText();
    const blocked = /chevauche/i.test(txt) && D.time_entries.length < 2;
    if (blocked) {
      // Correctif : la 2e ligne est refusée → le salarié la corrige en 13:00–18:00.
      await wp.keyboard.press('Escape').catch(() => {});
      return ['2e ligne refusée à l\'enregistrement (chevauchement)', ...(await (async () => { await openWorker(); await addLine('Salle', '13:00', '18:00'); return []; })())];
    }
    return [`lignes enregistrées : ${D.time_entries.length}`];
  },
  { send: { pause: 60 } });

// ═══ S5 · modification après envoi ════════════════════════════════════════════
await scenario('S5', 'journée envoyée 07:00–18:00 pause 1 h, puis le salarié corrige la fin à 17:00', 540,
  () => { D.time_entries = [row({ id: 'e-envoye', start_time: '07:00', end_time: '18:00', break_minutes: 60, status: 'submitted' })]; },
  async () => {
    await editCard(wp.locator('[data-testid=card-entry]').first(), null, '17:00');
    const e = D.time_entries.find((x) => x.id === 'e-envoye');
    return [`après correction : ${e.start_time.slice(0, 5)}–${e.end_time.slice(0, 5)} pause ${e.break_minutes} → ${hm(e.total_minutes)} (statut ${e.status})`];
  },
  { noSend: true });

// ═══ S6 · sortie à la borne QR ════════════════════════════════════════════════
// Ce que finish_active_session écrit : début tronqué à la minute, fin arrondie
// à la minute SUPÉRIEURE, pause 0, brouillon, source 'qr'.
await scenario('S6a', 'borne : arrivée 07:00, sortie 18:00:20 (ligne 07:00–18:01), pause 1 h', 601,
  () => { D.time_entries = [row({ id: 'e-qr', start_time: '07:00', end_time: '18:01', source: 'qr' })]; },
  null,
  { send: { pause: 60 } });

await scenario('S6b', 'borne avec Matin + Après-midi prévus : ligne 07:00–18:01 rattachée au Matin', 601,
  () => {
    D.planning = [plan('p-matin', SALLE.id, ...MATIN), plan('p-aprem', SALLE.id, ...APREM)];
    D.time_entries = [row({ id: 'e-qr', start_time: '07:00', end_time: '18:01', source: 'qr', planning_id: 'p-matin' })];
  },
  null,
  { send: { pause: 60 } });

// ─── Résumé ───────────────────────────────────────────────────────────────────
console.log('\n┌──────┬────────┬───────────────┬───────────────┬──────────┬────────┬────────┐');
console.log('│ Cas  │ Réel   │ Salarié avant │ Salarié après │ Planning │ Fiche  │ CSV    │');
for (const r of results) {
  console.log(`│ ${r.code.padEnd(4)} │ ${hm(r.real).padEnd(6)} │ ${hm(r.shownBeforeSend).padEnd(13)} │ ${hm(r.shownAfterSend).padEnd(13)} │ ${hm(r.grid).padEnd(8)} │ ${hm(r.sheet).padEnd(6)} │ ${hm(r.csv).padEnd(6)} │`);
}
console.log('└──────┴────────┴───────────────┴───────────────┴──────────┴────────┴────────┘');
fs.writeFileSync(path.join(SH, 'resultats.json'), JSON.stringify(results, null, 1));
console.log(`\n${ok} ✅ / ${ko} ❌`);
if (fails.length) console.log(fails.map((f) => ` - ${f}`).join('\n'));
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
