// Assistant BEMEXO, étape 2 « chat avec mémoire » : l'ÉCRAN de bout en bout (bureau ET salarié).
//
// Lancer : npm run build, puis
//   node scripts/tests/assistant-historique.mjs out docs/captures-assistant-historique 41600
//
// Vraies pages /admin et /poseur (export statique `out`), base Supabase SIMULÉE : les deux tables du chat
// (assistant_chats, assistant_chat_messages) et leurs deux fonctions SQL (assistant_chat_append, assistant_chat_clear)
// sont refaites ici en mémoire, par utilisateur. L'IA est simulée : la réponse des fonctions assistant /
// worker-assistant est fixée, et leur CORPS est relevé pour vérifier `history`. Tout le reste est le vrai code du navigateur.
//
//  H1  l'en-tête : « Nouveau chat » (+ « Historique »), l'accueil « Bonjour 👋 »
//  H2  deux tours → le serveur reçoit `history` (rien au 1er tour, puis les bons messages, 7 au plus) ; l'enregistrement
//      envoie le texte TAPÉ, le même chat d'un tour à l'autre, les liens ; « Historique » : une ligne, au bon titre
//  H3  l'historique : plus récent d'abord, « aujourd’hui » / « hier » / « il y a 3 jours », « Gardées 30 jours · visibles de vous seul »
//  H4  rouvrir une conversation (texte + liens), la CONTINUER : `history` = ses messages, le tour s'ajoute au MÊME chat
//  H5  « Nouveau chat » vide les messages, la question en attente et le chat courant (le tour suivant ouvre un autre chat)
//  H6  supprimer : confirmation en place (Non puis Oui), aucune fenêtre du navigateur ; supprimer le chat de l'écran le vide
//  H7  « Tout effacer » : confirmation en place (Non puis Oui), état vide
//  H8  l'enregistrement échoue (500 sur la fonction SQL) : l'assistant répond, rien dans la console, le tour suivant s'enregistre
//  H9  une notice (quota) n'est pas enregistrée, et ni elle ni sa question ne partent comme contexte
//  H10 historique indisponible : « Historique indisponible », l'assistant reste utilisable ; état « Chargement… »
//  M   téléphone 390 px : pas de défilement horizontal, boutons ≥ 40 px, captures
//  S   salarié (/poseur, 390 px) : `history` dans le corps de worker-assistant, « Historique », rouvrir et continuer
//  C   captures : docs/captures-assistant-historique/ (390 px et 1280 px : accueil, chat en cours, historique, suppression, vide)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const [,, OUT = 'out', SH = 'docs/captures-assistant-historique', PORT = '41600'] = process.argv;
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
const CO = 'c0000000-0000-0000-0000-000000000001';
const ADMIN = 'u-admin', SAM = 'u-sam';
const D = {
  users: [
    { id: ADMIN, company_id: CO, first_name: 'Paul', last_name: 'Martin', role: 'admin', email: 'paul@exemple.fr', is_active: true, created_at: '2026-01-01' },
    { id: SAM, company_id: CO, first_name: 'Sam', last_name: 'Test', role: 'worker', email: 'sam@exemple.fr', is_active: true, created_at: '2026-01-01' },
    { id: 'u-kevin', company_id: CO, first_name: 'Kevin', last_name: 'Roussel', role: 'worker', email: 'k@x.fr', is_active: true, created_at: '2026-01-01' },
  ],
  companies: [{ id: CO, name: 'Entreprise Exemple', ai_enabled: true, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, meal_enabled: true, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
  worksites: [{ id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true }, { id: 'w2', company_id: CO, client_name: 'Bureau Martin', city: 'Villeurbanne', is_active: true }],
};

// ── La base simulée du chat : les deux tables, par utilisateur (comme la RLS `user_id = auth.uid()`) ──
let DB, mid, lastTick, nid;
const fresh = () => { DB = { chats: [], messages: [] }; mid = 0; nid = 0; lastTick = 0; };
fresh();
const uuid = () => `00000000-0000-4000-8000-${String(++nid).padStart(12, '0')}`;
// Chaque écriture a une date strictement croissante (deux écritures dans la même milliseconde ne se départagent pas).
const stamp = () => { lastTick = Math.max(Date.now(), lastTick + 1); return new Date(lastTick).toISOString(); };
const titleOf = (t) => t.replace(/\s+/g, ' ').trim().slice(0, 60).trim() || 'Conversation';
/** Une conversation déjà là (pour l'historique, les dates relatives, la réouverture). */
const seedChat = (user, title, daysAgo, msgs) => {
  const id = uuid(); const at = new Date(Date.now() - daysAgo * 86400000).toISOString();
  DB.chats.push({ id, user_id: user, company_id: CO, side: user === ADMIN ? 'bureau' : 'salarie', title, created_at: at, updated_at: at });
  for (const m of msgs) DB.messages.push({ id: ++mid, chat_id: id, who: m.who, text: m.text, links: m.links || [], at });
  return id;
};
const msgsOf = (chatId) => DB.messages.filter((m) => m.chat_id === chatId);

// ── Ce que l'écran a envoyé, et les pannes simulées ──
const calls = { append: [], list: [], load: [], del: [], clear: 0, assistant: [], worker: [], otherWrites: [] };
let failAppend = false, failList = false, listDelay = 0;
let replyFn = (body) => ({ answer: `Réponse à : ${body.question}`, links: [], remaining: 40 });
let workerFn = (body) => ({ kind: 'answer', answer: `Réponse à : ${body.text}`, remaining: 19 });

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
const route = (session) => async (r) => {
  const req = r.request(); const u = new URL(req.url()); const m = req.method(); const me = session.user.id; const p = u.pathname;
  let body = null; try { body = req.postDataJSON(); } catch { body = null; }
  if (p.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
  if (p.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
  if (p === '/functions/v1/assistant') { calls.assistant.push(body); return r.fulfill({ json: await replyFn(body) }); }
  if (p === '/functions/v1/worker-assistant') { calls.worker.push(body); return r.fulfill({ json: await workerFn(body) }); }
  if (p.startsWith('/functions/v1/')) return r.fulfill({ json: {} });

  // ── assistant_chat_append : même règles que la fonction SQL (garde du propriétaire, titre, 2 messages, updated_at) ──
  if (p === '/rest/v1/rpc/assistant_chat_append') {
    calls.append.push({ me, body });
    if (failAppend) return r.fulfill({ status: 500, json: { message: 'panne simulée' } });
    let chat = null;
    if (body.p_chat_id) {
      chat = DB.chats.find((c) => c.id === body.p_chat_id && c.user_id === me);
      if (!chat) return r.fulfill({ status: 403, json: { code: '42501', message: 'Conversation introuvable.' } });
    } else {
      const at = stamp();
      chat = { id: uuid(), user_id: me, company_id: CO, side: me === ADMIN ? 'bureau' : 'salarie', title: titleOf(body.p_user_text), created_at: at, updated_at: at };
      DB.chats.push(chat);
    }
    const at = stamp();
    DB.messages.push({ id: ++mid, chat_id: chat.id, who: 'me', text: body.p_user_text, links: [], at }, { id: ++mid, chat_id: chat.id, who: 'bot', text: body.p_bot_text, links: body.p_links ?? [], at });
    chat.updated_at = at;
    return r.fulfill({ json: chat.id });
  }
  if (p === '/rest/v1/rpc/assistant_chat_clear') {
    calls.clear++;
    const mine = DB.chats.filter((c) => c.user_id === me).map((c) => c.id);
    DB.chats = DB.chats.filter((c) => c.user_id !== me); DB.messages = DB.messages.filter((x) => !mine.includes(x.chat_id));
    return r.fulfill({ json: mine.length });
  }
  if (p.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
  if (p === '/rest/v1/assistant_chats') {
    if (m === 'GET') {
      calls.list.push({ order: u.searchParams.get('order'), limit: u.searchParams.get('limit'), select: u.searchParams.get('select') });
      if (listDelay) await new Promise((x) => setTimeout(x, listDelay));
      if (failList) return r.fulfill({ status: 500, json: { message: 'panne simulée' } });
      const rows = DB.chats.filter((c) => c.user_id === me).sort((a, c) => (a.updated_at < c.updated_at ? 1 : a.updated_at > c.updated_at ? -1 : 0))
        .slice(0, Number(u.searchParams.get('limit') || 1000)).map(({ id, title, side, updated_at }) => ({ id, title, side, updated_at }));
      return r.fulfill({ json: rows });
    }
    if (m === 'DELETE') {
      const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
      calls.del.push(id);
      DB.chats = DB.chats.filter((c) => !(c.id === id && c.user_id === me)); DB.messages = DB.messages.filter((x) => x.chat_id !== id || DB.chats.some((c) => c.id === id));
      return r.fulfill({ status: 204, body: '' });
    }
  }
  if (p === '/rest/v1/assistant_chat_messages' && m === 'GET') {
    const id = (u.searchParams.get('chat_id') || '').replace(/^eq\./, '');
    calls.load.push({ id, order: u.searchParams.get('order') });
    const mine = DB.chats.some((c) => c.id === id && c.user_id === me);
    return r.fulfill({ json: mine ? msgsOf(id).sort((a, c) => a.id - c.id).map(({ who, text, links }) => ({ who, text, links })) : [] });
  }
  // ── le reste de l'application (planning, salariés…) : lecture seule, rien n'est écrit ──
  const t = p.replace('/rest/v1/', '');
  const rows = filt(D[t] || [], u.searchParams);
  if (m !== 'GET' && m !== 'HEAD') { calls.otherWrites.push(`${m} ${t}`); return r.fulfill({ status: 201, json: rows.length ? rows[0] : { id: 'new-1' } }); }
  if ((req.headers().accept || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
  return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
};

let ok = 0, ko = 0;
const check = (c, msg) => { if (c) { ok++; console.log('✅', msg); } else { ko++; console.log('❌', msg); } };
const same = (a, b2) => JSON.stringify(a) === JSON.stringify(b2);
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const shot = (name) => `${SH}/${name}.png`;
const until = async (f, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await new Promise((x) => setTimeout(x, 40)); } return f(); };

const pageErrors = [], consoleLines = [], dialogs = [];
const watch = (pg, label) => {
  pg.on('pageerror', (e) => { pageErrors.push(`${label}: ${e.message}`); console.log(`   [erreur page ${label}]`, e.message); });
  pg.on('console', (c) => consoleLines.push(c.text()));
  pg.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
};

// ── Ce que fait un utilisateur ──
const panel = (pg) => pg.locator('[data-testid=assistant-panel]');
const tid = (pg, id) => pg.locator(`[data-testid=${id}]`);
// Ordinateur : ✨ dans la barre (bar-assistant) ; téléphone : ✨ dans l'en-tête (m-assistant).
const openAdmin = async (pg, bouton = 'bar-assistant') => {
  await pg.goto(`http://localhost:${PORT}/admin`); await pg.waitForTimeout(2500);
  await pg.click(`[data-testid="${bouton}"]`); await pg.waitForSelector('[data-testid=assistant-panel]'); await pg.waitForTimeout(300);
};
const openWorker = async (pg) => {
  await pg.goto(`http://localhost:${PORT}/poseur`); await pg.waitForSelector('.bt-total', { timeout: 20000 }); await pg.waitForTimeout(900);
  await pg.locator('[data-testid=dock-assistant]').click(); await pg.waitForSelector('[data-testid=assistant-panel]'); await pg.waitForTimeout(400);
};
/** Pose une question et attend la réponse (la bulle) PUIS l'enregistrement du tour (qui suit l'affichage). */
const ask = async (pg, q, { saved = true } = {}) => {
  const bots = await pg.locator('.as-bot').count(); const n = calls.append.length;
  await pg.fill('.as-bar textarea', q);
  await pg.click('button[aria-label="Envoyer"]');
  await pg.waitForFunction((k) => document.querySelectorAll('.as-bot').length > k, bots, { timeout: 10000 });
  if (saved) await until(() => calls.append.length > n); else await pg.waitForTimeout(500);
  await pg.waitForTimeout(150);
};
const openHistory = async (pg) => { await tid(pg, 'assistant-history').click(); await pg.waitForSelector('[data-testid=assistant-history-view]'); await pg.waitForFunction(() => !document.querySelector('[data-testid=assistant-history-loading]'), null, { timeout: 8000 }).catch(() => {}); await pg.waitForTimeout(150); };
const rows = (pg) => tid(pg, 'assistant-history-item');
const rowTitles = async (pg) => (await pg.locator('[data-testid=assistant-history-item] .as-hname').allInnerTexts()).map(flat);
const rowDates = async (pg) => (await pg.locator('[data-testid=assistant-history-item] .as-hdate').allInnerTexts()).map(flat);
const bubbles = async (pg) => ({ me: (await pg.locator('.as-me').allInnerTexts()).map(flat), bot: (await pg.locator('.as-bot').allInnerTexts()).map(flat) });
const noHScroll = (pg) => pg.evaluate(() => {
  const pn = document.querySelector('[data-testid=assistant-panel]');
  return document.documentElement.scrollWidth <= window.innerWidth && pn.scrollWidth <= pn.clientWidth && [...pn.querySelectorAll('.as-body')].every((x) => x.scrollWidth <= x.clientWidth);
});
const bigEnough = async (loc, min = 40) => { const bb = await loc.first().boundingBox(); return !!bb && bb.width >= min && bb.height >= min ? true : `${bb ? `${Math.round(bb.width)}×${Math.round(bb.height)}` : 'absent'}`; };

// Les conversations d'un jour de travail : un chantier, une personne, puis « et pour Lucas aussi ? ».
const Q1 = 'Quels chantiers ont Karim cette semaine ?', A1 = 'Karim est sur Villa Dupont toute la semaine.';
const Q2 = 'Et pour Lucas aussi ?', A2 = 'Lucas est sur Bureau Martin jusqu’à jeudi.';
const LINK1 = { label: 'Fiche de Karim', action: 'salarie:u-karim' };
const scripted = { [Q1]: { answer: A1, links: [LINK1], remaining: 40 }, [Q2]: { answer: A2, links: [], remaining: 39 } };
replyFn = (body) => scripted[body.question] ?? { answer: `Réponse à : ${body.question}`, links: [], remaining: 38 };

// ════════════════════════ BUREAU · ordinateur 1280 × 900 ════════════════════════
const adminSession = sessionFor(ADMIN, 'paul@exemple.fr');
const dctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await dctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(adminSession)]);
await dctx.route('**/*.supabase.co/**', route(adminSession));
const p = await dctx.newPage(); watch(p, 'bureau 1280');

// ════════ H1 · l'en-tête et l'accueil ════════
console.log('\n═══ H1 · en-tête : « Nouveau chat » et « Historique » ; accueil « Bonjour 👋 »');
await openAdmin(p);
check(await tid(p, 'assistant-newchat').isVisible() && /Nouveau chat/.test(await tid(p, 'assistant-newchat').innerText()), 'H1 bouton « Nouveau chat » (icône + libellé)');
check(await tid(p, 'assistant-history').isVisible() && /Historique/.test(await tid(p, 'assistant-history').innerText()), 'H1 bouton « Historique »');
check(await panel(p).locator('button[aria-label="Fermer"]').isVisible(), 'H1 bouton « Fermer »');
check(/Bonjour 👋/.test(await p.locator('.as-hello').innerText()) && await p.locator('.as-sugg button').count() > 0, 'H1 accueil : « Bonjour 👋 » et des suggestions');
await panel(p).screenshot({ path: shot('1280-1-accueil') });

// ════════ H2 · deux tours : `history` envoyé, tours enregistrés, historique ════════
console.log('\n═══ H2 · deux tours → `history` au serveur, enregistrement, une ligne dans l’historique');
await ask(p, Q1);
check(calls.assistant.length === 1 && calls.assistant[0].question === Q1 && !('history' in calls.assistant[0]), `H2 1re demande : pas de clé « history » (${Object.keys(calls.assistant[0]).join(', ')})`);
await ask(p, Q2);
check(same(calls.assistant[1].history, [{ who: 'me', text: Q1 }, { who: 'bot', text: A1 }]), `H2 2e demande : history = la question et la réponse du 1er tour (${JSON.stringify(calls.assistant[1].history)})`);
check(calls.assistant[1].question === Q2, 'H2 la question courante reste dans `question`, pas dans `history`');
check(calls.append.length === 2 && calls.append[0].body.p_chat_id === null && calls.append[1].body.p_chat_id === DB.chats[0]?.id, `H2 1er tour : chat null (création) ; 2e tour : le chat renvoyé (${calls.append.map((c) => c.body.p_chat_id).join(' → ')})`);
check(calls.append[0].body.p_user_text === Q1 && calls.append[0].body.p_bot_text === A1 && same(calls.append[0].body.p_links, [LINK1]), 'H2 le texte tapé, la réponse et les liens sont envoyés à assistant_chat_append');
check(DB.chats.length === 1 && msgsOf(DB.chats[0].id).length === 4, `H2 un seul chat, 4 messages (${DB.chats.length} chat, ${DB.messages.length} messages)`);
await panel(p).screenshot({ path: shot('1280-2-chat') });
await openHistory(p);
check(await rows(p).count() === 1, `H2 « Historique » : UNE ligne (${await rows(p).count()})`);
check(same(await rowTitles(p), [Q1]), `H2 titre = début de la 1re question (« ${(await rowTitles(p))[0]} »)`);
check(same(await rowDates(p), ['aujourd’hui']), `H2 date relative : ${(await rowDates(p)).join(' / ')}`);
check(/Gardées 30 jours · visibles de vous seul/.test(flat(await tid(p, 'assistant-history-view').innerText())), 'H2 mention « Gardées 30 jours · visibles de vous seul »');
check(calls.list.at(-1)?.order === 'updated_at.desc' && calls.list.at(-1)?.limit === '50', `H2 lecture : triée updated_at desc, limite 50 (${calls.list.at(-1)?.order}, ${calls.list.at(-1)?.limit})`);
check(await tid(p, 'assistant-history-back').isVisible() && await p.locator('.as-bar textarea').count() === 0, 'H2 « Retour » visible ; le champ de saisie n’est pas dans la liste');
await tid(p, 'assistant-history-back').click();
const afterBack = await bubbles(p);
check(afterBack.me.length === 2 && afterBack.bot.length === 2 && await p.locator('.as-bar textarea').isVisible(), 'H2 « Retour » : la conversation est intacte (2 questions, 2 réponses)');

// 7 messages au plus : 4 tours de plus, la 5e demande ne reçoit que les 7 derniers messages
const transcript = [{ who: 'me', text: Q1 }, { who: 'bot', text: A1 }, { who: 'me', text: Q2 }, { who: 'bot', text: A2 }];
for (const q of ['Combien de salariés ?', 'Et sur Villa Dupont ?', 'Pareil demain']) {
  await ask(p, q); transcript.push({ who: 'me', text: q }, { who: 'bot', text: `Réponse à : ${q}` });
}
await ask(p, 'Merci');
check(calls.assistant.at(-1).history.length === 7 && same(calls.assistant.at(-1).history, transcript.slice(-7)), `H2 5e demande : les 7 DERNIERS messages (${calls.assistant.at(-1).history.length}, du « ${calls.assistant.at(-1).history[0].text} »)`);
check(calls.append.slice(2).every((c) => c.body.p_chat_id === DB.chats[0].id) && DB.chats.length === 1, 'H2 tous les tours vont au même chat');

// ════════ H3 · l'historique : ordre et dates relatives ════════
console.log('\n═══ H3 · plus récent d’abord, « aujourd’hui » / « hier » / « il y a 3 jours »');
const hier = seedChat(ADMIN, 'Congés de Sofia en novembre', 1, [
  { who: 'me', text: 'Congés de Sofia en novembre' },
  { who: 'bot', text: 'Sofia a posé 3 jours en novembre.', links: [{ label: 'Demandes de congés', action: 'conges' }] },
]);
seedChat(ADMIN, 'Planning de la semaine dernière pour toute l’équipe', 3, [
  { who: 'me', text: 'Planning de la semaine dernière pour toute l’équipe' }, { who: 'bot', text: 'Toute l’équipe était sur chantier.' },
]);
await openHistory(p);
check(same(await rowTitles(p), [Q1, 'Congés de Sofia en novembre', 'Planning de la semaine dernière pour toute l’équipe']), `H3 3 lignes, la plus récente d’abord (${(await rowTitles(p)).join(' | ')})`);
check(same(await rowDates(p), ['aujourd’hui', 'hier', 'il y a 3 jours']), `H3 dates : ${(await rowDates(p)).join(' | ')}`);
await panel(p).screenshot({ path: shot('1280-3-historique') });

// ════════ H4 · rouvrir une conversation, la continuer ════════
console.log('\n═══ H4 · rouvrir « Congés de Sofia » (texte + liens) puis la continuer');
const nChats = DB.chats.length;
await rows(p).nth(1).click();
await p.waitForSelector('.as-bot', { timeout: 5000 });
const reopened = await bubbles(p);
check(await tid(p, 'assistant-history-view').count() === 0, 'H4 retour au chat');
check(same(reopened.me, ['Congés de Sofia en novembre']) && same(reopened.bot, ['Sofia a posé 3 jours en novembre. Demandes de congés']), `H4 messages texte rouverts (${JSON.stringify(reopened)})`);
check(await p.locator('.as-links button', { hasText: 'Demandes de congés' }).count() === 1, 'H4 le lien « Demandes de congés » est revenu');
check(await p.locator('.ac').count() === 0, 'H4 aucune carte d’action (le texte seulement)');
const nAssistant = calls.assistant.length, nApp = calls.append.length;
await ask(p, 'Et pour Lucas aussi ?');
check(same(calls.assistant[nAssistant].history, [{ who: 'me', text: 'Congés de Sofia en novembre' }, { who: 'bot', text: 'Sofia a posé 3 jours en novembre.' }]),
  `H4 la suite part avec l’historique de la conversation rouverte (${JSON.stringify(calls.assistant[nAssistant].history)})`);
check(calls.append.length === nApp + 1 && calls.append[nApp].body.p_chat_id === hier, 'H4 le tour est ajouté au MÊME chat (identifiant rouvert)');
check(DB.chats.length === nChats && msgsOf(hier).length === 4, `H4 aucun nouveau chat (${DB.chats.length}), le chat rouvert a 4 messages (${msgsOf(hier).length})`);
await openHistory(p);
check((await rowTitles(p))[0] === 'Congés de Sofia en novembre', 'H4 la conversation continuée remonte en tête de l’historique');
await tid(p, 'assistant-history-back').click();

// ════════ H5 · « Nouveau chat » ════════
console.log('\n═══ H5 · « Nouveau chat » : messages, question en attente et chat courant vidés');
const pendingReply = {
  answer: 'Sur quel chantier ?', links: [], remaining: 37,
  action: { draft: { type: 'affecter_planning', user_id: 'u-kevin', salarie_texte: 'Kevin', worksite_id: null, chantier_texte: '', dates: [today], note: '', debut: '', fin: '' }, problems: ['Choisissez le chantier.'], summary: 'Kevin · demain', question: 'Sur quel chantier ?' },
  options: { salaries: [{ id: 'u-kevin', nom: 'Kevin Roussel' }], chantiers: [{ id: 'w1', nom: 'Villa Dupont', ville: 'Lyon' }] },
};
const DEMANDE = 'Mets Kevin sur un chantier demain';
replyFn = (body) => (body.question === DEMANDE ? pendingReply : scripted[body.question] ?? { answer: `Réponse à : ${body.question}`, links: [], remaining: 36 });
// Témoin : sans « Nouveau chat », la réponse « Villa Dupont » complète la demande en attente.
await ask(p, DEMANDE);
check(await p.locator('[data-testid=action-done]').count() === 0 && calls.otherWrites.length === 0, `H5 la question « Sur quel chantier ? » attend (rien d’écrit : ${calls.otherWrites.length} écriture)`);
await ask(p, 'Villa Dupont');
check(calls.assistant.at(-1).question === `${DEMANDE}, Villa Dupont`, `H5 témoin : sans « Nouveau chat », la réponse complète la demande en attente (« ${calls.assistant.at(-1).question} »)`);
check(calls.append.at(-1).body.p_user_text === 'Villa Dupont', `H5 mais l’enregistrement garde le texte TAPÉ : « ${calls.append.at(-1).body.p_user_text} »`);
// Même situation, avec « Nouveau chat » entre les deux.
await ask(p, DEMANDE);
const chatsBefore = DB.chats.length, chatBefore = calls.append.at(-1).body.p_chat_id;
await tid(p, 'assistant-newchat').click();
await p.waitForTimeout(200);
const vide = await bubbles(p);
check(vide.me.length === 0 && vide.bot.length === 0 && await p.locator('.ac').count() === 0, 'H5 « Nouveau chat » : plus aucun message, plus de carte');
check(/Bonjour 👋/.test(await p.locator('.as-hello').innerText()) && await p.locator('.as-sugg button').count() > 0, 'H5 retour à l’accueil « Bonjour 👋 » + suggestions');
await ask(p, 'Villa Dupont');
check(calls.assistant.at(-1).question === 'Villa Dupont', `H5 la question en attente est oubliée (« ${calls.assistant.at(-1).question} »)`);
check(!('history' in calls.assistant.at(-1)), 'H5 plus d’historique envoyé (conversation neuve)');
check(calls.append.at(-1).body.p_chat_id === null && DB.chats.length === chatsBefore + 1 && chatBefore !== null, 'H5 le tour suivant OUVRE un autre chat (identifiant courant oublié)');
// Désactivé tant qu'une réponse est en cours.
const lent = replyFn; let libere;
replyFn = (body) => new Promise((res) => { libere = () => res({ answer: 'Voilà.', links: [], remaining: 30 }); });
await p.fill('.as-bar textarea', 'Une question lente'); await p.click('button[aria-label="Envoyer"]');
await p.waitForSelector('.as-typing', { timeout: 5000 });
check(await tid(p, 'assistant-newchat').isDisabled(), 'H5 « Nouveau chat » est grisé pendant la réponse');
await until(() => !!libere); libere();
await p.waitForFunction(() => !document.querySelector('.as-typing'), null, { timeout: 8000 });
await p.waitForTimeout(400);
check(await tid(p, 'assistant-newchat').isEnabled(), 'H5 …et se réactive après');
replyFn = lent;

// ════════ H6 · supprimer une conversation (confirmation en place) ════════
console.log('\n═══ H6 · supprimer : « Supprimer ? Oui / Non » dans la ligne, aucune fenêtre du navigateur');
await openHistory(p);
const nBefore = await rows(p).count(), dbBefore = DB.chats.length;
const titreCible = (await rowTitles(p))[1];
await tid(p, 'assistant-history-delete').nth(1).click();
check(/Supprimer \?/.test(flat(await rows(p).nth(1).innerText())) && await tid(p, 'assistant-history-confirm-yes').count() === 1, 'H6 la ligne demande « Supprimer ? » avec Oui / Non');
check(calls.del.length === 0 && DB.chats.length === dbBefore, 'H6 rien n’est supprimé avant la réponse');
await panel(p).screenshot({ path: shot('1280-4-suppression') });
await tid(p, 'assistant-history-confirm-no').click();
check(await rows(p).count() === nBefore && (await rowTitles(p))[1] === titreCible && await tid(p, 'assistant-history-confirm-yes').count() === 0 && calls.del.length === 0, 'H6 « Non » : la ligne revient, rien supprimé');
await tid(p, 'assistant-history-delete').nth(1).click();
await tid(p, 'assistant-history-confirm-yes').click();
await until(() => calls.del.length === 1);
await p.waitForTimeout(250);
check(await rows(p).count() === nBefore - 1 && !(await rowTitles(p)).includes(titreCible), `H6 « Oui » : la ligne disparaît (${nBefore} → ${await rows(p).count()})`);
check(DB.chats.length === dbBefore - 1 && !DB.chats.some((c) => c.title === titreCible) && DB.messages.every((x) => DB.chats.some((c) => c.id === x.chat_id)), 'H6 la conversation et ses messages sont supprimés en base');
check(dialogs.length === 0, `H6 aucune fenêtre du navigateur (confirm/alert) : ${dialogs.length}`);
// Le chat de l'écran est supprimé : l'écran repart à blanc.
await tid(p, 'assistant-history-back').click();
await ask(p, 'Un dernier point');
const idCourant = calls.append.at(-1).body.p_chat_id;
check(!!idCourant && DB.chats.some((c) => c.id === idCourant) && (await bubbles(p)).me.length > 0, 'H6 (repère) la conversation de l’écran est un chat enregistré');
await openHistory(p);
const ligneCourante = (await rowTitles(p)).indexOf('Villa Dupont');
await tid(p, 'assistant-history-delete').nth(ligneCourante).click();
await tid(p, 'assistant-history-confirm-yes').click();
await until(() => calls.del.length === 2);
await p.waitForTimeout(250);
check(!DB.chats.some((c) => c.id === idCourant), 'H6 le chat affiché est supprimé en base');
await tid(p, 'assistant-history-back').click();
const apresSuppr = await bubbles(p);
check(apresSuppr.me.length === 0 && /Bonjour 👋/.test(await p.locator('.as-hello').innerText()), 'H6 supprimer le chat affiché vide l’écran (page blanche)');
await ask(p, 'Après suppression');
check(calls.append.at(-1).body.p_chat_id === null && !('history' in calls.assistant.at(-1)), 'H6 la suite ouvre un nouveau chat, sans historique envoyé');

// ════════ H7 · tout effacer ════════
console.log('\n═══ H7 · « Tout effacer » : confirmation en place, Non puis Oui, état vide');
await openHistory(p);
const avant = DB.chats.filter((c) => c.user_id === ADMIN).length;
check(avant > 1 && await tid(p, 'assistant-history-clear').isVisible(), `H7 « Tout effacer » visible (${avant} conversations)`);
await tid(p, 'assistant-history-clear').click();
check(await tid(p, 'assistant-history-confirm-yes').count() === 1 && /Tout effacer \?/.test(flat(await tid(p, 'assistant-history-view').innerText())), 'H7 la confirmation « Tout effacer ? Oui / Non » apparaît en place');
await tid(p, 'assistant-history-confirm-no').click();
check(calls.clear === 0 && DB.chats.filter((c) => c.user_id === ADMIN).length === avant && await tid(p, 'assistant-history-clear').isVisible(), 'H7 « Non » : rien n’est effacé');
await tid(p, 'assistant-history-clear').click();
await tid(p, 'assistant-history-confirm-yes').click();
await until(() => calls.clear === 1);
await p.waitForTimeout(250);
check(DB.chats.filter((c) => c.user_id === ADMIN).length === 0 && DB.messages.length === 0, 'H7 « Oui » : toutes les conversations et tous les messages sont supprimés');
check(/Aucune conversation pour l’instant/.test(flat(await tid(p, 'assistant-history-empty').innerText())) && await rows(p).count() === 0 && await tid(p, 'assistant-history-clear').count() === 0, 'H7 état vide : « Aucune conversation pour l’instant »');
check(dialogs.length === 0, `H7 aucune fenêtre du navigateur : ${dialogs.length}`);
await panel(p).screenshot({ path: shot('1280-5-vide') });
await tid(p, 'assistant-history-back').click();
check((await bubbles(p)).me.length === 0, 'H7 la conversation de l’écran faisait partie de l’historique effacé : page blanche');

// ════════ H8 · l'enregistrement échoue ════════
console.log('\n═══ H8 · erreur 500 sur la fonction SQL : l’assistant répond quand même, rien dans la console');
const SECRET = 'Question confidentielle QX7731';
const consoleAvant = consoleLines.length, errAvant = pageErrors.length;
failAppend = true;
const nSql = calls.append.length;
await ask(p, SECRET);
check(calls.append.length === nSql + 1 && DB.chats.length === 0, 'H8 l’appel SQL a bien échoué (rien en base)');
const bulles8 = await bubbles(p);
check(bulles8.me.includes(SECRET) && bulles8.bot.at(-1) === `Réponse à : ${SECRET}` && await p.locator('.as-bot.notice').count() === 0, 'H8 l’assistant a répondu normalement (aucune notice)');
check(pageErrors.length === errAvant, `H8 aucune erreur de page non gérée (${pageErrors.slice(errAvant).join(' | ') || 'aucune'})`);
check(!consoleLines.slice(consoleAvant).some((l) => l.includes('QX7731') || l.includes('Réponse à')), 'H8 le contenu du chat n’apparaît nulle part dans la console');
await ask(p, 'Et ensuite ?', { saved: true });
check(same(calls.assistant.at(-1).history, [{ who: 'me', text: SECRET }, { who: 'bot', text: `Réponse à : ${SECRET}` }]), 'H8 le contexte part quand même au serveur (même sans enregistrement)');
failAppend = false;
await ask(p, 'Et maintenant ?');
check(calls.append.at(-1).body.p_chat_id === null && DB.chats.length === 1 && msgsOf(DB.chats[0].id).length === 2, 'H8 enregistrement revenu : le tour suivant ouvre un chat (les tours perdus ne sont pas rejoués)');

// ════════ H9 · une notice n'est pas enregistrée ════════
console.log('\n═══ H9 · quota atteint : la notice n’est pas enregistrée, ni envoyée comme contexte');
await tid(p, 'assistant-newchat').click();
await ask(p, 'Première question');
const nMsgs = DB.messages.length, nSql9 = calls.append.length;
replyFn = () => ({ answer: 'Vous avez atteint la limite de questions pour aujourd’hui.', links: [], quota: true, remaining: 0 });
await ask(p, 'Question refusée', { saved: false });
check(await p.locator('.as-bot.notice').count() === 1, 'H9 la notice s’affiche (bulle d’avertissement)');
check(calls.append.length === nSql9 && DB.messages.length === nMsgs, `H9 aucun appel d’enregistrement pour la notice (${calls.append.length - nSql9}), base inchangée`);
replyFn = (body) => ({ answer: `Réponse à : ${body.question}`, links: [], remaining: 30 });
await ask(p, 'Troisième question');
check(same(calls.assistant.at(-1).history, [{ who: 'me', text: 'Première question' }, { who: 'bot', text: 'Réponse à : Première question' }]),
  `H9 ni la notice ni la question restée sans réponse ne partent comme contexte (${JSON.stringify(calls.assistant.at(-1).history.map((h) => h.text))})`);
check(!DB.messages.some((x) => /limite de questions|Question refusée/.test(x.text)), 'H9 aucune trace de la notice ni de la question refusée dans la base');

// ════════ H10 · historique indisponible / chargement ════════
console.log('\n═══ H10 · « Historique indisponible » ; l’assistant reste utilisable ; « Chargement… »');
failList = true; listDelay = 700;
await tid(p, 'assistant-history').click();
await p.waitForSelector('[data-testid=assistant-history-loading]', { timeout: 3000 });
check(/Chargement/.test(await tid(p, 'assistant-history-loading').innerText()), 'H10 état « Chargement… » pendant la lecture');
await p.waitForSelector('[data-testid=assistant-history-error]', { timeout: 6000 });
check(/Historique indisponible/.test(await tid(p, 'assistant-history-error').innerText()), 'H10 « Historique indisponible »');
check(pageErrors.length === errAvant, 'H10 aucune erreur de page');
await tid(p, 'assistant-history-back').click();
await ask(p, 'Ça marche encore ?');
check((await bubbles(p)).bot.at(-1) === 'Réponse à : Ça marche encore ?', 'H10 l’assistant reste utilisable');
failList = false; listDelay = 0;
await openHistory(p);
check(await rows(p).count() >= 1 && await tid(p, 'assistant-history-error').count() === 0, 'H10 la liste revient quand la lecture revient');
await tid(p, 'assistant-history-back').click();

// ════════════════════════ BUREAU · téléphone 390 × 844 ════════════════════════
console.log('\n═══ M · téléphone 390 px : pas de défilement horizontal, boutons ≥ 40 px, captures');
fresh(); calls.append.length = 0; calls.assistant.length = 0; calls.del.length = 0; calls.clear = 0; failAppend = false;
replyFn = (body) => scripted[body.question] ?? { answer: `Réponse à : ${body.question}`, links: [], remaining: 38 };
const mctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await mctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(adminSession)]);
await mctx.route('**/*.supabase.co/**', route(adminSession));
const m = await mctx.newPage(); watch(m, 'bureau 390');
await openAdmin(m, 'm-assistant');
check(await noHScroll(m), 'M accueil : pas de défilement horizontal');
for (const [id, label] of [['assistant-newchat', 'Nouveau chat'], ['assistant-history', 'Historique']]) {
  const r = await bigEnough(tid(m, id)); check(r === true, `M « ${label} » : zone ≥ 40 px (${r === true ? 'ok' : r})`);
}
{ const r = await bigEnough(panel(m).locator('button[aria-label="Fermer"]')); check(r === true, `M « Fermer » : zone ≥ 40 px (${r === true ? 'ok' : r})`); }
await panel(m).screenshot({ path: shot('390-1-accueil') });
await ask(m, Q1); await ask(m, Q2);
check(await noHScroll(m), 'M chat en cours : pas de défilement horizontal');
await panel(m).screenshot({ path: shot('390-2-chat') });
seedChat(ADMIN, 'Congés de Sofia en novembre', 1, [{ who: 'me', text: 'Congés de Sofia en novembre' }, { who: 'bot', text: 'Sofia a posé 3 jours en novembre.' }]);
seedChat(ADMIN, 'Combien d’heures supplémentaires ont été faites sur le chantier Rési', 3, [{ who: 'me', text: 'Combien d’heures supplémentaires ont été faites sur le chantier Résidence Leclerc ?' }, { who: 'bot', text: 'Environ 12 h.' }]);
await openHistory(m);
check(await noHScroll(m), 'M historique : pas de défilement horizontal (titre très long compris)');
for (const [id, label] of [['assistant-history-back', 'Retour'], ['assistant-history-delete', 'corbeille d’une ligne'], ['assistant-history-item', 'ligne (toucher pour rouvrir)'], ['assistant-history-clear', 'Tout effacer']]) {
  const r = await bigEnough(tid(m, id)); check(r === true, `M historique « ${label} » : zone ≥ 40 px (${r === true ? 'ok' : r})`);
}
{ const r = await bigEnough(m.locator('.as-hopen')); check(r === true, `M zone tactile de la ligne ≥ 40 px (${r === true ? 'ok' : r})`); }
await panel(m).screenshot({ path: shot('390-3-historique') });
await tid(m, 'assistant-history-delete').nth(0).click();
check(await noHScroll(m), 'M confirmation de suppression : pas de défilement horizontal');
for (const [id, label] of [['assistant-history-confirm-yes', 'Oui'], ['assistant-history-confirm-no', 'Non']]) {
  const r = await bigEnough(tid(m, id)); check(r === true, `M confirmation « ${label} » : zone ≥ 40 px (${r === true ? 'ok' : r})`);
}
await panel(m).screenshot({ path: shot('390-4-suppression') });
await tid(m, 'assistant-history-confirm-no').click();
await tid(m, 'assistant-history-clear').click();
check(await noHScroll(m), 'M « Tout effacer ? » : pas de défilement horizontal');
{ const r = await bigEnough(tid(m, 'assistant-history-confirm-yes')); check(r === true, `M « Tout effacer ? Oui » : zone ≥ 40 px (${r === true ? 'ok' : r})`); }
await tid(m, 'assistant-history-confirm-yes').click();
await until(() => calls.clear === 1); await m.waitForTimeout(250);
check(await tid(m, 'assistant-history-empty').isVisible() && await noHScroll(m), 'M état vide : visible, pas de défilement horizontal');
await panel(m).screenshot({ path: shot('390-5-vide') });
await tid(m, 'assistant-history-back').click();

// ════════════════════════ SALARIÉ · /poseur 390 × 844 ════════════════════════
console.log('\n═══ S · salarié (/poseur) : `history` dans le corps de worker-assistant, historique, rouvrir et continuer');
fresh(); calls.append.length = 0; calls.worker.length = 0;
const samSession = sessionFor(SAM, 'sam@exemple.fr');
const wctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await wctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(samSession)]);
await wctx.route('**/*.supabase.co/**', route(samSession));
const w = await wctx.newPage(); watch(w, 'salarié 390');
await openWorker(w);
check(await tid(w, 'assistant-newchat').isVisible() && await tid(w, 'assistant-history').isVisible(), 'S « Nouveau chat » et « Historique » présents côté salarié');
{ const r1 = await bigEnough(tid(w, 'assistant-newchat')), r2 = await bigEnough(tid(w, 'assistant-history')), r3 = await bigEnough(panel(w).locator('button[aria-label="Fermer"]'));
  check(r1 === true && r2 === true && r3 === true, `S boutons de l’en-tête ≥ 40 px (${[r1, r2, r3].map((x) => (x === true ? 'ok' : x)).join(', ')})`); }
check(await noHScroll(w), 'S accueil : pas de défilement horizontal');
await ask(w, 'Ce matin 7h30-12h Villa Dupont');
check(calls.worker.length === 1 && calls.worker[0].text === 'Ce matin 7h30-12h Villa Dupont' && calls.worker[0].multi === true && !('history' in calls.worker[0]), `S 1re demande : text + multi, sans « history » (${Object.keys(calls.worker[0]).join(', ')})`);
await ask(w, 'Et l’après-midi pareil ?');
check(same(calls.worker[1].history, [{ who: 'me', text: 'Ce matin 7h30-12h Villa Dupont' }, { who: 'bot', text: 'Réponse à : Ce matin 7h30-12h Villa Dupont' }]) && calls.worker[1].multi === true, `S 2e demande : history = le tour précédent (${JSON.stringify(calls.worker[1].history)})`);
check(calls.append.length === 2 && calls.append[0].body.p_chat_id === null && calls.append[1].body.p_chat_id === DB.chats[0]?.id && DB.chats[0].side === 'salarie', 'S les tours sont enregistrés dans le même chat (côté salarié)');
await openHistory(w);
check(same(await rowTitles(w), ['Ce matin 7h30-12h Villa Dupont']) && await noHScroll(w), 'S « Historique » : une ligne au bon titre, pas de défilement horizontal');
await w.screenshot({ path: shot('390-salarie-historique') });
await rows(w).first().click();
await w.waitForSelector('.as-bot', { timeout: 5000 });
check(same((await bubbles(w)).me, ['Ce matin 7h30-12h Villa Dupont', 'Et l’après-midi pareil ?']), 'S la conversation rouverte montre les 2 questions');
await ask(w, 'Merci');
check(calls.worker.at(-1).history.length === 4 && calls.append.at(-1).body.p_chat_id === DB.chats[0].id && DB.chats.length === 1, 'S continuée : 4 messages envoyés, tour ajouté au même chat');
await tid(w, 'assistant-newchat').click();
check((await bubbles(w)).me.length === 0, 'S « Nouveau chat » côté salarié : écran vide');

// ── Bilan ──
check(pageErrors.length === 0, `aucune erreur de page sur tout le parcours (${pageErrors.length})`);
check(dialogs.length === 0, `aucune fenêtre du navigateur sur tout le parcours (${dialogs.length})`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
