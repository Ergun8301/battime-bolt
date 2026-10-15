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
//  D   démo /apercu/assistant-salarie : l'historique reste en mémoire (memoryChatStore), aucune requête vers supabase.co
//  R1  une carte ÉCRIT (« Je le fais… ») : « Nouveau chat », rouvrir et supprimer le chat affiché sont refusés, la carte montre son résultat ;
//      une fiche pas encore confirmée : « Abandonner cette action ? » (Garder / Abandonner), pour « Nouveau chat » et pour rouvrir une conversation
//  R2  course au chargement : « Retour » puis une question pendant la lecture d'une ancienne conversation → l'écran ne bascule PAS sur l'ancien chat
//  R3  supprimer le chat affiché pendant qu'une réponse arrive → l'écran ne reste pas bloqué ; délai maximal d'une demande (60 s, bureau ET salarié)
//  R4  le chat courant a disparu (supprimé ailleurs) ou est plein (54000) → le tour va dans un NOUVEAU chat, une ligne discrète le dit, une seule fois
//  R5  clavier : le focus ne retombe jamais sur le haut de la page (confirmation → « Non », Oui → ligne suivante, rouvrir → champ de saisie), « Conversation supprimée » annoncée
//  C   captures : docs/captures-assistant-historique/ (390 px et 1280 px : accueil, chat en cours, historique, suppression, vide, action en cours, abandon, ligne discrète)
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
let loadDelay = 0;            // lenteur de la LECTURE d'une conversation (ms)
let writeDelay = 0;           // lenteur des écritures métier (planning…) : une carte qui écrit reste « Je le fais… »
const fullChats = new Set();  // chats « pleins » (200 messages) : la fonction SQL répond 54000
const sleep = (ms) => new Promise((x) => setTimeout(x, ms));
const resetCalls = () => { calls.append.length = 0; calls.list.length = 0; calls.load.length = 0; calls.del.length = 0; calls.clear = 0; calls.assistant.length = 0; calls.worker.length = 0; calls.otherWrites.length = 0; };
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
    if (body.p_chat_id && fullChats.has(body.p_chat_id)) return r.fulfill({ status: 400, json: { code: '54000', message: 'Cette conversation est pleine (200 messages au plus) : ouvrez un nouveau chat.' } });
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
    if (loadDelay) await sleep(loadDelay);
    const mine = DB.chats.some((c) => c.id === id && c.user_id === me);
    return r.fulfill({ json: mine ? msgsOf(id).sort((a, c) => a.id - c.id).map(({ who, text, links }) => ({ who, text, links })) : [] });
  }
  // ── le reste de l'application (planning, salariés…) : lecture seule, rien n'est écrit ──
  const t = p.replace('/rest/v1/', '');
  const rows = filt(D[t] || [], u.searchParams);
  if (m !== 'GET' && m !== 'HEAD') { calls.otherWrites.push(`${m} ${t}`); if (writeDelay) await sleep(writeDelay); return r.fulfill({ status: 201, json: rows.length ? rows[0] : { id: 'new-1' } }); }
  if ((req.headers().accept || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
  return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
};

let ok = 0, ko = 0;
const check = (c, msg) => { if (c) { ok++; console.log('✅', msg); } else { ko++; console.log('❌', msg); } };
// Un scénario qui échoue (délai d'attente, élément absent) est compté comme un ❌ et n'empêche pas les suivants de tourner.
const section = async (name, fn) => {
  try { await fn(); } catch (e) { ko++; console.log(`❌ ${name} : le scénario n’a pas pu aller au bout (${String(e.message).split('\n')[0]})`); } finally { writeDelay = 0; loadDelay = 0; }
};
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

// ════════════════════════ REVUE · les garde-fous de l'écran (R1 à R5) ════════════════════════
// Chaque section prend une page neuve (la conversation vit en mémoire de la page) et une base neuve.
const normalReply = (body) => scripted[body.question] ?? { answer: `Réponse à : ${body.question}`, links: [], remaining: 38 };
/** Réponses fixées par question (objet, ou fonction éventuellement lente) ; toute autre question reçoit « Réponse à : … ». */
const special = {};
const replyWithSpecial = async (body) => { const sp = special[body.question]; return sp ? (typeof sp === 'function' ? await sp(body) : sp) : normalReply(body); };
replyFn = replyWithSpecial;
/** Où est le focus : le data-testid de l'élément, sinon son aria-label (« open » pour la zone d'une ligne), avec @rang dans la liste. BODY = retombé en haut de la page. */
const where = async (pg) => {
  await pg.waitForTimeout(90); // le focus est rendu après le dessin (setTimeout 0)
  return pg.evaluate(() => {
    const a = document.activeElement; if (!a) return null;
    const li = a.closest('[data-testid=assistant-history-item]');
    const idx = li ? [...document.querySelectorAll('[data-testid=assistant-history-item]')].indexOf(li) : -1;
    const id = a.getAttribute('data-testid') || (a.classList.contains('as-hopen') ? 'open' : a.getAttribute('aria-label')) || a.tagName;
    return idx >= 0 ? `${id}@${idx}` : id;
  });
};
const reset = () => { fresh(); resetCalls(); failAppend = false; failList = false; listDelay = 0; loadDelay = 0; writeDelay = 0; fullChats.clear(); for (const k of Object.keys(special)) delete special[k]; };
const DIRECT = {
  answer: 'Je mets Kevin sur Villa Dupont.', links: [], remaining: 30,
  action: { draft: { type: 'affecter_planning', user_id: 'u-kevin', salarie_texte: 'Kevin', worksite_id: 'w1', chantier_texte: 'Villa Dupont', dates: [today], note: '', debut: '', fin: '' }, problems: [], summary: 'Kevin · Villa Dupont', question: null },
  options: pendingReply.options,
};
// Une fiche qui attend « Confirmer » (clôturer le mois : jamais faite d'office).
const CLOTURE = {
  answer: 'Je prépare la clôture.', links: [], remaining: 29,
  action: { draft: { type: 'cloturer_mois', mois: today.slice(0, 7) }, problems: [], summary: 'Clôturer le mois', question: null },
  options: pendingReply.options,
};

// ════════ R1 · une carte écrit : rien ne vide l'écran avant son résultat ════════
await section('R1', async () => {
  console.log('\n═══ R1 · une carte écrit (« Je le fais… ») : « Nouveau chat », rouvrir et supprimer le chat affiché sont refusés');
  reset();
  special['Mets Kevin sur Villa Dupont aujourd’hui'] = DIRECT;
  special['Clôture le mois'] = CLOTURE;
  seedChat(ADMIN, 'Un autre chat', 2, [{ who: 'me', text: 'Un autre chat' }, { who: 'bot', text: 'Autre réponse.' }]);
  const q = await dctx.newPage(); watch(q, 'bureau 1280 (R1)');
  await openAdmin(q);
  writeDelay = 2500;
  await ask(q, 'Mets Kevin sur Villa Dupont aujourd’hui');
  check(/Je le fais/.test(flat(await panel(q).innerText())), 'R1 la carte écrit : « Je le fais… » à l’écran');
  check(await tid(q, 'assistant-newchat').isDisabled(), 'R1 « Nouveau chat » est grisé pendant que la carte écrit');
  await panel(q).screenshot({ path: shot('1280-6-action-en-cours') });
  await tid(q, 'assistant-newchat').click({ force: true, timeout: 2000 }).catch(() => {});
  check((await bubbles(q)).me.length === 1 && /Je le fais/.test(flat(await panel(q).innerText())), 'R1 un clic forcé sur « Nouveau chat » ne vide pas l’écran');
  await openHistory(q);
  check(same(await rowTitles(q), ['Mets Kevin sur Villa Dupont aujourd’hui', 'Un autre chat']), `R1 historique : le chat de l’écran est enregistré (${(await rowTitles(q)).join(' | ')})`);
  check(await q.locator('.as-hopen').nth(1).isDisabled(), 'R1 historique : une autre conversation ne s’ouvre pas pendant l’écriture');
  check(await tid(q, 'assistant-history-delete').nth(0).isDisabled() && await tid(q, 'assistant-history-delete').nth(1).isEnabled(), 'R1 historique : le chat de l’écran ne se supprime pas (les autres, si)');
  check(await tid(q, 'assistant-history-clear').isDisabled(), 'R1 historique : « Tout effacer » non plus');
  check(await tid(q, 'assistant-history-verrou').isVisible(), 'R1 historique : une ligne dit pourquoi');
  await panel(q).screenshot({ path: shot('1280-6b-historique-verrou') });
  await tid(q, 'assistant-history-back').click();
  await q.waitForSelector('[data-testid=action-done]', { timeout: 9000 });
  check(/Fait/.test(flat(await tid(q, 'action-done').innerText())) && await tid(q, 'action-undo').isVisible(), 'R1 la carte a montré son résultat : « Fait » + Annuler (jamais perdue)');
  check(calls.otherWrites.includes('POST planning'), `R1 l’écriture est partie une fois (${calls.otherWrites.filter((x) => x === 'POST planning').length} × POST planning)`);
  check(await tid(q, 'assistant-newchat').isEnabled(), 'R1 « Nouveau chat » est de nouveau actif dès que la carte a fini');
  writeDelay = 0;

  console.log('\n═══ R1 · une fiche pas encore confirmée : « Abandonner cette action ? »');
  await tid(q, 'assistant-newchat').click();
  check(await tid(q, 'assistant-abandon').count() === 0 && /Bonjour 👋/.test(await q.locator('.as-hello').innerText()), 'R1 sans fiche en attente (la carte est faite), « Nouveau chat » vide tout de suite');
  await ask(q, 'Clôture le mois');
  check(await q.locator('[data-testid=action-card]').count() === 1 && await tid(q, 'action-confirm').isEnabled(), 'R1 une fiche à confirmer est à l’écran');
  const wFiche = calls.otherWrites.length;
  await tid(q, 'assistant-newchat').click();
  await q.waitForSelector('[data-testid=assistant-abandon]', { timeout: 3000 });
  check(/Abandonner cette action \?/.test(flat(await tid(q, 'assistant-abandon').innerText())), 'R1 « Nouveau chat » demande « Abandonner cette action ? »');
  check(await where(q) === 'assistant-abandon-no', 'R1 le focus est sur « Garder » (le choix sûr)');
  check(await q.locator('[data-testid=action-card]').count() === 1 && (await bubbles(q)).me.length === 1, 'R1 la fiche est toujours à l’écran tant qu’on n’a pas répondu');
  await panel(q).screenshot({ path: shot('1280-7-abandon') });
  await q.keyboard.press('Escape');
  check(await tid(q, 'assistant-abandon').count() === 0 && await q.locator('[data-testid=action-card]').count() === 1 && await where(q) === 'assistant-newchat', 'R1 Échap = « Garder » : la fiche reste, le focus revient sur « Nouveau chat »');
  await tid(q, 'assistant-newchat').click();
  await tid(q, 'assistant-abandon-no').click();
  check(await tid(q, 'assistant-abandon').count() === 0 && await q.locator('[data-testid=action-card]').count() === 1, 'R1 « Garder » : la fiche reste');
  await tid(q, 'assistant-newchat').click();
  await tid(q, 'assistant-abandon-yes').click();
  await q.waitForTimeout(200);
  check((await bubbles(q)).me.length === 0 && await q.locator('[data-testid=action-card]').count() === 0 && /Bonjour 👋/.test(await q.locator('.as-hello').innerText()) && await tid(q, 'assistant-abandon').count() === 0, 'R1 « Abandonner » : page blanche, plus de fiche');
  check(calls.otherWrites.length === wFiche, `R1 abandonner n’écrit rien (${calls.otherWrites.length - wFiche} écriture)`);

  console.log('\n═══ R1 · rouvrir une conversation (ou supprimer celle de l’écran) alors qu’une fiche attend');
  await ask(q, 'Clôture le mois');
  await openHistory(q);
  const iAutre = (await rowTitles(q)).indexOf('Un autre chat');
  const nLoad1 = calls.load.length;
  await rows(q).nth(iAutre).locator('.as-hopen').click();
  check(/Abandonner l’action en attente \?/.test(flat(await rows(q).nth(iAutre).innerText())), 'R1 rouvrir : la ligne demande d’abord « Abandonner l’action en attente ? »');
  check(await where(q) === `assistant-history-confirm-no@${iAutre}` && calls.load.length === nLoad1, 'R1 rouvrir : focus sur « Garder », rien n’est encore lu');
  await tid(q, 'assistant-history-confirm-no').click();
  check(await tid(q, 'assistant-history-confirm-no').count() === 0 && await where(q) === `open@${iAutre}` && await tid(q, 'assistant-history-view').count() === 1, 'R1 « Garder » : on reste dans l’historique, focus rendu à la ligne');
  await tid(q, 'assistant-history-delete').nth(0).click();
  check(/L’action en attente à l’écran sera abandonnée/.test(flat(await rows(q).nth(0).innerText())), 'R1 supprimer le chat de l’écran : la confirmation prévient que la fiche sera abandonnée');
  await tid(q, 'assistant-history-confirm-no').click();
  await rows(q).nth(iAutre).locator('.as-hopen').click();
  await tid(q, 'assistant-history-confirm-yes').click();
  await q.waitForFunction(() => [...document.querySelectorAll('.as-bot')].some((x) => x.textContent.includes('Autre réponse.')), null, { timeout: 5000 });
  check(same((await bubbles(q)).me, ['Un autre chat']) && await q.locator('[data-testid=action-card]').count() === 0, 'R1 « Abandonner » : la conversation s’ouvre, la fiche est partie');
});

// ════════ R2 · « Retour » pendant la lecture d'une ancienne conversation ════════
await section('R2', async () => {
  console.log('\n═══ R2 · « Retour » + une question pendant la lecture : l’ancienne conversation ne remplace pas l’écran');
  reset();
  const vieux = seedChat(ADMIN, 'Vieux chat', 5, [{ who: 'me', text: 'Ancienne question' }, { who: 'bot', text: 'Ancienne réponse' }]);
  const r2 = await dctx.newPage(); watch(r2, 'bureau 1280 (R2)');
  await openAdmin(r2);
  loadDelay = 2500;
  await openHistory(r2);
  await rows(r2).first().locator('.as-hopen').click();
  await until(() => calls.load.length === 1);
  await r2.waitForTimeout(200);
  await tid(r2, 'assistant-history-back').click();
  await ask(r2, 'Ma question pendant le chargement');
  check(same((await bubbles(r2)).me, ['Ma question pendant le chargement']), 'R2 la question posée pendant la lecture est à l’écran, avec sa réponse');
  await r2.waitForTimeout(3000); // la lecture se termine
  const b2 = await bubbles(r2);
  check(same(b2.me, ['Ma question pendant le chargement']) && same(b2.bot, ['Réponse à : Ma question pendant le chargement']) && !JSON.stringify(b2).includes('Ancienne'),
    `R2 …et y reste quand la lecture se termine (${JSON.stringify(b2)})`);
  check(await tid(r2, 'assistant-history-view').count() === 0, 'R2 l’historique n’est pas revenu');
  check(calls.append.at(-1).body.p_chat_id === null && calls.append.at(-1).body.p_user_text === 'Ma question pendant le chargement' && msgsOf(vieux).length === 2, 'R2 le tour est enregistré dans un NOUVEAU chat (le vieux chat n’a pas bougé)');
  await ask(r2, 'Deuxième question');
  check(same(calls.assistant.at(-1).history, [{ who: 'me', text: 'Ma question pendant le chargement' }, { who: 'bot', text: 'Réponse à : Ma question pendant le chargement' }]) && calls.append.at(-1).body.p_chat_id !== vieux && calls.append.at(-1).body.p_chat_id !== null,
    'R2 la suite part avec l’historique de la conversation vécue (pas celui du vieux chat), dans le chat nouveau');

  console.log('\n═══ R2 · variante lente : la réponse arrive après la fin de la lecture');
  await tid(r2, 'assistant-newchat').click();
  special['Question lente'] = async () => { await sleep(4500); return { answer: 'Réponse lente.', links: [], remaining: 20 }; };
  await openHistory(r2);
  const nLoad2 = calls.load.length, nApp2 = calls.append.length;
  await rows(r2).filter({ hasText: 'Vieux chat' }).locator('.as-hopen').click();
  await until(() => calls.load.length > nLoad2);
  await r2.waitForTimeout(200);
  await tid(r2, 'assistant-history-back').click();
  await r2.fill('.as-bar textarea', 'Question lente'); await r2.click('button[aria-label="Envoyer"]');
  await r2.waitForSelector('.as-typing');
  await r2.waitForTimeout(2800); // lecture finie (2,5 s), réponse pas encore là (4,5 s)
  check(await r2.locator('.as-typing').isVisible() && same((await bubbles(r2)).me, ['Question lente']) && !flat(await panel(r2).innerText()).includes('Ancienne'),
    'R2 lente : la lecture finie, l’écran montre toujours la question vécue et « Je regarde… » (pas l’ancien chat)');
  await r2.waitForFunction(() => document.querySelectorAll('.as-bot').length > 0, null, { timeout: 8000 });
  await until(() => calls.append.length > nApp2);
  check(same((await bubbles(r2)).bot, ['Réponse lente.']) && calls.append.at(-1).body.p_user_text === 'Question lente', 'R2 lente : la réponse arrive à l’écran et le tour est enregistré (rien n’est jeté)');

  console.log('\n═══ R2 · pendant une réponse en route, aucune conversation ne s’ouvre');
  special['Question en route'] = async () => { await sleep(2500); return { answer: 'Voilà.', links: [], remaining: 19 }; };
  await tid(r2, 'assistant-newchat').click();
  await r2.fill('.as-bar textarea', 'Question en route'); await r2.click('button[aria-label="Envoyer"]');
  await r2.waitForSelector('.as-typing');
  await tid(r2, 'assistant-history').click(); await r2.waitForSelector('[data-testid=assistant-history-view]');
  await r2.waitForFunction(() => !document.querySelector('[data-testid=assistant-history-loading]'), null, { timeout: 5000 });
  check(await r2.locator('.as-hopen').first().isDisabled(), 'R2 réponse en route : les conversations ne s’ouvrent pas');
  await r2.waitForFunction(() => !document.querySelector('.as-hopen:disabled'), null, { timeout: 6000 });
  check(await r2.locator('.as-hopen').first().isEnabled(), 'R2 …elles se rouvrent quand la réponse est arrivée');
});

// ════════ R3 · supprimer le chat affiché pendant qu'une réponse arrive ; délai maximal ════════
await section('R3a', async () => {
  console.log('\n═══ R3 · supprimer le chat de l’écran pendant une réponse : l’écran n’est pas bloqué');
  reset();
  const r3 = await dctx.newPage(); watch(r3, 'bureau 1280 (R3)');
  await openAdmin(r3);
  await ask(r3, 'Premier tour');
  let liberer = null;
  special['Question restée sans réponse'] = () => new Promise((res) => { liberer = () => res({ answer: 'Réponse tardive', links: [], remaining: 11 }); });
  await r3.fill('.as-bar textarea', 'Question restée sans réponse'); await r3.click('button[aria-label="Envoyer"]');
  await r3.waitForSelector('.as-typing');
  await until(() => !!liberer);
  await openHistory(r3);
  check(await tid(r3, 'assistant-history-delete').first().isEnabled(), 'R3 pendant la réponse, la corbeille du chat de l’écran reste utilisable');
  await tid(r3, 'assistant-history-delete').first().click();
  await tid(r3, 'assistant-history-confirm-yes').click();
  await until(() => calls.del.length === 1);
  await r3.waitForTimeout(250);
  await tid(r3, 'assistant-history-back').click();
  check(/Bonjour 👋/.test(await r3.locator('.as-hello').innerText()) && await r3.locator('.as-typing').count() === 0, 'R3 l’écran est blanc et « Je regarde… » a disparu');
  await r3.fill('.as-bar textarea', 'Autre question');
  check(await r3.locator('button[aria-label="Envoyer"]').isEnabled() && await tid(r3, 'assistant-newchat').isEnabled(), 'R3 Envoyer et « Nouveau chat » sont actifs (rien n’attend la réponse périmée)');
  await r3.screenshot({ path: shot('1280-9-apres-suppression-pendant-reponse'), clip: { x: 1280 - 420, y: 0, width: 420, height: 900 } });
  await r3.click('button[aria-label="Envoyer"]');
  await r3.waitForFunction(() => document.querySelectorAll('.as-bot').length === 1, null, { timeout: 5000 });
  await until(() => calls.append.some((c) => c.body.p_user_text === 'Autre question'));
  liberer(); // la réponse périmée arrive enfin
  await r3.waitForTimeout(500);
  const b3 = await bubbles(r3);
  check(same(b3.me, ['Autre question']) && same(b3.bot, ['Réponse à : Autre question']), `R3 la réponse périmée n’apparaît pas à l’écran (${JSON.stringify(b3)})`);
  check(!calls.append.some((c) => c.body.p_user_text === 'Question restée sans réponse' || c.body.p_bot_text === 'Réponse tardive'), 'R3 le tour périmé n’est pas enregistré');
  check(/11 questions restantes/.test(flat(await panel(r3).innerText())), 'R3 le quota consommé est quand même compté (« 11 questions restantes »)');
});

await section('R3b', async () => {
  console.log('\n═══ R3 · délai maximal : 60 s sans réponse, l’écran rend la main (bureau)');
  const tctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await tctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(adminSession)]);
  await tctx.route('**/*.supabase.co/**', route(adminSession));
  const tp = await tctx.newPage(); watch(tp, 'bureau (délai)');
  await tp.clock.install();
  await openAdmin(tp);
  special['Question sans réponse'] = () => new Promise(() => {}); // le serveur ne répond jamais
  const nAsk = calls.assistant.length, nAppT = calls.append.length;
  await tp.fill('.as-bar textarea', 'Question sans réponse'); await tp.click('button[aria-label="Envoyer"]');
  await tp.waitForSelector('.as-typing');
  await until(() => calls.assistant.length > nAsk);
  await tp.clock.fastForward(50_000);
  check(await tp.locator('.as-typing').isVisible(), 'R3 après 50 s, la réponse est encore attendue');
  await tp.clock.fastForward(11_000);
  await tp.waitForFunction(() => !document.querySelector('.as-typing'), null, { timeout: 5000 });
  const bt = await bubbles(tp);
  check(same(bt.bot, ['L’assistant met trop de temps à répondre. Réessayez.']) && await tp.locator('.as-bot.notice').count() === 1, `R3 au-delà de 60 s : une notice claire (${JSON.stringify(bt.bot)})`);
  await tp.fill('.as-bar textarea', 'On réessaie');
  check(await tp.locator('button[aria-label="Envoyer"]').isEnabled() && await tid(tp, 'assistant-newchat').isEnabled(), 'R3 Envoyer et « Nouveau chat » sont de nouveau actifs');
  check(calls.append.length === nAppT, 'R3 la notice n’est pas enregistrée');
  await tp.click('button[aria-label="Envoyer"]');
  await tp.waitForFunction(() => document.querySelectorAll('.as-bot').length === 2, null, { timeout: 5000 });
  check((await bubbles(tp)).bot.at(-1) === 'Réponse à : On réessaie', 'R3 la demande suivante répond normalement');
  check(same(calls.assistant.at(-1).history ?? [], []), 'R3 la question sans réponse ne part pas comme contexte');
});

// ════════ R4 · le chat courant n'existe plus, ou est plein ════════
await section('R4', async () => {
  console.log('\n═══ R4 · chat supprimé depuis un autre onglet : le tour va dans un nouveau chat, une ligne discrète le dit');
  reset();
  const r4 = await dctx.newPage(); watch(r4, 'bureau 1280 (R4)');
  await openAdmin(r4);
  await ask(r4, 'Tour A');
  const X = DB.chats[0].id;
  DB.chats = []; DB.messages = []; // « un autre onglet » vient de supprimer ce chat
  const nA4 = calls.append.length;
  await r4.fill('.as-bar textarea', 'Tour B'); await r4.click('button[aria-label="Envoyer"]');
  await r4.waitForFunction(() => document.querySelectorAll('.as-bot').length === 2, null, { timeout: 5000 });
  await until(() => calls.append.length >= nA4 + 2);
  await r4.waitForTimeout(300);
  check(calls.append.length === nA4 + 2 && calls.append[nA4].body.p_chat_id === X && calls.append[nA4 + 1].body.p_chat_id === null && calls.append[nA4 + 1].body.p_user_text === 'Tour B',
    `R4 chat introuvable (42501) : le tour est réessayé UNE fois sur un nouveau chat (${calls.append.slice(nA4).map((c) => c.body.p_chat_id === null ? 'null' : 'X').join(' → ')})`);
  const Y = DB.chats[0]?.id;
  check(DB.chats.length === 1 && Y !== X && msgsOf(Y).length === 2, `R4 le tour est en base (${DB.chats.length} chat, ${DB.messages.length} messages) au lieu d’être perdu`);
  check(await tid(r4, 'assistant-note').count() === 1 && /n’est plus dans l’historique : la suite est enregistrée dans un nouveau chat/.test(flat(await tid(r4, 'assistant-note').innerText())), 'R4 une ligne discrète le dit');
  check(await r4.locator('.as-bot').count() === 2, 'R4 ce n’est pas une bulle de l’assistant');
  await panel(r4).screenshot({ path: shot('1280-8-ligne-discrete') });
  await ask(r4, 'Tour C');
  check(calls.append.at(-1).body.p_chat_id === Y && msgsOf(Y).length === 4 && await tid(r4, 'assistant-note').count() === 1, 'R4 le tour suivant va au nouveau chat, sans nouvelle ligne (une seule fois)');
  check(!calls.assistant.at(-1).history.some((h) => /nouveau chat/.test(h.text)) && calls.assistant.at(-1).history.length === 4, 'R4 la ligne discrète ne part pas comme contexte');

  console.log('\n═══ R4 · chat plein (54000) : même chose, avec le bon mot');
  fullChats.add(Y);
  const nA5 = calls.append.length;
  await r4.fill('.as-bar textarea', 'Tour D'); await r4.click('button[aria-label="Envoyer"]');
  await r4.waitForFunction(() => document.querySelectorAll('.as-bot').length === 4, null, { timeout: 5000 });
  await until(() => calls.append.length >= nA5 + 2);
  await r4.waitForTimeout(300);
  const Z = DB.chats.find((c) => c.id !== Y)?.id;
  check(calls.append[nA5].body.p_chat_id === Y && calls.append[nA5 + 1].body.p_chat_id === null && !!Z && msgsOf(Z).length === 2, 'R4 chat plein : le tour est réessayé sur un nouveau chat');
  check(await tid(r4, 'assistant-note').count() === 2 && /pleine \(200 messages\)/.test(flat(await tid(r4, 'assistant-note').last().innerText())), 'R4 la ligne dit que la conversation est pleine');
  fullChats.clear();

  console.log('\n═══ R4 · panne passagère (500) sur un chat connu : pas de nouveau chat, pas de ligne');
  failAppend = true;
  const nA6 = calls.append.length;
  await r4.fill('.as-bar textarea', 'Tour E'); await r4.click('button[aria-label="Envoyer"]');
  await r4.waitForFunction(() => document.querySelectorAll('.as-bot').length === 5, null, { timeout: 5000 });
  await until(() => calls.append.length > nA6);
  await r4.waitForTimeout(500);
  check(calls.append.length === nA6 + 1 && await tid(r4, 'assistant-note').count() === 2, 'R4 panne passagère : un seul essai, aucune ligne ajoutée');
  failAppend = false;
  await ask(r4, 'Tour F');
  check(calls.append.at(-1).body.p_chat_id === Z && DB.chats.length === 2, 'R4 la panne passée, le tour suivant va au MÊME chat (pas de chat en trop)');
});

// ════════ R5 · clavier et lecteur d'écran ════════
await section('R5', async () => {
  console.log('\n═══ R5 · le focus ne retombe jamais en haut de la page');
  reset();
  seedChat(ADMIN, 'Conversation un', 0, [{ who: 'me', text: 'Conversation un' }, { who: 'bot', text: 'Réponse un.' }]);
  seedChat(ADMIN, 'Conversation deux', 1, [{ who: 'me', text: 'Conversation deux' }, { who: 'bot', text: 'Réponse deux.' }]);
  seedChat(ADMIN, 'Conversation trois', 2, [{ who: 'me', text: 'Conversation trois' }, { who: 'bot', text: 'Réponse trois.' }]);
  const r5 = await dctx.newPage(); watch(r5, 'bureau 1280 (R5)');
  await openAdmin(r5);
  await openHistory(r5);
  check(await where(r5) === 'assistant-history-back', 'R5 ouverture de l’historique : focus sur « Retour »');
  await r5.keyboard.press('Tab');
  check(await where(r5) === 'open@0', 'R5 Tab : la 1re conversation');
  await r5.keyboard.press('Enter');
  await r5.waitForSelector('.as-bot', { timeout: 5000 });
  check(await r5.evaluate(() => document.activeElement?.tagName === 'TEXTAREA' && document.activeElement.getAttribute('aria-label') === 'Votre question'), 'R5 conversation rouverte : le focus est dans le champ de saisie');
  await openHistory(r5);
  await r5.keyboard.press('Tab'); await r5.keyboard.press('Tab');
  check(await where(r5) === 'assistant-history-delete@0', 'R5 Tab Tab : la corbeille de la 1re ligne');
  await r5.keyboard.press('Enter');
  check(await where(r5) === 'assistant-history-confirm-no@0', 'R5 corbeille : le focus va sur « Non » (le choix sûr), pas en haut de la page');
  await r5.keyboard.press('Enter');
  check(await where(r5) === 'assistant-history-delete@0' && await tid(r5, 'assistant-history-confirm-no').count() === 0, 'R5 « Non » : le focus revient sur la corbeille d’origine');
  await r5.keyboard.press('Enter');
  await r5.keyboard.press('Escape');
  check(await where(r5) === 'assistant-history-delete@0' && await tid(r5, 'assistant-history-confirm-no').count() === 0 && calls.del.length === 0, 'R5 Échap = « Non »');
  await r5.keyboard.press('Enter');
  await r5.keyboard.press('Shift+Tab');
  check(await where(r5) === 'assistant-history-confirm-yes@0', 'R5 Maj+Tab depuis « Non » : « Oui »');
  await r5.keyboard.press('Enter');
  await until(() => calls.del.length === 1); await r5.waitForTimeout(250);
  check(await where(r5) === 'open@0' && !(await rowTitles(r5)).includes('Conversation un'), `R5 « Oui » : le focus va sur la ligne suivante (${await where(r5)})`);
  check(/Conversation supprimée/.test(flat(await tid(r5, 'assistant-history-status').textContent())) && await r5.locator('[data-testid=assistant-history-status][role=status]').count() === 1, 'R5 « Conversation supprimée. » est annoncé (zone role=status)');
  await tid(r5, 'assistant-history-delete').nth(1).focus();
  await r5.keyboard.press('Enter'); await r5.keyboard.press('Shift+Tab'); await r5.keyboard.press('Enter');
  await until(() => calls.del.length === 2); await r5.waitForTimeout(250);
  check(await where(r5) === 'open@0' && (await rowTitles(r5)).length === 1, `R5 dernière ligne supprimée : le focus va sur la précédente (${await where(r5)})`);
  await tid(r5, 'assistant-history-clear').focus();
  await r5.keyboard.press('Enter');
  check(await where(r5) === 'assistant-history-confirm-no', 'R5 « Tout effacer » : le focus va sur « Non »');
  await r5.keyboard.press('Enter');
  check(await where(r5) === 'assistant-history-clear', 'R5 « Non » : le focus revient sur « Tout effacer »');
  await r5.keyboard.press('Enter'); await r5.keyboard.press('Shift+Tab'); await r5.keyboard.press('Enter');
  await until(() => calls.clear === 1); await r5.waitForTimeout(250);
  check(await where(r5) === 'assistant-history-back' && /Toutes les conversations ont été supprimées/.test(flat(await tid(r5, 'assistant-history-status').textContent())), 'R5 « Tout effacer » confirmé : le focus va sur « Retour » et c’est annoncé');
});

// ════════════════════════ BUREAU · téléphone 390 × 844 ════════════════════════
console.log('\n═══ M · téléphone 390 px : pas de défilement horizontal, boutons ≥ 40 px, captures');
reset();
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
await section('M-abandon', async () => {
  // « Abandonner cette action ? » (une fiche attend son « Confirmer ») : tient dans 390 px, boutons ≥ 40 px.
  special['Clôture le mois'] = CLOTURE;
  await ask(m, 'Clôture le mois');
  await tid(m, 'assistant-newchat').click();
  await m.waitForSelector('[data-testid=assistant-abandon]', { timeout: 3000 });
  check(await noHScroll(m), 'M « Abandonner cette action ? » : pas de défilement horizontal');
  for (const [id, label] of [['assistant-abandon-yes', 'Abandonner'], ['assistant-abandon-no', 'Garder']]) {
    const r = await bigEnough(tid(m, id)); check(r === true, `M « ${label} » : zone ≥ 40 px (${r === true ? 'ok' : r})`);
  }
  await panel(m).screenshot({ path: shot('390-6-abandon') });
  await tid(m, 'assistant-abandon-yes').click();
});

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
await section('S-fiche', async () => {
  // Une fiche d'heures qui s'enregistre (« Je note vos heures… ») ne se laisse pas démonter non plus.
  const FICHE = { kind: 'draft', answer: 'Voici vos heures.', remaining: 17, chantiers: [{ id: 'w1', nom: 'Villa Dupont', ville: 'Lyon' }],
    draft: { date: today, errors: [], lines: [{ worksite_id: 'w1', worksite_text: 'Villa Dupont', start: '08:00', end: '12:00', break_minutes: 0 }] } };
  workerFn = (body) => (body.text === 'Heures du matin' ? FICHE : { kind: 'answer', answer: `Réponse à : ${body.text}`, remaining: 19 });
  writeDelay = 2500;
  await ask(w, 'Heures du matin');
  check(/Je note vos heures/.test(flat(await panel(w).innerText())) && await tid(w, 'assistant-newchat').isDisabled(), 'S la fiche d’heures s’enregistre : « Nouveau chat » est grisé');
  await w.waitForSelector('[data-testid=action-done]', { timeout: 9000 });
  check(/Fait/.test(flat(await tid(w, 'action-done').innerText())) && await tid(w, 'assistant-newchat').isEnabled(), 'S la fiche montre « Fait » et « Nouveau chat » redevient actif');
  check(calls.otherWrites.includes('POST time_entries'), `S l’enregistrement des heures est bien parti (${calls.otherWrites.join(', ')})`);
  writeDelay = 0;
});

await section('S-délai', async () => {
  // Délai maximal côté salarié (même garde-fou que le bureau, autre fonction) : la phrase revient dans le champ.
  console.log('\n═══ S · délai maximal : 60 s sans réponse de worker-assistant, l’écran rend la main et la phrase revient dans le champ');
  reset();
  const wtctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await wtctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(samSession)]);
  await wtctx.route('**/*.supabase.co/**', route(samSession));
  const wt = await wtctx.newPage(); watch(wt, 'salarié (délai)');
  await wt.clock.install();
  await openWorker(wt);
  workerFn = () => new Promise(() => {}); // le serveur ne répond jamais
  const PHRASE = 'Ce matin 7h30-12h Villa Dupont';
  await wt.fill('.as-bar textarea', PHRASE); await wt.click('button[aria-label="Envoyer"]');
  await wt.waitForSelector('.as-typing');
  await until(() => calls.worker.length === 1);
  await wt.clock.fastForward(59_000);
  check(await wt.locator('.as-typing').isVisible(), 'S après 59 s, la réponse est encore attendue');
  await wt.clock.fastForward(2_000);
  await wt.waitForFunction(() => !document.querySelector('.as-typing'), null, { timeout: 5000 });
  check(same((await bubbles(wt)).bot, ['L’assistant met trop de temps à répondre. Réessayez.']) && await wt.locator('.as-bot.notice').count() === 1, 'S au-delà de 60 s : une notice claire');
  check(await wt.inputValue('.as-bar textarea') === PHRASE, 'S la phrase revient dans le champ (pas à redicter)');
  check(await tid(wt, 'assistant-newchat').isEnabled() && await wt.locator('button[aria-label="Envoyer"]').isEnabled() && calls.append.length === 0, 'S « Nouveau chat » et Envoyer sont actifs, rien n’est enregistré');
});

// ════════════════════════ DÉMO · /apercu/assistant-salarie (historique en mémoire, aucune base) ════════════════════════
console.log('\n═══ D · démo salarié : l’historique reste en mémoire, aucune requête vers la base');
const hits = [];
const dctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const dm = await dctx2.newPage(); watch(dm, 'démo');
dm.on('request', (q) => { if (q.url().includes('.supabase.co')) hits.push(q.url()); });
await dm.goto(`http://localhost:${PORT}/apercu/assistant-salarie?demo=salarie`); await dm.waitForTimeout(1200);
await dm.locator('[data-testid=assistant-open]').click(); await dm.waitForSelector('[data-testid=assistant-panel]'); await dm.waitForTimeout(300);
check(await tid(dm, 'assistant-newchat').isVisible() && await tid(dm, 'assistant-history').isVisible(), 'D « Nouveau chat » et « Historique » présents en démo');
for (const q of ['Bonjour', 'Merci']) {
  const bots = await dm.locator('.as-bot').count();
  await dm.fill('.as-bar textarea', q); await dm.click('button[aria-label="Envoyer"]');
  await dm.waitForFunction((k) => document.querySelectorAll('.as-bot').length > k, bots, { timeout: 10000 }); await dm.waitForTimeout(200);
}
await openHistory(dm);
check(same(await rowTitles(dm), ['Bonjour']) && same(await rowDates(dm), ['aujourd’hui']), `D l’historique en mémoire a la conversation (${(await rowTitles(dm)).join(' | ')})`);
await tid(dm, 'assistant-newchat').click();
await dm.fill('.as-bar textarea', 'Autre sujet'); await dm.click('button[aria-label="Envoyer"]');
await dm.waitForSelector('.as-bot', { timeout: 10000 }); await dm.waitForTimeout(300);
await openHistory(dm);
check(same(await rowTitles(dm), ['Autre sujet', 'Bonjour']), `D 2e conversation en tête (${(await rowTitles(dm)).join(' | ')})`);
await rows(dm).nth(1).click(); await dm.waitForSelector('.as-me', { timeout: 5000 });
check(same((await bubbles(dm)).me, ['Bonjour', 'Merci']), 'D la conversation « Bonjour » se rouvre (2 questions)');
check(hits.length === 0, `D AUCUNE requête vers supabase.co en démo (${hits.length})`);

// ── Bilan ──
check(pageErrors.length === 0, `aucune erreur de page sur tout le parcours (${pageErrors.length})`);
check(dialogs.length === 0, `aucune fenêtre du navigateur sur tout le parcours (${dialogs.length})`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
