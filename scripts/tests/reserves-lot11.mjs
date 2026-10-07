// Lot 11 — « Lever la réserve » de bout en bout (base Supabase SIMULÉE, vraie
// page de l'export statique, aucun accès réseau réel).
//
// Lancer : npm run build, puis
//   node scripts/tests/reserves-lot11.mjs out docs/captures-lot11
//
//  A) BUREAU (/admin) : « Réserves » → « Lever la réserve » avec commentaire +
//     photo → la photo part D'ABORD (stockage puis ligne documents), PUIS
//     set_reserve_resolution(note) → la réserve passe dans « Levées » avec
//     « Levée le … par Paul Martin », la puce « par le bureau », le
//     commentaire et la vignette (adresse signée). Levée refusée → la photo
//     envoyée est retirée. Réserve levée par le salarié → « par le salarié ».
//     « Rouvrir » (après confirmation) retire les 4 marques de levée en une écriture ; les commentaires restent.
//  B) SALARIÉ (/poseur) : carte « ⚠ Avec réserve » → « Lever la réserve » →
//     même formulaire → mark_reserve_fixed(note), carte « ✓ Réserve levée le … »,
//     « Annuler » 10 s (mark_reserve_fixed false + photo retirée), refus
//     « déjà levée par le bureau », bandeau « ⚠ N réserves à lever › » et sa
//     liste (refermée après chaque levée : « Annuler » doit rester touchable,
//     y compris quand une autre réserve reste à lever), aucune mutation
//     pendant les relectures, clôture « jusqu'au … »,
//     « Prévu · 14:00 » (journée et semaine).
//  C) Aucun défilement horizontal des fenêtres à 390, 1024 et 1280 px.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-lot11', PORT = '0'] = process.argv;
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
const BASE = `http://localhost:${srv.address().port}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };

// ─── Dates (jour de Paris) ─────────────────────────────────────────────────────
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const day = (n) => { const x = new Date(`${today}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const ago = (d) => new Date(Date.now() - d * 86400e3).toISOString();
const frDay = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dMMM = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

// ─── Base simulée commune ──────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-000000000001';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Maison Garnier', city: 'Vienne', is_active: true };
const AUTRE = { id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true };
const W3 = { id: 'w3', company_id: CO, client_name: 'Dépôt Gerland', city: 'Lyon', is_active: true };
const u = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@x.fr`, is_active: true, created_at: '2026-01-01' });
const ws = (w) => ({ client_name: w.client_name, city: w.city });
const RES0 = { reserve_resolved_at: null, reserve_resolved_by: null, reserve_resolution: null, reserve_fixed_at: null, reserve_fixed_by: null, reserve_fix_note: null };
const tEntry = (id, user, work_date, w, status, extra = {}) => ({
  id, company_id: CO, user_id: user.id, worksite_id: w.id, planning_id: null, work_date, start_time: '08:00:00', end_time: '12:00:00',
  break_minutes: 0, total_minutes: 240, meal_allowance: false, status, locked: false, exported_at: null, observation: null,
  reception: 'avec', gap_before: null, created_at: `${work_date}T06:00:00Z`, ...RES0,
  worksite: { ...w }, owner: { first_name: user.first_name, last_name: user.last_name }, ...extra,
});

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
      if (op === 'like') return String(cur ?? '').startsWith(val.replace(/[*%].*$/, ''));
      return true;
    });
  }
  return rows;
};

/** Monte la base simulée dans un contexte. `S` = état (tables + journal des appels). */
async function mount(ctx, S, me) {
  const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: me.id, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
  const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: me.id, email: me.email, aud: 'authenticated', role: 'authenticated' } };
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const url = new URL(req.url()); const method = req.method(); const P = url.pathname;
    let body = null; try { body = req.postDataJSON(); } catch { body = null; }
    if (P.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (P.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (P.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    // ── Stockage (photos) ──
    if (P.startsWith('/storage/v1/object/sign/chantier-docs/')) return r.fulfill({ status: 200, contentType: 'image/png', body: S.png });
    if (P === '/storage/v1/object/sign/chantier-docs' && method === 'POST') {
      S.seq.push('sign');
      return r.fulfill({ json: (body?.paths || []).map((p) => ({ path: p, signedURL: `/object/sign/chantier-docs/${p}?token=t`, error: null })) });
    }
    if (P.startsWith('/storage/v1/object/chantier-docs/') && method === 'POST') {
      const key = decodeURIComponent(P.replace('/storage/v1/object/chantier-docs/', ''));
      S.seq.push('upload'); S.uploads.push({ key, bytes: (req.postDataBuffer() || Buffer.alloc(0)).length, multipart: (req.postDataBuffer() || Buffer.alloc(0)).toString('latin1').slice(0, 600) });
      return r.fulfill({ json: { Key: `chantier-docs/${key}`, Id: 'obj-1' } });
    }
    if (P === '/storage/v1/object/chantier-docs' && method === 'DELETE') { S.seq.push('storage-delete'); S.storageDeletes.push(body); return r.fulfill({ json: [] }); }
    if (P.startsWith('/storage/v1/')) return r.fulfill({ json: {} });
    // ── Fonctions serveur ──
    if (P.startsWith('/rest/v1/rpc/')) {
      const fn = P.replace('/rest/v1/rpc/', '');
      S.calls.push({ fn, body });
      const row = S.time_entries.find((x) => x.id === body?.p_entry_id);
      if (fn === 'set_reserve_resolution') {
        S.seq.push(`rpc:${fn}`);
        if (S.failRpc) return r.fulfill({ status: 400, json: { code: 'P0001', message: 'Réserve introuvable', details: null, hint: null } });
        Object.assign(row, body.p_resolved
          ? { reserve_resolved_at: new Date().toISOString(), reserve_resolved_by: me.id, reserve_resolution: (body.p_note || '').trim() || null }
          : { reserve_resolved_at: null, reserve_resolved_by: null, reserve_resolution: null });
        return r.fulfill({ status: 204, body: '' });
      }
      if (fn === 'mark_reserve_fixed') {
        S.seq.push(`rpc:${fn}:${body.p_fixed}`);
        if (row.reserve_resolved_at) return r.fulfill({ status: 400, json: { code: 'P0001', message: 'Cette réserve a déjà été levée par le bureau', details: null, hint: null } });
        Object.assign(row, body.p_fixed
          ? { reserve_fixed_at: new Date().toISOString(), reserve_fixed_by: me.id, reserve_fix_note: (body.p_note || '').trim() || null }
          : { reserve_fixed_at: null, reserve_fixed_by: null, reserve_fix_note: null });
        return r.fulfill({ status: 204, body: '' });
      }
      return r.fulfill({ json: [] });
    }
    // ── Tables ──
    const t = P.replace('/rest/v1/', '');
    const rows = filterRows(S[t] || [], url.searchParams);
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    if (method === 'GET' || method === 'HEAD') {
      if (single) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
      // Pagination (.range → offset/limit) : lib/fetch-all.ts lit jusqu'à une page vide.
      const off = Number(url.searchParams.get('offset') || 0);
      const lim = url.searchParams.get('limit');
      const page = rows.slice(off, lim ? off + Number(lim) : undefined);
      return r.fulfill({ json: page, headers: { 'content-range': `${off}-${Math.max(off, off + page.length - 1)}/${rows.length}` } });
    }
    S.writes.push({ method, t, search: url.search, body });
    if (t === 'documents' && method === 'POST') {
      const doc = { ...body, id: `doc-${S.documents.length + 1}`, created_at: new Date().toISOString() };
      S.documents.push(doc); S.seq.push('doc');
      return r.fulfill({ status: 201, json: single ? { id: doc.id } : [{ id: doc.id }] });
    }
    if (method === 'DELETE') {
      S[t] = (S[t] || []).filter((x) => !rows.includes(x)); S.seq.push(`delete:${t}`);
      return r.fulfill({ json: rows.map((x) => ({ id: x.id })) });
    }
    if (method === 'PATCH' && S.patchError) return r.fulfill({ status: 400, json: { code: 'P0001', message: S.patchError, details: null, hint: null } });
    if (method === 'PATCH') {
      for (const x of rows) Object.assign(x, body); S.seq.push(`patch:${t}`);
      return r.fulfill({ json: rows.map((x) => ({ id: x.id })) });
    }
    return r.fulfill({ status: 201, json: single ? { id: 'new-1' } : [{ id: 'new-1' }] });
  });
}
const freshLog = () => ({ seq: [], calls: [], uploads: [], storageDeletes: [], writes: [], failRpc: false });

/** Aucun défilement horizontal : la fenêtre ne déborde pas, aucun élément ne sort à droite. */
const noHScroll = (p, sel) => p.evaluate((sel) => {
  const d = document.querySelector(sel);
  if (!d) return { ok: false, why: 'absent' };
  const r = d.getBoundingClientRect();
  const over = [...d.querySelectorAll('*')].filter((e) => { const x = e.getBoundingClientRect(); return x.width > 0 && x.height > 0 && x.right > r.right + 1; })
    .map((e) => `${e.tagName.toLowerCase()}.${String(e.className || '').split(' ')[0]}`).slice(0, 5);
  const pageOk = document.documentElement.scrollWidth <= window.innerWidth + 1;
  return { ok: d.scrollWidth <= d.clientWidth + 1 && !over.length && pageOk && r.right <= window.innerWidth + 1 && r.left >= -1, sw: d.scrollWidth, cw: d.clientWidth, over, pageOk };
}, sel);

// Une vraie photo (PNG 2400×1800) fabriquée par le navigateur.
async function makePng(ctx) {
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/robots.txt`).catch(() => {});
  const b64 = await pg.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 2400; c.height = 1800;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 2400, 1800); grd.addColorStop(0, '#c8843a'); grd.addColorStop(1, '#2a4d6e');
    g.fillStyle = grd; g.fillRect(0, 0, 2400, 1800);
    g.fillStyle = '#f2ede3'; g.font = 'bold 220px sans-serif'; g.fillText('JOINT', 600, 1000);
    return c.toDataURL('image/png').split(',')[1];
  });
  await pg.close();
  return Buffer.from(b64, 'base64');
}

// ════════════════════════════════════════════════════════════════════════════
// A · BUREAU
// ════════════════════════════════════════════════════════════════════════════
{
  const ADMIN = u('u-admin', 'Paul', 'Martin', 'admin');
  const KARIM = u('u-karim', 'Karim', 'Benali');
  const SARA = u('u-sara', 'Sara', 'Morel');
  const S = {
    ...freshLog(),
    users: [ADMIN, KARIM, SARA],
    companies: [{ id: CO, name: 'Benali Rénovation', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
    worksites: [W1, W2, AUTRE],
    time_entries: [
      tEntry('r1', KARIM, day(-3), W1, 'submitted', { observation: 'Joint silicone de la douche à reprendre — côté fenêtre, sur toute la hauteur du bac, avec un très long commentaire pour éprouver la largeur de la fenêtre' }),
      tEntry('r4', SARA, day(-6), W2, 'validated', { observation: 'Plinthe à recoller' }),
      tEntry('r2', KARIM, day(-5), W2, 'validated', { observation: 'Prise décentrée', reserve_fixed_at: ago(4), reserve_fixed_by: 'u-karim', reserve_fix_note: 'Recentrée et revissée' }),
      tEntry('r3', SARA, day(-9), W1, 'submitted', { observation: 'Rayure sur la porte', reserve_resolved_at: ago(7), reserve_resolved_by: 'u-admin', reserve_resolution: 'Vu sur place, rien à faire' }),
      tEntry('r5', KARIM, day(-1), W1, 'draft', { observation: 'Brouillon : pas encore une réserve pour le bureau' }),
    ],
    planning: [], active_sessions: [], month_closures: [], leave_requests: [], invitations: [], documents: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [],
  };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  S.png = await makePng(ctx);
  await mount(ctx, S, ADMIN);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  await p.goto(`${BASE}/admin`);
  await p.waitForSelector('.bt-pl-out', { timeout: 20000 }); await p.waitForTimeout(1500);

  const openReserves = async () => {
    await p.locator('.bt-pl-out:visible', { hasText: 'Réserves' }).first().click();
    await p.waitForSelector('[data-testid=reserves-report] [data-testid=rr-tab-open]', { timeout: 8000 });
    await p.waitForTimeout(700);
  };
  const tabN = async (id) => Number((await p.locator(`[data-testid=${id}] .bt-rr-tabn`).innerText()).trim());
  await openReserves();
  check(await tabN('rr-tab-open') === 2 && await tabN('rr-tab-done') === 2, `A1) « À traiter » 2 / « Levées » 2 (levée par le salarié = levée ; brouillon exclu) : ${await tabN('rr-tab-open')} / ${await tabN('rr-tab-done')}`);
  check(!(await p.locator('[data-testid=reserves-report]').innerText()).includes('à vérifier'), 'A1) plus de « à vérifier » : le salarié lève vraiment');

  // A2 · Lever r1 avec commentaire + photo.
  const card = p.locator('[data-testid=rr-open-card]', { hasText: 'Joint silicone' });
  await card.getByRole('button', { name: 'Lever la réserve' }).click();
  const form = card.locator('[data-testid=reserve-lift-form]');
  const ftxt = await form.innerText();
  check(ftxt.includes('Commentaire (facultatif)') && ftxt.includes('📷 Photo (facultatif)') && ftxt.includes('Lever la réserve') && ftxt.includes('Annuler'), 'A2) formulaire : « Commentaire (facultatif) », « 📷 Photo (facultatif) », « Lever la réserve », « Annuler »');
  const fileAttrs = await form.locator('[data-testid=reserve-lift-file]').evaluate((e) => [e.getAttribute('accept'), e.getAttribute('capture')]);
  check(fileAttrs[0] === 'image/*' && fileAttrs[1] === 'environment', `A2) photo : accept=image/*, capture=environment (${fileAttrs.join(', ')})`);
  await form.locator('textarea').fill('Joint refait le matin, sec à 14 h');
  await form.locator('[data-testid=reserve-lift-file]').setInputFiles({ name: 'chantier.png', mimeType: 'image/png', buffer: S.png });
  await p.waitForTimeout(300);
  check(await form.locator('[data-testid=reserve-lift-preview] img').count() === 1, 'A2) aperçu de la photo affiché');
  await form.getByRole('button', { name: 'Retirer la photo' }).click();
  check(await form.locator('[data-testid=reserve-lift-preview]').count() === 0 && (await form.innerText()).includes('📷 Photo (facultatif)'), 'A2) ✕ retire la photo');
  await form.locator('[data-testid=reserve-lift-file]').setInputFiles({ name: 'chantier.png', mimeType: 'image/png', buffer: S.png });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${SH}/reserves-bureau-formulaire-1280x800.png` });
  S.seq.length = 0;
  await form.locator('[data-testid=reserve-lift-submit]').click();
  await p.waitForTimeout(1800);
  const order = S.seq.filter((x) => ['upload', 'doc', 'rpc:set_reserve_resolution'].includes(x));
  check(JSON.stringify(order) === JSON.stringify(['upload', 'doc', 'rpc:set_reserve_resolution']), `A2) ordre : photo (stockage) → ligne documents → set_reserve_resolution : ${order.join(' → ')}`);
  const doc = S.documents.at(-1);
  check(doc && doc.time_entry_id === 'r1' && doc.worksite_id === 'w1' && doc.category === 'reserve' && doc.label === `Réserve levée — ${frDay}` && doc.uploaded_by === 'u-admin',
    `A2) document : intervention r1, catégorie « reserve », « Réserve levée — ${frDay} » (${doc?.label})`);
  check(doc && doc.mime_type === 'image/jpeg' && /\.jpg$/.test(doc.file_name) && doc.size_bytes > 0, `A2) photo réduite avant l'envoi : ${doc?.mime_type}, ${doc?.file_name}, ${doc?.size_bytes} o (original PNG ${S.png.length} o)`);
  const rpc = S.calls.find((c) => c.fn === 'set_reserve_resolution');
  check(rpc && rpc.body.p_entry_id === 'r1' && rpc.body.p_resolved === true && rpc.body.p_note === 'Joint refait le matin, sec à 14 h', `A2) set_reserve_resolution(r1, true, commentaire) : ${JSON.stringify(rpc?.body)}`);
  check(await tabN('rr-tab-open') === 1 && await tabN('rr-tab-done') === 3, 'A2) la réserve passe dans « Levées » (1 / 3)');

  // A3 · « Levées » : nom, puce, commentaire, vignette, plus récente d'abord.
  await p.locator('[data-testid=rr-tab-done]').click();
  await p.waitForTimeout(900);
  const done = p.locator('[data-testid=rr-done-card]');
  const first = await done.nth(0).innerText();
  check(first.includes('Villa Dupont') && first.includes(`Levée le ${dMMM(new Date())}`) && first.includes('par Paul Martin') && first.includes('par le bureau') && first.includes('« Joint refait le matin, sec à 14 h »'),
    `A3) 1re carte (la plus récente) : « Levée le … par Paul Martin », « par le bureau », commentaire : ${first.replace(/\s+/g, ' ').slice(0, 160)}`);
  const img = done.nth(0).locator('[data-testid=rr-lift-photo]');
  const imgOk = await img.count() === 1 && await img.evaluate((e) => e.complete && e.naturalWidth > 0).catch(() => false);
  check(imgOk && /\/storage\/v1\/object\/sign\/chantier-docs\//.test(await img.getAttribute('src')), 'A3) vignette de la photo (adresse signée), chargée');
  const second = await done.nth(1).innerText();
  check(second.includes('Prise décentrée') && second.includes('par Karim Benali') && second.includes('par le salarié') && second.includes('« Recentrée et revissée »'), `A3) levée par le salarié : « par Karim Benali », « par le salarié », son commentaire : ${second.replace(/\s+/g, ' ').slice(0, 140)}`);
  check((await done.nth(2).innerText()).includes('Rayure sur la porte'), 'A3) tri : la plus ancienne levée en dernier');
  await p.screenshot({ path: `${SH}/reserves-bureau-levees-1280x800.png` });
  const h1280 = await noHScroll(p, '[data-testid=reserves-report]');
  check(h1280.ok, `C) 1280 : fenêtre « Réserves » sans défilement horizontal ${JSON.stringify(h1280)}`);

  // A4 · « Rouvrir » une réserve levée par le SALARIÉ : confirmation, puis les 4 marques de levée
  // retirées en UNE écriture ; les commentaires (bureau et salarié) restent en base.
  S.seq.length = 0;
  const nPatch0 = S.writes.filter((w) => w.method === 'PATCH' && w.t === 'time_entries').length;
  await done.nth(1).getByRole('button', { name: 'Rouvrir' }).click();
  await p.waitForTimeout(400);
  check(S.writes.filter((w) => w.method === 'PATCH' && w.t === 'time_entries').length === nPatch0, 'A4) un clic sur « Rouvrir » ne rouvre pas encore (confirmation demandée)');
  await p.locator('[data-testid=rr-reopen-yes]').click();
  await p.waitForTimeout(1200);
  const patch = S.writes.filter((w) => w.method === 'PATCH' && w.t === 'time_entries').at(-1);
  const four = ['reserve_resolved_at', 'reserve_resolved_by', 'reserve_fixed_at', 'reserve_fixed_by'];
  check(patch && new URLSearchParams(patch.search).get('id') === 'eq.r2' && four.every((k) => k in patch.body && patch.body[k] === null) && Object.keys(patch.body).length === 4,
    `A4) « Rouvrir » : UNE écriture qui retire les 4 marques de levée, commentaires gardés : ${JSON.stringify(patch?.body)}`);
  check(!S.calls.some((c) => c.fn === 'set_reserve_resolution' && c.body.p_resolved === false), 'A4) pas de set_reserve_resolution(false) (laisserait la levée du salarié)');
  check(await tabN('rr-tab-open') === 2 && await tabN('rr-tab-done') === 2, 'A4) la réserve revient dans « À traiter » (2 / 2)');

  // A5 · Levée refusée : la photo déjà envoyée est retirée, la réserve reste à traiter.
  await p.locator('[data-testid=rr-tab-open]').click();
  await p.waitForTimeout(400);
  const card4 = p.locator('[data-testid=rr-open-card]', { hasText: 'Plinthe à recoller' });
  await card4.getByRole('button', { name: 'Lever la réserve' }).click();
  await card4.locator('[data-testid=reserve-lift-file]').setInputFiles({ name: 'plinthe.png', mimeType: 'image/png', buffer: S.png });
  S.failRpc = true; S.seq.length = 0;
  const docsBefore = S.documents.length;
  await card4.locator('[data-testid=reserve-lift-submit]').click();
  await p.waitForTimeout(1500);
  check(JSON.stringify(S.seq.filter((x) => x !== 'sign')) === JSON.stringify(['upload', 'doc', 'rpc:set_reserve_resolution', 'delete:documents', 'storage-delete']),
    `A5) levée refusée → document puis fichier retirés : ${S.seq.join(' → ')}`);
  check(S.documents.length === docsBefore, 'A5) aucune photo orpheline');
  check(await p.locator('[data-sonner-toast][data-type="error"]').count() > 0 && await card4.locator('[data-testid=reserve-lift-form]').count() === 1, 'A5) message d’erreur, le formulaire reste ouvert');
  S.failRpc = false;
  await card4.getByRole('button', { name: 'Annuler' }).click();

  // C · 1024 (tablette paysage).
  await p.setViewportSize({ width: 1024, height: 768 });
  await p.waitForTimeout(500);
  await p.locator('[data-testid=rr-tab-done]').click();
  await p.waitForTimeout(500);
  const h1024 = await noHScroll(p, '[data-testid=reserves-report]');
  check(h1024.ok, `C) 1024 : fenêtre « Réserves » sans défilement horizontal ${JSON.stringify(h1024)}`);
  await p.screenshot({ path: `${SH}/reserves-bureau-tablette-1024x768.png` });
  await p.keyboard.press('Escape');
  await ctx.close();

  // C · 390 (téléphone, menu ☰ → « Réserves »).
  const ctxM = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await mount(ctxM, S, ADMIN);
  const m = await ctxM.newPage();
  await m.goto(`${BASE}/admin`);
  await m.waitForSelector('button[aria-label="Menu"]', { timeout: 20000 }); await m.waitForTimeout(1200);
  await m.locator('button[aria-label="Menu"]:visible').first().click();
  await m.locator('.bt-mm-item', { hasText: 'Réserves' }).click();
  await m.waitForSelector('[data-testid=reserves-report] [data-testid=rr-tab-open]', { timeout: 8000 }); await m.waitForTimeout(700);
  await m.locator('[data-testid=rr-open-card]').first().getByRole('button', { name: 'Lever la réserve' }).click();
  await m.locator('[data-testid=reserve-lift-file]').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: S.png });
  await m.waitForTimeout(400);
  const h390 = await noHScroll(m, '[data-testid=reserves-report]');
  check(h390.ok, `C) 390 : formulaire ouvert, fenêtre sans défilement horizontal ${JSON.stringify(h390)}`);
  await m.screenshot({ path: `${SH}/reserves-bureau-mobile-390x844.png` });
  await m.locator('[data-testid=reserve-lift-form]').getByRole('button', { name: 'Annuler' }).click();
  await m.locator('[data-testid=rr-tab-done]').click(); await m.waitForTimeout(500);
  const h390b = await noHScroll(m, '[data-testid=reserves-report]');
  check(h390b.ok, `C) 390 : « Levées » (vignette, puce) sans défilement horizontal ${JSON.stringify(h390b)}`);
  await m.screenshot({ path: `${SH}/reserves-bureau-levees-mobile-390x844.png` });
  await ctxM.close();
}

// ════════════════════════════════════════════════════════════════════════════
// B · SALARIÉ
// ════════════════════════════════════════════════════════════════════════════
{
  const KARIM = u('u-karim', 'Karim', 'Benali');
  const S = {
    ...freshLog(),
    users: [KARIM],
    companies: [{ id: CO, name: 'Benali Rénovation', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
    worksites: [W1, W2, W3, AUTRE],
    time_entries: [
      tEntry('e-today', KARIM, today, W1, 'submitted', { observation: 'Fissure enduit au-dessus de la porte' }),
      tEntry('e-old', KARIM, day(-2), W2, 'validated', { observation: 'Joint de carrelage à refaire' }),
      tEntry('e-bureau', KARIM, today, W2, 'submitted', { start_time: '13:00:00', end_time: '16:00:00', total_minutes: 180, observation: null, reserve_resolved_at: ago(0.1), reserve_resolved_by: 'u-admin', reserve_resolution: 'OK' }),
    ],
    planning: [{ id: 'p-rdv', company_id: CO, user_id: 'u-karim', worksite_id: 'w3', work_date: today, absence_type: null, estimated_start: '16:30:00', estimated_end: null, notes: null, worksite: { ...W3 } }],
    active_sessions: [], month_closures: [], user_closures: [], leave_requests: [], documents: [], time_entry_corrections: [], time_entry_positions: [], push_subscriptions: [],
  };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  S.png = await makePng(ctx);
  await mount(ctx, S, KARIM);
  await ctx.clock.install({ time: new Date() });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('   [erreur page]', e.message));
  const open = async () => { await p.goto(`${BASE}/poseur`); await p.waitForSelector('.bt-total', { timeout: 15000 }); await p.waitForTimeout(1300); };
  const bodyText = () => p.locator('body').innerText();
  const banner = () => p.locator('[data-testid=reserves-banner]');
  // Les messages (10 s) recouvrent le haut de l'écran : on les laisse expirer.
  const clearToasts = async () => {
    await p.mouse.move(5, 830);
    for (let i = 0; i < 4 && await p.locator('[data-sonner-toast]').count(); i++) { await p.clock.fastForward(6_000); await p.waitForTimeout(700); }
  };
  await open();

  const cardToday = p.locator('[data-testid=card-entry]', { hasText: 'Fissure enduit' });
  check((await cardToday.innerText()).includes('⚠ Avec réserve') && await cardToday.locator('[data-testid=card-lift]').count() === 1, 'B1) carte : « ⚠ Avec réserve » + « Lever la réserve »');
  check((await p.locator('[data-testid=card-entry]', { hasText: '13:00' }).innerText()).includes('✓ Réserve levée par le bureau'), 'B1) levée par le bureau : « ✓ Réserve levée par le bureau »');
  check(!(await bodyText()).includes('corrigé sur place'), 'B1) plus de « J’ai corrigé sur place »');
  check((await banner().innerText().catch(() => '')).replace(/\s+/g, ' ').includes('2 réserves à lever'), `B1) bandeau « ⚠ 2 réserves à lever › » : ${(await banner().innerText().catch(() => '')).replace(/\s+/g, ' ')}`);
  // (textContent : la ligne est en capitales par la feuille de style.)
  check((await p.locator('[data-testid=card-planned] .bt-plan-k').textContent()).includes('Prévu · 16:30'), 'B1) heure de début seule : « Prévu · 16:30 »');
  await p.screenshot({ path: `${SH}/salarie-reserve-carte-390x844.png` });

  // B2 · Aucune mutation pendant les relectures (minute : bandeau + journée).
  await p.evaluate(() => {
    window.__muts = [];
    window.__mo = new MutationObserver((ms) => { for (const m of ms) window.__muts.push(m.type); });
    window.__mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await p.clock.fastForward(30_000); await p.waitForTimeout(400); await p.clock.fastForward(31_000); await p.waitForTimeout(1500);
  await p.evaluate(() => window.dispatchEvent(new Event('bemexo:reserves-changed'))); await p.waitForTimeout(1200);
  const muts = await p.evaluate(() => { window.__mo.disconnect(); return window.__muts.length; });
  check(muts === 0, `B2) relectures (minute, bandeau, journée) avec réserves à l’écran : ${muts} mutation(s)`);

  // B3 · Lever depuis la carte : commentaire + photo.
  await cardToday.locator('[data-testid=card-lift]').click();
  const form = cardToday.locator('[data-testid=reserve-lift-form]');
  check(await form.count() === 1 && await p.locator('.bt-ed').count() === 0, 'B3) formulaire sous la carte (la fiche d’heures ne s’ouvre pas)');
  const ftxt = await form.innerText();
  check(ftxt.includes('Commentaire (facultatif)') && ftxt.includes('📷 Photo (facultatif)'), 'B3) même formulaire que le bureau');
  await form.locator('textarea').fill('Enduit repris et poncé');
  await form.locator('[data-testid=reserve-lift-file]').setInputFiles({ name: 'enduit.png', mimeType: 'image/png', buffer: S.png });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${SH}/salarie-reserve-formulaire-390x844.png` });
  const hForm = await noHScroll(p, '.bt-day-scroll');
  check(hForm.ok, `C) 390 : carte + formulaire sans débordement ${JSON.stringify(hForm)}`);
  S.seq.length = 0;
  await form.locator('[data-testid=reserve-lift-submit]').click();
  await p.waitForTimeout(1600);
  const order = S.seq.filter((x) => ['upload', 'doc'].includes(x) || x.startsWith('rpc:'));
  check(JSON.stringify(order) === JSON.stringify(['upload', 'doc', 'rpc:mark_reserve_fixed:true']), `B3) ordre : photo → document → mark_reserve_fixed : ${order.join(' → ')}`);
  const call = S.calls.filter((c) => c.fn === 'mark_reserve_fixed').at(-1);
  check(call && call.body.p_entry_id === 'e-today' && call.body.p_fixed === true && call.body.p_note === 'Enduit repris et poncé', `B3) mark_reserve_fixed(e-today, true, commentaire) : ${JSON.stringify(call?.body)}`);
  const wdoc = S.documents.at(-1);
  check(wdoc && wdoc.time_entry_id === 'e-today' && wdoc.category === 'reserve' && wdoc.label === `Réserve levée — ${frDay}` && wdoc.uploaded_by === 'u-karim', `B3) photo rangée sur l’intervention : ${wdoc?.label}`);
  check((await cardToday.innerText()).includes(`✓ Réserve levée le ${dMMM(new Date())}`) && await cardToday.locator('[data-testid=card-lift]').count() === 0, `B3) carte : « ✓ Réserve levée le ${dMMM(new Date())} »`);
  check((await banner().innerText().catch(() => '')).replace(/\s+/g, ' ').includes('1 réserve à lever'), 'B3) bandeau : « 1 réserve à lever »');
  const toast = p.locator('[data-sonner-toast]', { hasText: 'Réserve levée' });
  check(await toast.count() === 1 && await toast.getByRole('button', { name: 'Annuler' }).count() === 1, 'B3) message « Réserve levée » avec « Annuler »');
  await p.screenshot({ path: `${SH}/salarie-reserve-levee-390x844.png` });

  // B4 · « Annuler » (dans les 10 s) : remise à lever, photo retirée.
  S.seq.length = 0;
  await toast.getByRole('button', { name: 'Annuler' }).click();
  await p.waitForTimeout(1500);
  check(S.seq.includes('rpc:mark_reserve_fixed:false') && S.seq.includes('delete:documents') && S.seq.includes('storage-delete'), `B4) « Annuler » : mark_reserve_fixed(false) + photo retirée : ${S.seq.join(' → ')}`);
  check(await cardToday.locator('[data-testid=card-lift]').count() === 1 && (await banner().innerText()).replace(/\s+/g, ' ').includes('2 réserves à lever'), 'B4) carte et bandeau reviennent (« Lever la réserve », 2 à lever)');

  // B5 · Sans photo, puis le bureau lève entre-temps → « Annuler » refusé, dit clairement.
  await cardToday.locator('[data-testid=card-lift]').click();
  await cardToday.locator('[data-testid=reserve-lift-form] textarea').fill('Repris');
  S.seq.length = 0;
  await cardToday.locator('[data-testid=reserve-lift-submit]').click();
  await p.waitForTimeout(1300);
  check(!S.seq.includes('upload') && S.seq.includes('rpc:mark_reserve_fixed:true'), `B5) sans photo : aucun envoi de fichier, levée directe (${S.seq.join(' → ')})`);
  Object.assign(S.time_entries.find((x) => x.id === 'e-today'), { reserve_resolved_at: new Date().toISOString(), reserve_resolved_by: 'u-admin' });
  await p.locator('[data-sonner-toast]', { hasText: 'Réserve levée' }).last().getByRole('button', { name: 'Annuler' }).click();
  await p.waitForTimeout(1300);
  check(await p.locator('[data-sonner-toast][data-type="error"]', { hasText: 'déjà été levée par le bureau' }).count() === 1, 'B5) bureau passé entre-temps : « Cette réserve a déjà été levée par le bureau »');
  check((await cardToday.innerText()).includes('✓ Réserve levée par le bureau'), 'B5) la carte dit la vérité : « levée par le bureau »');
  // remise en état pour la suite
  Object.assign(S.time_entries.find((x) => x.id === 'e-today'), RES0);
  await p.evaluate(() => window.dispatchEvent(new Event('bemexo:reserves-changed'))); await p.waitForTimeout(1200);

  // B6 · Le bandeau → la liste → même formulaire.
  await clearToasts();
  await banner().click();
  await p.waitForSelector('[data-testid=reserves-dialog]', { timeout: 5000 }); await p.waitForTimeout(500);
  const items = p.locator('[data-testid=wr-item]');
  const it0 = await items.nth(0).innerText();
  check(await items.count() === 2 && it0.includes('Villa Dupont') && it0.includes('Fissure enduit') && (await items.nth(1).innerText()).includes('Maison Garnier'),
    `B6) liste : date · chantier · détail, la plus récente d'abord (${(await items.count())} réserves)`);
  const hDlg = await noHScroll(p, '[data-testid=reserves-dialog]');
  check(hDlg.ok, `C) 390 : liste des réserves sans défilement horizontal ${JSON.stringify(hDlg)}`);
  await items.nth(1).locator('[data-testid=wr-lift]').click();
  await items.nth(1).locator('textarea').fill('Joints refaits');
  await items.nth(1).locator('[data-testid=reserve-lift-file]').setInputFiles({ name: 'joint.png', mimeType: 'image/png', buffer: S.png });
  await p.waitForTimeout(300);
  const hDlg2 = await noHScroll(p, '[data-testid=reserves-dialog]');
  check(hDlg2.ok, `C) 390 : formulaire dans la liste sans défilement horizontal ${JSON.stringify(hDlg2)}`);
  await p.screenshot({ path: `${SH}/salarie-reserves-liste-390x844.png` });
  S.seq.length = 0;
  await items.nth(1).locator('[data-testid=reserve-lift-submit]').click();
  await p.waitForTimeout(1600);
  const c6 = S.calls.filter((c) => c.fn === 'mark_reserve_fixed').at(-1);
  check(JSON.stringify(S.seq.filter((x) => ['upload', 'doc'].includes(x) || x.startsWith('rpc:'))) === JSON.stringify(['upload', 'doc', 'rpc:mark_reserve_fixed:true']) && c6.body.p_entry_id === 'e-old' && c6.body.p_note === 'Joints refaits',
    `B6) depuis la liste : photo → document → mark_reserve_fixed(e-old, note) (${JSON.stringify(c6?.body)})`);
  // Une fenêtre ouverte rend inerte tout ce qui est derrière, message compris :
  // la liste se referme après chaque levée pour que « Annuler » reste touchable.
  check(await p.locator('[data-testid=reserves-dialog]').count() === 0 && (await banner().innerText()).replace(/\s+/g, ' ').includes('1 réserve à lever'),
    'B6) après la levée, la liste se referme (message « Annuler » touchable), bandeau « 1 réserve à lever »');

  // B6b · « Annuler » après une levée depuis la liste (il restait une autre réserve).
  S.seq.length = 0;
  const toast6 = p.locator('[data-sonner-toast]', { hasText: 'Réserve levée' }).last();
  const undoClicked = await toast6.getByRole('button', { name: 'Annuler' }).click({ timeout: 3000 }).then(() => true, () => false);
  await p.waitForTimeout(1500);
  const c6u = S.calls.filter((c) => c.fn === 'mark_reserve_fixed').at(-1);
  check(undoClicked && S.seq.includes('rpc:mark_reserve_fixed:false') && c6u?.body.p_entry_id === 'e-old' && S.seq.includes('delete:documents') && S.seq.includes('storage-delete'),
    `B6b) « Annuler » depuis la liste : mark_reserve_fixed(e-old, false) + photo retirée (clic ${undoClicked ? 'ok' : 'IMPOSSIBLE'} ; ${S.seq.join(' → ')})`);
  check((await banner().innerText()).replace(/\s+/g, ' ').includes('2 réserves à lever'), 'B6b) bandeau revenu à « 2 réserves à lever »');

  // Relever : commentaire seul (sans photo), puis la dernière sans rien du tout.
  await clearToasts();
  await banner().click();
  await p.waitForSelector('[data-testid=reserves-dialog]', { timeout: 5000 }); await p.waitForTimeout(500);
  check(await items.count() === 2, 'B6b) la réserve remise à lever est de nouveau dans la liste');
  await items.nth(1).locator('[data-testid=wr-lift]').click();
  await items.nth(1).locator('textarea').fill('Joints refaits');
  S.seq.length = 0;
  await items.nth(1).locator('[data-testid=reserve-lift-submit]').click();
  await p.waitForTimeout(1600);
  const c6b = S.calls.filter((c) => c.fn === 'mark_reserve_fixed').at(-1);
  check(!S.seq.includes('upload') && c6b.body.p_entry_id === 'e-old' && c6b.body.p_fixed === true && c6b.body.p_note === 'Joints refaits', `B6) commentaire seul : mark_reserve_fixed(e-old, note), sans photo (${JSON.stringify(c6b?.body)})`);
  check(await p.locator('[data-testid=reserves-dialog]').count() === 0 && (await banner().innerText()).replace(/\s+/g, ' ').includes('1 réserve à lever'), 'B6) la réserve quitte la liste, bandeau « 1 réserve à lever »');
  await clearToasts();
  await banner().click();
  await p.waitForSelector('[data-testid=reserves-dialog]', { timeout: 5000 }); await p.waitForTimeout(500);
  check(await items.count() === 1, 'B6) la liste rouverte ne montre plus que la dernière réserve');
  await items.nth(0).locator('[data-testid=wr-lift]').click();
  await items.nth(0).locator('[data-testid=reserve-lift-submit]').click();
  await p.waitForTimeout(1600);
  const c7 = S.calls.filter((c) => c.fn === 'mark_reserve_fixed').at(-1);
  check(c7.body.p_entry_id === 'e-today' && c7.body.p_note === null, 'B6) tout facultatif : « Lever la réserve » seul suffit (note vide → null)');
  check(await p.locator('[data-testid=reserves-dialog]').count() === 0 && await banner().count() === 0, 'B6) dernière réserve levée : la liste se ferme, le bandeau disparaît');
  check((await cardToday.innerText()).includes('✓ Réserve levée le'), 'B6) la carte du jour suit (levée depuis la liste)');

  // B7 · Tablette 1024 : la liste ne déborde pas.
  Object.assign(S.time_entries.find((x) => x.id === 'e-old'), RES0);
  await p.setViewportSize({ width: 1024, height: 768 });
  await p.evaluate(() => window.dispatchEvent(new Event('bemexo:reserves-changed'))); await p.waitForTimeout(1200);
  await clearToasts();
  await banner().click(); await p.waitForSelector('[data-testid=reserves-dialog]'); await p.waitForTimeout(400);
  await p.locator('[data-testid=wr-lift]').first().click(); await p.waitForTimeout(300);
  const hTab = await noHScroll(p, '[data-testid=reserves-dialog]');
  check(hTab.ok, `C) 1024 : liste + formulaire sans défilement horizontal ${JSON.stringify(hTab)}`);
  await p.screenshot({ path: `${SH}/salarie-reserves-tablette-1024x768.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.setViewportSize({ width: 1280, height: 800 }); await p.waitForTimeout(300);
  await banner().click(); await p.waitForSelector('[data-testid=reserves-dialog]'); await p.waitForTimeout(300);
  const hDesk = await noHScroll(p, '[data-testid=reserves-dialog]');
  check(hDesk.ok, `C) 1280 : liste des réserves sans défilement horizontal ${JSON.stringify(hDesk)}`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.setViewportSize({ width: 390, height: 844 });

  // B8 · « Ma semaine » : « Prévu · 16:30 ».
  await p.getByRole('button', { name: 'Mon compte et menu' }).click();
  await p.getByRole('menuitem', { name: 'Ma semaine' }).click();
  await p.waitForTimeout(1500);
  check((await bodyText()).includes('Prévu · 16:30'), 'B8) « Ma semaine » : « Prévu · 16:30 » (heure de début seule)');
  await ctx.close();

  // B9 · Clôture de CE salarié jusqu'à aujourd'hui : « Heures clôturées », lever reste possible.
  const S2 = { ...S, ...freshLog(), time_entries: [tEntry('e-c', KARIM, today, W1, 'submitted', { observation: 'Silicone' })], user_closures: [{ user_id: 'u-karim', company_id: CO, closed_until: today, reopened_at: null }], planning: [] };
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await mount(ctx2, S2, KARIM);
  const q = await ctx2.newPage();
  await q.goto(`${BASE}/poseur`); await q.waitForSelector('.bt-total', { timeout: 15000 }); await q.waitForTimeout(1300);
  const d = new Date(`${today}T12:00:00`); const label = `${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
  check((await q.locator('body').innerText()).includes(`Heures clôturées jusqu'au ${label}`), `B9) note : « Heures clôturées jusqu'au ${label} — vois avec la secrétaire »`);
  await q.locator('[data-testid=card-entry] .bt-iv-name').first().click();
  await q.waitForTimeout(500);
  const dlg = await q.locator('[role=dialog]').innerText().catch(() => '');
  check(dlg.includes('Heures clôturées') && dlg.includes(`jusqu'au ${label}`) && !dlg.includes('Mois clôturé'), `B9) toucher la carte : « Heures clôturées » (pas « Mois clôturé ») : ${dlg.replace(/\s+/g, ' ').slice(0, 120)}`);
  await q.screenshot({ path: `${SH}/salarie-cloture-390x844.png` });
  await q.keyboard.press('Escape'); await q.waitForTimeout(300);
  check(await q.locator('[data-testid=card-lift]').count() === 1, 'B9) jour clôturé : « Lever la réserve » reste possible (ce ne sont pas des heures)');
  await ctx2.close();

  // B10 · Le bureau clôture PENDANT que l'écran est ouvert : le refus du serveur
  // (« … jusqu'au AAAA-MM-JJ ») est dit en clair, sans fermer tout le mois.
  const S3 = { ...S, ...freshLog(), user_closures: [], planning: [],
    time_entries: [tEntry('g1', KARIM, today, W1, 'draft', { reception: null }), tEntry('g2', KARIM, today, W2, 'draft', { reception: null, start_time: '13:00:00', end_time: '16:00:00', total_minutes: 180 })],
    patchError: `time_entries: heures clôturées par le bureau jusqu'au ${today}` };
  const ctx3 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await mount(ctx3, S3, KARIM);
  const g = await ctx3.newPage();
  await g.goto(`${BASE}/poseur`); await g.waitForSelector('.bt-total', { timeout: 15000 }); await g.waitForTimeout(1300);
  await g.getByRole('button', { name: 'Route' }).first().click();
  await g.waitForTimeout(900);
  const err = await g.locator('[data-sonner-toast][data-type="error"]').innerText().catch(() => '');
  check(err.includes(`Le bureau a clôturé tes heures jusqu'au ${label}`) && !err.includes('ce mois'), `B10) refus « jusqu'au » : « ${err.replace(/\s+/g, ' ')} »`);
  await g.locator('[data-testid=card-entry] .bt-iv-name').first().click(); await g.waitForTimeout(500);
  const dlg3 = await g.locator('[role=dialog]').innerText().catch(() => '');
  check(dlg3.includes('Heures clôturées') && !dlg3.includes('Mois clôturé'), 'B10) ensuite, l’écran est fermé jusqu’à cette date (« Heures clôturées »), pas tout le mois');
  await ctx3.close();
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
