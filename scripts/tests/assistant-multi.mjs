// Assistant BEMEXO salarié — « UNE fiche, PLUSIEURS actions » (français + turc) : l'écran, de bout en bout.
//
// Lancer : npm run build, puis
//   node scripts/tests/assistant-multi.mjs out docs/captures-assistant-multi 41500
//
// Vraie page /poseur (export statique), base Supabase SIMULÉE avec état (aucune vraie base, aucun e-mail,
// noms fictifs). L'IA est simulée : la réponse du serveur est fixée, tout le reste (fiche, « Tout confirmer »,
// création du chantier, enregistrement, annexes, annulation) est le vrai code du navigateur.
//
//  M1  cas d'Ergun : deux créneaux, pause 1 h, total net 8 h, chantier à créer — rien avant le clic, puis 1 chantier + 2 lignes
//  M2  ville vide → « Tout confirmer » grisé ; un reutilise_id périmé n'est pas cru
//  M3  chantier déjà là (même nom + ville, « Dupont Pierrick ») → rien n'est créé ; une 2e demande identique non plus
//  M4  hors ligne : refus clair, rien d'écrit ; chantier existant hors ligne : lignes gardées sur le téléphone, c'est dit
//  M5  échec partiel : 1 ligne écrite, 1 refusée → dit sans promesse, « pas fait » en cascade, « Annuler » ; le chantier reste
//  M6  heures + panier + réserve + envoi : ordre des écritures, réserve sur la bonne ligne (clé stable), créneau retiré
//  M7  « Annuler » : lignes retirées, chantier toujours là ; après un envoi réussi, pas de bouton Annuler
//  M8  aucun geste ne part sans clic (panier, congé, réserve seuls dans une fiche)
//  M9  non-régression : brouillon complet et geste « direct » toujours faits tout de suite ; `confirmer` attend ; `multi: true` envoyé
//  M10 panier refusé → l'envoi n'est JAMAIS appelé
//  M11 chantier SEUL : code postal et travaux écrits ; relancé sur un chantier existant : rien
//  M12 chevauchement avec une ligne déjà notée : « Déjà noté aujourd'hui », bouton grisé, puis réactivé
//  M13 phrase longue lente : « Je lis votre message… » au bout de 4 s (jamais pour une phrase courte)
//  M14 l'assistant n'a pas pu répondre : la phrase est remise dans le champ
//  M15 geste court « ajoute le chantier X » : créé tel que dit
//  M16 écran : haut de la fiche visible, poubelle 44 px, « Remettre », 320 px, mot très long
//  M17 créneau invalide / date illisible : jamais écartés en silence ; congé seul sans sous-titre de journée
//  M18 focus après « Tout confirmer », « Annulé » annoncé
//  D   démo /apercu/assistant-salarie : la phrase d'Ergun, aucune requête vers supabase.co
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const [,, OUT = 'out', SH = 'docs/captures-assistant-multi', PORT = '41500'] = process.argv;
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
const plusDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const CO = 'c0000000-0000-0000-0000-000000000001';
const ME = 'u-sam';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Bureau Martin', city: 'Villeurbanne', is_active: true };
const CHANTIERS = [{ id: 'w1', nom: 'Villa Dupont', ville: 'Lyon' }, { id: 'w2', nom: 'Bureau Martin', ville: 'Villeurbanne' }];
const ERGUN = "Ajoute-moi une intervention. J'ai travaillé aujourd'hui de 8h à midi, puis pause d'1h, puis de 13h à 17h sur un nouveau chantier : prénom Pierrick, nom Dupont, à Montagna 01250, pour la pose d'un store banne.";

let D;
const fresh = () => {
  D = {
    users: [
      { id: 'u-admin', company_id: CO, first_name: 'Paul', last_name: 'Martin', role: 'admin', email: 'paul@exemple.fr', is_active: true, created_at: '2026-01-01' },
      { id: ME, company_id: CO, first_name: 'Sam', last_name: 'Test', role: 'worker', email: 'sam@exemple.fr', is_active: true, created_at: '2026-01-01' },
    ],
    companies: [{ id: CO, name: 'Entreprise Exemple', ai_enabled: true, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, meal_enabled: true, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
    worksites: [{ ...W1 }, { ...W2 }], planning: [], time_entries: [], active_sessions: [], month_closures: [], leave_requests: [], invitations: [],
    documents: [], certifications: [], push_subscriptions: [], time_entry_corrections: [], time_entry_edits: [], time_entry_positions: [], assistant_journal: [],
    traces: [], // la table existe : l'en-tête x-bemexo-origine est posé pour de vrai
  };
};
fresh();
let workerReply = null;
let refuseEntriesAfter = null;   // n : le (n+1)e insert de time_entries et les suivants sont refusés (400)
let refuseMeal = false;          // le panier est refusé en silence (journée verrouillée)
let entryInserts = 0;
let replyDelay = 0;             // lenteur simulée de worker-assistant (ms)
const log = [];
const fnBodies = [];             // corps envoyés à worker-assistant
const supabaseHits = [];         // toute requête vers *.supabase.co (démo)
// Une écriture en base : ni les appels de fonction, ni les lectures, ni le rafraîchissement de l'écran (ensure_other_worksite),
// ni l'enregistrement du chat après chaque tour (assistant_chat_append : étape 2, c'est du texte d'historique, pas une écriture métier).
const isWrite = (x) => x.m !== 'GET' && x.m !== 'HEAD' && x.m !== 'FN' && x.t !== 'ensure_other_worksite' && x.t !== 'assistant_chat_append';
const writes = (n) => log.slice(n).filter(isWrite);
const names = (w) => w.map((x) => `${x.m} ${x.t}`).join(' → ');

const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sessionFor = (uid, email) => ({
  access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`,
  refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: uid, email, aud: 'authenticated', role: 'authenticated' },
});
const match = (x, k, v) => {
  if (!(k in x)) return true; const s = x[k] == null ? null : String(x[k]);
  if (v.startsWith('eq.')) return s === v.slice(3); if (v.startsWith('neq.')) return s !== v.slice(4);
  if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map((z) => z.replace(/^"|"$/g, '')).includes(s);
  if (v.startsWith('gte.')) return s >= v.slice(4); if (v.startsWith('lte.')) return s <= v.slice(4);
  if (v === 'is.null') return s === null; if (v === 'not.is.null') return s !== null; return true;
};
const SKIP = new Set(['select', 'limit', 'order', 'on_conflict', 'columns', 'offset', 'or']);
const filt = (rows, sp) => rows.filter((x) => [...sp].every(([k, v]) => SKIP.has(k) || match(x, k, v)));
let nid = 0;
const route = (session) => async (r) => {
  const req = r.request(); const u = new URL(req.url()); const m = req.method();
  const origin = req.headers()['x-bemexo-origine'] || null;
  let body = null; try { body = req.postDataJSON(); } catch { body = null; }
  if (u.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
  if (u.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
  if (u.pathname.startsWith('/functions/v1/worker-assistant')) { fnBodies.push(body); log.push({ m: 'FN', t: 'worker-assistant' }); if (replyDelay) await new Promise((x) => setTimeout(x, replyDelay)); return r.fulfill({ json: workerReply || { kind: 'answer', answer: '…', remaining: 20 } }); }
  if (u.pathname.startsWith('/functions/v1/')) { log.push({ m: 'FN', t: u.pathname }); return r.fulfill({ json: { sent: 0 } }); }
  const t = u.pathname.replace('/rest/v1/', '');
  if (u.pathname === '/rest/v1/rpc/request_leave') {
    log.push({ m: 'RPC', t: 'request_leave', body, origin });
    D.leave_requests.push({ id: `lr-${++nid}`, company_id: CO, user_id: ME, type: body.p_type, start_date: body.p_start_date, end_date: body.p_end_date, note: body.p_note, status: 'pending', created_at: new Date(Date.now() + nid).toISOString() });
    return r.fulfill({ json: null });
  }
  if (u.pathname.startsWith('/rest/v1/rpc/')) { log.push({ m: 'RPC', t: t.slice(4), body, origin }); return r.fulfill({ json: [] }); }
  D[t] = D[t] || [];
  if (m === 'GET' || m === 'HEAD') {
    log.push({ m, t });
    const rows = filt(D[t], u.searchParams);
    if ((req.headers().accept || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  }
  if (m === 'DELETE') {
    const gone = filt(D[t], u.searchParams);
    D[t] = D[t].filter((x) => !gone.includes(x));
    log.push({ m, t, ids: gone.map((x) => x.id), origin });
    return r.fulfill({ json: gone });
  }
  if (m === 'PATCH') {
    if (t === 'time_entries' && body && 'meal_allowance' in body && refuseMeal) { log.push({ m, t, body, refus: true, origin }); return r.fulfill({ json: [] }); }
    const hit = filt(D[t], u.searchParams);
    for (const x of hit) Object.assign(x, body);
    log.push({ m, t, ids: hit.map((x) => x.id), body, origin });
    return r.fulfill({ json: hit });
  }
  // POST
  if (t === 'time_entries') {
    entryInserts++;
    if (refuseEntriesAfter !== null && entryInserts > refuseEntriesAfter) {
      log.push({ m, t, body, refus: true, origin });
      return r.fulfill({ status: 400, json: { code: 'P0001', message: 'refusé par le serveur', details: null, hint: null } });
    }
  }
  const arr = (Array.isArray(body) ? body : [body]).map((x) => ({ id: `${t}-${++nid}`, ...x }));
  for (const row of arr) { const i = D[t].findIndex((x) => x.id === row.id); if (i >= 0) D[t][i] = row; else D[t].push(row); }
  log.push({ m, t, rows: arr, body, origin });
  if ((req.headers().accept || '').includes('vnd.pgrst.object')) return r.fulfill({ status: 201, json: arr[0] });
  return r.fulfill({ status: 201, json: arr });
};

const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const only = (id) => !ONLY.length || ONLY.includes(id);
let ok = 0, ko = 0;
const check = (c, msg) => { if (c) { ok++; console.log('✅', msg); } else { ko++; console.log('❌', msg); } };
const shot = (name) => `${SH}/${name}.png`;
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// ════════════════════════ SALARIÉ (téléphone 390 × 844) ════════════════════════
const wctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const ws = sessionFor(ME, 'sam@exemple.fr');
await wctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(ws)]);
await wctx.route('**/*.supabase.co/**', route(ws));
const wp = await wctx.newPage();
const pageErrors = [];
wp.on('pageerror', (e) => { pageErrors.push(e.message); console.log('   [erreur page salarié]', e.message); });
wp.on('request', (q) => { if (q.url().includes('/functions/v1/worker-assistant')) { /* corps déjà noté par la route */ } });
const openWorker = async () => { await wp.goto(`http://localhost:${PORT}/poseur`); await wp.waitForSelector('.bt-total', { timeout: 20000 }); await wp.waitForTimeout(900); };
const askWorker = async (text) => {
  if (!(await wp.locator('[data-testid=assistant-panel]').count())) { await wp.locator('[data-testid=dock-assistant]').click(); await wp.waitForTimeout(500); }
  await wp.locator('.as-bar textarea').fill(text);
  await wp.locator('button[aria-label="Envoyer"]').click();
};
const panel = () => wp.locator('[data-testid=assistant-panel]');
const card = () => wp.locator('[data-testid=multi-card]').last();
const confirmBtn = () => wp.locator('[data-testid=wm-confirm]').last();
const waitCard = async () => { await wp.waitForSelector('[data-testid=multi-card]', { timeout: 10000 }).catch(() => {}); await wp.waitForTimeout(500); };
const waitResult = async () => {
  await wp.waitForFunction(() => /Fait :|Pas fait :|Ignoré :|Rien n|Pas de réseau/.test([...document.querySelectorAll('[data-testid=wm-result]')].pop()?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  await wp.waitForTimeout(400);
};
const resultText = async () => flat(await wp.locator('[data-testid=wm-result]').last().innerText().catch(() => ''));
const queued = () => wp.evaluate((me) => JSON.parse(localStorage.getItem(`battime_offline_${me}`) || '[]'), ME);
const fullShot = async (name, locator = card()) => {
  // La fiche entière (390 px de large) : on agrandit la hauteur le temps de la capture.
  await wp.setViewportSize({ width: 390, height: 1500 });
  await wp.waitForTimeout(300);
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await panel().screenshot({ path: shot(name) }).catch(() => {});
  await wp.setViewportSize({ width: 390, height: 844 });
  await wp.waitForTimeout(200);
};

// ── Fiches du serveur (mêmes formes que _shared/worker-multi.ts) ──
const multiReply = (items, extra = {}) => ({
  kind: 'multi', answer: 'Vérifiez la fiche, puis « Tout confirmer » : rien n’est enregistré avant.', date: today, aujourdhui: today,
  items, ignores: [], non_prepare: [], deja_notees: [], chantiers: CHANTIERS, remaining: 19, ...extra,
});
const PIERRICK = { nom: 'Pierrick Dupont', adresse: '', code_postal: '01250', ville: 'Montagna', description: 'pose d’un store banne' };
const ligneNouveau = (key, start, end, extra = {}) => ({ worksite_id: null, worksite_text: 'Pierrick Dupont', start, end, break_minutes: 0, nouveau: true, key, ...extra });
const ergunItems = (bloc = PIERRICK) => [{ id: 'i0', kind: 'heures', depend: [], draft: { date: today, errors: [], lines: [ligneNouveau('L0', '08:00', '12:00'), ligneNouveau('L1', '13:00', '17:00', { gap_before: 'pause' })], nouveau_chantier: { ...bloc } } }];
const ligneW = (key, ws, start, end, extra = {}) => ({ worksite_id: ws.id, worksite_text: ws.client_name, start, end, break_minutes: 0, key, ...extra });
const choixLignes = (lignes) => lignes.map((l) => ({ id: `draft:${l.key}`, chantier: l.worksite_text, chantier_id: l.worksite_id, debut: l.start, fin: l.end, envoyee: false, panier: false, reserve: false, corrigee: false }));
const action = (id, draft, depend = [], extra = {}) => ({ id, kind: 'action', action: { draft, problems: [] }, depend, ...extra });

const demandeErgun = async (reply = multiReply(ergunItems())) => {
  workerReply = reply;
  await askWorker(ERGUN);
  await waitCard();
};

// ════════ M1 · le cas d'Ergun ════════
if (only('M1')) {
  console.log('\n═══ M1 · cas d’Ergun : deux créneaux, pause 1 h, total 8 h, nouveau chantier — rien avant le clic');
  fresh(); entryInserts = 0; refuseEntriesAfter = null; refuseMeal = false;
  await openWorker();
  const n = log.length;
  await demandeErgun();
  const txt = flat(await card().innerText());
  check(await wp.locator('[data-testid^=wm-line-]').count() === 2, 'M1 la fiche montre DEUX créneaux');
  const times = await card().locator('input[type=time]').evaluateAll((els) => els.map((e) => e.value));
  check(times.join() === '08:00,12:00,13:00,17:00', `M1 08:00→12:00 ET 13:00→17:00 (${times.join(' ')})`);
  check(/Pause 1 h · 12:00 → 13:00/.test(flat(await wp.locator('[data-testid=wm-pause-0]').innerText().catch(() => ''))), 'M1 « Pause 1 h · 12:00 → 13:00 » entre les deux');
  check(flat(await wp.locator('[data-testid=wm-total]').innerText().catch(() => '')) === 'Total net : 8 h 00', 'M1 « Total net : 8 h 00 »');
  const nouveau = flat(await wp.locator('[data-testid=wm-nouveau]').innerText().catch(() => ''));
  check(/Pierrick Dupont · Montagna 01250 · pose d’un store banne/.test(nouveau), `M1 bloc « Nouveau chantier » : Pierrick Dupont · Montagna 01250 · pose d’un store banne`);
  check(/Ce chantier sera créé quand vous confirmerez/.test(nouveau) && /le bureau pourra l’archiver/.test(nouveau), 'M1 la fiche dit que le chantier ne sera créé qu’au clic et qu’on ne pourra pas le supprimer');
  check(await confirmBtn().isEnabled() && /Tout confirmer/.test(await confirmBtn().innerText()), 'M1 UN bouton « Tout confirmer », actif');
  check(writes(n).length === 0, `M1 AVANT le clic : 0 écriture (${names(writes(n)) || 'aucune'})`);
  await wp.waitForTimeout(1200);
  check(writes(n).length === 0, 'M1 …toujours 0 écriture après une pause (aucun effet au montage)');
  await fullShot('fiche-ergun-390');
  const k = log.length;
  await confirmBtn().click();
  await waitResult();
  const w = writes(k);
  const ws1 = w.filter((x) => x.m === 'POST' && x.t === 'worksites');
  check(ws1.length === 1, `M1 UN seul chantier créé (${names(w)})`);
  const cr = ws1[0]?.body ?? {};
  check(cr.client_name === 'Pierrick Dupont' && cr.city === 'Montagna' && cr.postal_code === '01250' && cr.description === 'pose d’un store banne' && cr.company_id === CO && cr.is_active === true,
    `M1 chantier : nom, ville, code postal, travaux, entreprise de la SESSION (${JSON.stringify(cr)})`);
  const te = w.filter((x) => x.m === 'POST' && x.t === 'time_entries');
  check(te.length === 2, `M1 DEUX lignes d’heures écrites (${te.length})`);
  const nouveauId = D.worksites.find((x) => x.client_name === 'Pierrick Dupont')?.id;
  check(!!nouveauId && te.every((x) => x.body.worksite_id === nouveauId), 'M1 les deux lignes portent l’identifiant du chantier créé');
  check(te.every((x) => x.body.break_minutes === 0), 'M1 pause 0 sur chaque ligne (l’écart EST la pause : jamais comptée deux fois)');
  check(!('gap_before' in (te[0]?.body ?? {})) && te[1]?.body?.gap_before === 'pause', `M1 la 2e ligne porte gap_before « pause », la 1re n’a pas la clé (${Object.keys(te[0]?.body ?? {}).includes('gap_before')})`);
  check(te.map((x) => `${x.body.start_time}-${x.body.end_time}`).join() === '08:00-12:00,13:00-17:00', 'M1 08:00-12:00 et 13:00-17:00');
  check(w.filter((x) => x.m === 'POST' && ['worksites', 'time_entries'].includes(x.t)).every((x) => x.origin === 'assistant'), 'M1 toutes ces écritures portent l’en-tête x-bemexo-origine: assistant');
  check(!log.slice(k).some((x) => x.m === 'FN'), 'M1 aucune requête vers /functions/ après le clic');
  check(names(w).indexOf('POST worksites') < names(w).indexOf('POST time_entries'), 'M1 le chantier est créé AVANT les heures');
  const res = await resultText();
  check(/Fait : 2 créneaux enregistrés \(8 h 00\) ; chantier « Pierrick Dupont » créé\./.test(res), `M1 message : « ${res} »`);
  const journal = log.slice(k).filter((x) => x.t === 'assistant_journal_log').map((x) => x.body?.p_summary).join(' | ');
  check(/Chantier créé \(Montagna\)/.test(journal) && !/Pierrick|Dupont/.test(journal.replace(/Heures du/g, '')), `M1 journal : la ville, jamais le nom du particulier (« ${journal} »)`);
  await fullShot('fiche-ergun-apres-confirmation');
  check(await wp.locator('[data-testid=wm-undo]').count() === 1, 'M1 « Annuler » proposé');
}

// ════════ M2 · ville vide / reutilise_id périmé ════════
if (only('M2')) {
  console.log('\n═══ M2 · ville vide → « Tout confirmer » grisé ; un reutilise_id périmé n’est pas cru');
  fresh(); entryInserts = 0;
  await openWorker();
  await demandeErgun(multiReply(ergunItems({ ...PIERRICK, ville: '' }), {}));
  check(await confirmBtn().isDisabled(), 'M2 sans ville : « Tout confirmer » est grisé');
  check(/Indiquez la ville du chantier pour confirmer/.test(flat(await card().innerText())), 'M2 « Indiquez la ville du chantier pour confirmer. »');
  check(/Complétez : la ville du chantier/.test(flat(await wp.locator('[data-testid=wm-besoin]').innerText().catch(() => ''))), 'M2 « Complétez : la ville du chantier. » sous le bouton');
  await wp.locator('[data-testid=wm-ville]').fill('Montagna');
  await wp.waitForTimeout(200);
  check(await confirmBtn().isEnabled(), 'M2 ville renseignée : « Tout confirmer » actif');
  await fullShot('fiche-ville-manquante');
  // reutilise_id qui ne correspond PLUS au chantier (nom différent) : ignoré, le chantier est bien créé.
  fresh(); entryInserts = 0;
  await openWorker();
  await demandeErgun(multiReply(ergunItems({ ...PIERRICK, nom: 'Pierrick Dupont', reutilise_id: 'w2' })));
  check(!/existe déjà/.test(flat(await card().innerText())), 'M2 reutilise_id d’un autre chantier : la fiche ne dit pas « existe déjà »');
  const k = log.length;
  await confirmBtn().click(); await waitResult();
  check(writes(k).filter((x) => x.t === 'worksites' && x.m === 'POST').length === 1 && !D.time_entries.some((x) => x.worksite_id === 'w2'), 'M2 le chantier est créé et rien n’est écrit sur Bureau Martin');
}

// ════════ M3 · chantier déjà là ════════
if (only('M3')) {
  console.log('\n═══ M3 · « Dupont Pierrick » existe déjà (Montagna) → rien n’est créé ; une 2e demande identique non plus');
  fresh(); entryInserts = 0;
  D.worksites.push({ id: 'w-pierrick', company_id: CO, client_name: 'Dupont Pierrick', city: 'Montagna (01)', is_active: true });
  await openWorker();
  await demandeErgun();
  const k = log.length;
  await confirmBtn().click(); await waitResult();
  const w = writes(k);
  check(!w.some((x) => x.m === 'POST' && x.t === 'worksites'), `M3 AUCUN chantier créé (${names(w)})`);
  check(D.time_entries.length === 2 && D.time_entries.every((x) => x.worksite_id === 'w-pierrick'), 'M3 les deux lignes sont sur le chantier existant');
  check(/chantier « Dupont Pierrick » utilisé \(il existait déjà\)/.test(await resultText()), `M3 c’est dit : « ${await resultText()} »`);
  // 2e demande identique, après un 1er succès avec création.
  fresh(); entryInserts = 0;
  await openWorker();
  await demandeErgun();
  await confirmBtn().click(); await waitResult();
  check(D.worksites.filter((x) => x.client_name === 'Pierrick Dupont').length === 1, 'M3 1re demande : le chantier est créé');
  await demandeErgun();
  const k2 = log.length;
  await confirmBtn().click(); await waitResult();
  check(!writes(k2).some((x) => x.m === 'POST' && x.t === 'worksites') && D.worksites.filter((x) => /Pierrick/.test(x.client_name)).length === 1,
    `M3 2e demande identique : pas de second chantier (${D.worksites.filter((x) => /Pierrick/.test(x.client_name)).length})`);
}

// ════════ M4 · hors ligne ════════
if (only('M4')) {
  console.log('\n═══ M4 · hors ligne : refus clair (nouveau chantier), puis lignes gardées sur le téléphone (chantier existant)');
  fresh(); entryInserts = 0;
  await openWorker();
  await demandeErgun();
  await wctx.setOffline(true);
  await wp.waitForTimeout(300);
  const k = log.length;
  await confirmBtn().click();
  await wp.waitForSelector('[data-testid=wm-stop]', { timeout: 8000 }).catch(() => {});
  const stop = flat(await wp.locator('[data-testid=wm-stop]').innerText().catch(() => ''));
  check(stop === 'Pas de réseau : le nouveau chantier ne peut pas être créé. Rien n’a été enregistré. Réessayez quand le réseau est revenu.', `M4 refus clair : « ${stop} »`);
  check(writes(k).length === 0 && D.worksites.length === 2 && D.time_entries.length === 0, `M4 0 écriture (ni worksites ni time_entries)`);
  check((await queued()).length === 0, 'M4 rien dans la file du téléphone (battime_offline_*)');
  check(await confirmBtn().isEnabled(), 'M4 la fiche reste modifiable (bouton actif)');
  await fullShot('hors-ligne-refus');
  await wctx.setOffline(false);
  await wp.waitForTimeout(300);
  await confirmBtn().click(); await waitResult();
  check(D.worksites.some((x) => x.client_name === 'Pierrick Dupont') && D.time_entries.length === 2, 'M4 réseau revenu : « Tout confirmer » aboutit');
  // Chantier EXISTANT hors ligne : les lignes sont gardées sur le téléphone, et c'est dit.
  fresh(); entryInserts = 0;
  await openWorker();
  workerReply = multiReply([{ id: 'i0', kind: 'heures', depend: [], draft: { date: today, errors: [], lines: [ligneW('L0', W1, '08:00', '12:00'), ligneW('L1', W1, '13:00', '17:00', { gap_before: 'pause' })] } }]);
  await askWorker('Mets mes heures chez Dupont de 8h à midi et de 13h à 17h, pause d’une heure, merci beaucoup pour tout le travail.'); await waitCard();
  await wctx.setOffline(true); await wp.waitForTimeout(300);
  await confirmBtn().click(); await waitResult();
  const res = await resultText();
  check(/pas de réseau, 2 créneaux gardés sur le téléphone\. Ils partiront dès que le réseau revient/.test(res), `M4 hors ligne : « ${res} »`);
  check((await queued()).length === 2 && D.time_entries.length === 0, `M4 les 2 lignes sont dans la file du téléphone (${(await queued()).length})`);
  await fullShot('hors-ligne-lignes-gardees');
  // On vide la file locale AVANT le retour du réseau : sinon la synchronisation de l'application enverrait ces lignes pendant le scénario suivant.
  await wp.evaluate((me) => localStorage.removeItem(`battime_offline_${me}`), ME);
  await wctx.setOffline(false);
  await wp.waitForTimeout(500);
}

// ════════ M5 · échec partiel ════════
if (only('M5')) {
  console.log('\n═══ M5 · 1 ligne écrite, la 2e refusée par le serveur : dit sans promesse, le reste « pas fait », « Annuler »');
  fresh(); entryInserts = 0; refuseEntriesAfter = 1;
  await openWorker();
  const lignes = [ligneW('L0', W1, '08:00', '12:00'), ligneW('L1', W1, '13:00', '17:00', { gap_before: 'pause' })];
  workerReply = multiReply([
    { id: 'i0', kind: 'heures', depend: [], draft: { date: today, errors: [], lines: lignes } },
    action('i1', { type: 'panier_repas', valeur: true }, ['i0']),
    action('i2', { type: 'envoyer_journee', date: today, lignes: 2 }, ['i0', 'i1'], { deja_notees: [] }),
  ]);
  await askWorker('Mets mes heures chez Dupont de 8h à midi et de 13h à 17h avec une heure de pause, le panier repas, et envoie ma journée au bureau.'); await waitCard();
  const k = log.length;
  await confirmBtn().click(); await waitResult();
  const res = await resultText();
  check(D.time_entries.length === 1 && (await queued()).length === 1, `M5 1 ligne écrite, 1 gardée sur le téléphone (${D.time_entries.length} / ${(await queued()).length})`);
  check(/1 créneau enregistré, 1 non enregistré : vérifiez dans « Ma journée »/.test(res), `M5 message : « ${res} »`);
  check(!/partiront dès que le réseau revient/.test(res), 'M5 AUCUNE promesse de départ automatique (c’est un refus du serveur)');
  check(!writes(k).some((x) => x.m === 'PATCH'), `M5 panier et envoi ne partent pas (${names(writes(k))})`);
  check(/panier repas \(les heures ne sont pas enregistrées\)/i.test(res) && /Envoi de la journée \(un élément précédent n’a pas abouti/.test(res), 'M5 « pas fait » dit pour le panier et pour l’envoi');
  check(await wp.locator('[data-testid=wm-undo]').count() === 1, 'M5 « Annuler » est proposé (ligne écrite + ligne gardée)');
  await fullShot('echec-partiel');
  await wp.locator('[data-testid=wm-undo]').click();
  await wp.waitForSelector('[data-testid=wm-undone]', { timeout: 10000 }).catch(() => {});
  check(D.time_entries.length === 0 && (await queued()).length === 0, `M5 « Annuler » retire la ligne écrite ET vide la file du téléphone (${D.time_entries.length} / ${(await queued()).length})`);
  refuseEntriesAfter = null;
}

// ════════ M6 · heures + panier + réserve + envoi ════════
const fiche4 = () => {
  const lignes = [ligneW('L0', W1, '07:00', '10:00'), ligneW('L1', W2, '10:30', '12:00'), ligneW('L2', W1, '13:00', '16:30')];
  return { lignes, reply: multiReply([
    { id: 'i0', kind: 'heures', depend: [], draft: { date: today, errors: [], lines: lignes } },
    action('i1', { type: 'panier_repas', valeur: true }, ['i0']),
    action('i2', { type: 'signaler_reserve', entry_id: 'draft:L2', detail: 'fissure sur le mur sud', choix: choixLignes(lignes) }, ['i0'], { cible: { chantier_id: 'w1', nouveau: false, nom: 'Villa Dupont' } }),
    action('i3', { type: 'envoyer_journee', date: today, lignes: 3 }, ['i0', 'i1', 'i2'], { deja_notees: [] }),
  ]) };
};
const PHRASE4 = 'Ce matin 7h à 10h chez Dupont, 10h30 à midi chez Martin, 13h à 16h30 chez Dupont, le panier repas, une réserve fissure sur le mur chez Dupont, et envoie ma journée.';
if (only('M6')) {
  console.log('\n═══ M6 · heures + panier + réserve + envoi : ordre des écritures, réserve sur la dernière ligne du chantier');
  fresh(); entryInserts = 0;
  await openWorker();
  workerReply = fiche4().reply;
  await askWorker(PHRASE4); await waitCard();
  check(/Envoyer la journée au bureau \(3 créneaux\)/.test(flat(await card().innerText())), 'M6 « Envoyer la journée au bureau (3 créneaux) »');
  check(/Écart 30 min · 10:00 → 10:30 · non compté/.test(flat(await wp.locator('[data-testid=wm-ecart-0]').innerText().catch(() => ''))), 'M6 un écart entre deux chantiers est « non compté », jamais « Pause »');
  await fullShot('fiche-quatre-actions');
  const k = log.length;
  await confirmBtn().click(); await waitResult();
  const w = writes(k).filter((x) => x.t !== 'assistant_journal_log');
  const seq = w.map((x) => (x.m === 'POST' ? `POST ${x.t}` : x.m === 'PATCH' && x.body && 'meal_allowance' in x.body ? 'PATCH panier' : x.m === 'PATCH' && x.body?.reception ? 'PATCH réserve' : x.m === 'PATCH' && x.body?.status === 'submitted' ? 'PATCH envoi' : `${x.m} ${x.t}`));
  check(seq.join(' → ') === 'POST time_entries → POST time_entries → POST time_entries → PATCH panier → PATCH réserve → PATCH envoi', `M6 ordre : ${seq.join(' → ')}`);
  const derniere = D.time_entries.find((x) => x.start_time === '13:00');
  check(derniere?.reception === 'avec' && D.time_entries.filter((x) => x.reception === 'avec').length === 1, 'M6 la réserve est sur la DERNIÈRE ligne de Villa Dupont (13:00)');
  check(D.time_entries.every((x) => x.status === 'submitted'), 'M6 la journée est envoyée');
  check(await wp.locator('[data-testid=wm-undo]').count() === 0 && /Journée envoyée : pour corriger, passez par « Ma journée »/.test(flat(await card().innerText())), 'M6 après un envoi réussi : pas de bouton « Annuler », le chemin de correction est dit');
  check(/Fait : 3 créneaux enregistrés \(8 h 00\) ; panier repas coché ; réserve posée ; journée envoyée\./.test(await resultText()), `M6 message : « ${await resultText()} »`);

  // Variante : le salarié retire le créneau 1 avant de confirmer → la réserve vise toujours le bon créneau.
  fresh(); entryInserts = 0;
  await openWorker();
  workerReply = fiche4().reply;
  await askWorker(PHRASE4); await waitCard();
  await wp.locator('[data-testid=wm-retirer-0]').click(); await wp.waitForTimeout(200);
  check(await confirmBtn().isEnabled(), 'M6b créneau 1 retiré : « Tout confirmer » reste actif (la réserve vise Villa Dupont, pas un rang)');
  await confirmBtn().click(); await waitResult();
  check(D.time_entries.length === 2 && D.time_entries.find((x) => x.start_time === '13:00')?.reception === 'avec' && D.time_entries.filter((x) => x.reception === 'avec').length === 1, 'M6b la réserve est bien sur le créneau 13:00 (clé stable)');
  // Variante : il retire TOUS les créneaux de Villa Dupont → la réserve est bloquée, bouton grisé.
  fresh(); entryInserts = 0;
  await openWorker();
  workerReply = fiche4().reply;
  await askWorker(PHRASE4); await waitCard();
  await wp.locator('[data-testid=wm-retirer-0]').click(); await wp.waitForTimeout(150);
  await wp.locator('[data-testid=wm-retirer-1]').click(); await wp.waitForTimeout(250); // l'ancien créneau 3 est devenu le 2e
  check(await confirmBtn().isDisabled(), 'M6c plus aucun créneau Villa Dupont : « Tout confirmer » grisé');
  check(/Aucun créneau n’est plus sur Villa Dupont : retirez la réserve ou choisissez un chantier\./.test(flat(await card().innerText())), 'M6c « Aucun créneau n’est plus sur Villa Dupont… »');
  await wp.locator('[aria-label="Retirer : réserve"]').click(); await wp.waitForTimeout(250);
  check(await confirmBtn().isEnabled(), 'M6c réserve retirée : le bouton redevient actif');
}

// ════════ M7 · Annuler ════════
if (only('M7')) {
  console.log('\n═══ M7 · « Annuler » : lignes retirées, le chantier reste (et c’est dit)');
  fresh(); entryInserts = 0;
  await openWorker();
  await demandeErgun();
  await confirmBtn().click(); await waitResult();
  const crees = D.worksites.filter((x) => x.client_name === 'Pierrick Dupont').length;
  const k = log.length;
  await wp.locator('[data-testid=wm-undo]').click();
  await wp.waitForSelector('[data-testid=wm-undone]', { timeout: 10000 }).catch(() => {});
  const said = flat(await wp.locator('[data-testid=wm-undone]').innerText().catch(() => ''));
  check(D.time_entries.length === 0, `M7 les deux lignes d’heures sont retirées (${D.time_entries.length})`);
  check(D.worksites.filter((x) => x.client_name === 'Pierrick Dupont').length === crees && crees === 1, 'M7 le chantier est TOUJOURS là');
  check(/Le chantier « Pierrick Dupont » reste créé \(vous ne pouvez pas le supprimer ; le bureau peut l’archiver\)\./.test(said), `M7 le message le dit : « ${said} »`);
  check(!writes(k).some((x) => x.t === 'worksites'), 'M7 aucune écriture sur les chantiers');
  check(writes(k).filter((x) => x.m === 'DELETE').every((x) => x.t === 'time_entries'), 'M7 les seules suppressions sont celles des lignes de la fiche (brouillons)');
}

// ════════ M8 · rien ne part sans clic ════════
if (only('M8')) {
  console.log('\n═══ M8 · un geste « direct » seul dans une fiche (panier, congé, réserve) n’est PAS fait tout seul');
  for (const [nom, items, phrase] of [
    ['panier', [action('i0', { type: 'panier_repas', valeur: true })], 'Mets-moi le panier repas aujourd’hui.'],
    ['congé', [action('i0', { type: 'demander_conge', conge_type: 'conge', du: plusDays(today, 10), au: plusDays(today, 12), note: '' })], 'Je voudrais poser un congé du lundi au mercredi prochain.'],
    ['réserve', [action('i0', { type: 'signaler_reserve', entry_id: 'e1', detail: 'fissure', choix: [{ id: 'e1', chantier: 'Villa Dupont', debut: '07:30', fin: '12:00', envoyee: false }] })], 'Signale une réserve chez Dupont : fissure.'],
  ]) {
    fresh(); entryInserts = 0;
    D.time_entries = [{ id: 'e1', company_id: CO, user_id: ME, worksite_id: 'w1', work_date: today, start_time: '07:30:00', end_time: '12:00:00', break_minutes: 0, meal_allowance: false, status: 'draft', locked: false, submitted_at: null, observation: null, reception: null }];
    await openWorker();
    const k = log.length;
    workerReply = multiReply(items); await askWorker(phrase); await waitCard();
    await wp.waitForTimeout(1200);
    check(await confirmBtn().count() === 1 && writes(k).length === 0, `M8 ${nom} seul : fiche à confirmer, 0 requête d’écriture sans clic (${names(writes(k)) || 'aucune'})`);
  }
}

// ════════ M9 · non-régression ════════
if (only('M9')) {
  console.log('\n═══ M9 · non-régression : brouillon complet et geste direct toujours faits tout de suite ; `confirmer` attend ; `multi: true` envoyé');
  fresh(); entryInserts = 0;
  await openWorker();
  fnBodies.length = 0;
  workerReply = { kind: 'draft', remaining: 20, answer: 'Vérifiez, puis enregistrez.', chantiers: CHANTIERS,
    draft: { date: today, errors: [], lines: [{ worksite_id: 'w1', worksite_text: 'Villa Dupont', start: '07:30', end: '12:00', break_minutes: 0 }, { worksite_id: 'w2', worksite_text: 'Bureau Martin', start: '13:00', end: '16:30', break_minutes: 0 }] } };
  await askWorker('ce matin 7h30 12h villa dupont, après-midi 13h 16h30 bureau martin');
  await wp.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  check(D.time_entries.length === 2, `M9 un brouillon complet s’enregistre encore tout seul (${D.time_entries.length} lignes)`);
  check(fnBodies.length === 1 && fnBodies[0].multi === true && fnBodies[0].text.startsWith('ce matin'), `M9 le corps envoyé à worker-assistant porte multi: true (${JSON.stringify(fnBodies[0])})`);
  workerReply = { kind: 'action', remaining: 19, answer: 'C’est fait.', chantiers: CHANTIERS, action: { draft: { type: 'panier_repas', valeur: true }, problems: [] } };
  const k = log.length;
  await askWorker('mets le panier');
  await wp.waitForTimeout(2500);
  check(writes(k).some((x) => x.m === 'PATCH' && x.body && 'meal_allowance' in x.body), 'M9 un geste « direct » (sans `confirmer`) s’exécute encore tout seul');
  workerReply = { kind: 'action', remaining: 18, answer: 'Vérifiez, puis confirmez.', chantiers: CHANTIERS, confirmer: true,
    action: { draft: { type: 'modifier_heures', entry_id: D.time_entries[0].id, debut: '08:00', fin: '12:00', choix: [{ id: D.time_entries[0].id, chantier: 'Villa Dupont', debut: '07:30', fin: '12:00', envoyee: false }] }, problems: [] } };
  const k2 = log.length;
  await askWorker('change l’heure de début à 8h');
  await wp.waitForSelector('[data-testid=worker-action-confirm]', { timeout: 10000 }).catch(() => {});
  await wp.waitForTimeout(1500);
  check(await wp.locator('[data-testid=worker-action-confirm]').last().isVisible() && writes(k2).length === 0, `M9 \`confirmer: true\` : « Enregistrer » attend le clic, 0 écriture (${names(writes(k2)) || 'aucune'})`);
}

// ════════ M10 · panier refusé → l'envoi n'est jamais appelé ════════
if (only('M10')) {
  console.log('\n═══ M10 · panier refusé (journée verrouillée) → l’envoi n’est JAMAIS appelé');
  fresh(); entryInserts = 0; refuseMeal = true;
  await openWorker();
  const lignes = [ligneW('L0', W1, '08:00', '12:00'), ligneW('L1', W1, '13:00', '17:00', { gap_before: 'pause' })];
  workerReply = multiReply([
    { id: 'i0', kind: 'heures', depend: [], draft: { date: today, errors: [], lines: lignes } },
    action('i1', { type: 'panier_repas', valeur: true }, ['i0']),
    action('i2', { type: 'envoyer_journee', date: today, lignes: 2 }, ['i0', 'i1'], { deja_notees: [] }),
  ]);
  await askWorker('Mets mes heures chez Dupont de 8h à midi et de 13h à 17h, le panier repas, et envoie ma journée au bureau s’il te plaît.'); await waitCard();
  const k = log.length;
  await confirmBtn().click(); await waitResult();
  const res = await resultText();
  check(!writes(k).some((x) => x.m === 'PATCH' && x.body?.status === 'submitted'), `M10 aucune requête d’envoi (${names(writes(k))})`);
  check(D.time_entries.length === 2 && D.time_entries.every((x) => x.status === 'draft'), 'M10 les heures restent notées (brouillons)');
  check(/Pas fait :/.test(res) && /un élément précédent n’a pas abouti/.test(res), `M10 la fiche dit « Pas fait : … un élément précédent n’a pas abouti » (« ${res} »)`);
  refuseMeal = false;
}

// ════════ M11 · chantier seul ════════
if (only('M11')) {
  console.log('\n═══ M11 · chantier SEUL : code postal et travaux écrits ; relancé sur un chantier existant : rien');
  fresh(); entryInserts = 0;
  await openWorker();
  const seul = multiReply([{ id: 'i0', kind: 'chantier', depend: [], manque: [], nouveau_chantier: { nom: 'Claire Martin', adresse: '12 rue des Lilas', code_postal: '01000', ville: 'Bourg-en-Bresse', description: 'rénovation d’une salle de bain' } }]);
  workerReply = seul; await askWorker('Ajoute un nouveau chantier : madame Claire Martin, 12 rue des Lilas à Bourg-en-Bresse 01000, rénovation d’une salle de bain.'); await waitCard();
  const k = log.length;
  await confirmBtn().click(); await waitResult();
  const cr = writes(k).find((x) => x.m === 'POST' && x.t === 'worksites')?.body ?? {};
  check(cr.client_name === 'Claire Martin' && cr.postal_code === '01000' && cr.address === '12 rue des Lilas' && cr.description === 'rénovation d’une salle de bain' && cr.city === 'Bourg-en-Bresse', `M11 le POST worksites porte code postal, adresse et travaux (${JSON.stringify(cr)})`);
  check(await wp.locator('[data-testid=wm-undo]').count() === 0, 'M11 un chantier seul : pas d’« Annuler »');
  check(/Fait : chantier « Claire Martin » créé\./.test(await resultText()), `M11 « ${await resultText()} »`);
  workerReply = seul; await askWorker('Ajoute un nouveau chantier : madame Claire Martin, 12 rue des Lilas à Bourg-en-Bresse 01000, rénovation d’une salle de bain.'); await waitCard();
  const k2 = log.length;
  await confirmBtn().click(); await waitResult();
  check(!writes(k2).some((x) => x.t === 'worksites') && D.worksites.filter((x) => x.client_name === 'Claire Martin').length === 1, 'M11 relancé sur un chantier existant : 0 POST worksites');
}

// ════════ M12 · chevauchement avec une ligne déjà notée ════════
if (only('M12')) {
  console.log('\n═══ M12 · un créneau chevauche une ligne déjà notée → « Déjà noté aujourd’hui », bouton grisé ; le retirer le réactive');
  fresh(); entryInserts = 0;
  await openWorker();
  const lignes = [ligneW('L0', W1, '08:00', '12:00'), ligneW('L1', W1, '13:00', '17:00', { gap_before: 'pause' })];
  workerReply = multiReply([{ id: 'i0', kind: 'heures', depend: [], draft: { date: today, errors: [], lines: lignes } }],
    { deja_notees: [{ debut: '07:30', fin: '10:00', chantier: 'Villa Dupont', envoyee: false }] });
  await askWorker('Mets mes heures chez Dupont de 8h à midi et de 13h à 17h, avec une heure de pause entre les deux, comme d’habitude.'); await waitCard();
  const txt = flat(await card().innerText());
  check(/Déjà noté aujourd'hui : 07:30–10:00 \(Villa Dupont\)\. Retirez ce créneau ou corrigez-le dans « Ma journée »\./.test(txt), 'M12 « Déjà noté aujourd’hui : 07:30–10:00 (Villa Dupont)… »');
  check(await confirmBtn().isDisabled(), 'M12 « Tout confirmer » grisé');
  await wp.locator('[data-testid=wm-retirer-0]').click(); await wp.waitForTimeout(250);
  check(await confirmBtn().isEnabled() && !/Déjà noté/.test(flat(await card().innerText())), 'M12 créneau retiré : l’erreur disparaît, le bouton est actif');
}


// ════════ M13 · attente ════════
if (only('M13')) {
  console.log('\n═══ M13 · phrase longue lente : « Je lis votre message… » au bout de 4 s ; phrase courte : « Je regarde… » reste');
  fresh(); entryInserts = 0; replyDelay = 6000;
  await openWorker();
  workerReply = multiReply(ergunItems());
  await askWorker(ERGUN);
  await wp.waitForTimeout(1500);
  check(/Je regarde…/.test(flat(await wp.locator('.as-typing').innerText().catch(() => ''))), 'M13 avant 4 s : « Je regarde… »');
  await wp.waitForTimeout(3500);
  check(/Je lis votre message… cela peut prendre quelques secondes\./.test(flat(await wp.locator('.as-typing').innerText().catch(() => ''))), 'M13 après 4 s : « Je lis votre message… cela peut prendre quelques secondes. »');
  await waitCard();
  await wp.waitForSelector('[data-testid=multi-card]', { timeout: 10000 });
  workerReply = { kind: 'answer', answer: 'Bonjour.', remaining: 18 };
  await askWorker('Bonjour');
  await wp.waitForTimeout(5000);
  check(/Je regarde…/.test(flat(await wp.locator('.as-typing').innerText().catch(() => ''))), 'M13 phrase courte lente : « Je regarde… » reste (pas de faux message d’attente)');
  replyDelay = 0;
}

// ════════ M14 · échec : la phrase revient ════════
if (only('M14')) {
  console.log('\n═══ M14 · « L’assistant n’a pas pu répondre » : la phrase est remise dans le champ');
  fresh(); entryInserts = 0; replyDelay = 0;
  await openWorker();
  workerReply = { kind: 'answer', notice: true, answer: 'L’assistant n’a pas pu répondre. Utilisez la saisie habituelle.', remaining: 19 };
  await askWorker(ERGUN);
  await wp.waitForSelector('.as-bot.notice', { timeout: 10000 }).catch(() => {});
  await wp.waitForTimeout(300);
  check((await wp.locator('.as-bar textarea').inputValue()) === ERGUN, 'M14 la phrase longue est remise dans le champ (rien à redicter)');
  workerReply = multiReply(ergunItems());
  await wp.locator('button[aria-label="Envoyer"]').click(); await waitCard();
  check(await confirmBtn().count() === 1 && (await wp.locator('.as-bar textarea').inputValue()) === '', 'M14 renvoyée : la fiche arrive, le champ est vide');
}

// ════════ M15 · geste COURT « ajoute le chantier X à Lyon » : créé tel que dit, jamais confondu avec un chantier proche ════════
if (only('M15')) {
  console.log('\n═══ M15 · geste court « ajoute le chantier X » : nom écrit tel que dit (civilité gardée), un chantier proche d’une autre ville ne bloque pas');
  fresh(); entryInserts = 0;
  D.worksites.push({ id: 'w3', company_id: CO, client_name: 'Boulangerie Coin', city: 'Lyon 3', is_active: true });
  await openWorker();
  const cas = [['Monsieur Bricolage', 'Lyon'], ['Boulangerie du Coin', 'Lyon'], ['Villa 2', 'Lyon']];
  D.worksites.push({ id: 'w4', company_id: CO, client_name: 'Villa 1', city: 'Lyon', is_active: true });
  for (const [nom, ville] of cas) {
    workerReply = { kind: 'action', remaining: 19, answer: 'Vérifiez, puis confirmez.', chantiers: CHANTIERS, action: { draft: { type: 'nouveau_chantier', nom, ville }, problems: [] } };
    await askWorker(`ajoute le chantier ${nom} à ${ville}`);
    await wp.waitForSelector('[data-testid=worker-action-confirm]', { timeout: 10000 }).catch(() => {});
    await wp.waitForTimeout(400);
    const k = log.length;
    await wp.locator('[data-testid=worker-action-confirm]').last().click();
    await wp.waitForTimeout(1200);
    const cr = writes(k).find((x) => x.m === 'POST' && x.t === 'worksites')?.body ?? {};
    check(cr.client_name === nom && cr.city === ville && !('postal_code' in cr), `M15 « ${nom} » (${ville}) : créé tel que dit (${JSON.stringify(cr)})`);
    check(new RegExp(`Chantier « ${nom} » ajouté\\.`).test(flat(await panel().innerText())), `M15 le message dit « Chantier « ${nom} » ajouté. »`);
  }
}

// ════════ M16 · l'écran : début de la fiche visible, cibles de 44 px, créneau remis, pas de débordement ════════
if (only('M16')) {
  console.log('\n═══ M16 · écran : haut de la fiche visible (390×780), poubelle 44 px numérotée + « Remettre », 320 px sans débordement, mot très long');
  fresh(); entryInserts = 0;
  await openWorker();
  await wp.setViewportSize({ width: 390, height: 780 }); await wp.waitForTimeout(300);
  await demandeErgun();
  await wp.waitForTimeout(1500);
  const vis = await wp.evaluate(() => {
    const body = document.querySelector('.as-body').getBoundingClientRect();
    const dans = (el) => { const r = el.getBoundingClientRect(); return r.top >= body.top - 1 && r.bottom <= body.bottom + 1; };
    return { titre: dans([...document.querySelectorAll('[data-testid=multi-card] h3')].pop()), resume: dans([...document.querySelectorAll('[data-testid=wm-nouveau-resume]')].pop()) };
  });
  check(vis.titre && vis.resume, `M16 à 390×780, SANS défiler : le titre « Fiche à confirmer » et le résumé du chantier à créer sont visibles (${JSON.stringify(vis)})`);
  const box = await wp.locator('[data-testid=wm-retirer-0]').boundingBox();
  check(box.width >= 44 && box.height >= 44, `M16 la poubelle mesure ${box.width}×${box.height} (≥ 44)`);
  const labels = await wp.locator('[data-testid^=wm-retirer-]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check(labels.join('|') === 'Retirer le créneau 1|Retirer le créneau 2', `M16 libellés numérotés (${labels.join('|')})`);
  const pauses = await wp.locator('[data-testid^=wd-pause-]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check(pauses.join('|') === 'Pause (h:mm) du créneau 1|Pause (h:mm) du créneau 2', `M16 pauses numérotées, libellé visible inclus (${pauses.join('|')})`);
  check(await wp.locator('[data-testid=wm-chantier-0]').evaluate((e) => getComputedStyle(e).scrollMarginBottom) === '130px', 'M16 un champ qui prend le focus ne finit pas sous la barre « Tout confirmer » (scroll-margin)');
  // Retirer le créneau 2 par erreur : on peut le remettre.
  await wp.locator('[data-testid=wm-retirer-1]').click(); await wp.waitForTimeout(200);
  check(await wp.locator('[data-testid^=wm-line-]').count() === 1 && flat(await wp.locator('[data-testid=wm-total]').innerText()) === 'Total net : 4 h 00', 'M16 créneau 2 retiré : un seul créneau, 4 h 00');
  const rem = wp.locator('[data-testid^=wm-remettre-]');
  check(await rem.count() === 1 && /Remettre le créneau 13:00 → 17:00/.test(flat(await rem.innerText())), 'M16 « Remettre le créneau 13:00 → 17:00 » proposé');
  await rem.click(); await wp.waitForTimeout(200);
  const times = await card().locator('input[type=time]').evaluateAll((els) => els.map((e) => e.value));
  check(times.join() === '08:00,12:00,13:00,17:00' && await wp.locator('[data-testid^=wm-remettre-]').count() === 0 && flat(await wp.locator('[data-testid=wm-total]').innerText()) === 'Total net : 8 h 00', `M16 créneau remis à sa place (${times.join(' ')}), 8 h 00`);
  // 320 px : les deux champs d'heure tiennent dans la ligne.
  await wp.setViewportSize({ width: 320, height: 640 }); await wp.waitForTimeout(400);
  const deborde = await wp.evaluate(() => [...document.querySelectorAll('[data-testid^=wm-line-]')].map((l) => {
    const r = l.getBoundingClientRect(); return [...l.querySelectorAll('input[type=time]')].some((i) => i.getBoundingClientRect().right > r.right + 0.5);
  }));
  check(deborde.length === 2 && deborde.every((x) => !x), `M16 320 px : les champs d’heure ne dépassent pas du créneau (${deborde.join()})`);
  // Un mot très long (sans espace) ne fait pas défiler le panneau en horizontal.
  await wp.setViewportSize({ width: 390, height: 844 });
  await demandeErgun(multiReply(ergunItems({ ...PIERRICK, nom: 'N'.repeat(79), description: 'D'.repeat(100) })));
  await wp.waitForTimeout(500);
  const larg = await wp.evaluate(() => { const b = document.querySelector('.as-body'); return [b.scrollWidth, b.clientWidth]; });
  check(larg[0] <= larg[1] + 1, `M16 un nom sans espace de 79 caractères ne déborde pas (${larg.join('/')})`);
}

// ════════ M17 · rien ne disparaît sans un mot : créneau écarté, date illisible ════════
if (only('M17')) {
  console.log('\n═══ M17 · un créneau invalide envoyé par le serveur reste dans la fiche et BLOQUE ; une date illisible aussi, jusqu’à ce qu’on touche au champ « Jour »');
  fresh(); entryInserts = 0;
  await openWorker();
  const l1 = ligneNouveau('L1', '13:00', '17:00', { gap_before: 'pause', break_minutes: 300 });
  await demandeErgun(multiReply([{ id: 'i0', kind: 'heures', depend: [], draft: { date: today, errors: ['Pause plus longue que le créneau 13:00 → 17:00.'], lines: [ligneNouveau('L0', '08:00', '12:00'), l1], nouveau_chantier: { ...PIERRICK } } }]));
  check(await wp.locator('[data-testid^=wm-line-]').count() === 2, 'M17 les DEUX créneaux sont dans la fiche (le 2e n’est pas écarté en silence)');
  check(await confirmBtn().isDisabled() && /Pause plus longue que le créneau 13:00 → 17:00\./.test(flat(await wp.locator('[data-testid=wm-bloquants]').innerText().catch(() => ''))), 'M17 « Pause plus longue que le créneau 13:00 → 17:00. » en rouge, « Tout confirmer » grisé');
  await wp.locator('[data-testid=wd-pause-1]').fill(''); await wp.waitForTimeout(250);
  check(await confirmBtn().isEnabled(), 'M17 pause corrigée : « Tout confirmer » actif');
  // Date illisible.
  fresh(); entryInserts = 0;
  await openWorker();
  await demandeErgun(multiReply([{ id: 'i0', kind: 'heures', depend: [], draft: { date: today, errors: ['Date illisible : vérifiez le jour.'], lines: [ligneNouveau('L0', '08:00', '12:00'), ligneNouveau('L1', '13:00', '17:00', { gap_before: 'pause' })], nouveau_chantier: { ...PIERRICK } } }]));
  check(await confirmBtn().isDisabled() && /Date illisible : vérifiez le jour\./.test(flat(await wp.locator('[data-testid=wm-bloquants]').innerText().catch(() => ''))), 'M17 « Date illisible : vérifiez le jour. » affichée, bouton grisé');
  await wp.locator('[data-testid=wm-jour]').focus(); await wp.locator('[data-testid=wm-jour]').blur(); await wp.waitForTimeout(250);
  check(await confirmBtn().isEnabled() && !/Date illisible/.test(flat(await card().innerText())), 'M17 le salarié a regardé le champ « Jour » : l’alerte tombe, le bouton est actif');
  // Pas de sous-titre « Journée d'aujourd'hui » pour une demande de congé seule.
  fresh(); entryInserts = 0;
  await openWorker();
  await demandeErgun(multiReply([action('i0', { type: 'demander_conge', conge_type: 'conge', du: plusDays(today, 10), au: plusDays(today, 12), note: '' })]));
  check(await wp.locator('[data-testid=multi-card] .wm-sub').count() === 0, 'M17 congé seul : aucun sous-titre « Journée d’aujourd’hui »');
}

// ════════ M18 · après « Tout confirmer » : le focus va au résultat ; « Annuler » est annoncé ════════
if (only('M18')) {
  console.log('\n═══ M18 · focus sur la zone du résultat après le clic ; le message d’annulation est dans la zone annoncée');
  fresh(); entryInserts = 0;
  await openWorker();
  await demandeErgun();
  await confirmBtn().click(); await waitResult();
  check(await wp.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'wm-result'), 'M18 le focus est sur la zone du résultat (pas sur <body>)');
  await wp.locator('[data-testid=wm-undo]').click();
  await wp.waitForSelector('[data-testid=wm-undone]', { timeout: 8000 }).catch(() => {});
  check(await wp.evaluate(() => !!document.querySelector('[data-testid=wm-result] [data-testid=wm-undone]')), 'M18 « Annulé… » est DANS la zone aria-live (annoncé au lecteur d’écran)');
}

check(pageErrors.length === 0, `aucune erreur JavaScript dans la page (${pageErrors.join(' | ') || 'aucune'})`);
await wctx.close();

// ════════════ DÉMO : /apercu/assistant-salarie (aucune requête vers supabase.co) ════════════
{
  console.log('\n═══ D · démo /apercu/assistant-salarie : la phrase d’Ergun, IA simulée, contrôles réels, aucune requête réseau');
  const dctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  // Dictée simulée pour que le sélecteur de langue s'affiche (Chrome sait dicter).
  await dctx.addInitScript(() => { window.webkitSpeechRecognition = class { start() {} stop() {} abort() {} }; });
  await dctx.route('**/*.supabase.co/**', (r) => { supabaseHits.push(r.request().url()); return r.abort(); });
  const dp = await dctx.newPage();
  dp.on('request', (q) => { if (q.url().includes('supabase.co')) supabaseHits.push(q.url()); });
  await dp.goto(`http://localhost:${PORT}/apercu/assistant-salarie?demo=salarie`);
  await dp.waitForTimeout(1500);
  const open = dp.locator('[data-testid="assistant-open"], [aria-label="Assistant BEMEXO"]').first();
  if (await open.count()) { await open.click(); await dp.waitForTimeout(400); }
  const sugg = dp.locator('.as-sugg button', { hasText: 'store banne' });
  check(await sugg.count() === 1, 'D la phrase d’Ergun est proposée en démo');
  // Sélecteur de langue FR / TR
  check(await dp.locator('[data-testid=assistant-langs]').count() === 1, 'D le sélecteur de dictée « Français / Türkçe » est affiché');
  await dp.locator('[data-testid="assistant-lang-tr-TR"]').click(); await dp.waitForTimeout(200);
  check(await dp.locator('[data-testid="assistant-lang-tr-TR"]').getAttribute('aria-pressed') === 'true' && await dp.locator('.as-bar textarea').getAttribute('lang') === 'tr', 'D « Türkçe » choisi : aria-pressed, lang="tr" sur le champ');
  check(await dp.locator('[data-testid="assistant-lang-tr-TR"]').getAttribute('aria-label') === 'Türkçe : dicter en turc' && await dp.locator('[data-testid="assistant-lang-tr-TR"] span[lang=tr]').count() === 1,
    'D « Türkçe » : le nom accessible contient le texte visible, lang="tr" seulement sur le mot turc');
  await dp.screenshot({ path: shot('selecteur-fr-tr') });
  await dp.locator('[data-testid="assistant-lang-fr-FR"]').click(); await dp.waitForTimeout(150);
  await sugg.click();
  await dp.waitForSelector('[data-testid=multi-card]', { timeout: 10000 }).catch(() => {});
  await dp.waitForTimeout(500);
  const t = flat(await dp.locator('[data-testid=multi-card]').innerText().catch(() => ''));
  const times = await dp.locator('[data-testid=multi-card] input[type=time]').evaluateAll((els) => els.map((e) => e.value));
  check(times.join() === '08:00,12:00,13:00,17:00', `D le vrai code redécoupe 08:00-17:00 pause 60 en DEUX créneaux (${times.join(' ')})`);
  check(/Pause 1 h/.test(t) && /Total net : 8 h 00/.test(t) && /Pierrick Dupont · Montagna 01250 · pose d’un store banne/.test(t), 'D pause 1 h, total net 8 h 00, bloc Nouveau chantier');
  check(await dp.locator('[data-testid=wm-confirm]').isEnabled(), 'D « Tout confirmer » est là');
  await dp.setViewportSize({ width: 390, height: 1500 }); await dp.waitForTimeout(300);
  await dp.locator('[data-testid=assistant-panel]').screenshot({ path: shot('demo-fiche') }).catch(() => {});
  await dp.setViewportSize({ width: 390, height: 844 });
  await dp.locator('[data-testid=wm-confirm]').click();
  await dp.waitForFunction(() => /Fait :/.test(document.querySelector('[data-testid=wm-result]')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  check(/Fait : 2 créneaux enregistrés \(8 h 00\) ; chantier « Pierrick Dupont » créé\./.test(flat(await dp.locator('[data-testid=wm-result]').innerText().catch(() => ''))), 'D « Tout confirmer » en démo : fait (démo, rien n’est écrit)');
  check(supabaseHits.length === 0, `D AUCUNE requête vers supabase.co en démo (${supabaseHits.length})`);
  await dctx.close();
}

console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
