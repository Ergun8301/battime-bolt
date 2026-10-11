// Lot 1 — « HEURES SÛRES » : aucune heure perdue, confirmation avant toute suppression.
//
// Lancer : npm run build, puis
//   node scripts/tests/heures-sures.mjs out docs/captures-heures-sures 41400
// « Avant » (sur un build du code d'origine) : AVANT=1 node scripts/tests/heures-sures.mjs <out-origine> docs/captures-heures-sures 41450
//   → les vérifications deviennent des constats (ℹ), les captures sont préfixées « avant- ».
//
// Vraies pages /poseur et /admin (export statique), base Supabase SIMULÉE avec état
// (aucune vraie base, aucun e-mail, noms fictifs). L'IA est simulée : la réponse du
// serveur est fixée, tout le reste (cartes, exécution, annulation) est le vrai code.
//
//  S1  « J'ai fini » puis « Annuler », borne active : la base refuse de recréer le chrono →
//      la ligne d'heures RESTE (avant : elle était effacée, chrono non rétabli).
//  S2  « Annuler » sans borne : le chrono repart D'ABORD, la ligne part ENSUITE.
//  S3  chrono recréé mais la ligne ne part pas (verrouillée entre-temps) : retour à l'état
//      sûr — chrono retiré, ligne gardée, jamais d'heures comptées deux fois.
//  S4  salarié « efface la ligne de … » : carte (lignes, durée, jour), rien avant « Effacer » ;
//      les heures effacées sont écrites au journal ; « Annuler » les remet.
//  S5  bureau « corrige les heures de … » : motif OBLIGATOIRE, office_correct_entry (comme la fiche).
//  S6  devis joint : le montant du devis est AFFICHÉ, jamais enregistré comme budget.
//  S7  « planning de la semaine » appliqué : « Annuler » retire les cases ajoutées.
//  S8  bureau « supprime le document … » : carte, « Garder » → rien d'écrit.
// Relecture :
//  S3b la ligne ne part pas ET le chrono relancé ne peut pas être retiré : on dit de prévenir le bureau.
//  S3c le retrait de la ligne passe en base mais la réponse se perd : la ligne est relue, le chrono reste.
//  S9  « changer ma demande de congé » : envoi refusé → l'ancienne reste ; réponse perdue → pas de demande en moins.
//  S10 « copier ma journée » puis retouche d'une copie, puis « Annuler » : la copie retouchée est gardée.
//  S11 heures dictées puis retouchées, puis « Annuler » : la ligne retouchée est gardée.
//  S12 « efface mes heures d'avant-hier » : la carte lit la base (lignes, total, ce qui reste), et seules
//      les lignes montrées partent.
//  S13 bureau : placer 2 jours, des heures notées sur l'un, « Modifier » → rien en double ; « Annuler »
//      quand tout porte des heures → « Rien n'a été retiré ».
//  S14 bureau « effacer la semaine » : seules les cases montrées partent ; une case aux heures retirées est annoncée.
//  S15 planning « Présent » : seule l'absence en cours part (fenêtre d'abord), le congé posé plus tard reste.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const [,, OUT = 'out', SH = 'docs/captures-heures-sures', PORT = '41400'] = process.argv;
const AVANT = process.env.AVANT === '1';
const PREFIX = AVANT ? 'avant-' : 'apres-';
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
const parisHHmm = (iso) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const CO = 'c0000000-0000-0000-0000-000000000001';
const ME = 'u-sam';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Bureau Martin', city: 'Villeurbanne', is_active: true };
const entry = (id, ws, s, e, extra = {}) => ({
  id, company_id: CO, user_id: ME, worksite_id: ws.id, planning_id: null, work_date: today, start_time: `${s}:00`, end_time: `${e}:00`,
  break_minutes: 0, meal_allowance: false, status: 'draft', locked: false, submitted_at: null, exported_at: null,
  observation: null, reception: null, gap_before: null, created_at: new Date().toISOString(), worksite: ws, ...extra,
});

// ── La base simulée (remise à zéro à chaque scénario) ──
let D;
const fresh = () => {
  D = {
    users: [
      { id: 'u-admin', company_id: CO, first_name: 'Paul', last_name: 'Martin', role: 'admin', email: 'paul@exemple.fr', is_active: true, created_at: '2026-01-01' },
      { id: ME, company_id: CO, first_name: 'Sam', last_name: 'Test', role: 'worker', email: 'sam@exemple.fr', is_active: true, created_at: '2026-01-01' },
      { id: 'u-lou', company_id: CO, first_name: 'Lou', last_name: 'Test', role: 'worker', email: 'lou@exemple.fr', is_active: true, created_at: '2026-01-01' },
    ],
    companies: [{ id: CO, name: 'Entreprise Exemple', ai_enabled: true, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, meal_enabled: true, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
    worksites: [W1, W2], planning: [], time_entries: [], active_sessions: [], month_closures: [], leave_requests: [], invitations: [],
    documents: [], certifications: [], push_subscriptions: [], time_entry_corrections: [], time_entry_edits: [], time_entry_positions: [], assistant_journal: [],
  };
};
fresh();
let kioskActive = false; // la base refuse de recréer un chrono (garde du lot 12)
let lockEntries = false; // la base refuse d'effacer une ligne (verrouillée entre-temps)
let refuseStop = false;  // la base refuse de retirer un chrono
let loseDeleteOf = null; // cette table : l'effacement PASSE en base, mais la réponse se perd (une fois)
let refuseRpc = null;    // cette fonction serveur répond une erreur
let workerReply = null, officeReply = null;
const log = [];
// Écritures en base (les RPC de lecture de l'écran, comme ensure_other_worksite, n'en sont pas).
const writes = (n) => log.slice(n).filter((x) => x.m !== 'GET' && x.m !== 'HEAD' && !(x.m === 'RPC' && x.t !== 'office_correct_entry'));

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
  let body = null; try { body = req.postDataJSON(); } catch { body = null; }
  if (u.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
  if (u.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
  if (u.pathname.startsWith('/functions/v1/worker-assistant')) return r.fulfill({ json: workerReply || { kind: 'answer', answer: '…', remaining: 20 } });
  if (u.pathname.startsWith('/functions/v1/assistant')) return r.fulfill({ json: officeReply || { answer: '…', links: [], remaining: 40 } });
  if (u.pathname.startsWith('/functions/v1/')) { log.push({ m: 'FN', t: u.pathname }); return r.fulfill({ json: { sent: 0 } }); }
  const t = u.pathname.replace('/rest/v1/', '');
  if (u.pathname === '/rest/v1/rpc/finish_active_session') {
    const s = D.active_sessions[0];
    D.active_sessions = [];
    const e = entry('e-fini', W1, parisHHmm(s.started_at), parisHHmm(new Date().toISOString()));
    D.time_entries.push(e);
    log.push({ m: 'RPC', t: 'finish_active_session' });
    return r.fulfill({ json: [{ entry_id: e.id, work_date: today, start_time: e.start_time, end_time: e.end_time, cancelled: false }] });
  }
  if (u.pathname === '/rest/v1/rpc/office_correct_entry') {
    log.push({ m: 'RPC', t: 'office_correct_entry', body });
    const e = D.time_entries.find((x) => x.id === body.p_entry_id);
    const old = { start_time: e.start_time.slice(0, 5), end_time: e.end_time.slice(0, 5) };
    Object.assign(e, body.p_changes);
    const ed = { id: 'ed1', entry_id: e.id, work_date: e.work_date, kind: 'correction', reason: body.p_reason, edited_by: 'u-admin', edited_at: new Date().toISOString(),
      old_values: old, new_values: { start_time: e.start_time.slice(0, 5), end_time: e.end_time.slice(0, 5) }, correction_id: null, notified_at: null, notify_error: null };
    D.time_entry_edits.push(ed);
    return r.fulfill({ json: [ed] });
  }
  if (u.pathname === '/rest/v1/rpc/request_leave') {
    log.push({ m: 'RPC', t: 'request_leave', body });
    if (refuseRpc === 'request_leave') return r.fulfill({ status: 400, json: { code: 'P0001', message: 'Demande refusée : chevauche une autre absence', details: null, hint: null } });
    D.leave_requests.push({ id: `lr-${++nid}`, company_id: CO, user_id: ME, type: body.p_type, start_date: body.p_start_date, end_date: body.p_end_date, note: body.p_note, status: 'pending', created_at: new Date(Date.now() + nid).toISOString() });
    return r.fulfill({ json: null });
  }
  if (u.pathname.startsWith('/rest/v1/rpc/')) { log.push({ m: 'RPC', t: t.slice(4), body }); return r.fulfill({ json: [] }); }
  D[t] = D[t] || [];
  if (m === 'GET' || m === 'HEAD') {
    const rows = filt(D[t], u.searchParams);
    if ((req.headers().accept || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  }
  if (m === 'DELETE') {
    if (t === 'active_sessions' && refuseStop) { log.push({ m: 'DELETE-REFUS', t }); return r.fulfill({ status: 400, json: { code: 'P0001', message: 'refusé', details: null, hint: null } }); }
    const gone = t === 'time_entries' && lockEntries ? [] : filt(D[t], u.searchParams);
    D[t] = D[t].filter((x) => !gone.includes(x));
    log.push({ m, t, ids: gone.map((x) => x.id), q: u.search });
    if (loseDeleteOf === t) { loseDeleteOf = null; log.push({ m: 'REPONSE-PERDUE', t }); return r.abort('failed'); }
    return r.fulfill({ json: gone });
  }
  if (m === 'PATCH') {
    const hit = filt(D[t], u.searchParams);
    for (const x of hit) Object.assign(x, body);
    log.push({ m, t, ids: hit.map((x) => x.id), body });
    return r.fulfill({ json: hit });
  }
  // POST (insert / upsert)
  if (t === 'active_sessions' && kioskActive) {
    log.push({ m: 'POST-REFUS', t });
    return r.fulfill({ status: 400, json: { code: 'P0001', message: 'active_sessions: avec la tablette, la journée commence en scannant le QR', details: null, hint: null } });
  }
  const arr = (Array.isArray(body) ? body : [body]).map((x) => ({ id: `${t}-${++nid}`, ...x }));
  for (const row of arr) { const i = D[t].findIndex((x) => x.id === row.id); if (i >= 0) D[t][i] = row; else D[t].push(row); }
  log.push({ m, t, rows: arr });
  if ((req.headers().accept || '').includes('vnd.pgrst.object')) return r.fulfill({ status: 201, json: arr[0] });
  return r.fulfill({ status: 201, json: arr });
};

let ok = 0, ko = 0; const notes = [];
const check = (c, msg) => {
  if (AVANT) { notes.push(`${c ? 'oui' : 'non'} — ${msg}`); console.log(`  ℹ ${c ? 'oui' : 'non'} — ${msg}`); return; }
  if (c) { ok++; console.log('✅', msg); } else { ko++; console.log('❌', msg); }
};
const shot = (name) => `${SH}/${PREFIX}${name}.png`;

// ════════════════════════ SALARIÉ (téléphone 390 × 844) ════════════════════════
const wctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const ws = sessionFor(ME, 'sam@exemple.fr');
await wctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(ws)]);
await wctx.route('**/*.supabase.co/**', route(ws));
const wp = await wctx.newPage();
wp.on('pageerror', (e) => console.log('   [erreur page salarié]', e.message));
const openWorker = async () => { await wp.goto(`http://localhost:${PORT}/poseur`); await wp.waitForSelector('.bt-total', { timeout: 20000 }); await wp.waitForTimeout(900); };
const askWorker = async (text) => {
  await wp.locator('[data-testid=dock-assistant]').click(); await wp.waitForTimeout(500);
  await wp.locator('.as-bar textarea').fill(text);
  await wp.locator('button[aria-label="Envoyer"]').click();
};
const panel = (pg) => pg.locator('[data-testid=assistant-panel]');

const finishScenario = async (code, label, opts) => {
  console.log(`\n═══ ${code} · ${label}`);
  fresh(); kioskActive = opts.kiosk; lockEntries = false; refuseStop = false; loseDeleteOf = null;
  // Chrono ouvert AUJOURD'HUI (Paris) : 2 h plus tôt, ou juste après minuit si on lance le test la nuit.
  const [hh, mm] = parisHHmm(new Date().toISOString()).split(':').map(Number);
  const back = Math.max(1, Math.min(120, hh * 60 + mm - 1));
  const started = new Date(Date.now() - back * 60000).toISOString();
  D.active_sessions = [{ user_id: ME, company_id: CO, worksite_id: 'w1', planning_id: null, work_date: today, started_at: started, source: opts.kiosk ? 'qr' : null }];
  workerReply = { kind: 'action', answer: 'C’est fait.', remaining: 20, chantiers: [{ id: 'w1', nom: 'Villa Dupont', ville: 'Lyon' }, { id: 'w2', nom: 'Bureau Martin', ville: 'Villeurbanne' }],
    action: { draft: { type: 'terminer_pointage', chantier: 'Villa Dupont', depuis: started, fin: '', worksite_id: 'w1' }, problems: [] } };
  await openWorker();
  await askWorker('J’ai fini');
  await wp.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  check(D.time_entries.length === 1 && D.active_sessions.length === 0, `${code} « J’ai fini » : une ligne d’heures, plus de chrono`);
  const line = JSON.stringify(D.time_entries[0]);
  if (opts.lock) lockEntries = true;
  if (opts.refuseStop) refuseStop = true;
  if (opts.lose) loseDeleteOf = 'time_entries';
  const n = log.length;
  await wp.locator('[data-testid=action-undo]').click();
  await wp.waitForSelector('[data-testid=action-undone], .ad-e', { timeout: 10000 }).catch(() => {});
  await wp.waitForTimeout(400);
  const w = writes(n);
  const err = (await wp.locator('.ad-e').last().innerText().catch(() => '')).trim();
  const undone = (await wp.locator('[data-testid=action-undone]').last().innerText().catch(() => '')).trim();
  console.log('   écritures :', w.map((x) => `${x.m} ${x.t}`).join(' → '), '·', err || undone);
  await panel(wp).screenshot({ path: shot(opts.shot) }).catch(() => {});
  return { w, err, undone, line, started };
};

{ // S1 — borne active
  const { w, err, line } = await finishScenario('S1', '« Annuler » après « J’ai fini », borne active', { kiosk: true, shot: 'annuler-fin-borne-active' });
  check(D.time_entries.length === 1 && JSON.stringify(D.time_entries[0]) === line, `S1 la ligne d’heures est GARDÉE, intacte (${D.time_entries.length} ligne)`);
  check(!w.some((x) => x.m === 'DELETE' && x.t === 'time_entries'), 'S1 aucune suppression de ligne d’heures');
  const iPost = w.findIndex((x) => x.t === 'active_sessions');
  check(iPost === 0, `S1 le chrono est tenté D’ABORD (${w.map((x) => `${x.m} ${x.t}`).join(' → ')})`);
  check(/La journée reste terminée/.test(err) && /Ma journée/.test(err), `S1 message simple : « ${err} »`);
}
{ // S2 — sans borne
  const { w, undone, started } = await finishScenario('S2', '« Annuler » après « J’ai fini », sans borne', { kiosk: false, shot: 'annuler-fin-sans-borne' });
  const iPost = w.findIndex((x) => x.m === 'POST' && x.t === 'active_sessions');
  const iDel = w.findIndex((x) => x.m === 'DELETE' && x.t === 'time_entries');
  check(iPost >= 0 && iDel > iPost, `S2 le chrono repart D’ABORD, la ligne part ENSUITE (${w.map((x) => `${x.m} ${x.t}`).join(' → ')})`);
  check(D.time_entries.length === 0 && D.active_sessions.length === 1 && D.active_sessions[0].started_at === started, 'S2 base : chrono rétabli à l’heure d’origine, ligne retirée');
  check(/comme avant/.test(undone), `S2 « ${undone} »`);
}
{ // S3 — la ligne ne part pas après recréation
  const { w, err } = await finishScenario('S3', 'chrono recréé, mais la ligne ne part pas', { kiosk: false, lock: true, shot: 'annuler-fin-ligne-verrouillee' });
  check(D.time_entries.length === 1 && D.active_sessions.length === 0, `S3 retour à l’état sûr : ligne gardée, chrono retiré (${D.time_entries.length} ligne, ${D.active_sessions.length} chrono)`);
  check(w.filter((x) => x.t === 'active_sessions').map((x) => x.m).join() === 'POST,DELETE', `S3 chrono recréé puis retiré : jamais compté deux fois (${w.map((x) => `${x.m} ${x.t}`).join(' → ')})`);
  check(/La journée reste terminée/.test(err), `S3 message : « ${err} »`);
}
if (!AVANT) { // S3b — et le chrono relancé ne peut pas être retiré
  const { err } = await finishScenario('S3b', 'ligne qui ne part pas, chrono relancé impossible à retirer', { kiosk: false, lock: true, refuseStop: true, shot: 'annuler-fin-chrono-a-arreter' });
  check(D.time_entries.length === 1, 'S3b la ligne d’heures est gardée');
  check(!/La journée reste terminée/.test(err) && /prévenez le bureau/.test(err) && /deux fois/.test(err), `S3b on ne rassure pas à tort, on dit de faire arrêter le chrono : « ${err} »`);
}
if (!AVANT) { // S3c — retrait de la ligne passé en base, réponse perdue
  const { undone, err, started } = await finishScenario('S3c', 'la ligne part en base, mais la réponse se perd', { kiosk: false, lose: true, shot: 'annuler-fin-reponse-perdue' });
  check(D.time_entries.length === 0 && D.active_sessions.length === 1 && D.active_sessions[0].started_at === started, `S3c rien de perdu : la ligne est partie, le chrono qui porte les heures RESTE (${D.time_entries.length} ligne, ${D.active_sessions.length} chrono)`);
  check(/chrono est reparti/.test(undone) && !err, `S3c message juste : « ${undone || err} »`);
}
{ // S4 — effacer une ligne : carte d'abord
  console.log('\n═══ S4 · salarié « efface la ligne de Villa Dupont » : carte, puis « Effacer », puis « Annuler »');
  fresh(); kioskActive = false; lockEntries = false;
  D.time_entries = [entry('e1', W1, '07:30', '12:00'), entry('e2', W2, '13:00', '16:30')];
  const choix = [{ id: 'e1', chantier: 'Villa Dupont', debut: '07:30', fin: '12:00', envoyee: false }, { id: 'e2', chantier: 'Bureau Martin', debut: '13:00', fin: '16:30', envoyee: false }];
  workerReply = { kind: 'action', answer: 'Vérifiez ce qui sera effacé, puis confirmez : rien ne part avant.', remaining: 20, chantiers: [{ id: 'w1', nom: 'Villa Dupont', ville: 'Lyon' }],
    action: { draft: { type: 'effacer_heures', date: today, entry_id: 'e1', tout: false, choix }, problems: [] } };
  await openWorker();
  const n = log.length;
  await askWorker('efface la ligne de villa dupont');
  await wp.waitForSelector('[data-testid=worker-action-card], [data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  await wp.waitForTimeout(800);
  const notice = (await wp.locator('[data-testid=removal-notice]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/Villa Dupont · 07:30–12:00 \(4 h 30\)/.test(notice) && /Les heures déjà envoyées restent/.test(notice), `S4 la carte dit ce qui part : « ${notice.slice(0, 110)} »`);
  check(!writes(n).some((x) => x.m === 'DELETE') && D.time_entries.length === 2, 'S4 rien n’est effacé avant « Effacer »');
  await panel(wp).screenshot({ path: shot('salarie-effacer-confirmation') }).catch(() => {});
  if (!AVANT) {
    await wp.locator('[data-testid=worker-action-confirm]').click();
    await wp.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
    check(D.time_entries.length === 1 && D.time_entries[0].id === 'e2', 'S4 après « Effacer » : seule la ligne choisie est partie');
    const j = log.find((x) => x.m === 'RPC' && x.t === 'assistant_journal_log' && x.body?.p_action === 'effacer_heures');
    check(!!j && /Villa Dupont 07:30–12:00/.test(j.body.p_summary), `S4 journal : les heures effacées sont tracées (« ${j?.body?.p_summary ?? ''} »)`);
    await wp.locator('[data-testid=action-undo]').click();
    await wp.waitForSelector('[data-testid=action-undone]', { timeout: 10000 }).catch(() => {});
    check(D.time_entries.length === 2 && D.time_entries.some((x) => x.id === 'e1' && x.start_time === '07:30:00'), 'S4 « Annuler » : la ligne revient à l’identique');
  }
}

const plusDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const CHANTIERS = [{ id: 'w1', nom: 'Villa Dupont', ville: 'Lyon' }, { id: 'w2', nom: 'Bureau Martin', ville: 'Villeurbanne' }];
const workerAction = (draft, answer = 'Vérifiez, puis confirmez.') => ({ kind: 'action', answer, remaining: 20, chantiers: CHANTIERS, action: { draft, problems: [] } });
const L1 = plusDays(today, 20), L2 = plusDays(today, 24), L3 = plusDays(today, 25);
const leaveScenario = async (code, label, opts) => {
  console.log(`\n═══ ${code} · ${label}`);
  fresh(); refuseRpc = opts.refuse ? 'request_leave' : null; loseDeleteOf = opts.lose ? 'leave_requests' : null;
  D.leave_requests = [{ id: 'l1', company_id: CO, user_id: ME, type: 'conge', start_date: L1, end_date: L2, note: null, status: 'pending', created_at: '2026-10-01T08:00:00Z' }];
  workerReply = workerAction({ type: 'modifier_conge', leave_id: 'l1', choix: [{ id: 'l1', type: 'conge', du: L1, au: L2 }], du: L1, au: L3 }, 'Vérifiez ce qui sera remplacé, puis confirmez : rien ne change avant.');
  await openWorker();
  await askWorker('change mon congé, je reviens un jour plus tard');
  await wp.waitForSelector('[data-testid=worker-action-confirm]', { timeout: 10000 }).catch(() => {});
  await wp.waitForTimeout(500);
  const before = (await panel(wp).innerText()).replace(/\s+/g, ' ');
  await wp.locator('[data-testid=worker-action-confirm]').last().click();
  await wp.waitForSelector('[data-testid=action-done], .wa-p', { timeout: 10000 }).catch(() => {});
  await wp.waitForTimeout(500);
  return { before, after: (await panel(wp).innerText()).replace(/\s+/g, ' ') };
};
if (!AVANT) { // S9a — nouvelle demande refusée : l'ancienne reste
  const { before, after } = await leaveScenario('S9a', '« changer ma demande », envoi refusé', { refuse: true });
  check(/Vérifiez ce qui sera remplacé/.test(before) && /Ce qui sera remplacé/i.test(before) && !/ce qui sera effacé/.test(before), 'S9a la carte dit « remplacé », pas « effacé »');
  check(D.leave_requests.length === 1 && D.leave_requests[0].id === 'l1' && !log.some((x) => x.m === 'DELETE' && x.t === 'leave_requests'), `S9a l’ancienne demande RESTE, rien n’est retiré (${D.leave_requests.map((x) => x.id).join(',')})`);
  check(/chevauche/.test(after), 'S9a le refus est dit');
}
if (!AVANT) { // S9b — l'ancienne part en base, réponse perdue : jamais aucune demande
  await leaveScenario('S9b', '« changer ma demande », retrait de l’ancienne passé mais réponse perdue', { lose: true });
  check(D.leave_requests.length === 1 && D.leave_requests[0].start_date === L1 && D.leave_requests[0].end_date === L3, `S9b la nouvelle demande est GARDÉE (avant : retirée aussi, plus aucune demande) — ${D.leave_requests.map((x) => `${x.start_date}→${x.end_date}`).join(',') || 'aucune'}`);
  // « Annuler » : l'ancienne revient AVANT que la nouvelle parte ; nouvelle déjà traitée → c'est dit.
  D.leave_requests[0].status = 'approved';
  await wp.locator('[data-testid=action-undo]').last().click();
  await wp.waitForSelector('[data-testid=action-undone], .ad-e', { timeout: 10000 }).catch(() => {});
  const said = (await wp.locator('[data-testid=action-undone]').last().innerText().catch(() => '')).trim();
  check(D.leave_requests.length === 2 && /n’a pas pu être retirée/.test(said), `S9b « Annuler » quand la nouvelle est déjà traitée : l’ancienne est renvoyée et c’est dit (« ${said} »)`);
}
refuseRpc = null; loseDeleteOf = null;
if (!AVANT) { // S10 — copier puis retoucher, puis « Annuler »
  console.log('\n═══ S10 · « copie ma journée d’hier », une copie retouchée, puis « Annuler »');
  fresh();
  D.time_entries = [entry('y1', W1, '07:30', '12:00', { work_date: yesterday, status: 'submitted', submitted_at: `${yesterday}T17:00:00Z` }), entry('y2', W2, '13:00', '16:30', { work_date: yesterday, status: 'submitted', submitted_at: `${yesterday}T17:00:00Z` })];
  workerReply = workerAction({ type: 'copier_journee', depuis: yesterday, vers: [today] }, 'C’est fait.');
  await openWorker();
  await askWorker('copie ma journée d’hier');
  await wp.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  const copies = D.time_entries.filter((x) => x.work_date === today);
  check(copies.length === 2, `S10 2 lignes copiées (${copies.length})`);
  copies.find((x) => x.start_time.startsWith('13:00')).end_time = '17:00:00'; // retouchée dans « Ma journée »
  await wp.locator('[data-testid=action-undo]').last().click();
  await wp.waitForSelector('[data-testid=action-undone], .ad-e', { timeout: 10000 }).catch(() => {});
  const said = (await wp.locator('[data-testid=action-undone]').last().innerText().catch(() => '')).trim();
  const left = D.time_entries.filter((x) => x.work_date === today);
  check(left.length === 1 && left[0].end_time === '17:00:00', `S10 la copie retouchée est GARDÉE, l’autre retirée (${left.map((x) => `${x.start_time}-${x.end_time}`).join(',')})`);
  check(/Annulé en partie/.test(said) && /1 gardée/.test(said), `S10 c’est dit : « ${said} »`);
}
if (!AVANT) { // S11 — heures dictées, retouchées, puis « Annuler »
  console.log('\n═══ S11 · heures dictées, une ligne retouchée dans « Ma journée », puis « Annuler »');
  fresh();
  workerReply = { kind: 'draft', remaining: 20, answer: 'Vérifiez, puis enregistrez.', chantiers: CHANTIERS,
    draft: { date: today, errors: [], lines: [{ worksite_id: 'w1', worksite_text: 'Villa Dupont', start: '07:30', end: '12:00', break_minutes: 0 }, { worksite_id: 'w2', worksite_text: 'Bureau Martin', start: '13:00', end: '16:30', break_minutes: 0 }] } };
  await openWorker();
  await askWorker('ce matin 7h30 12h villa dupont, après-midi 13h 16h30 bureau martin');
  await wp.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  check(D.time_entries.length === 2, `S11 2 lignes notées (${D.time_entries.length})`);
  D.time_entries.find((x) => x.worksite_id === 'w1').start_time = '07:00:00'; // retouchée depuis
  await wp.locator('[data-testid=action-undo]').last().click();
  await wp.waitForSelector('[data-testid=action-undone], .ad-e', { timeout: 10000 }).catch(() => {});
  const said = (await wp.locator('[data-testid=action-undone]').last().innerText().catch(() => '')).trim();
  check(D.time_entries.length === 1 && D.time_entries[0].start_time === '07:00:00', `S11 la ligne retouchée est GARDÉE (avant : effacée) — ${D.time_entries.map((x) => `${x.start_time}-${x.end_time}`).join(',')}`);
  check(/Annulé en partie/.test(said) && /1 ligne gardée/.test(said), `S11 c’est dit : « ${said} »`);
}
if (!AVANT) { // S12 — effacer les heures d'avant-hier : la carte lit la base
  console.log('\n═══ S12 · « efface mes heures d’avant-hier » : chiffres lus en base, seules les lignes montrées partent');
  fresh();
  const d2 = plusDays(today, -2);
  D.time_entries = [
    entry('a1', W1, '07:30', '12:00', { work_date: d2 }),
    entry('a2', W2, '13:00', '16:30', { work_date: d2, submitted_at: `${d2}T17:00:00Z` }), // renvoyée par le bureau
  ];
  workerReply = workerAction({ type: 'effacer_heures', date: d2, entry_id: null, tout: true, choix: [] }, 'Vérifiez ce qui sera effacé, puis confirmez : rien ne part avant.');
  await openWorker();
  const n = log.length;
  await askWorker('efface mes heures d’avant-hier');
  await wp.waitForFunction(() => /au total/.test(document.querySelector('[data-testid=removal-notice]')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  const notice = (await wp.locator('[data-testid=removal-notice]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/Villa Dupont · 07:30–12:00 \(4 h 30\)/.test(notice) && /1 ligne, 4 h 30 au total/.test(notice), `S12 la carte dit quelles lignes, combien d’heures (« ${notice.slice(0, 120)} »)`);
  check(/1 ligne envoyée \(ou renvoyée par le bureau\) reste/.test(notice) && !/Bureau Martin/.test(notice), 'S12 la ligne renvoyée par le bureau n’est pas annoncée comme effacée, et c’est dit qu’elle reste');
  check(!writes(n).some((x) => x.m === 'DELETE'), 'S12 rien n’est effacé avant « Effacer »');
  await panel(wp).screenshot({ path: shot('salarie-effacer-autre-jour') }).catch(() => {});
  D.time_entries.push(entry('a3', W2, '17:00', '18:00', { work_date: d2 })); // ajoutée entre-temps (autre appareil)
  await wp.locator('[data-testid=worker-action-confirm]').last().click();
  await wp.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  check(D.time_entries.map((x) => x.id).sort().join() === 'a2,a3', `S12 seule la ligne montrée est partie (restent ${D.time_entries.map((x) => x.id).sort().join(',')})`);
}
await wctx.close();

// ════════════════════════ BUREAU (1280 × 900) ════════════════════════
const octx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const os = sessionFor('u-admin', 'paul@exemple.fr');
await octx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(os)]);
await octx.route('**/*.supabase.co/**', route(os));
const op = await octx.newPage();
op.on('pageerror', (e) => console.log('   [erreur page bureau]', e.message));
const OPTIONS = { salaries: [{ id: ME, nom: 'Sam Test' }, { id: 'u-lou', nom: 'Lou Test' }], chantiers: [{ id: 'w1', nom: 'Villa Dupont', ville: 'Lyon' }, { id: 'w2', nom: 'Bureau Martin', ville: 'Villeurbanne' }] };
const openOffice = async () => { await op.goto(`http://localhost:${PORT}/admin`); await op.waitForTimeout(2500); await op.click('[data-testid="bar-assistant"]'); await op.waitForTimeout(400); };
const askOffice = async (text, action) => {
  officeReply = { answer: '', links: [], remaining: 40, action: { ...action, summary: '', question: null }, options: OPTIONS };
  await op.fill('.as-bar textarea', text);
  await op.click('button[aria-label="Envoyer"]');
  await op.waitForSelector('[data-testid=action-card], [data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  await op.waitForTimeout(600);
};

{ // S5 — correction avec motif
  console.log('\n═══ S5 · bureau « corrige les heures de Sam d’hier » : motif obligatoire');
  fresh();
  D.time_entries = [entry('t1', W1, '07:30', '17:00', { work_date: yesterday, status: 'submitted', submitted_at: `${yesterday}T17:00:00Z` })];
  await openOffice();
  const n = log.length;
  await askOffice('Corrige les heures de Sam hier : 7h30 16h', {
    draft: { type: 'corriger_pointage', user_id: ME, salarie_texte: 'Sam', date: yesterday, entry_id: 't1', debut: '07:30', fin: '16:00', choix: [{ id: 't1', chantier: 'Villa Dupont', debut: '07:30', fin: '17:00' }], motif: '' },
    problems: ['Indiquez un motif (3 caractères au moins) : le salarié le lit.'],
  });
  const btn = op.locator('[data-testid=action-confirm]').last();
  check(await op.locator('[data-testid=correction-motif]').count() === 1, 'S5 la carte demande le motif');
  check(await btn.isDisabled(), 'S5 sans motif : « Corriger et prévenir » est grisé');
  await panel(op).screenshot({ path: shot('bureau-correction-motif') }).catch(() => {});
  if (!AVANT) {
    await op.locator('[data-testid=correction-motif]').fill('Oubli de pause');
    check(!(await btn.isDisabled()), 'S5 motif saisi : le bouton s’active');
    await btn.click();
    await op.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
    const rpc = log.slice(n).find((x) => x.t === 'office_correct_entry');
    check(!!rpc && rpc.body.p_reason === 'Oubli de pause' && JSON.stringify(rpc.body.p_changes) === '{"end_time":"16:00"}', `S5 office_correct_entry, avec le motif et la seule fin changée (${JSON.stringify(rpc?.body ?? {})})`);
    check(!log.slice(n).some((x) => x.t === 'correct_time_entry'), 'S5 jamais l’ancien chemin sans motif (correct_time_entry)');
    check(D.time_entry_edits.length === 1 && D.time_entries[0].end_time === '16:00', 'S5 heures corrigées et tracées (avant / après, motif)');
  }
}
{ // S6 — devis : montant affiché, jamais un budget
  console.log('\n═══ S6 · devis joint : « montant du devis » affiché, jamais enregistré comme budget');
  fresh();
  await openOffice();
  const n = log.length;
  await askOffice('nouveau client, voilà son devis', {
    draft: { type: 'creer_chantier', nom_client: 'Maison Garnier', ville: 'Caluire', adresse: '12 rue des Lilas', telephone: '', email: '', description: '', budget_heures: '160', montant_devis: '18400' },
    problems: [],
  });
  const amount = (await op.locator('[data-testid=devis-amount]').innerText().catch(() => '')).replace(/\s/g, ' ');
  check(/18.400 €/.test(amount), `S6 la carte affiche le montant du devis : « ${amount} »`);
  await panel(op).screenshot({ path: shot('bureau-devis-montant') }).catch(() => {});
  if (!AVANT) {
    await op.locator('[data-testid=action-confirm]').last().click();
    await op.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
    const budget = writes(n).find((x) => x.m === 'PATCH' && x.t === 'worksites');
    check(!!budget && budget.body.budget_hours === 160 && budget.body.budget_amount === null, `S6 seules les heures deviennent un budget (${JSON.stringify(budget?.body ?? {})})`);
    check(!JSON.stringify(writes(n)).includes('18400'), 'S6 le montant du devis n’est écrit nulle part');
  }
}
{ // S7 — planning de la semaine : « Annuler »
  console.log('\n═══ S7 · « planning de la semaine » appliqué, puis « Annuler »');
  fresh();
  await openOffice();
  const mon = new Date(); mon.setUTCDate(mon.getUTCDate() + ((8 - mon.getUTCDay()) % 7 || 7)); const d0 = mon.toISOString().slice(0, 10);
  await askOffice('Fais le planning de la semaine prochaine', {
    draft: { type: 'planning_semaine', semaine_du: d0, lignes: [{ user_id: ME, date: d0, worksite_id: 'w1' }, { user_id: 'u-lou', date: d0, worksite_id: 'w2' }], notes: [] },
    problems: [],
  });
  const n = log.length;
  await op.locator('[data-testid=action-confirm]').last().click();
  await op.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  check(D.planning.length === 2, `S7 2 cases ajoutées (${D.planning.length})`);
  check(await op.locator('[data-testid=action-undo]').count() === 1, 'S7 « Annuler » proposé après « Appliquer »');
  if (!AVANT) {
    await op.locator('[data-testid=action-undo]').last().click();
    await op.waitForSelector('[data-testid=action-undone]', { timeout: 10000 }).catch(() => {});
    const undone = (await op.locator('[data-testid=action-undone]').last().innerText().catch(() => '')).trim();
    check(D.planning.length === 0 && /2 cases retirées/.test(undone), `S7 « Annuler » : les 2 cases ajoutées sont retirées (« ${undone} »)`);
    check(writes(n).filter((x) => x.m === 'DELETE' && x.t === 'planning').flatMap((x) => x.ids).length === 2, 'S7 seulement les cases de cette action');
  }
}
{ // S8 — supprimer un document : carte, « Garder »
  console.log('\n═══ S8 · bureau « supprime la facture » : carte, puis « Garder »');
  fresh();
  D.documents = [{ id: 'd1', company_id: CO, worksite_id: 'w1', label: 'Facture Plomberie', file_name: 'facture.pdf', file_path: 'c/w1/facture.pdf', category: 'facture', uploaded_by: 'u-admin', created_at: `${today}T08:00:00Z` }];
  await openOffice();
  const n = log.length;
  await askOffice('supprime la facture de villa dupont', {
    draft: { type: 'supprimer_document', worksite_id: 'w1', chantier_texte: 'Villa Dupont', document_id: 'd1', choix: [{ id: 'd1', nom: 'Facture Plomberie', chantier: 'Villa Dupont', categorie: 'facture', date: today }] },
    problems: [],
  });
  const notice = (await op.locator('[data-testid=removal-notice]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/« Facture Plomberie » · Villa Dupont/.test(notice) && /Rien n’est fait avant « Supprimer »/.test(notice), `S8 la carte dit ce qui part : « ${notice.slice(0, 100)} »`);
  check(writes(n).filter((x) => x.t !== 'assistant_journal').length === 0 && D.documents.length === 1, 'S8 rien n’est supprimé avant le clic');
  await panel(op).screenshot({ path: shot('bureau-supprimer-document') }).catch(() => {});
  if (!AVANT) {
    await op.getByRole('button', { name: 'Garder', exact: true }).last().click(); await op.waitForTimeout(500);
    check(D.documents.length === 1 && writes(n).length === 0 && /rien n’a été fait/.test(await panel(op).innerText()), 'S8 « Garder » : rien d’écrit, et c’est dit');
  }
}
const mon0 = (() => { const t = new Date(`${today}T12:00:00Z`); const k = (t.getUTCDay() + 6) % 7; return new Date(t.getTime() - k * 86400000).toISOString().slice(0, 10); })();
const nextMon = new Date(Date.parse(`${mon0}T12:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
const plus = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const slot = (id, uid, date, ws, extra = {}) => ({ id, company_id: CO, user_id: uid, worksite_id: ws?.id ?? null, work_date: date, absence_type: null, estimated_start: null, estimated_end: null, notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: `${date}T06:00:00Z`, ...extra });
if (!AVANT) { // S13 — placer, des heures notées sur une case, puis « Modifier » / « Annuler »
  console.log('\n═══ S13 · bureau : placer Sam 2 jours, des heures notées sur l’un, puis « Modifier »');
  fresh();
  await openOffice();
  const place = { type: 'affecter_planning', user_id: ME, salarie_texte: 'Sam', worksite_id: 'w1', chantier_texte: 'Villa Dupont', dates: [nextMon, plus(nextMon, 1)], note: '', debut: '', fin: '' };
  await askOffice('Mets Sam sur Villa Dupont lundi et mardi prochains', { draft: place, problems: [] });
  await op.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  check(D.planning.length === 2, `S13 2 cases placées (${D.planning.length})`);
  const p0 = D.planning.find((x) => x.work_date === nextMon);
  D.time_entries.push(entry('h1', W1, '08:00', '12:00', { work_date: nextMon, planning_id: p0.id })); // notées depuis par Sam
  await op.locator('[data-testid=action-edit]').last().click(); await op.waitForTimeout(400);
  const n = log.length;
  await op.locator('[data-testid=action-confirm]').last().click();
  await op.waitForSelector('[data-testid=action-undone]', { timeout: 10000 }).catch(() => {});
  const said = (await op.locator('[data-testid=action-undone]').last().innerText().catch(() => '')).trim();
  check(D.planning.length === 1 && D.planning[0].id === p0.id && !writes(n).some((x) => x.m === 'POST' && x.t === 'planning'),
    `S13 « Modifier » : la case aux heures reste, l’action n’est PAS refaite — rien en double (${D.planning.length} case)`);
  check(/Annulé en partie/.test(said) && /La modification n’est pas faite/.test(said), `S13 c’est dit : « ${said} »`);
  // Tout porte des heures : « Annuler » ne prétend pas avoir annulé.
  fresh();
  await openOffice();
  await askOffice('Mets Sam sur Villa Dupont lundi et mardi prochains', { draft: place, problems: [] });
  await op.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  for (const x of D.planning) D.time_entries.push(entry(`h-${x.id}`, W1, '08:00', '12:00', { work_date: x.work_date, planning_id: x.id }));
  await op.locator('[data-testid=action-undo]').last().click();
  await op.waitForSelector('.ad-e', { timeout: 10000 }).catch(() => {});
  const e = (await op.locator('.ad-e').last().innerText().catch(() => '')).trim();
  check(D.planning.length === 2 && /Rien n’a été retiré/.test(e) && await op.locator('[data-testid=action-undone]').count() === 0, `S13 « Annuler » quand tout porte des heures : « ${e} »`);
}
if (!AVANT) { // S14 — effacer la semaine : seules les cases montrées partent
  console.log('\n═══ S14 · bureau « efface le planning de Sam la semaine prochaine » : seules les cases montrées partent');
  fresh();
  D.planning = [slot('s1', ME, nextMon, W1), slot('s2', ME, plus(nextMon, 1), W1), slot('s3', ME, plus(nextMon, 2), W2)];
  D.time_entries = [entry('r1', W2, '08:00', '10:00', { work_date: plus(nextMon, 2), planning_id: 's3', status: 'cancelled' })]; // retirée par Sam
  await openOffice();
  const n = log.length;
  await askOffice('Efface le planning de Sam la semaine prochaine', { draft: { type: 'effacer_planning', user_id: ME, salarie_texte: 'Sam', du: nextMon, au: plus(nextMon, 6) }, problems: [] });
  await op.waitForFunction(() => /cases retirées/.test(document.querySelector('[data-testid=removal-notice]')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  const notice = (await op.locator('[data-testid=removal-notice]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/3 cases retirées/.test(notice) && /Une case porte des heures retirées par le salarié : ces heures restent dans sa fiche/.test(notice), `S14 la carte annonce aussi la case aux heures retirées (« ${notice.slice(0, 160)} »)`);
  check(!writes(n).some((x) => x.m === 'DELETE' || x.m === 'PATCH'), 'S14 rien n’est écrit avant « Effacer »');
  await panel(op).screenshot({ path: shot('bureau-effacer-heures-retirees') }).catch(() => {});
  D.planning.push(slot('s4', ME, plus(nextMon, 3), W1)); // ajoutée entre-temps par un collègue
  await op.locator('[data-testid=action-confirm]').last().click();
  await op.waitForSelector('[data-testid=action-done]', { timeout: 10000 }).catch(() => {});
  check(D.planning.map((x) => x.id).join() === 's4' && D.time_entries[0].planning_id === null, `S14 les 3 cases montrées partent, pas celle ajoutée depuis ; les heures retirées restent (détachées) — reste ${D.planning.map((x) => x.id).join(',')}`);
}

if (!AVANT) { // S15 — planning « Présent » : seule l'absence en cours
  console.log('\n═══ S15 · planning : « Présent » à partir d’aujourd’hui, un congé posé plus tard');
  fresh();
  const abs = (id, date, type) => slot(id, ME, date, null, { absence_type: type });
  D.planning = [abs('i0', today, 'intemperie'), abs('i1', plus(today, 1), 'intemperie'), abs('i2', plus(today, 2), 'intemperie'),
    abs('c0', plus(today, 60), 'conge'), abs('c1', plus(today, 61), 'conge'), abs('c2', plus(today, 62), 'conge')];
  await op.goto(`http://localhost:${PORT}/admin`);
  await op.waitForSelector('.bt-pl-gridwrap .bt-pl-abs', { timeout: 20000 }).catch(() => {}); await op.waitForTimeout(1200);
  const dayIdx = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const row = op.locator('tr', { has: op.locator('.bt-pl-name', { hasText: 'Sam Test' }) }).first();
  await row.locator('td.bt-pl-cell').nth(dayIdx).locator('.bt-pl-abs').click();
  await op.waitForSelector('[role=dialog] >> text=Statut de Sam', { timeout: 8000 }).catch(() => {});
  const n = log.length;
  await op.locator('[role=dialog]').last().locator('button', { hasText: 'Présent' }).click();
  await op.waitForSelector('[data-testid=erase-ask]', { timeout: 8000 }).catch(() => {});
  const ask = (await op.locator('[data-testid=erase-ask]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/Retirer 3 jours d’absence \?/.test(ask) && /reste\./.test(ask), `S15 « Retirer ? » d’abord : les 3 jours de l’absence en cours, le congé posé plus tard reste (« ${ask.slice(0, 160)} »)`);
  check(!writes(n).some((x) => x.m === 'DELETE'), 'S15 rien n’est retiré avant le clic');
  await op.waitForTimeout(300); await op.screenshot({ path: shot('planning-present-confirmation') }).catch(() => {});
  await op.click('[data-testid=erase-confirm]');
  await op.waitForSelector('[data-testid=undo-card]', { timeout: 8000 }).catch(() => {});
  check(D.planning.map((x) => x.id).sort().join() === 'c0,c1,c2', `S15 seule l’absence en cours part ; le congé de plus tard reste (avant : tout effacé) — reste ${D.planning.map((x) => x.id).sort().join(',')}`);
  await op.locator('[data-testid=undo-card] [data-testid=action-undo]').click();
  await op.waitForSelector('[data-testid=undo-card] [data-testid=action-undone]', { timeout: 8000 }).catch(() => {});
  check(D.planning.length === 6, `S15 « Annuler » remet l’absence (${D.planning.length} jours)`);
}
await octx.close();

if (AVANT) { fs.writeFileSync(`${SH}/avant-constats.txt`, `${notes.join('\n')}\n`); console.log(`\nConstats « avant » écrits dans ${SH}/avant-constats.txt`); }
else console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(!AVANT && ko ? 1 : 0);
