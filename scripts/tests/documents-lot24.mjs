// Lot 24 — Documents : changer la catégorie après coup, factures cachées aux salariés
// (base Supabase SIMULÉE, vraie page de l'export statique, aucun accès réseau réel).
//
// Lancer : npm run build, puis
//   node scripts/tests/documents-lot24.mjs out docs/captures-documents-categories [port]
//
//  1) BUREAU (/admin, 390 px) : fiche chantier → Documents : un bouton de catégorie par ligne
//     (≥ 44 px), « Sans catégorie ▾ » compris.
//  2) Choix : 9 options (≥ 48 px) ; Facture → avertissement ; Enregistrer → UNE seule clé dans
//     l'écriture ; message « Annuler » (8 s) → seconde écriture qui remet l'ancienne catégorie.
//  3) Avertissements réserve → autre, facture → autre.
//  4) Erreurs : 0 ligne, refus avec message, catégorie inconnue, coupure réseau puis « Réessayer ».
//  5) SALARIÉ (/poseur) : la liste (RLS simulée) n'a pas de facture ; bouton sur SES documents
//     légers seulement ; 6 options ; le message « Envoyer au client » ne cite aucune facture.
//  6) Migration absente (fonction 404, ou réseau en panne) : rien de nouveau à l'écran, aucun message.
//  7) Aucun défilement horizontal (390 et 1024), clavier : Tab, Entrée, Échap, retour du focus.
//  8) Contrôle statique : aucun appel de suppression (navigateur) ni mot de suppression SQL ajouté hors commentaires.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-documents-categories', PORT = '0'] = process.argv;
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

// ─── Données (FICTIVES) ────────────────────────────────────────────────────────
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const CO = 'c0000000-0000-0000-0000-000000000001';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true, client_email: 'dupont@exemple.fr' };
const u = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@x.fr`, is_active: true, created_at: '2026-01-01' });
const ADMIN = u('u-admin', 'Paul', 'Martin', 'admin');
const SAM = u('u-sam', 'Sam', 'Girard');
const ALEX = u('u-alex', 'Alex', 'Roux');
const who = (x) => ({ first_name: x.first_name, last_name: x.last_name });
const LONG_NAME = 'Devis-definitif-renovation-complete-appartement-T4-copropriete-jardins-suspendus-batiment-C-version-12-signe-par-le-client.pdf';
const doc = (id, label, mime, category, by, extra = {}) => ({
  id, company_id: CO, worksite_id: 'w1', label, file_name: label, file_path: `${CO}/w1/${id}.${mime === 'image/png' ? 'png' : 'pdf'}`, mime_type: mime, size_bytes: 12000,
  created_at: new Date(Date.now() - 3600e3).toISOString(), uploaded_by: by.id, uploader: who(by), work_date: today, time_entry_id: null, category, ...extra,
});
// Six documents côté bureau ; quatre côté salarié (RLS simulée : ni facture ni facture payée).
const docsBase = () => [
  doc('d-devis', LONG_NAME, 'application/pdf', 'devis', ALEX),
  doc('d-fact', 'Facture-0412-plomberie.pdf', 'application/pdf', 'facture', ADMIN),
  doc('d-fpay', 'Facture-0388-carrelage-payee.pdf', 'application/pdf', 'facture_payee', ADMIN),
  doc('d-photo', 'Photo 1 — ' + today, 'image/png', null, SAM),
  doc('d-res', 'Réserve levée — joint', 'image/png', 'reserve', SAM),
  doc('d-null', 'Bon-de-livraison.pdf', 'application/pdf', null, SAM),
];
// Une vraie image 1×1 : les vignettes se chargent.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k) || k === 'or' || k === 'and') continue;
    const dot = v.indexOf('.'); const op = v.slice(0, dot); const val = v.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k];
      if (op === 'eq') return String(cur) === val;
      if (op === 'neq') return String(cur) !== val;
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      if (op === 'is') return val === 'null' ? cur == null : String(cur) === val;
      return true;
    });
  }
  return rows;
};

/** Monte la base simulée. `S` : l'état (tables, mode de la fonction « prête ? », réponses d'écriture, journal). */
async function mount(ctx, S, me) {
  const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: me.id, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
  const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: me.id, email: me.email, aud: 'authenticated', role: 'authenticated' } };
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* */ } }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const url = new URL(req.url()); const method = req.method(); const P = url.pathname;
    let body = null; try { body = req.postDataJSON(); } catch { body = null; }
    if (P.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (P.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (P.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    // ── Stockage ──
    if (P.startsWith('/storage/v1/object/sign/chantier-docs/')) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (P === '/storage/v1/object/sign/chantier-docs' && method === 'POST') {
      S.signed.push(body?.paths || []);
      return r.fulfill({ json: (body?.paths || []).map((p) => ({ path: p, signedURL: `/object/sign/chantier-docs/${p}?token=t`, error: null })) });
    }
    if (P.startsWith('/storage/v1/')) return r.fulfill({ json: {} });
    // ── Fonctions serveur ──
    if (P.startsWith('/rest/v1/rpc/')) {
      const fn = P.replace('/rest/v1/rpc/', '');
      S.rpc.push(fn);
      if (fn === 'document_category_ready') {
        if (S.ready === 'network') return r.abort('failed');
        if (S.ready === 'missing') return r.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function public.document_category_ready without parameters in the schema cache', details: null, hint: null } });
        return r.fulfill({ json: true });
      }
      return r.fulfill({ json: [] });
    }
    // ── Tables ──
    const t = P.replace('/rest/v1/', '');
    let rows = filterRows(S[t] || [], url.searchParams);
    // RLS simulée : un salarié ne lit jamais une facture (migration du lot 24).
    if (t === 'documents' && me.role !== 'admin') rows = rows.filter((x) => x.category !== 'facture' && x.category !== 'facture_payee');
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    if (method === 'GET' || method === 'HEAD') {
      if (single) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
      const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
      const page = rows.slice(off, lim ? off + Number(lim) : undefined);
      return r.fulfill({ json: page, headers: { 'content-range': `${off}-${Math.max(off, off + page.length - 1)}/${rows.length}` } });
    }
    if (t === 'documents' && method === 'PATCH') {
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
      S.patches.push({ id, body });
      if (S.offline) return r.abort('failed');
      if (S.patchError) return r.fulfill({ status: 403, json: { ...S.patchError, details: null, hint: null } });
      if (S.patchRows === 'none') return r.fulfill({ json: [] });
      for (const x of rows) Object.assign(x, body);
      return r.fulfill({ json: rows.map((x) => ({ id: x.id, category: x.category })) });
    }
    return r.fulfill({ status: 201, json: single ? { id: 'new-1' } : [{ id: 'new-1' }] });
  });
}
const freshState = (extra = {}) => ({
  ready: 'ok', offline: false, patchError: null, patchRows: 'apply', patches: [], rpc: [], signed: [],
  users: [ADMIN, SAM, ALEX],
  companies: [{ id: CO, name: 'Dupont Rénovation', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
  worksites: [W1], planning: [], time_entries: [], active_sessions: [], month_closures: [], leave_requests: [], invitations: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [],
  documents: docsBase(), ...extra,
});

const clickFirst = async (p, cands, timeout = 4000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const [sel, text] of cands) {
      const loc = p.locator(sel, text ? { hasText: text } : undefined).filter({ visible: true }).first();
      if (await loc.count().catch(() => 0)) {
        await loc.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
        try { await loc.click({ timeout: 2500 }); return true; } catch { /* recouvert, on réessaie */ }
      }
    }
    await p.waitForTimeout(150);
  }
  return false;
};
const step = async (p, ...cands) => { const okk = await clickFirst(p, cands); if (okk) await p.waitForTimeout(450); return okk; };

/** Aucun défilement horizontal : page et fenêtre. */
const noHScroll = (p, sel = '[role=dialog]') => p.evaluate((sel) => {
  const ds = [...document.querySelectorAll(sel)].filter((d) => d.getBoundingClientRect().width > 0);
  const pageOk = document.documentElement.scrollWidth <= window.innerWidth + 1;
  const bad = [];
  for (const d of ds) {
    const r = d.getBoundingClientRect();
    if (d.scrollWidth > d.clientWidth + 1 || r.right > window.innerWidth + 1 || r.left < -1) bad.push(`${d.getAttribute('data-testid') || d.className.slice(0, 30)} ${d.scrollWidth}>${d.clientWidth}`);
    for (const e of d.querySelectorAll('*')) {
      const x = e.getBoundingClientRect();
      if (x.width > 0 && x.height > 0 && x.right > r.right + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('[data-sonner-toaster]')) { bad.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} dépasse`); break; }
    }
  }
  return { ok: pageOk && !bad.length && ds.length > 0, pageOk, n: ds.length, bad };
}, sel);

const newPage = async (S, me, vp) => {
  const ctx = await b.newContext({ viewport: vp, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(vp.width < 700 ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await mount(ctx, S, me);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  return { ctx, p, errs };
};

// ─── Ouvertures ────────────────────────────────────────────────────────────────
const openAdminDocs = async (p) => {
  await p.goto(`${BASE}/admin`);
  await p.locator('.bt-pl-acct, .bt-pl-m-ibtn[aria-label="Menu"]').filter({ visible: true }).first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(900);
  const mob = await p.locator('.bt-pl-m-ibtn[aria-label="Menu"]').filter({ visible: true }).count();
  const nav = mob ? (await step(p, ['.bt-pl-m-ibtn[aria-label="Menu"]'])) && step(p, ['.bt-mm-item', 'Chantiers']) : step(p, ['.bt-pl-segbtn', 'Clients']);
  if (!nav) return false;
  if (!(await step(p, ['.bt-pl-clientrow:has-text("Villa Dupont") .bt-pl-clientedit'], ['[role=dialog] [title="Modifier la fiche"]'], ['[role=dialog] button', 'Villa Dupont']))) return false;
  if (!(await step(p, ['[role=dialog] button', 'Documents'], ['[role=dialog] button', 'Pièces']))) return false;
  await p.waitForSelector('.bt-doc-row', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(500);
  return true;
};
const openWorkerDocs = async (p) => {
  await p.goto(`${BASE}/poseur`);
  await p.waitForSelector('.bt-total', { timeout: 20000 });
  await p.waitForTimeout(900);
  if (!(await step(p, ['[data-testid=card-entry]']))) return false;
  if (!(await step(p, ['.bt-ed-doc']))) return false;
  await p.waitForSelector('.bt-doc-row', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(500);
  return true;
};
const workerEntry = () => ({ id: 'we1', company_id: CO, user_id: 'u-sam', worksite_id: 'w1', planning_id: null, work_date: today, start_time: '08:00:00', end_time: '12:00:00',
  break_minutes: 0, total_minutes: 240, meal_allowance: false, status: 'draft', locked: false, exported_at: null, observation: null, reception: null, gap_before: null, worksite: W1 });

const tabFiles = (p) => p.locator('.bt-doc-tab', { hasText: 'Fichiers' }).click().then(() => p.waitForTimeout(250));
const tabPhotos = (p) => p.locator('.bt-doc-tab', { hasText: 'Photos' }).click().then(() => p.waitForTimeout(250));
const row = (p, name) => p.locator('.bt-doc-row', { hasText: name }).first();
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const sheet = (p) => p.locator('[data-testid=doc-cat-sheet]');
const pick = (p, cat) => sheet(p).locator(`[data-testid=doc-cat-opt][data-cat="${cat}"]`).click();
const done = (p) => p.locator('[data-testid=doc-cat-done]');

// ════════════════════════════════════════════════════════════════════════════
// A · BUREAU, 390 px
// ════════════════════════════════════════════════════════════════════════════
const S = freshState();
{
  const { ctx, p, errs } = await newPage(S, ADMIN, { width: 390, height: 844 });
  check(await openAdminDocs(p), 'A0) bureau : fiche chantier → Documents ouvert');
  const btn = p.locator('[data-testid=doc-cat-btn]');

  // A1 · un bouton par ligne, ≥ 44 px (les deux onglets).
  const sizes = [];
  const readSizes = async () => { for (const h of await btn.elementHandles()) { const bx = await h.boundingBox(); if (bx) sizes.push({ w: bx.width, h: bx.height, t: norm(await h.innerText()) }); } };
  await tabPhotos(p); const nPhotos = await btn.count(); await readSizes();
  await tabFiles(p); const nFiles = await btn.count(); await readSizes();
  check(nPhotos === 2 && nFiles === 4, `A1) un bouton de catégorie par ligne : ${nPhotos} photos + ${nFiles} fichiers = 6 sur 6 documents`);
  check(sizes.length === 6 && sizes.every((s) => s.h >= 44 && s.w >= 44), `A1) boutons ≥ 44 px : ${sizes.filter((s) => s.h >= 44 && s.w >= 44).length}/${sizes.length} (min ${Math.min(...sizes.map((s) => s.h))} × ${Math.min(...sizes.map((s) => s.w))})`);
  const texts = sizes.map((s) => s.t);
  check(texts.some((t) => t === 'Facture ▾') && texts.some((t) => t === 'Facture payée ▾') && texts.some((t) => t === 'Devis ▾') && texts.some((t) => t === 'Sans catégorie ▾') && texts.some((t) => t === 'Photo ▾' || t === 'Réserve ▾'), `A1) textes : ${texts.join(' | ')}`);
  const labels = await btn.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check(labels.some((l) => l === `Changer la catégorie de « ${LONG_NAME} » (actuellement : Devis)`), 'A1) aria-label complet : « Changer la catégorie de « … » (actuellement : Devis) »');
  await p.mouse.move(1, 1);
  await p.screenshot({ path: `${SH}/01-liste-bureau.png` });

  // A2 · le choix sur le devis.
  S.patches.length = 0;
  await row(p, LONG_NAME).locator('[data-testid=doc-cat-btn]').click();
  await sheet(p).waitFor({ timeout: 4000 });
  await p.waitForTimeout(400);
  check(norm(await sheet(p).locator('h2').innerText()) === 'Catégorie du document', 'A2) titre « Catégorie du document »');
  check((await sheet(p).innerText()).includes('Choisissez où ranger ce document.') && (await sheet(p).locator('[data-testid=doc-cat-name]').innerText()).includes('Devis-definitif'), 'A2) consigne et nom du document');
  const opts = sheet(p).locator('[data-testid=doc-cat-opt]');
  const oh = [];
  for (const h of await opts.elementHandles()) oh.push((await h.boundingBox()).height);
  check(oh.length === 9 && oh.every((x) => x >= 48), `A2) 9 options, chacune ≥ 48 px : ${oh.filter((x) => x >= 48).length}/${oh.length} (min ${Math.min(...oh)})`);
  const cats = await opts.evaluateAll((els) => els.map((e) => e.getAttribute('data-cat')));
  check(cats.includes('facture') && cats.includes('facture_payee') && cats.includes('none') && cats.includes('reserve'), `A2) bureau : factures, réserve et « sans catégorie » proposées (${cats.join(',')})`);
  check(await sheet(p).locator('[role=radiogroup]').getAttribute('aria-label') === 'Catégorie', 'A2) radiogroup « Catégorie »');
  check(await sheet(p).locator('[data-cat=devis]').getAttribute('aria-checked') === 'true' && (await sheet(p).locator('[data-cat=devis]').getAttribute('aria-label')).includes('(actuelle)'), 'A2) « Devis » coché et lu « (actuelle) »');
  check(await sheet(p).locator('[data-testid=doc-cat-save]').isDisabled(), 'A2) « Enregistrer » désactivé tant que le choix = l’actuelle');
  await pick(p, 'facture');
  const notice = sheet(p).locator('[data-testid=doc-cat-notice]');
  check(norm(await notice.innerText()) === 'Les salariés ne verront plus ce document.' && await notice.getAttribute('role') === 'status', 'A2) Facture → « Les salariés ne verront plus ce document. »');
  check(S.patches.length === 0, 'A2) aucune écriture avant « Enregistrer »');
  await p.screenshot({ path: `${SH}/02-choix-bureau.png` });
  const hs2 = await noHScroll(p);
  check(hs2.ok, `A2) fenêtre de choix sans défilement horizontal (390) ${JSON.stringify(hs2)}`);
  await sheet(p).locator('[data-testid=doc-cat-save]').click();
  await p.waitForTimeout(900);
  check(S.patches.length === 1 && S.patches[0].id === 'd-devis' && JSON.stringify(S.patches[0].body) === '{"category":"facture"}', `A2) UNE écriture, UNE seule clé : ${JSON.stringify(S.patches)}`);
  check(await sheet(p).count() === 0, 'A2) la fenêtre se ferme');
  check(norm(await row(p, LONG_NAME).locator('[data-testid=doc-cat-btn]').innerText()) === 'Facture ▾', 'A2) la ligne affiche « Facture ▾ » (sans rechargement)');
  const t1 = done(p);
  check(norm(await t1.innerText()) === 'Catégorie changée : Facture. Annuler' && await t1.getAttribute('role') === 'status', `A2) bandeau « Catégorie changée : Facture. » avec « Annuler » : ${norm(await t1.innerText())}`);
  const ub = await t1.locator('[data-testid=doc-cat-undo]').boundingBox();
  const tb = await t1.boundingBox();
  check(ub.height >= 44 && ub.width >= 44 && tb.y + tb.height <= 844 && tb.y >= 0, `A2) « Annuler » ≥ 44 px (${Math.round(ub.width)}×${Math.round(ub.height)}), bandeau dans l’écran (bas à ${Math.round(tb.y + tb.height)} px sur 844)`);
  await p.screenshot({ path: `${SH}/04-bandeau-annuler.png` });
  await t1.locator('[data-testid=doc-cat-undo]').click();
  await p.waitForTimeout(900);
  check(S.patches.length === 2 && S.patches[1].id === 'd-devis' && JSON.stringify(S.patches[1].body) === '{"category":"devis"}', `A2) « Annuler » : seconde écriture qui remet « devis » : ${JSON.stringify(S.patches[1])}`);
  check(norm(await row(p, LONG_NAME).locator('[data-testid=doc-cat-btn]').innerText()) === 'Devis ▾', 'A2) la ligne est revenue à « Devis ▾ »');
  check(norm(await done(p).innerText()) === 'Catégorie remise : Devis.', 'A2) bandeau « Catégorie remise : Devis. »');
  await p.waitForTimeout(500);

  // A3 · avertissements.
  await tabPhotos(p);
  await row(p, 'Réserve levée').locator('[data-testid=doc-cat-btn]').click();
  await sheet(p).waitFor();
  await pick(p, 'autre');
  check(norm(await sheet(p).locator('[data-testid=doc-cat-notice]').innerText()) === 'Ce document ne sera plus classé dans les réserves.', 'A3) réserve → autre : « Ce document ne sera plus classé dans les réserves. »');
  await sheet(p).locator('[data-testid=doc-cat-cancel]').click();
  await p.waitForTimeout(400);
  check(await sheet(p).count() === 0 && S.patches.length === 2, 'A3) « Annuler » ferme sans rien écrire');
  await tabFiles(p);
  await row(p, 'Facture-0412').locator('[data-testid=doc-cat-btn]').click();
  await sheet(p).waitFor();
  await pick(p, 'autre');
  check(norm(await sheet(p).locator('[data-testid=doc-cat-notice]').innerText()) === 'Les salariés pourront voir ce document.', 'A3) facture → autre : « Les salariés pourront voir ce document. »');
  await pick(p, 'facture_payee');
  check(await sheet(p).locator('[data-testid=doc-cat-notice]').count() === 0, 'A3) facture → facture payée : pas d’avertissement');

  // A4 · erreurs. (la fenêtre « facture » est ouverte)
  await pick(p, 'plan');
  S.patchRows = 'none';
  await sheet(p).locator('[data-testid=doc-cat-save]').click();
  await p.waitForTimeout(700);
  let err = sheet(p).locator('[role=alert]');
  check(await sheet(p).count() === 1 && norm(await err.innerText()) === 'Changement refusé : vous ne pouvez pas modifier ce document.', 'A4) 0 ligne : « Changement refusé : vous ne pouvez pas modifier ce document. » dans la fenêtre, restée ouverte');
  check(norm(await row(p, 'Facture-0412').locator('[data-testid=doc-cat-btn]').innerText()) === 'Facture ▾', 'A4) la ligne est restée « Facture ▾ »');
  check(norm(await sheet(p).locator('[data-testid=doc-cat-save]').innerText()) === 'Réessayer' && !(await sheet(p).locator('[data-testid=doc-cat-save]').isDisabled()), 'A4) bouton « Réessayer » actif');
  await p.screenshot({ path: `${SH}/03-erreur-refus.png` });
  S.patchRows = 'apply'; S.patchError = { code: '42501', message: 'Cette catégorie est réservée au bureau.' };
  await sheet(p).locator('[data-testid=doc-cat-save]').click(); await p.waitForTimeout(600);
  check(norm(await err.innerText()) === 'Cette catégorie est réservée au bureau.', 'A4) 42501 : le message de la base, tel quel');
  S.patchError = { code: '23514', message: 'new row violates check constraint "documents_category_check"' };
  await sheet(p).locator('[data-testid=doc-cat-save]').click(); await p.waitForTimeout(600);
  check(norm(await err.innerText()) === 'Catégorie inconnue : rien n’a été changé.', 'A4) 23514 : « Catégorie inconnue : rien n’a été changé. »');
  S.patchError = null; S.offline = true;
  await sheet(p).locator('[data-testid=doc-cat-save]').click(); await p.waitForTimeout(700);
  check(norm(await err.innerText()) === 'Pas de connexion : rien n’a été changé. Réessayez.', 'A4) réseau coupé en route : « Pas de connexion : rien n’a été changé. Réessayez. »');
  S.offline = false;
  // Playwright laisse passer les réponses simulées même « hors ligne » : on coupe donc les deux (l'état du navigateur ET la route).
  S.offline = true; await ctx.setOffline(true); await p.waitForTimeout(400);
  check(norm(await sheet(p).locator('[role=status]', { hasText: 'Pas de connexion' }).first().innerText()) === 'Pas de connexion : le changement ne pourra pas être enregistré.', 'A4) hors ligne : bandeau « Pas de connexion : le changement ne pourra pas être enregistré. »');
  await sheet(p).locator('[data-testid=doc-cat-save]').click(); await p.waitForTimeout(700);
  check(norm(await err.innerText()) === 'Pas de connexion : rien n’a été changé. Réessayez.', 'A4) hors ligne : même message au clic');
  S.offline = false; await ctx.setOffline(false); await p.waitForTimeout(300);
  await sheet(p).locator('[data-testid=doc-cat-save]').click(); await p.waitForTimeout(900);
  check(await sheet(p).count() === 0 && norm(await row(p, 'Facture-0412').locator('[data-testid=doc-cat-btn]').innerText()) === 'Plan ▾', 'A4) connexion rétablie : « Réessayer » réussit, la ligne passe à « Plan ▾ »');
  check(S.documents.find((x) => x.id === 'd-fact').category === 'plan', 'A4) la base simulée a bien reçu « plan »');
  const allKeys = S.patches.map((x) => Object.keys(x.body).length);
  check(allKeys.every((n) => n === 1) && S.patches.every((x) => Object.keys(x.body)[0] === 'category'), `A4) ${S.patches.length} écritures envoyées, toutes avec la seule clé « category » (${allKeys.filter((n) => n === 1).length}/${allKeys.length})`);

  // A5 · 1024 px : toujours sans défilement horizontal.
  await p.waitForTimeout(500);
  await p.setViewportSize({ width: 1024, height: 768 });
  await p.waitForTimeout(500);
  const hsDocs1024 = await noHScroll(p);
  await row(p, 'Bon-de-livraison').locator('[data-testid=doc-cat-btn]').click();
  await sheet(p).waitFor(); await p.waitForTimeout(400);
  const hsSheet1024 = await noHScroll(p);
  check(hsDocs1024.ok && hsSheet1024.ok, `A5) 1024 : panneau Documents et fenêtre de choix sans défilement horizontal ${JSON.stringify([hsDocs1024.bad, hsSheet1024.bad])}`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  check(errs.length === 0, `A5) aucune erreur de page (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// B · SALARIÉ (/poseur), 390 px — Sam
// ════════════════════════════════════════════════════════════════════════════
{
  const SW = freshState({ time_entries: [workerEntry()], users: [SAM, ALEX, ADMIN] });
  const { ctx, p, errs } = await newPage(SW, SAM, { width: 390, height: 844 });
  check(await openWorkerDocs(p), 'B0) salarié : journée → Documents ouvert');
  const btn = p.locator('[data-testid=doc-cat-btn]');
  const list = async () => { await tabPhotos(p); const a = await p.locator('.bt-doc-row').allInnerTexts(); await tabFiles(p); const f = await p.locator('.bt-doc-row').allInnerTexts(); return [...a, ...f].map(norm); };
  const rowsTxt = await list();
  check(rowsTxt.length === 4 && !rowsTxt.some((t) => /Facture/.test(t)), `B1) la liste du salarié a 4 lignes (bureau : 6), aucune facture : ${rowsTxt.length}`);
  check(!(await p.locator('[role=dialog]').first().innerText()).includes('Facture'), 'B1) le mot « Facture » n’apparaît nulle part dans le panneau du salarié');
  // Boutons : SES documents légers (photo sans catégorie, bon de livraison) ; pas le devis d'Alex, pas sa réserve.
  await tabPhotos(p); const bp = await btn.count(); const photoHas = await row(p, 'Photo 1').locator('[data-testid=doc-cat-btn]').count(); const resHas = await row(p, 'Réserve levée').locator('[data-testid=doc-cat-btn]').count();
  await tabFiles(p); const bf = await btn.count(); const nullHas = await row(p, 'Bon-de-livraison').locator('[data-testid=doc-cat-btn]').count(); const devHas = await row(p, 'Devis-definitif').locator('[data-testid=doc-cat-btn]').count();
  check(photoHas === 1 && nullHas === 1 && resHas === 0 && devHas === 0 && bp + bf === 2, `B2) bouton seulement sur SES documents légers (2) : sa photo, son bon ; ni le devis d’un collègue, ni sa réserve (pastille en lecture seule : ${await row(p, 'Devis-definitif').locator('.bt-doc-meta').innerText().then((t) => norm(t).includes('Devis'))})`);
  await tabPhotos(p);
  check(norm(await row(p, 'Réserve levée').innerText()).includes('Réserve') && await row(p, 'Réserve levée').locator('[data-testid=doc-cat-btn]').count() === 0, 'B2) sa réserve garde la pastille « Réserve » en lecture seule');

  // B3 · choix : 6 options.
  await tabFiles(p);
  await p.screenshot({ path: `${SH}/05-liste-salarie.png` });
  SW.patches.length = 0;
  await row(p, 'Bon-de-livraison').locator('[data-testid=doc-cat-btn]').click();
  await sheet(p).waitFor(); await p.waitForTimeout(400);
  const cats = await sheet(p).locator('[data-testid=doc-cat-opt]').evaluateAll((els) => els.map((e) => e.getAttribute('data-cat')));
  check(cats.length === 6 && !cats.includes('facture') && !cats.includes('facture_payee') && !cats.includes('reserve') && cats.includes('none'), `B3) 6 options, ni Facture, ni Facture payée, ni Réserve : ${cats.join(',')}`);
  const oh = []; for (const h of await sheet(p).locator('[data-testid=doc-cat-opt]').elementHandles()) oh.push((await h.boundingBox()).height);
  check(oh.every((x) => x >= 48), `B3) options ≥ 48 px : ${oh.filter((x) => x >= 48).length}/${oh.length}`);
  check(await sheet(p).locator('[data-cat=none]').getAttribute('aria-checked') === 'true', 'B3) « Sans catégorie » coché');
  await p.screenshot({ path: `${SH}/06-choix-salarie.png` });
  await pick(p, 'plan');
  check(await sheet(p).locator('[data-testid=doc-cat-notice]').count() === 0, 'B3) NULL → plan : pas d’avertissement');
  await sheet(p).locator('[data-testid=doc-cat-save]').click(); await p.waitForTimeout(900);
  check(SW.patches.length === 1 && SW.patches[0].id === 'd-null' && JSON.stringify(SW.patches[0].body) === '{"category":"plan"}', `B3) NULL → plan : une écriture, une seule clé ${JSON.stringify(SW.patches)}`);
  check(norm(await row(p, 'Bon-de-livraison').locator('[data-testid=doc-cat-btn]').innerText()) === 'Plan ▾', 'B3) la ligne affiche « Plan ▾ »');

  // B4 · « Envoyer au client » : aucune facture dans le message.
  await p.locator('.bt-doc-send-btn.ghost').click(); await p.waitForTimeout(700);
  const copied = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check(copied.includes('Bon-de-livraison') && copied.includes('Devis-definitif') && !/factur/i.test(copied), `B4) message au client copié : ${(copied.match(/^- /gm) || []).length} pièces, aucune facture`);
  check(SW.signed.at(-1)?.every((x) => !/d-fact|d-fpay/.test(x)) && SW.signed.at(-1)?.length === 4, `B4) liens signés demandés pour 4 fichiers seulement (${SW.signed.at(-1)?.length})`);
  const hs = await noHScroll(p, '[role=dialog]');
  check(hs.ok, `B5) 390 : panneau Documents du salarié sans défilement horizontal ${JSON.stringify(hs.bad)}`);
  check(errs.length === 0, `B5) aucune erreur de page (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// C · MIGRATION ABSENTE : rien de nouveau, aucun message
// ════════════════════════════════════════════════════════════════════════════
for (const mode of ['missing', 'network']) {
  const SC = freshState({ ready: mode });
  const { ctx, p, errs } = await newPage(SC, ADMIN, { width: 390, height: 844 });
  const consoleErr = []; p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErr.push(m.text()); });
  check(await openAdminDocs(p), `C0) (${mode}) bureau : Documents ouvert`);
  await p.waitForTimeout(800);
  check(SC.rpc.includes('document_category_ready'), `C1) (${mode}) la fonction « prête ? » a bien été interrogée`);
  check(await p.locator('[data-testid=doc-cat-btn]').count() === 0, `C1) (${mode}) aucun bouton de catégorie`);
  await tabFiles(p);
  const txt = norm(await p.locator('[role=dialog]', { hasText: 'Documents —' }).first().innerText());
  check(!txt.includes('▾') && !txt.includes('Sans catégorie') && /Devis/.test(txt) && /Facture payée/.test(txt), `C2) (${mode}) pastilles de lecture comme avant (« Devis », « Facture », « Facture payée »), pas de « Sans catégorie » ni de ▾`);
  check(await p.locator("[data-sonner-toast], [data-testid=doc-cat-done]").count() === 0 && await p.locator('[role=alert]:not(#__next-route-announcer__)').count() === 0, `C2) (${mode}) aucun message, aucun bandeau`);
  check(consoleErr.length === 0 && errs.length === 0, `C2) (${mode}) rien dans la console : ${[...consoleErr, ...errs].slice(0, 2).join(' | ') || 'vide'}`);
  if (mode === 'missing') { await p.mouse.move(1, 1); await p.screenshot({ path: `${SH}/07-migration-absente.png` }); }
  await ctx.close();
}
{
  // Salarié, migration absente : la liste est celle d'avant (pastilles, pas de bouton).
  const SC = freshState({ ready: 'missing', time_entries: [workerEntry()] });
  const { ctx, p } = await newPage(SC, SAM, { width: 390, height: 844 });
  check(await openWorkerDocs(p), 'C3) salarié (migration absente) : Documents ouvert');
  check(await p.locator("[data-testid=doc-cat-btn]").count() === 0 && await p.locator("[data-sonner-toast], [data-testid=doc-cat-done]").count() === 0, 'C3) salarié : aucun bouton, aucun message');
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// D · CLAVIER : Tab → bouton, Entrée ouvre, Échap ferme, le focus revient
// ════════════════════════════════════════════════════════════════════════════
{
  const SD = freshState();
  const { ctx, p } = await newPage(SD, ADMIN, { width: 390, height: 844 });
  check(await openAdminDocs(p), 'D0) clavier : Documents ouvert');
  await tabFiles(p);
  const target = p.locator('[data-testid=doc-cat-btn][aria-label*="Facture-0388"]');
  await p.locator('.bt-doc-addbtn').first().focus();
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) {
    await p.keyboard.press('Tab');
    reached = await p.evaluate(() => document.activeElement?.getAttribute('aria-label')?.includes('Facture-0388') ?? false);
  }
  check(reached, 'D1) Tab atteint le bouton de catégorie');
  check(await target.evaluate((e) => getComputedStyle(e).outlineStyle !== 'none' || e.matches(':focus-visible')), 'D1) anneau de focus visible (:focus-visible)');
  await p.keyboard.press('Enter');
  await sheet(p).waitFor({ timeout: 3000 });
  check(true, 'D2) Entrée ouvre la fenêtre de choix');
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  check(await sheet(p).count() === 0, 'D3) Échap ferme la fenêtre de choix seule');
  check(await p.locator('.bt-doc-row').first().isVisible(), 'D3) le panneau Documents reste ouvert');
  check(await p.evaluate(() => document.activeElement?.getAttribute('aria-label')?.includes('Facture-0388') ?? false), 'D3) le focus revient sur le bouton d’origine');
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// E · CONTRÔLE STATIQUE : aucune suppression ajoutée
// ════════════════════════════════════════════════════════════════════════════
{
  // Les mots sont assemblés ici pour que ce fichier ne se dénonce pas lui-même.
  const words = ['DELE' + 'TE', 'DR' + 'OP', 'TRUN' + 'CATE', 'CAS' + 'CADE'];
  const calls = new RegExp('\\.(' + ['dele' + 'te', 'remo' + 've'].join('|') + ')\\(');
  const sql = new RegExp('\\b(' + words.join('|') + ')\\b');
  let diff = '';
  try { diff = execSync('git diff origin/integration/bemexo-ia -- components lib scripts supabase/migrations', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (e) { diff = String(e.stdout || ''); }
  const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  const bad = added.filter((l) => !/^\+\s*--/.test(l)).filter((l) => calls.test(l) || sql.test(l));
  check(diff.length > 0 && added.length > 50, `E1) diff relu (${added.length} lignes ajoutées)`);
  check(bad.length === 0, `E1) aucun appel de suppression ni mot de suppression SQL ajouté hors commentaires${bad.length ? ' : ' + bad.slice(0, 3).join(' | ') : ''}`);
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
