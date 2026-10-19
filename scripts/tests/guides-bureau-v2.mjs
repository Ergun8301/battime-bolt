// Lancer : node scripts/tests/guides-bureau-v2.mjs out /tmp/g2 (après npm run build). ONLY=id1,id2 pour quelques fiches ; WIDTHS=1280,834,390.
// Bascule du bureau v2 : CHAQUE fiche du guide pas à pas (les 48, telles que la fonction `assistant` les lance), jouée sur la VRAIE page /admin
// (design v2, base simulée comme guides-bureau-lot7.mjs) à 1280×800, 834×1112 (tablette) et 390×844 (téléphone). À chaque étape : l'anneau
// doit être sur la cible (jamais « Je ne vois pas ce bouton »). On avance comme le patron : on touche la cible quand c'est elle qui ouvre l'écran
// suivant (navigation seulement, liste NAV ci-dessous), sinon « Suivant ». Aucune écriture n'est permise.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { chromium } from 'playwright-core';
const [,, OUT, SH, PORT = '4431'] = process.argv; fs.mkdirSync(SH, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); for (const c of [p, p + '.html', path.join(p, 'index.html')]) { const f = path.join(OUT, c); if (fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(r); } } r.writeHead(404); r.end(); });
await new Promise((r) => srv.listen(Number(PORT), r));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const run = (n) => !process.env.ONLY || process.env.ONLY.split(',').includes(String(n));
let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };


// ─── Horloge figée : mercredi 21 octobre 2026, 10:00 (Paris) ─────────────────────
const NOW = new Date('2026-10-21T10:00:00+02:00');
const D_ = (d) => `2026-10-${String(d).padStart(2, '0')}`;
const CO = 'c0000000-0000-0000-0000-000000000001';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', address: '12 rue des Lilas', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Maison Martin', city: 'Vienne', is_active: true };
const WS = { w1: W1, w2: W2 };
const usr = (id, first, last, role = 'worker') => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01' });
const slot = (id, user_id, work_date, ws, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: ws?.id ?? null, work_date, absence_type: null, estimated_start: null, estimated_end: null, notes: null, position: null, added_by_worker: false, created_by: 'u-admin', created_at: `${work_date}T06:00:00Z`, ...extra });
const entry = (id, user_id, work_date, ws, status, minutes, extra = {}) => ({ id, company_id: CO, user_id, work_date, worksite_id: ws?.id ?? null, planning_id: null, status, start_time: '08:00:00', end_time: `${String(8 + Math.floor(minutes / 60)).padStart(2, '0')}:00:00`, total_minutes: minutes, reception: null, reserve_resolved_at: null, reserve_fixed_at: null, observation: null, ...extra });
const ver = (id, number, created_at) => ({ id, company_id: CO, week_start: D_(19), number, kind: number === 1 ? 'initial' : 'manuel', request: null, note: null, created_by: 'u-admin', created_at, cells: [], user_ids: [] });
const fresh = () => ({
  users: [usr('u-admin', 'Paul', 'Martin', 'admin'), usr('u-dupont', 'Jean', 'Dupont'), usr('u-martin', 'Léa', 'Martin')],
  companies: [{ id: CO, name: 'Entreprise Exemple', ai_enabled: true, kiosk_enabled: true, position_tracking_enabled: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: 'compta@exemple.fr', support_enabled: true, colleagues_planning_visible: false }],
  worksites: [W1, W2],
  planning: [slot('p1', 'u-dupont', D_(19), W1), slot('p2', 'u-dupont', D_(20), W1), slot('p3', 'u-dupont', D_(21), W1), slot('p4', 'u-martin', D_(20), W2)],
  // Léa : heures hors planning, une chez un client (lundi), une SANS client (jeudi) — « Autre ».
  time_entries: [entry('e1', 'u-martin', D_(19), W1, 'submitted', 120), entry('e2', 'u-martin', D_(22), null, 'submitted', 120),
    entry('e3', 'u-dupont', D_(13), W2, 'submitted', 60, { reception: 'avec', observation: 'Joint à reprendre' }),
    // Deux chantiers avec une réserve : l'anneau de « Lever la réserve » doit couvrir LA LISTE, pas le premier chantier.
    entry('e4', 'u-martin', D_(14), W1, 'submitted', 60, { reception: 'avec', observation: 'Fissure à reprendre' }),
    // Jean a envoyé sa journée d'aujourd'hui : la feuille d'heures (période « Aujourd'hui ») a une ligne à ouvrir pour « Corriger ».
    entry('e5', 'u-dupont', D_(21), W1, 'submitted', 420)],
  active_sessions: [], month_closures: [], user_closures: [],
  // Deux demandes en attente : l'anneau doit couvrir LA LISTE, jamais la première demande avec ses boutons ✓ ✗.
  leave_requests: [{ id: 'lr1', company_id: CO, user_id: 'u-dupont', type: 'conge', status: 'pending', start_date: D_(26), end_date: D_(27), created_at: '2026-10-10T08:00:00Z' },
    { id: 'lr2', company_id: CO, user_id: 'u-martin', type: 'conge', status: 'pending', start_date: D_(28), end_date: D_(29), created_at: '2026-10-11T08:00:00Z' }],
  invitations: [
    { id: 'i1', company_id: CO, email: 'marc@exemple.fr', first_name: 'Marc', last_name: 'Durand', role: 'worker', token: 't1', created_at: '2026-10-10T08:00:00Z', expires_at: '2030-01-01T00:00:00Z', accepted_at: null, created_by: 'u-admin' },
    { id: 'i2', company_id: CO, email: 'nina@exemple.fr', first_name: 'Nina', last_name: 'Morel', role: 'worker', token: 't2', created_at: '2026-10-11T08:00:00Z', expires_at: '2030-01-01T00:00:00Z', accepted_at: null, created_by: 'u-admin' },
  ],
  documents: [], certifications: [], push_subscriptions: [], kiosks: [], kiosk_settings: [], worksite_expenses: [], user_payroll: [], assistant_journal: [],
  planning_versions: [ver('v1', 1, '2026-10-19T05:30:00Z'), ver('v2', 2, '2026-10-20T09:10:00Z')],
});
let D = fresh();

// ─── Session simulée + routes Supabase (avec état, comme admin-lot11) ───────────
const now = Math.floor(NOW.getTime() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-admin', role: 'authenticated', exp: now + 864000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 864000, expires_in: 864000, token_type: 'bearer', user: { id: 'u-admin', email: 'paul@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or']);
const filterRows = (rows, params) => {
  for (const [k, v] of params) {
    if (SKIP.has(k)) continue;
    let neg = false; let w = v; if (w.startsWith('not.')) { neg = true; w = w.slice(4); }
    const dot = w.indexOf('.'); const op = w.slice(0, dot); const val = w.slice(dot + 1);
    rows = rows.filter((x) => {
      if (!(k in x)) return true;
      const cur = x[k]; let r = true;
      if (op === 'eq') r = String(cur) === val; else if (op === 'neq') r = String(cur) !== val;
      else if (op === 'in') r = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cur));
      else if (op === 'gte') r = String(cur) >= val; else if (op === 'lte') r = String(cur) <= val;
      else if (op === 'gt') r = String(cur) > val; else if (op === 'lt') r = String(cur) < val;
      else if (op === 'is') r = val === 'null' ? cur == null : String(cur) === val;
      return neg ? !r : r;
    });
  }
  return rows;
};
const embed = (t, row, sel) => {
  const out = { ...row };
  if (sel.includes('worksite:worksites')) out.worksite = row.worksite_id ? WS[row.worksite_id] : null;
  if (sel.includes('user:users')) out.user = D.users.find((x) => x.id === row.user_id) || null;
  if (sel.includes('owner:users')) { const o = D.users.find((x) => x.id === row.user_id); out.owner = o ? { first_name: o.first_name, last_name: o.last_name } : null; }
  return out;
};
// Toutes les requêtes qui partent, dans l'ordre : { method, path, rpc, fn, t }.
const calls = [];
let REPLY = { id: 'ajouter_salarie', extra: [] };
const mark = () => calls.length;
// Les SEULES lectures par RPC (POST) que le guide a le droit de provoquer en ouvrant une fenêtre : ajoutées une à une, par nom.
const RPC_LECTURE = new Set(['my_worksite_labour', 'support_is_staff', 'support_my_companies', 'document_category_ready', 'pending_invitations_sent_at']);
/** Tout ce qui n'est pas une lecture : un échec. */
const ecritures = (from) => calls.slice(from).filter((c) => {
  if (c.path.startsWith('/auth/v1/token')) return false;                 // renouvellement de session, pas un geste du guide
  if (c.rpc) return !RPC_LECTURE.has(c.rpc);                              // support_* (sauf lecture), set_*, kiosk_*… = écriture
  if (c.fn) return true;                                                  // kiosk, send-push, invite-worker, assistant…
  if (/\/auth\/v1\/factors/.test(c.path)) return true;
  return !['GET', 'HEAD'].includes(c.method);
});
const setup = async (ctx) => {
  await ctx.clock.install({ time: NOW });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url()); const m = r.request().method();
    const rec = { method: m, path: url.pathname, t: Date.now() };
    if (url.pathname.startsWith('/rest/v1/rpc/')) rec.rpc = url.pathname.slice('/rest/v1/rpc/'.length);
    if (url.pathname.startsWith('/functions/v1/')) rec.fn = url.pathname.slice('/functions/v1/'.length);
    calls.push(rec);
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/assistant')) {
      const link = { label: 'Me guider pas à pas', action: `guide:${REPLY.id}` };
      return r.fulfill({ json: { answer: 'Voici comment faire : suivez les étapes.', links: [{ label: 'Salariés', action: 'salaries' }, link, ...REPLY.extra], remaining: 40 } });
    }
    if (url.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
    if (url.pathname === '/rest/v1/rpc/my_worksite_labour') return r.fulfill({ json: [] });
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', ''); D[t] = D[t] || [];
    const sel = url.searchParams.get('select') || '*';
    const single = (r.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    if (m === 'DELETE' || m === 'POST' || m === 'PATCH') return r.fulfill({ status: 201, json: single ? { id: 'x' } : [] });
    const all = filterRows(D[t], url.searchParams).map((x) => embed(t, x, sel));
    if (single) return all.length ? r.fulfill({ json: all[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
    const rows = all.slice(off, lim ? off + Number(lim) : undefined);
    return r.fulfill({ json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${all.length}`, 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' } });
  });
};

const G = { card: '[data-testid=guide-card]', ring: '[data-testid=guide-ring]', next: '[data-testid=guide-next]', count: '[data-testid=guide-count]', text: '[data-testid=guide-text]' };
const READY = ':is([data-testid=barre-noire],[data-testid=planning-mobile])';
const errors = [];
const { adminStepsFor } = await import('../../supabase/functions/_shared/admin-tours.ts');
const { ADMIN_TOURS_V2: ADMIN_TOURS } = await import('../../supabase/functions/_shared/admin-tours-v2.ts');
check(ADMIN_TOURS.length === 48, `48 fiches (${ADMIN_TOURS.length})`);
// Les cibles qu'on TOUCHE pour avancer (elles ouvrent un menu ou une fenêtre de lecture) quand l'étape suivante ne prépare pas son écran elle-même.
const NAV = new Set(['bureau-nav.salaries', 'bureau-nav.clients', 'bureau-nav.exporter', 'bureau-nav.couts', 'bureau-nav.reserves', 'bureau-nav.borne',
  'bureau-nav.versions', 'bureau-nav.reglages', 'bureau-nav.compte', 'bureau-nav.menu', 'bureau-nav.plus', 'bureau-salaries.nouveau', 'bureau-salaries.conges',
  'bureau-salaries.nom', 'bureau-clients.nouveau', 'bureau-clients.crayon', 'bureau-planning.nom', 'bureau-planning.bulle', 'bureau-planning.case',
  'bureau-planning.ajouter', 'bureau-planning.autre', 'bureau-statut.feuille', 'bureau-edit.documents', 'bureau-export.un-salarie', 'bureau-stat.relance',
  'bureau-invit.voir', 'bureau-fiche.corriger', 'bureau-fiche.habilitations', 'bureau-versions.voir', 'bureau-nav.selection', 'bureau-reglages.rub-notif',
  'bureau-reglages.rub-heures', 'bureau-reglages.rub-borne', 'bureau-fiche.gerer', 'bureau-fiche.lignes', 'bureau-docs.envoyer-client', 'bureau-statut.absences']);
// Étapes qui ne s'affichent qu'après un geste qui AGIT (le guide ne le fait jamais, ce banc non plus), hors de l'essai, ou sans tablette reliée :
// « Je ne vois pas ce bouton » y est juste.
const APRES_GESTE = new Set(['lever_reserve:reserves.valider', 'abonnement:bureau-nav.abonner', 'borne:bureau-borne.deconnecter']);
const NON_OFFERT = new Set(['versions']);
const WIDTHS = (process.env.WIDTHS || '1280,834,390').split(',').map(Number);
const IDS = process.env.ONLY ? process.env.ONLY.split(',') : ADMIN_TOURS.map((t) => t.id);
const bilan = [];
for (const w of WIDTHS) {
  const mobile = w < 1024; const h = w === 1280 ? 800 : w === 834 ? 1112 : 844;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(mobile ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
  await setup(ctx); const p = await ctx.newPage();
  p.on('pageerror', (e) => { errors.push(`${w} ${e.message}`); console.log('   [erreur page]', w, e.message); });
  for (const id of IDS) {
    const t = ADMIN_TOURS.find((x) => x.id === id);
    const steps = adminStepsFor(t, mobile, w >= 768 && w < 1024); // tablette v2 : pas de bouton ☰ (components/admin-planning.tsx)
    if (t.ordi && mobile) continue;
    D = fresh(); REPLY = { id, extra: [] };
    await p.goto(`http://localhost:${PORT}/admin`); await p.waitForSelector(`${READY} >> visible=true`, { timeout: 20000 }); await p.waitForTimeout(1200);
    // Lancement comme en vrai : l'assistant répond avec « Me guider pas à pas ».
    await p.locator(':is([data-testid=bar-assistant],[data-testid=m-assistant]):visible').first().click();
    await p.waitForSelector('.as-bar textarea'); await p.fill('.as-bar textarea', `Comment faire ${id.replace(/_/g, ' ')} ?`);
    await p.click('button[aria-label="Envoyer"]');
    try { await p.waitForSelector('.as-bot .as-links button:has-text("Me guider pas à pas")', { timeout: 8000 }); } catch {
      // Le bureau v2 n'offre pas « Versions du planning » (components/assistant-bureau.tsx) : son guide n'est jamais proposé.
      check(NON_OFFERT.has(id), `${w} ${id} : « Me guider pas à pas » proposé`); bilan.push({ w, id, okAll: NON_OFFERT.has(id), res: ['non offert'] }); continue;
    }
    check(!NON_OFFERT.has(id), `${w} ${id} : jamais proposé en v2`);
    await p.locator('.as-bot .as-links').last().locator('button', { hasText: 'Me guider pas à pas' }).click();
    await p.waitForSelector(G.card, { timeout: 5000 });
    const from = calls.length; const res = [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      try { await p.waitForFunction((n) => document.querySelector('[data-testid=guide-count]')?.textContent?.includes(`Étape ${n}`), i + 1, { timeout: 3000 }); } catch { res.push(`${i + 1}:carte?`); break; }
      let ph = 'search';
      for (let k = 0; k < 40 && ph === 'search'; k++) { await p.waitForTimeout(150); ph = await p.locator(G.text).getAttribute('data-phase'); }
      // « S'il y a… » : l'étape dit elle-même que la case peut manquer (et la suivante n'existe qu'après elle).
      const conditionnel = /^S’il y a/.test(steps.find((x) => x.cible === s.cible)?.texte ?? '') || /^S’il y a/.test(steps[i - 1]?.texte ?? '');
      res.push(ph === 'ok' ? `${i + 1}✓` : APRES_GESTE.has(`${id}:${s.cible}`) || conditionnel ? `${i + 1}✓(attendu : ${ph})` : `${i + 1}✗(${ph}) ${s.cible}`);
      if (ph !== 'ok' || process.env.SHOTS) await p.screenshot({ path: `${SH}/${w}-${id}-${i + 1}.png` });
      const next = steps[i + 1];
      if (ph === 'ok' && next && (!next.ecran || s.cible === 'bureau-nav.selection') && NAV.has(s.cible) && id !== 'deplacer') {
        const el = s.cible === 'bureau-statut.absences' ? p.locator('[data-guide="bureau-statut.absences"] >> visible=true').first().getByText('Congé', { exact: true })
          : s.cible === 'bureau-fiche.lignes' ? p.locator('[data-guide="bureau-fiche.lignes"] >> visible=true').first().locator(':is([data-testid=fiche-ligne-ouvrir],.dz-hb-carte-ligne)').first()
          : p.locator(`[data-guide="${s.cible}"] >> visible=true`).first();
        try { await el.click({ timeout: 2000 }); } catch { await p.locator(G.next).click(); }
      } else await p.locator(G.next).click();
      await p.waitForTimeout(250);
    }
    // La borne : « Borne » touché par le patron lit l'état de la tablette (fonction kiosk), ce n'est pas le guide.
    const ecr = ecritures(from).filter((c) => !(id === 'borne' && c.fn === 'kiosk'));
    const okAll = res.every((r) => /✓/.test(r)) && res.length === steps.length;
    check(okAll, `${w} ${id} : ${res.join(' ')}`);
    check(ecr.length === 0, `${w} ${id} : aucune écriture${ecr.length ? ` — ${ecr.map((c) => `${c.method} ${c.path}`).join(' ; ')}` : ''}`);
    bilan.push({ w, id, okAll, res });
  }
  await ctx.close();
}
check(errors.length === 0, `aucune erreur JS (${errors.length})`);
fs.writeFileSync(`${SH}/bilan.json`, JSON.stringify(bilan, null, 1));
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close(); process.exit(ko ? 1 : 0);
