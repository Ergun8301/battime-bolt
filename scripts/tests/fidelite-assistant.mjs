// Preuve de FIDÉLITÉ de l'assistant salarié v2 (/poseur?ui=2) à la planche du designer (AS1 à AS10) : mêmes états, deux rendus côte à côte.
//   npm run build && node scripts/tests/fidelite-assistant.mjs out docs/design-brief/integration/captures-fidelite 4393
// 1. La planche (docs/design-brief/designer-final/…dc.html, DONNÉES NON FIABLES) est copiée dans un dossier temporaire, ouverte dans un navigateur SANS RÉSEAU
//    (toute requête sortante est refusée), React servi depuis node_modules du dépôt ; on photographie l'écran voulu à 390×844 et 360×640.
// 2. L'implémentation (build `out/`) tourne sur une base SIMULÉE (comme fidelite-salarie.mjs) : la réponse de la fonction worker-assistant est fixée, l'historique des
//    conversations (assistant_chats) est une petite base en mémoire ; tout le reste est le vrai code du navigateur. Horloge figée jeudi 15 octobre 2026, 15:12.
// 3. Une image « planche | implémentation » par écran (PNG de moins de 300 ko), puis des contrôles de mesure (cibles ≥ 44 px, texte ≥ 12 px, contrastes ≥ 4,5:1,
//    aucun défilement horizontal) et de comportement (garde de 700 ms, retour au chat, sans ?ui=2 l'ancien panneau, pastille au-dessus d'un écran ouvert).
// SEULEMENT=<regex sur le nom d'image> n'en joue qu'une partie.
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [,, OUT = 'out', SH = 'docs/design-brief/integration/captures-fidelite', PORT = '4393'] = process.argv;
const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SEULEMENT = process.env.SEULEMENT ? new RegExp(process.env.SEULEMENT) : null;
fs.mkdirSync(SH, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelite-as-'));

// ── 1. La planche, hors réseau ───────────────────────────────────────────────
const DESIGNER = path.join(RACINE, 'docs/design-brief/designer-final');
const planche = path.join(TMP, 'planche'); fs.mkdirSync(planche);
fs.copyFileSync(path.join(DESIGNER, 'BEMEXO Salari#U00e9 - Dossier.dc.html'), path.join(planche, 'dossier.html'));
fs.writeFileSync(path.join(planche, 'support.js'), fs.readFileSync(path.join(DESIGNER, 'support.js'), 'utf8').replace(/s\.integrity = [A-Za-z_]+;/g, '// intégrité retirée (copie locale)'));
const browser = await chromium.launch({ executablePath: CHROME });
const photosPlanche = new Map();
async function photographierPlanche(ids, largeur, hauteur) {
  const ctx = await browser.newContext({ viewport: { width: 1800, height: 1400 }, deviceScaleFactor: 1 });
  await ctx.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.startsWith('file://')) return r.continue();
    if (u.includes('react@18.3.1/umd/react.production')) return r.fulfill({ path: path.join(RACINE, 'node_modules/react/umd/react.production.min.js'), contentType: 'text/javascript' });
    if (u.includes('react-dom@18.3.1/umd/react-dom.production')) return r.fulfill({ path: path.join(RACINE, 'node_modules/react-dom/umd/react-dom.production.min.js'), contentType: 'text/javascript' });
    return r.abort(); // aucune requête sortante
  });
  const p = await ctx.newPage();
  await p.goto(`file://${planche}/dossier.html`); await p.waitForTimeout(3500);
  await p.addStyleTag({ content: fs.readFileSync(path.join(RACINE, 'public/fonts/fonts.css'), 'utf8').replace(/url\(\/?fonts\//g, `url(file://${RACINE}/public/fonts/`) });
  await p.waitForTimeout(800);
  for (const id of ids) {
    const h = await p.evaluateHandle(([code, w, ht]) => {
      const cadre = [...document.querySelectorAll('div')].find((d) => d.style.borderRadius === '48px' && d.parentElement.innerText.split('\n')[0] === code);
      if (!cadre) return null;
      cadre.style.width = `${w + 20}px`; cadre.style.height = `${ht + 20}px`; // l'ÉCRAN fait exactement la taille demandée
      return cadre.firstElementChild;
    }, [id, largeur, hauteur]);
    const el = h.asElement();
    if (!el) throw new Error(`écran ${id} introuvable dans la planche`);
    await p.waitForTimeout(200);
    const f = path.join(TMP, `planche-${id}-${largeur}x${hauteur}.png`);
    await el.screenshot({ path: f, animations: 'disabled' });
    photosPlanche.set(`${id}-${largeur}x${hauteur}`, f);
  }
  await ctx.close();
}
const IDS = ['AS1', 'AS2', 'AS3', 'AS4', 'AS5', 'AS6', 'AS7', 'AS8', 'AS9', 'AS10'];
await photographierPlanche(IDS, 390, 844);
await photographierPlanche(['AS1', 'AS2', 'AS3', 'AS4'], 360, 640);

// ── 2. L'implémentation, sur la base simulée ─────────────────────────────────
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

const FIXED = new Date('2026-10-15T13:12:00Z'); // jeudi 15 octobre 2026, 15:12 à Paris
const today = '2026-10-15';
const CO = 'c0000000-0000-0000-0000-000000000001';
const ME = 'u-sam';
const W1 = { id: 'w1', company_id: CO, client_name: 'Maison Démo', city: 'Bron', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Villa Exemple', city: 'Lyon', is_active: true };
const W3 = { id: 'w3', company_id: CO, client_name: 'Résidence Test', city: 'Villeurbanne', is_active: true };
const CHANTIERS = [{ id: 'w1', nom: 'Maison Démo', ville: 'Bron' }, { id: 'w2', nom: 'Villa Exemple', ville: 'Lyon' }, { id: 'w3', nom: 'Résidence Test', ville: 'Villeurbanne' }];
const D = {
  users: [{ id: ME, company_id: CO, first_name: 'Sam', last_name: 'Gérard', role: 'worker', email: 'sam@exemple.fr', is_active: true, created_at: '2026-01-01' }],
  companies: [{ id: CO, name: 'Entreprise Exemple', ai_enabled: true, kiosk_enabled: true, position_tracking_enabled: false, travel_paid: false, meal_enabled: true, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
  worksites: [W1, W2, W3], planning: [], time_entries: [], active_sessions: [], month_closures: [], leave_requests: [], documents: [], time_entry_corrections: [], time_entry_positions: [], push_subscriptions: [],
};
let CHATS = []; let MSGS = []; let nid = 0;
const seed = (title, iso, msgs) => { const id = `00000000-0000-4000-8000-${String(++nid).padStart(12, '0')}`; CHATS.push({ id, user_id: ME, company_id: CO, side: 'salarie', title, created_at: iso, updated_at: iso }); for (const m of msgs) MSGS.push({ id: ++nid, chat_id: id, who: m.who, text: m.text, links: [], at: iso }); return id; };
const seedQuatre = () => {
  CHATS = []; MSGS = [];
  seed('Heures de mardi', '2026-10-15T07:12:00Z', [{ who: 'me', text: 'Heures de mardi' }, { who: 'bot', text: 'Voici.' }]);
  seed('Congé de novembre', '2026-10-14T16:40:00Z', [{ who: 'me', text: 'Congé de novembre' }, { who: 'bot', text: 'Voici.' }]);
  seed('Comment lever une réserve', '2026-10-12T05:55:00Z', [{ who: 'me', text: 'Comment lever une réserve' }, { who: 'bot', text: 'Voici.' }]);
  seed('Où est le dépôt ?', '2026-10-10T04:58:00Z', [{ who: 'me', text: 'Où est le dépôt ?' }, { who: 'bot', text: 'Voici.' }]);
};
const ligneDraft = (ws, s, e) => ({ worksite_id: ws ? ws.id : null, worksite_text: ws ? ws.client_name : '', start: s, end: e, break_minutes: 0 });
const reponses = {
  'Ce matin 7h30-12h, après-midi 13h-16h30': { kind: 'draft', answer: 'Le matin est noté sur Maison Démo. Sur quel chantier pour l’après-midi ?', remaining: 18, chantiers: CHANTIERS,
    draft: { date: today, errors: [], lines: [ligneDraft(null, '13:00', '16:30')] } },
  'J’ai fini, envoie ma journée et mets le panier': { kind: 'multi', answer: 'L’envoi passe par les mêmes vérifications que le bouton « Envoyer ma journée ».', date: today, aujourdhui: today, remaining: 17, chantiers: CHANTIERS, ignores: [], non_prepare: [], deja_notees: [],
    items: [{ id: 'i1', kind: 'action', action: { draft: { type: 'panier_repas', valeur: true }, problems: [] }, depend: [] }, { id: 'i2', kind: 'action', action: { draft: { type: 'envoyer_journee' }, problems: [] }, depend: ['i1'] }] },
  'Je travaille où lundi ?': { kind: 'answer', answer: 'Lundi 19 : Villa Exemple, Lyon, 08:00 → 12:00 puis 13:30 → 17:00.', remaining: 16 },
  'Qui est avec moi ?': { kind: 'answer', answer: 'Alex et Bruno sont prévus sur Villa Exemple lundi.', remaining: 15 },
  'Combien d’heures cette semaine ?': { kind: 'answer', answer: '22:42 notées, dont 16:00 envoyées. Mardi 13 reste à envoyer.', remaining: 14 },
  'Ouvre mardi': { kind: 'answer', answer: 'Je vous ouvre mardi 13.', remaining: 13, links: [{ label: 'Ouvrir mardi 13', action: 'ouvrir:jour.date?date=2026-10-13' }] },
  'Patrick à confirmer': { kind: 'multi', answer: 'Vérifiez la fiche, puis « Tout confirmer » : rien n’est enregistré avant.', date: '2026-10-19', aujourdhui: today, remaining: 11, chantiers: CHANTIERS, ignores: [], non_prepare: [], deja_notees: [],
    items: [{ id: 'i0', kind: 'heures', depend: [], draft: { date: '2026-10-19', errors: [], nouveau_chantier: { nom: 'Patrick Du Maine', adresse: '', code_postal: '', ville: 'Paris', description: '' },
      lines: [{ key: 'L0', worksite_id: null, worksite_text: 'nouveau', nouveau: true, start: '08:00', end: '12:00', break_minutes: 0 }, { key: 'L1', worksite_id: null, worksite_text: 'nouveau', nouveau: true, start: '13:00', end: '17:00', break_minutes: 0 }] } }] },
  'Fiche à remplir': { kind: 'draft', answer: 'Vérifiez, puis enregistrez.', remaining: 12, chantiers: CHANTIERS, draft: { date: today, errors: ['Pause trop longue.'], lines: [ligneDraft(W1, '08:00', '12:00')] } },
};
const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: ME, email: 'sam@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
const match = (rows, sp) => { let out = rows; for (const [k, v] of sp) { if (v.startsWith('eq.')) { const val = v.slice(3); out = out.filter((x) => !(k in x) || String(x[k]) === val); } } return out; };
let listeLente = 0, listeEnPanne = false;
async function contexte(largeur, hauteur) {
  const ctx = await browser.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion: 'reduce' });
  await ctx.clock.install(); await ctx.clock.setFixedTime(FIXED);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const u = new URL(req.url()); const method = req.method(); const p = u.pathname;
    let body = null; try { body = req.postDataJSON(); } catch { body = null; }
    if (p.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (p.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (p === '/functions/v1/worker-assistant') return r.fulfill({ json: reponses[body?.text] ?? { kind: 'answer', answer: `Réponse à : ${body?.text}`, remaining: 18 } });
    if (p.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (p === '/rest/v1/rpc/my_trainings') return r.fulfill({ json: [] });
    if (p === '/rest/v1/rpc/assistant_chat_append') {
      const id = body.p_chat_id || `00000000-0000-4000-8000-${String(++nid).padStart(12, '0')}`;
      if (!body.p_chat_id) CHATS.push({ id, user_id: ME, company_id: CO, side: 'salarie', title: body.p_user_text.slice(0, 60), created_at: FIXED.toISOString(), updated_at: FIXED.toISOString() });
      MSGS.push({ id: ++nid, chat_id: id, who: 'me', text: body.p_user_text, links: [], at: FIXED.toISOString() }, { id: ++nid, chat_id: id, who: 'bot', text: body.p_bot_text, links: body.p_links ?? [], at: FIXED.toISOString() });
      return r.fulfill({ json: id });
    }
    if (p === '/rest/v1/rpc/assistant_chat_clear') { const n = CHATS.length; CHATS = []; MSGS = []; return r.fulfill({ json: n }); }
    if (p.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    if (p === '/rest/v1/assistant_chats') {
      if (method === 'GET') {
        if (listeLente) await new Promise((ok) => setTimeout(ok, listeLente));
        if (listeEnPanne) return r.fulfill({ status: 500, json: { message: 'panne simulée' } });
        return r.fulfill({ json: [...CHATS].sort((a, c) => (a.updated_at < c.updated_at ? 1 : -1)).map(({ id, title, side, updated_at }) => ({ id, title, side, updated_at })) });
      }
      if (method === 'DELETE') { const id = (u.searchParams.get('id') || '').replace(/^eq\./, ''); CHATS = CHATS.filter((c) => c.id !== id); return r.fulfill({ status: 204, body: '' }); }
    }
    if (p === '/rest/v1/assistant_chat_messages' && method === 'GET') {
      const id = (u.searchParams.get('chat_id') || '').replace(/^eq\./, '');
      return r.fulfill({ json: MSGS.filter((m) => m.chat_id === id).sort((a, c) => a.id - c.id).map(({ who, text, links }) => ({ who, text, links })) });
    }
    const t = p.replace('/rest/v1/', '');
    const rows = match(D[t] || [], u.searchParams);
    if (method === 'GET' || method === 'HEAD') return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
    return r.fulfill({ status: 201, json: rows.length ? rows[0] : { id: 'new-1' } });
  });
  return ctx;
}
const erreurs = [];
async function ouvrir(largeur, hauteur, { ui2 = true } = {}) {
  D.time_entries = [{ id: 'jeu-1', company_id: CO, user_id: ME, worksite_id: 'w1', planning_id: null, work_date: today, start_time: '07:30:00', end_time: '12:00:00', break_minutes: 0, total_minutes: 270, meal_allowance: false, status: 'draft', locked: false, exported_at: null, observation: null, reception: null, gap_before: null, worksite: W1 }];
  const ctx = await contexte(largeur, hauteur);
  const p = await ctx.newPage(); p.on('pageerror', (e) => erreurs.push(e.message));
  await p.goto(`http://localhost:${PORT}/poseur?ui=${ui2 ? 2 : 1}`);
  await p.waitForSelector(ui2 ? '.dz-bande' : '.bt-total', { timeout: 20000 }); await p.waitForTimeout(1500);
  await p.locator('[data-testid=dock-assistant]').click(); await p.waitForSelector('[data-testid=assistant-panel]'); await p.waitForTimeout(600);
  return { p, ctx };
}
const demander = async (p, texte) => {
  await p.locator('[data-testid=assistant-panel] textarea').fill(texte);
  await p.locator('[data-testid=assistant-panel] button[aria-label=Envoyer]').click();
  await p.waitForTimeout(1500);
};
const photo = async (p, nom, largeur, hauteur) => {
  await p.mouse.move(2, 2); await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur()).catch(() => {});
  await p.waitForTimeout(400);
  const f = path.join(TMP, `impl-${nom}-${largeur}x${hauteur}.png`);
  await p.screenshot({ path: f, animations: 'disabled', caret: 'hide' });
  return f;
};

// ── 3. Côte à côte ───────────────────────────────────────────────────────────
async function cote(nom, fPlanche, fImpl, titre) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const a = fs.readFileSync(fPlanche).toString('base64'); const i = fs.readFileSync(fImpl).toString('base64');
  await p.setContent(`<body style="margin:0;background:#E9E2D4;font:700 14px Archivo,system-ui,sans-serif;color:#15120F"><div style="display:flex;gap:24px;padding:12px 16px;align-items:flex-start"><figure style="margin:0"><figcaption style="padding:0 0 8px">Planche du designer · ${titre}</figcaption><img src="data:image/png;base64,${a}" style="display:block;box-shadow:0 0 0 1px #15120F"></figure><figure style="margin:0"><figcaption style="padding:0 0 8px">Implémentation (?ui=2)</figcaption><img src="data:image/png;base64,${i}" style="display:block;box-shadow:0 0 0 1px #15120F"></figure></div></body>`);
  await p.waitForFunction(() => [...document.images].every((m) => m.complete && m.naturalWidth > 0));
  const f = path.join(SH, `${nom}.png`);
  await p.screenshot({ path: f, fullPage: true });
  await ctx.close();
  const ko = (fs.statSync(f).size / 1000).toFixed(0);
  console.log('📸', f, `${ko} ko`);
  return Number(ko);
}
let ok = 0, ko = 0;
const verifie = (cond, msg) => { if (cond) { ok++; console.log('✅', msg); } else { ko++; console.log('❌', msg); } };
const poids = [];
const veut = (nom) => !SEULEMENT || SEULEMENT.test(nom);
const planchesDe = (id, l, h) => photosPlanche.get(`${id}-${l}x${h}`);

const mesures = async (p) => p.evaluate(() => {
  const racine = document.querySelector('[data-testid=assistant-panel]') || document.querySelector('[data-testid=assistant-pastille]');
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // Une case à cocher se touche par son étiquette (la ligne entière, 44 px au moins) : c'est elle qu'on mesure.
  const cibles = [...racine.querySelectorAll('button, textarea, input:not([hidden])')].filter(vis).map((e) => (e.matches('input[type=checkbox]') ? e.closest('label') || e : e))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).map((e) => `${e.getAttribute('aria-label') || e.textContent.trim().slice(0, 14)} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`);
  const petits = []; const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim() || !n.parentElement || !vis(n.parentElement) || n.parentElement.closest('.dz-as-sr')) continue; const fs = parseFloat(getComputedStyle(n.parentElement).fontSize); if (fs > 0 && fs < 11.99) petits.push(`${n.textContent.trim().slice(0, 24)} ${fs}px`); }
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rgba = (c) => { const m = c.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m[3] ?? 1]; };
  const melange = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
  const fondDe = (e) => { let c = [255, 255, 255]; const pile = []; for (let n = e; n; n = n.parentElement) { const b = rgba(getComputedStyle(n).backgroundColor); if (b[3] > 0) pile.push(b); if (b[3] >= 0.99) break; } for (const b of pile.reverse()) c = melange(b, [...c, 1]); return c; };
  const faibles = []; const w2 = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
  for (let n = w2.nextNode(); n; n = w2.nextNode()) {
    const e = n.parentElement; if (!n.textContent.trim() || !e || !vis(e) || e.closest('[aria-hidden="true"], [aria-disabled="true"], button:disabled, .dz-as-sr')) continue;
    const st = getComputedStyle(e); const fond = fondDe(e); const texte = melange(rgba(st.color), [...fond, 1]);
    const L1 = lum(texte), L2 = lum(fond); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const grand = parseFloat(st.fontSize) >= 24 || (parseFloat(st.fontSize) >= 18.66 && Number(st.fontWeight) >= 700);
    if (ratio < (grand ? 3 : 4.5)) faibles.push(`« ${n.textContent.trim().slice(0, 22)} » ${ratio.toFixed(2)}:1`);
  }
  const r = racine.getBoundingClientRect();
  return { cibles, petits, faibles, debordeX: document.documentElement.scrollWidth > innerWidth || racine.scrollWidth > racine.clientWidth + 1, plein: Math.round(r.width) === innerWidth || Math.round(r.width) === 480, haut: Math.round(r.top), bas: Math.round(r.bottom) };
});
const contr = async (p, nom) => {
  const m = await mesures(p);
  verifie(m.cibles.length === 0, `${nom} : cibles ≥ 44 px (${m.cibles.join(' ; ') || 'toutes'})`);
  verifie(m.petits.length === 0, `${nom} : texte ≥ 12 px (${m.petits.join(' ; ') || 'tout'})`);
  verifie(m.faibles.length === 0, `${nom} : contrastes ≥ 4,5:1 (${m.faibles.join(' ; ') || 'tous'})`);
  verifie(!m.debordeX, `${nom} : aucun défilement horizontal`);
  return m;
};
const panneau = (p) => p.locator('[data-testid=assistant-panel]');
const testid = (p, id) => p.locator(`[data-testid=${id}]`);

for (const [l, h] of [[390, 844], [360, 640]]) {
  const suf = `${l}x${h}`;
  // AS1 · accueil
  if (veut(`AS1-accueil-${suf}`)) {
    seedQuatre();
    const { p, ctx } = await ouvrir(l, h);
    verifie(await panneau(p).evaluate((e) => e.classList.contains('dz-as') && e.classList.contains('dz-portail')), `AS1 ${suf} : le panneau v2 (dz-as, dz-portail) est ouvert par le ✦`);
    verifie(!(await p.locator('.as-panel').count()), `AS1 ${suf} : l’ancien panneau n’est pas dessiné`);
    verifie(/Bonjour Sam/.test(await p.locator('.dz-as-titre').innerText()), `AS1 ${suf} : titre « Bonjour Sam »`);
    verifie((await p.locator('.dz-as-suggestions button').allInnerTexts()).map((t) => t.replace(/\s*›$/, '').trim()).join('|') === 'Ce matin 7h30-12h, après-midi 13h-16h30|J’ai fini ma journée|Demander un congé|Comment je signale une réserve ?', `AS1 ${suf} : les 4 suggestions, libellés exacts`);
    verifie((await p.locator('.dz-as-aide').innerText()).includes('Rien ne part avant « Envoyer »'), `AS1 ${suf} : ligne d’aide de la planche`);
    verifie((await testid(p, 'assistant-attach').count()) === 1, `AS1 ${suf} : bouton pièce jointe`);
    verifie((await testid(p, 'assistant-attach').getAttribute('aria-label')) === 'Joindre un fichier ou une photo' && (await testid(p, 'assistant-attach').locator('svg').count()) === 1, `AS1 ${suf} : la pièce jointe est un trombone (icône), libellé « Joindre un fichier ou une photo »`);
    verifie((await testid(p, 'assistant-langs').count()) === 0 && !/FR·TR|Dictée|Türkçe/.test(await panneau(p).innerText()), `AS1 ${suf} : plus de rangée « Dictée : Français / Türkçe » ni de bouton « FR·TR »`);
    const barre = await p.locator('.dz-as-barre').evaluate((f) => [...f.children].filter((e) => e.getBoundingClientRect().width > 0).map((e) => (e.matches('textarea') ? 'champ' : e.getAttribute('data-testid') || e.getAttribute('aria-label'))));
    verifie(barre.join('|') === 'assistant-attach|champ|assistant-mic|Envoyer', `AS1 ${suf} : barre = [joindre] [champ] [micro] [envoyer] (${barre.join('|')})`);
    verifie((await testid(p, 'assistant-mic').count()) === 0 || ((await testid(p, 'assistant-mic').locator('svg').count()) === 1 && !(await testid(p, 'assistant-mic').innerText()).trim()), `AS1 ${suf} : le micro est une icône sans lettres`);
    await contr(p, `AS1 ${suf}`);
    poids.push(await cote(`AS1-accueil-${suf}`, planchesDe('AS1', l, h), await photo(p, `AS1-${suf}`, l, h), `AS1 · accueil · ${l} × ${h}`));
    // ✕ ferme, ✦ rouvre au même endroit
    await p.locator('.dz-as-x').click(); await p.waitForTimeout(300);
    verifie((await panneau(p).count()) === 0, `AS1 ${suf} : ✕ ferme l’assistant`);
    await ctx.close();
  }
  // AS2 · heures dites : question en boutons, puis « Fait » + Annuler / Modifier
  if (veut(`AS2-heures-dites-${suf}`)) {
    seedQuatre();
    const { p, ctx } = await ouvrir(l, h);
    await demander(p, 'Ce matin 7h30-12h, après-midi 13h-16h30');
    verifie((await p.locator('.dz-as-me').innerText()).includes('13h-16h30'), `AS2 ${suf} : la bulle de la personne`);
    verifie((await p.locator('.aq-c button').count()) === 3, `AS2 ${suf} : « Sur quel chantier ? » en 3 boutons`);
    verifie(/18 QUESTIONS RESTANTES/.test(await p.locator('.dz-as-kicker').innerText()), `AS2 ${suf} : « 18 QUESTIONS RESTANTES » dans l’en-tête`);
    await contr(p, `AS2 ${suf} (question)`);
    poids.push(await cote(`AS2-question-${suf}`, planchesDe('AS2', l, h), await photo(p, `AS2q-${suf}`, l, h), `AS2 · chantier ? · ${l} × ${h}`));
    await p.locator('.aq-c button').first().click(); await p.waitForSelector('[data-testid=action-done]', { timeout: 8000 }); await p.waitForTimeout(500);
    verifie((await p.locator('.ad-b button').count()) === 2, `AS2 ${suf} : Annuler et Modifier`);
    await contr(p, `AS2 ${suf} (fait)`);
    poids.push(await cote(`AS2-fait-${suf}`, planchesDe('AS2', l, h), await photo(p, `AS2f-${suf}`, l, h), `AS2 / AS8 · fait · ${l} × ${h}`));
    await ctx.close();
  }
}

// AS3 · à confirmer
if (veut('AS3-a-confirmer')) {
  seedQuatre();
  const { p, ctx } = await ouvrir(390, 844);
  await demander(p, 'J’ai fini, envoie ma journée et mets le panier');
  await p.waitForSelector('[data-testid=multi-card], .wm', { timeout: 8000 }).catch(() => {});
  verifie((await p.locator('.dz-f-ok').count()) === 1 && (await p.locator('.dz-f-non').count()) === 1, 'AS3 : « Tout confirmer » et « Ignorer » dans la fiche');
  verifie(await p.locator('.dz-f-ok').evaluate((e) => getComputedStyle(e).backgroundColor === 'rgb(255, 194, 26)'), 'AS3 : « Tout confirmer » en jaune');
  await contr(p, 'AS3');
  poids.push(await cote('AS3-a-confirmer-390x844', planchesDe('AS3', 390, 844), await photo(p, 'AS3', 390, 844), 'AS3 · à confirmer · 390 × 844'));
  await ctx.close();
}
// AS3b · la fiche d'Ergun (Patrick Du Maine, lundi 19 : hors période) : la raison du blocage est VISIBLE, entière, au-dessus des boutons ; champs alignés
for (const [l, h] of [[390, 844], [360, 640]]) {
  const suf = `${l}x${h}`;
  if (!veut(`AS3-fiche-bloquee-${suf}`)) continue;
  seedQuatre();
  const { p, ctx } = await ouvrir(l, h);
  await demander(p, 'Patrick à confirmer');
  await p.waitForSelector('[data-testid=multi-card]', { timeout: 8000 });
  await p.waitForTimeout(500);
  // AVANT=1 : sur un ancien build (avant la refonte de la fiche), on photographie seulement (haut, puis bas de la conversation) : les images « avant » de la PR.
  if (process.env.AVANT) {
    fs.copyFileSync(await photo(p, `AVANT-haut-${suf}`, l, h), path.join(SH, `AVANT-fiche-haut-${suf}.png`));
    await p.evaluate(() => { const c = document.querySelector('.dz-as-corps'); c.scrollTop = c.scrollHeight; }); await p.waitForTimeout(400);
    fs.copyFileSync(await photo(p, `AVANT-bas-${suf}`, l, h), path.join(SH, `AVANT-fiche-bas-${suf}.png`));
    await ctx.close(); continue;
  }
  verifie(await testid(p, 'wm-confirm').isDisabled(), `AS3b ${suf} : « Tout confirmer » est inactif (date hors période)`);
  const stop = testid(p, 'wm-bloquants');
  const txt = (await stop.innerText()).replace(/\s+/g, ' ');
  verifie(/Impossible de confirmer : Date hors période : les heures se déclarent au plus tard le lendemain, et jusqu’à 31 jours en arrière\./.test(txt), `AS3b ${suf} : la raison COMPLÈTE est écrite au-dessus des boutons (« ${txt.slice(0, 70)}… »)`);
  const g = await p.evaluate(() => {
    const corps = document.querySelector('.dz-as-corps').getBoundingClientRect();
    const s = document.querySelector('[data-testid=wm-bloquants]'); const sr = s.getBoundingClientRect();
    const b = document.querySelector('.dz-f-btns').getBoundingClientRect();
    const raisons = [...s.querySelectorAll('.dz-f-raison')].map((e) => ({ coupe: e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1, bas: e.getBoundingClientRect().bottom, haut: e.getBoundingClientRect().top }));
    const cp = document.querySelector('[data-testid=wm-cp]').getBoundingClientRect(); const vi = document.querySelector('[data-testid=wm-ville]').getBoundingClientRect();
    const lc = document.querySelector('label[for$="-cp"]').getBoundingClientRect(); const lv = document.querySelector('label[for$="-ville"]').getBoundingClientRect();
    const champs = ['wm-nom', 'wm-adresse', 'wm-cp', 'wm-ville', 'wm-travaux', 'wm-jour'].map((t) => Math.round(document.querySelector(`[data-testid=${t}]`).getBoundingClientRect().height));
    return { visible: sr.top >= corps.top - 1 && sr.bottom <= corps.bottom + 1, auDessus: sr.bottom <= b.top + 1, coupe: raisons.some((x) => x.coupe), cpMemeLigne: Math.abs(cp.top - vi.top) < 1 && Math.abs(cp.height - vi.height) < 1 && Math.abs(lc.height - lv.height) < 1 && lc.height < 20, champs, boutons: b.bottom <= corps.bottom + 1 };
  });
  verifie(g.visible && g.auDessus && g.boutons, `AS3b ${suf} : le résumé et les boutons sont VISIBLES dans la zone défilante (rien sous la barre), résumé au-dessus des boutons`);
  verifie(!g.coupe, `AS3b ${suf} : le message d’erreur n’est jamais tronqué`);
  verifie(g.cpMemeLigne, `AS3b ${suf} : « Code postal » et « Ville » alignés (étiquettes sur une ligne, mêmes tops et hauteurs)`);
  verifie(new Set(g.champs).size === 1 && g.champs[0] === 48, `AS3b ${suf} : tous les champs ont la même hauteur (${g.champs.join('/')} px)`);
  await testid(p, 'multi-card').locator('.dz-f-voir').click(); await p.waitForTimeout(700);
  verifie(await p.evaluate(() => { const c = document.querySelector('.dz-as-corps').getBoundingClientRect(); const e = document.querySelector('[data-dz-erreur]').getBoundingClientRect(); return e.bottom > c.top && e.top < c.bottom; }), `AS3b ${suf} : « Voir le point » met le premier champ en erreur en vue`);
  await contr(p, `AS3b ${suf}`);
  poids.push(await cote(`AS3-fiche-bloquee-${suf}`, planchesDe('AS3', l, h), await photo(p, `AS3b-${suf}`, l, h), `AS3 · fiche à confirmer, bloquée · ${l} × ${h}`));
  await testid(p, 'wm-heures').evaluate((e) => e.scrollIntoView({ block: 'start' })); await p.waitForTimeout(400);
  verifie(await p.evaluate(() => { const c = document.querySelector('.dz-as-corps').getBoundingClientRect(); const b = document.querySelector('.dz-f-barre').getBoundingClientRect(); return b.bottom <= c.bottom + 1 && b.top > c.top; }), `AS3b ${suf} : la barre de la fiche reste collée en bas de la zone défilante`);
  poids.push(await cote(`AS3-fiche-creneaux-${suf}`, planchesDe('AS3', l, h), await photo(p, `AS3c-${suf}`, l, h), `AS3 · fiche à confirmer, créneaux · ${l} × ${h}`));
  await ctx.close();
}
// AS4 · historique, suppression en place + garde de 700 ms · AS6 · tout effacer
for (const [l, h] of [[390, 844], [360, 640]]) {
  const suf = `${l}x${h}`;
  if (!veut(`AS4-historique-${suf}`)) continue;
  seedQuatre();
  const { p, ctx } = await ouvrir(l, h);
  await testid(p, 'assistant-history').click(); await p.waitForSelector('[data-testid=assistant-history-view]'); await p.waitForTimeout(700);
  verifie((await p.locator('.dz-as-titre').innerText()) === 'Historique' && /PRIVÉ · GARDÉ 30 JOURS/.test(await p.locator('.dz-as-kicker').innerText()), `AS4 ${suf} : « Historique » et « PRIVÉ · GARDÉ 30 JOURS »`);
  verifie((await p.locator('[data-testid=assistant-history-item]').count()) === 4, `AS4 ${suf} : quatre conversations`);
  verifie((await p.locator('.dz-as-hdate').allInnerTexts()).join('|') === 'Aujourd’hui · 09:12|Hier · 18:40|12 oct. · 07:55|10 oct. · 06:58', `AS4 ${suf} : dates « Aujourd’hui · 09:12 », « Hier · 18:40 », « 12 oct. · 07:55 »`);
  await p.locator('[data-testid=assistant-history-delete]').nth(1).click(); await p.waitForTimeout(150);
  verifie(await testid(p, 'assistant-history-confirm-no').evaluate((e) => document.activeElement === e), `AS4 ${suf} : le focus est sur « Non »`);
  // garde : « Oui » tout de suite ne supprime rien
  await testid(p, 'assistant-history-confirm-yes').click({ force: true }); await p.waitForTimeout(150);
  verifie((await p.locator('[data-testid=assistant-history-item]').count()) === 4 && (await testid(p, 'assistant-history-confirm-yes').count()) === 1, `AS4 ${suf} : « Oui » touché avant 700 ms ne supprime rien`);
  await p.waitForTimeout(900);
  verifie((await testid(p, 'assistant-history-confirm-yes').getAttribute('aria-disabled')) === 'false', `AS4 ${suf} : « Oui » s’arme après 700 ms`);
  await contr(p, `AS4 ${suf}`);
  poids.push(await cote(`AS4-historique-${suf}`, planchesDe('AS4', l, h), await photo(p, `AS4-${suf}`, l, h), `AS4 · historique · ${l} × ${h}`));
  if (l === 390) {
    await testid(p, 'assistant-history-confirm-no').click(); await p.waitForTimeout(200);
    // AS6 · tout effacer
    await testid(p, 'assistant-history-clear').click(); await p.waitForTimeout(150);
    await testid(p, 'assistant-history-confirm-yes').click({ force: true }); await p.waitForTimeout(150);
    verifie((await p.locator('[data-testid=assistant-history-item]').count()) === 4, 'AS6 : « Oui » touché avant 700 ms n’efface rien');
    await p.waitForTimeout(900);
    verifie(/Tout effacer \?/.test(await panneau(p).innerText()) && /Les 4 conversations seront supprimées/.test(await panneau(p).innerText()), 'AS6 : « Tout effacer ? », « Les 4 conversations seront supprimées. »');
    await contr(p, 'AS6');
    poids.push(await cote('AS6-tout-effacer-390x844', planchesDe('AS6', 390, 844), await photo(p, 'AS6', 390, 844), 'AS6 · tout effacer · 390 × 844'));
    await testid(p, 'assistant-history-confirm-yes').click(); await p.waitForTimeout(400);
    verifie((await p.locator('[data-testid=assistant-history-item]').count()) === 0 && (await testid(p, 'assistant-history-empty').count()) === 1, 'AS6 : après « Oui » armé, tout est effacé et l’historique est vide (AS5)');
    verifie((await testid(p, 'assistant-history-clear').count()) === 0, 'AS5 : « Tout effacer » masqué quand la liste est vide');
    await contr(p, 'AS5');
    poids.push(await cote('AS5-historique-vide-390x844', planchesDe('AS5', 390, 844), await photo(p, 'AS5', 390, 844), 'AS5 · historique vide · 390 × 844'));
    await p.getByRole('button', { name: '+ Nouveau chat' }).last().click(); await p.waitForTimeout(300);
    verifie((await testid(p, 'assistant-history-view').count()) === 0 && (await p.locator('.dz-as-suggestions').count()) === 1, 'AS5 : « + Nouveau chat » revient à l’accueil');
  }
  await ctx.close();
}
// AS9 · historique : chargement, indisponible · abandon d'une action en attente
if (veut('AS9-historique-erreur')) {
  seedQuatre(); listeEnPanne = true;
  let { p, ctx } = await ouvrir(390, 844);
  await testid(p, 'assistant-history').click(); await p.waitForSelector('[data-testid=assistant-history-error]'); await p.waitForTimeout(400);
  verifie(/Historique indisponible/.test(await panneau(p).innerText()) && (await testid(p, 'assistant-history-retry').count()) === 1, 'AS9 : « Historique indisponible » + « Réessayer »');
  await contr(p, 'AS9 (erreur)');
  poids.push(await cote('AS9-historique-erreur-390x844', planchesDe('AS9', 390, 844), await photo(p, 'AS9e', 390, 844), 'AS9 · historique indisponible · 390 × 844'));
  listeEnPanne = false; await ctx.close();
  listeLente = 4000;
  ({ p, ctx } = await ouvrir(390, 844));
  await testid(p, 'assistant-history').click(); await p.waitForSelector('[data-testid=assistant-history-loading]'); await p.waitForTimeout(300);
  verifie((await p.locator('.dz-as-squelette').count()) === 1, 'AS9 : le squelette de chargement');
  listeLente = 0; await ctx.close();
}
if (veut('AS9-abandon')) {
  seedQuatre();
  const { p, ctx } = await ouvrir(390, 844);
  await demander(p, 'Fiche à remplir');
  await p.waitForSelector('[data-testid=draft-card]', { timeout: 8000 });
  await testid(p, 'assistant-newchat').click(); await p.waitForSelector('[data-testid=assistant-abandon]'); await p.waitForTimeout(200);
  verifie(await testid(p, 'assistant-abandon-no').evaluate((e) => document.activeElement === e), 'AS9 : « Abandonner cette action ? » : le focus est sur « Non »');
  await testid(p, 'assistant-abandon-yes').click({ force: true }); await p.waitForTimeout(150);
  verifie((await testid(p, 'assistant-abandon').count()) === 1 && (await testid(p, 'draft-card').count()) === 1, 'AS9 : « Oui » touché avant 700 ms n’abandonne rien');
  await p.waitForTimeout(900);
  await contr(p, 'AS9 (abandon)');
  poids.push(await cote('AS9-abandon-390x844', planchesDe('AS9', 390, 844), await photo(p, 'AS9a', 390, 844), 'AS9 · abandonner cette action ? · 390 × 844'));
  await testid(p, 'assistant-abandon-yes').click(); await p.waitForTimeout(300);
  verifie((await testid(p, 'draft-card').count()) === 0 && (await p.locator('.dz-as-suggestions').count()) === 1, 'AS9 : « Oui » armé abandonne la fiche, retour à l’accueil');
  await ctx.close();
}
// AS10 · questions heures, planning, collègues
if (veut('AS10-questions')) {
  seedQuatre();
  const { p, ctx } = await ouvrir(390, 844);
  for (const q of ['Je travaille où lundi ?', 'Qui est avec moi ?', 'Combien d’heures cette semaine ?']) await demander(p, q);
  verifie((await p.locator('.dz-as-bot').count()) === 3 && (await p.locator('.dz-as-me').count()) === 3, 'AS10 : trois questions, trois réponses');
  await contr(p, 'AS10');
  poids.push(await cote('AS10-questions-390x844', planchesDe('AS10', 390, 844), await photo(p, 'AS10', 390, 844), 'AS10 · heures, planning, collègues · 390 × 844'));
  await ctx.close();
}
// AS7 / AS8 · la pastille au-dessus d'un écran ouvert depuis l'assistant
if (veut('AS7-pastille')) {
  seedQuatre();
  const { p, ctx } = await ouvrir(390, 844);
  await demander(p, 'Ouvre mardi');
  await p.getByRole('button', { name: 'Ouvrir mardi 13' }).click(); await p.waitForTimeout(900);
  verifie((await panneau(p).count()) === 0 && (await testid(p, 'assistant-pastille').count()) === 1, 'AS7 : le panneau se réduit en pastille « ASSISTANT · EN ATTENTE »');
  verifie((await p.locator('.bt-phdr-back').count()) === 1, 'AS7 : l’écran demandé (mardi 13) est ouvert dessous');
  verifie(/Ouvre mardi/.test(await p.locator('.dz-as-pastille__question').innerText()), 'AS7 : la pastille rappelle la demande');
  const m = await mesures(p);
  verifie(m.cibles.length === 0 && m.petits.length === 0 && m.faibles.length === 0, `AS7 : pastille ≥ 44 px, ≥ 12 px, contrastes (${[...m.cibles, ...m.petits, ...m.faibles].join(' ; ') || 'tous'})`);
  poids.push(await cote('AS7-pastille-390x844', planchesDe('AS7', 390, 844), await photo(p, 'AS7', 390, 844), 'AS7 · pastille · 390 × 844'));
  await testid(p, 'assistant-reprendre').click(); await p.waitForTimeout(500);
  verifie((await panneau(p).count()) === 1 && (await p.locator('.dz-as-me').count()) === 1, 'AS8 : « Reprendre » rouvre l’assistant au même endroit de la conversation');
  await ctx.close();
}
// Sans ?ui=2 : l'ancien panneau, strictement
if (veut('sans-ui2')) {
  seedQuatre();
  const { p, ctx } = await ouvrir(390, 844, { ui2: false });
  verifie((await p.locator('.as-panel').count()) === 1 && (await p.locator('.dz-as').count()) === 0, 'sans ?ui=2 : l’ancien panneau (.as-panel), aucune classe dz-as');
  verifie(/Bonjour/.test(await p.locator('.as-hello').innerText()), 'sans ?ui=2 : l’accueil d’avant (« Bonjour 👋 »)');
  await ctx.close();
}
console.log(`\n${ok} ✅ / ${ko} ❌ · erreurs de page : ${erreurs.length ? erreurs.join(' | ') : 'aucune'} · images : ${poids.length}, la plus lourde ${Math.max(0, ...poids)} ko (plafond 300 ko)`);
verifie(Math.max(0, ...poids) < 300, 'toutes les images pèsent moins de 300 ko');
verifie(erreurs.length === 0, 'aucune erreur de page');
await browser.close(); srv.close();
process.exit(ko ? 1 : 0);
