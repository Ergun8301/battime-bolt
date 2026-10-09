// Lancer : npm run build, puis node scripts/tests/absences-lot2.mjs out [dossier-captures] [port]
// Build d'avant le correctif (constats seuls, n'échoue jamais) :
//   AVANT=1 node scripts/tests/absences-lot2.mjs <out-avant> '' 4902
//
// Lot 2 — absences posées par le bureau (lib/planning-writes.ts, setAbsence, commit 492d1ef),
// sur la VRAIE page planning (base simulée AVEC état, horloge figée au mercredi
// 21 octobre 2026, 10:00 à Paris ; aucune vraie base, aucun e-mail).
// Sam a « Congé » jeudi 22 et vendredi 23 ; le bureau pose « Intempérie » du 22 au 23
// par l'interface (case d'absence → fenêtre « Statut » → type → calendrier → Enregistrer).
//  A1  réussite : le POST (insertion) part AVANT le DELETE ; le DELETE vise exactement
//      les identifiants des anciennes absences (id=in.(...)), rien d'autre n'est touché
//  A2  échec : l'insertion répond 400, code 23514 (contrainte CHECK) → AUCUN DELETE,
//      les congés sont toujours là, message « Impossible d'enregistrer l'absence : rien n'a été changé »
//  A2b le retrait des anciennes échoue après l'insertion → la nouvelle est retirée
//      (DELETE de ses identifiants) : rien en double, rien de perdu
//  A3  la fenêtre « Statut » ne propose plus « Repos » (la base le refuse)
// La base simulée applique planning_absence_type_check (conge, maladie, intemperie) :
// en mode AVANT, choisir « Repos » reproduit la perte des congés sans forcer d'erreur.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const [,, OUT = 'out', SH = '', PORT = process.env.PORT || '4901'] = process.argv;
const AVANT = process.env.AVANT === '1';
if (SH) fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Horloge figée : mercredi 21 octobre 2026, 10:00 (Paris) ─────────────────────
const NOW = new Date('2026-10-21T10:00:00+02:00');
const D_ = (d) => `2026-10-${String(d).padStart(2, '0')}`;
// Colonnes de la semaine affichée : lundi = 0 … dimanche = 6.
const MON = 0, THU = 3, FRI = 4;

// ─── Base simulée (avec état) — noms fictifs neutres ─────────────────────────────
const CO = 'c0000000-0000-0000-0000-0000000000a2';
const W1 = { id: 'w1', company_id: CO, client_name: 'Salle', city: 'Lyon', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Dépôt', city: 'Vienne', is_active: true };
const u = (id, first, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: 'Test', role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01' });
const slot = (id, user_id, work_date, ws, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: ws?.id ?? null, work_date, absence_type: null, estimated_start: null, estimated_end: null, notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: `${work_date}T06:00:00Z`, ...extra });
const abs = (id, user_id, work_date, type) => slot(id, user_id, work_date, null, { absence_type: type });
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: true, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: null };
const OLD_IDS = ['pa-thu', 'pa-fri'];
const fresh = () => ({
  users: [u('u-admin', 'Alex', 'admin'), u('u-sam', 'Sam'), u('u-lou', 'Lou')],
  companies: [{ ...COMPANY }],
  worksites: [W1, W2],
  planning: [
    // Sam : lun. une intervention · « Congé » jeu. 22 et ven. 23 · « Congé » lun. 26 (hors période choisie)
    slot('ps-mon', 'u-sam', D_(19), W1, { estimated_start: '08:00:00', estimated_end: '12:00:00' }),
    abs('pa-thu', 'u-sam', D_(22), 'conge'), abs('pa-fri', 'u-sam', D_(23), 'conge'),
    abs('pa-mon26', 'u-sam', D_(26), 'conge'),
    // Lou : lun. une intervention · « Congé » jeu. 22 (témoin : ne doit jamais bouger)
    slot('pl-mon', 'u-lou', D_(19), W2),
    abs('pl-thu', 'u-lou', D_(22), 'conge'),
  ],
  time_entries: [], active_sessions: [], month_closures: [], user_closures: [],
  leave_requests: [], invitations: [], documents: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [], worksite_expenses: [], user_payroll: [], assistant_journal: [],
});
let D = fresh();
// Une seule réponse forcée, consommée par la prochaine écriture de cette méthode sur planning.
let FAIL = {};
const CHECK_ERR = { code: '23514', message: 'new row for relation "planning" violates check constraint "planning_absence_type_check"', details: null, hint: null };
const ABSENCE_OK = new Set(['conge', 'maladie', 'intemperie']);

// ─── Session simulée + routes Supabase (comme planning-lot2) ─────────────────────
const now = Math.floor(NOW.getTime() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-admin', role: 'authenticated', exp: now + 864000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 864000, expires_in: 864000, token_type: 'bearer', user: { id: 'u-admin', email: 'u-admin@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    let neg = false; let w = v; if (w.startsWith('not.')) { neg = true; w = w.slice(4); }
    const dot = w.indexOf('.'); const op = w.slice(0, dot); const val = w.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k]; let r = true;
      if (op === 'eq') r = String(cur) === val;
      else if (op === 'neq') r = String(cur) !== val;
      else if (op === 'in') r = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      else if (op === 'gte') r = String(cur) >= val;
      else if (op === 'lte') r = String(cur) <= val;
      else if (op === 'gt') r = String(cur) > val;
      else if (op === 'lt') r = String(cur) < val;
      else if (op === 'is') r = val === 'null' ? cur == null : String(cur) === val;
      return neg ? !r : r;
    });
  }
  return rows;
};
const embed = (t, row, sel) => {
  const out = { ...row };
  if (t === 'planning') {
    if (sel.includes('worksite:worksites')) out.worksite = D.worksites.find((w) => w.id === row.worksite_id) || null;
    if (sel.includes('user:users')) out.user = D.users.find((x) => x.id === row.user_id) || null;
  }
  return out;
};
const log = { writes: [] };
let seq = 0;
const setup = async (ctx) => {
  await ctx.clock.install({ time: NOW });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url()); const m = r.request().method();
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/')) { log.writes.push({ m: 'FN', t: url.pathname }); return r.fulfill({ json: {} }); }
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', ''); D[t] = D[t] || [];
    const sel = url.searchParams.get('select') || '*';
    const single = (r.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    // q pour lire un filtre ; qa garde tout (work_date=gte… ET work_date=lte…).
    const q = Object.fromEntries(url.searchParams); const qa = [...url.searchParams];
    if (m === 'DELETE') {
      if (t === 'planning' && FAIL.DELETE) {
        const f = FAIL.DELETE; delete FAIL.DELETE;
        log.writes.push({ m, t, q, qa, ids: [], status: f.status });
        return r.fulfill({ status: f.status, json: f.json });
      }
      const gone = filterRows(D[t], url.searchParams); D[t] = D[t].filter((x) => !gone.includes(x));
      log.writes.push({ m, t, q, qa, ids: gone.map((x) => x.id), status: 200 });
      return r.fulfill({ json: gone.map((x) => ({ id: x.id })) });
    }
    if (m === 'POST') {
      const body = JSON.parse(r.request().postData() || '[]'); const arr = Array.isArray(body) ? body : [body];
      const forced = t === 'planning' && FAIL.POST ? FAIL.POST : null;
      if (forced) delete FAIL.POST;
      // La vraie contrainte de la base : planning_absence_type_check.
      const refused = forced || (t === 'planning' && arr.some((x) => x.absence_type != null && !ABSENCE_OK.has(x.absence_type)) ? { status: 400, json: CHECK_ERR } : null);
      if (refused) {
        log.writes.push({ m, t, q, qa, rows: arr, ids: [], status: refused.status });
        return r.fulfill({ status: refused.status, json: refused.json });
      }
      const saved = arr.map((row) => { const x = { id: row.id || `new-${++seq}`, position: null, added_by_worker: false, created_at: NOW.toISOString(), ...row }; const i = D[t].findIndex((y) => y.id === x.id); if (i >= 0) D[t][i] = x; else D[t].push(x); return x; });
      log.writes.push({ m, t, q, qa, rows: arr, ids: saved.map((x) => x.id), status: 201 });
      return r.fulfill({ status: 201, json: single ? saved[0] : saved });
    }
    if (m === 'PATCH') {
      const body = JSON.parse(r.request().postData() || '{}');
      const hit = filterRows(D[t], url.searchParams); for (const x of hit) Object.assign(x, body);
      log.writes.push({ m, t, q, qa, ids: hit.map((x) => x.id), body, status: 200 });
      return r.fulfill({ json: hit.map((x) => ({ ...x })) });
    }
    const all = filterRows(D[t], url.searchParams).map((x) => embed(t, x, sel));
    if (single) return all.length ? r.fulfill({ json: all[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
    const rows = all.slice(off, lim ? off + Number(lim) : undefined);
    return r.fulfill({ json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${all.length}`, 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' } });
  });
};
const planningWrites = (n) => log.writes.slice(n).filter((x) => x.t === 'planning');
const fmtW = (l) => l.map((x) => `${x.m}${x.status >= 400 ? ` (${x.status})` : ''} ${x.m === 'POST' ? (x.rows || []).map((y) => `${y.work_date}:${y.absence_type}`).join(',') : (x.qa || []).filter(([k]) => k !== 'select').map(([k, v]) => `${k}=${v}`).join('&')}`).join('  →  ');
/** Les identifiants d'un filtre « in.(a,b) » de PostgREST. */
const inIds = (v) => (v && v.startsWith('in.(') ? v.slice(4, -1).split(',').map((s) => s.replace(/^"|"$/g, '')) : null);
const sameSet = (a, c) => !!a && a.length === c.length && [...a].sort().join() === [...c].sort().join();
const absOf = (uid, from, to) => D.planning.filter((x) => x.user_id === uid && x.absence_type && x.work_date >= from && x.work_date <= to)
  .sort((x, y) => x.work_date.localeCompare(y.work_date)).map((x) => `${x.work_date.slice(8)}:${x.absence_type}${OLD_IDS.includes(x.id) ? '(ancien)' : ''}`);

let ok = 0, ko = 0;
const check = (c, m) => { if (AVANT) return note(`${c ? 'oui' : 'NON'} — ${m}`); if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };
const note = (m) => console.log('ℹ️ ', m);
const newPage = async () => {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await setup(ctx); const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await p.goto(`http://localhost:${PORT}/admin`);
  await p.waitForSelector('.bt-pl-gridwrap .bt-pl-abs', { timeout: 20000 }); await p.waitForTimeout(1200);
  return { ctx, p };
};

// ─── Repères dans la grille et les fenêtres ──────────────────────────────────────
const row = (p, first) => p.locator('tr', { has: p.locator('.bt-pl-name', { hasText: `${first} Test` }) }).first();
const cell = (p, first, day) => row(p, first).locator('td.bt-pl-cell').nth(day);
// textContent : la grille met l'étiquette en capitales par CSS (« CONGÉ »).
const absLabel = async (p, first, day) => ((await cell(p, first, day).locator('.bt-pl-abs-lbl').textContent({ timeout: 3000 }).catch(() => '')) || '').trim();
const dialog = (p) => p.locator('[role=dialog]').last();
const dialogTitle = async (p) => (await dialog(p).locator('h2').first().innerText().catch(() => '')).trim();
const toasts = async (p) => (await p.locator('[data-sonner-toast]').allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, ' ').trim());
const shot = async (p, name) => { if (SH) await p.screenshot({ path: `${SH}/${AVANT ? 'avant' : 'apres'}-absence-${name}.png` }); };
/** Case d'absence de Sam jeudi → fenêtre « Statut » ; renvoie les choix proposés. */
const openStatus = async (p) => {
  await cell(p, 'Sam', THU).locator('.bt-pl-abs').click();
  await p.waitForSelector('[role=dialog] >> text=Statut de Sam', { timeout: 8000 });
  await p.waitForTimeout(250);
  return (await dialog(p).locator('button').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
};
/** Type → calendrier (1er jour déjà posé : jeudi 22) → dernier jour vendredi 23 → Enregistrer. */
const pickAndSave = async (p, label, { name } = {}) => {
  await dialog(p).locator('button', { hasText: label }).first().click();
  await p.waitForSelector(`[role=dialog] h2:has-text("— Sam")`, { timeout: 8000 });
  await p.waitForTimeout(250);
  await dialog(p).locator('button[name=day]:not(.day-outside)').filter({ hasText: /^23$/ }).first().click();
  await p.waitForTimeout(200);
  const range = (await dialog(p).locator('p.text-center').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  if (name) await shot(p, `${name}-calendrier`);
  await dialog(p).locator('button', { hasText: 'Enregistrer' }).click();
  await p.waitForTimeout(1500);
  return range;
};
const TOAST_KO = "Impossible d'enregistrer l'absence : rien n'a été changé";

// ═══ A3 + A1 — réussite : la nouvelle d'abord, les anciennes ensuite (par identifiant) ═══
{
  D = fresh(); FAIL = {};
  const { ctx, p } = await newPage();
  check(await absLabel(p, 'Sam', THU) === 'Congé' && await absLabel(p, 'Sam', FRI) === 'Congé', 'avant : Sam est en « Congé » jeudi 22 et vendredi 23');

  const opts = await openStatus(p);
  await shot(p, 'statut');
  check(!opts.some((x) => /\bRepos\b/.test(x)), `A3 la fenêtre « Statut » ne propose pas « Repos » (${opts.join(' · ')})`);
  check(['Présent', 'Congé', 'Arrêt maladie', 'Intempérie'].every((x) => opts.includes(x)), 'A3 Présent, Congé, Arrêt maladie, Intempérie restent proposés');
  check(await dialogTitle(p) === 'Statut de Sam à partir du jeudi 22 octobre', `A3 titre : « ${await dialogTitle(p)} »`);

  const w = log.writes.length;
  const range = await pickAndSave(p, 'Intempérie', { name: 'reussite' });
  check(/Du\s*22 oct\.?\s*au\s*23 oct\.? 2026/i.test(range), `A1 période choisie au calendrier : « ${range} »`);
  const pw = planningWrites(w);
  const iPost = pw.findIndex((x) => x.m === 'POST'); const iDel = pw.findIndex((x) => x.m === 'DELETE');
  const post = pw[iPost]; const del = pw[iDel];
  note(`écritures planning : ${fmtW(pw)}`);
  check(iPost >= 0 && iDel >= 0 && iPost < iDel, `A1 le POST (insertion) part AVANT le DELETE (ordre : ${pw.map((x) => x.m).join(' → ')})`);
  check(pw.length === 2 && pw.every((x) => x.status < 400), 'A1 exactement deux écritures planning, toutes acceptées');
  const rows = post?.rows || [];
  check(rows.length === 2 && rows.map((x) => x.work_date).join() === `${D_(22)},${D_(23)}` && rows.every((x) => x.absence_type === 'intemperie' && x.user_id === 'u-sam' && x.company_id === CO && x.created_by === 'u-admin' && x.worksite_id === null), `A1 le POST pose « intemperie » les 22 et 23 pour Sam (${rows.map((x) => `${x.work_date}:${x.absence_type}`).join(', ')})`);
  check(sameSet(inIds(del?.q.id), OLD_IDS), `A1 le DELETE vise exactement les anciennes absences : id=${del?.q.id}`);
  check(del?.q.company_id === `eq.${CO}` && !('work_date' in (del?.q || {})) && !('user_id' in (del?.q || {})) && !('absence_type' in (del?.q || {})), 'A1 le DELETE filtre par entreprise + identifiants (plus par période)');
  check(sameSet(del?.ids, OLD_IDS), `A1 lignes réellement retirées : ${del?.ids?.join(', ')}`);
  check(JSON.stringify(absOf('u-sam', D_(22), D_(23))) === '["22:intemperie","23:intemperie"]', `A1 base : Sam ${absOf('u-sam', D_(22), D_(23)).join(', ')} (rien en double)`);
  check(D.planning.some((x) => x.id === 'pa-mon26' && x.absence_type === 'conge') && D.planning.some((x) => x.id === 'pl-thu' && x.absence_type === 'conge'), 'A1 hors période (Sam lun. 26) et autre salarié (Lou jeu. 22) : congés intacts');
  const t = await toasts(p);
  check(t.some((x) => x.includes("Absence enregistrée jusqu'à la date de fin")), `A1 message : « ${t.join(' | ')} »`);
  await p.waitForTimeout(600);
  check(await absLabel(p, 'Sam', THU) === 'Intempérie' && await absLabel(p, 'Sam', FRI) === 'Intempérie' && await absLabel(p, 'Lou', THU) === 'Congé', 'A1 la grille montre « Intempérie » jeu. et ven. pour Sam, Lou toujours en « Congé »');
  await shot(p, 'reussite');
  await ctx.close();
}

// ═══ A2 — l'insertion est refusée (400, 23514) : rien n'est effacé ═════════════════
const failScenario = async (label, { force, type, tag }) => {
  D = fresh(); FAIL = force ? { POST: { status: 400, json: CHECK_ERR } } : {};
  const { ctx, p } = await newPage();
  const opts = await openStatus(p);
  if (!opts.includes(type)) { note(`${label} : « ${type} » n'est pas proposé (${opts.join(' · ')}) — scénario sauté`); await ctx.close(); return; }
  const w = log.writes.length;
  await pickAndSave(p, type);
  const pw = planningWrites(w);
  note(`${label} — écritures planning : ${fmtW(pw)}`);
  const post = pw.find((x) => x.m === 'POST');
  check(!!post && post.status === 400, `${label} l'insertion est tentée et refusée (400, code 23514)`);
  check(pw.filter((x) => x.m === 'DELETE').length === 0, `${label} AUCUN DELETE envoyé (${pw.map((x) => `${x.m} ${x.status}`).join(' → ')})`);
  check(JSON.stringify(absOf('u-sam', D_(22), D_(23))) === '["22:conge(ancien)","23:conge(ancien)"]', `${label} base : Sam ${absOf('u-sam', D_(22), D_(23)).join(', ') || 'AUCUNE absence les 22–23 (congés perdus)'}`);
  const t = await toasts(p);
  check(t.some((x) => x.includes(TOAST_KO)), `${label} message : « ${t.join(' | ')} »`);
  check(await dialogTitle(p) === `${type} — Sam`, `${label} la fenêtre reste ouverte pour réessayer (« ${await dialogTitle(p)} »)`);
  await shot(p, `${tag}-echec`);
  // Rechargée : ce que la base contient vraiment.
  await p.reload(); await p.waitForSelector('.bt-pl-gridwrap .bt-pl-name', { timeout: 20000 }); await p.waitForTimeout(1200);
  const thu = await absLabel(p, 'Sam', THU); const fri = await absLabel(p, 'Sam', FRI);
  check(thu === 'Congé' && fri === 'Congé', `${label} page rechargée : Sam jeu. « ${thu || 'présent'} », ven. « ${fri || 'présent'} »`);
  await ctx.close();
};
await failScenario('A2', { force: true, type: 'Intempérie', tag: 'insertion-refusee' });
if (AVANT) await failScenario('A2 (« Repos », refusé par la vraie contrainte)', { force: false, type: 'Repos', tag: 'repos' });

// ═══ A2b — le retrait des anciennes échoue après l'insertion : la nouvelle repart ═══
{
  D = fresh(); FAIL = { DELETE: { status: 403, json: { code: '42501', message: 'permission denied for table planning', details: null, hint: null } } };
  const { ctx, p } = await newPage();
  await openStatus(p);
  const w = log.writes.length;
  await pickAndSave(p, 'Intempérie');
  const pw = planningWrites(w);
  note(`A2b — écritures planning : ${fmtW(pw)}`);
  const post = pw.find((x) => x.m === 'POST' && x.status < 400);
  const dels = pw.filter((x) => x.m === 'DELETE');
  check(!!post && pw[0] === post && dels.length === 2 && dels[0].status === 403 && sameSet(inIds(dels[0].q.id), OLD_IDS), 'A2b POST accepté, puis DELETE des anciennes refusé (403)');
  check(dels[1] && dels[1].status < 400 && sameSet(inIds(dels[1].q.id), post?.ids || ['?']) && sameSet(dels[1].ids, post?.ids || ['?']), `A2b la nouvelle est retirée : DELETE id=${dels[1]?.q.id}`);
  check(JSON.stringify(absOf('u-sam', D_(22), D_(23))) === '["22:conge(ancien)","23:conge(ancien)"]', `A2b base : Sam ${absOf('u-sam', D_(22), D_(23)).join(', ')} (rien en double, rien de perdu)`);
  const t = await toasts(p);
  check(t.some((x) => x.includes(TOAST_KO)), `A2b message : « ${t.join(' | ')} »`);
  await ctx.close();
}

if (AVANT) console.log('\nMode AVANT : constats seuls (aucun échec compté).');
else console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(!AVANT && ko ? 1 : 0);
