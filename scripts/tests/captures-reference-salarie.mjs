// Captures de RÉFÉRENCE de l'écran salarié (/poseur) : 12 états, rendu déterministe.
//
// Sert de preuve « rien n'a bougé à l'écran » pour les étapes d'intégration du nouveau
// design qui ne doivent AUCUN changement visible (CSS déplacé, chargements différés,
// code mort retiré). Plan : docs/design-brief/audit-salarie/03-plan-integration.md §5.
//
// Lancer : npm run build, puis
//   node scripts/tests/captures-reference-salarie.mjs out docs/design-brief/integration/captures-reference
//   node scripts/tests/comparer-captures.mjs docs/design-brief/integration/captures-reference <dossier-apres>
//
// Vraie page /poseur (export statique), base Supabase SIMULÉE (aucune vraie base),
// téléphone 390×844 à l'échelle 1 (PNG légers), HORLOGE FIGÉE (mercredi 14 octobre 2026,
// 10:30 à Paris) : la date, l'heure et le chrono du pointage en cours ne bougent pas
// d'une exécution à l'autre. Animations coupées à la capture.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
// playwright-core du projet s'il est là, sinon celui installé globalement avec playwright.
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/design-brief/integration/captures-reference', PORT = '4390'] = process.argv;
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

const FIXED = new Date('2026-10-14T08:30:00Z'); // mercredi 14 octobre 2026, 10:30 à Paris (UTC+2)
const today = '2026-10-14';
const CO = 'c0000000-0000-0000-0000-000000000001';
const ME = 'u-karim';
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Maison Martin', city: 'Villeurbanne', is_active: true };
const W3 = { id: 'w3', company_id: CO, client_name: 'Dépôt Gerland', city: 'Lyon', is_active: true };
const AUTRE = { id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true };
const entry = (id, ws, s, e, extra = {}) => {
  const [sh, sm] = s.split(':').map(Number); const [eh, em] = e.split(':').map(Number);
  return { id, company_id: CO, user_id: ME, worksite_id: ws.id, planning_id: null, work_date: today, start_time: `${s}:00`, end_time: `${e}:00`,
    break_minutes: 0, total_minutes: (eh * 60 + em) - (sh * 60 + sm), meal_allowance: false, status: 'draft', locked: false, exported_at: null,
    observation: null, reception: null, gap_before: null, worksite: ws, ...extra };
};
const plan = (id, ws, s, e) => ({ id, company_id: CO, user_id: ME, worksite_id: ws.id, work_date: today, absence_type: null, estimated_start: `${s}:00`, estimated_end: `${e}:00`, notes: null, worksite: ws });

const D = {
  users: [
    { id: ME, company_id: CO, first_name: 'Karim', last_name: 'Benali', role: 'worker', email: 'karim@exemple.fr', is_active: true, created_at: '2026-01-01' },
    { id: 'u-lucas', company_id: CO, first_name: 'Lucas', last_name: 'Petit', role: 'worker', email: 'lucas@exemple.fr', is_active: true, created_at: '2026-01-01' },
    { id: 'u-nina', company_id: CO, first_name: 'Nina', last_name: 'Roux', role: 'worker', email: 'nina@exemple.fr', is_active: true, created_at: '2026-01-01' },
  ],
  companies: [{ id: CO, name: 'Benali Rénovation', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
  worksites: [W1, W2, W3, AUTRE],
  planning: [], time_entries: [], active_sessions: [],
  month_closures: [], leave_requests: [], documents: [], time_entry_corrections: [], time_entry_positions: [], push_subscriptions: [],
};
let trainings = []; // lignes de rpc:my_trainings

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion: 'reduce' });
await ctx.clock.install(); await ctx.clock.setFixedTime(FIXED); // Date figée, les minuteries tournent
const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: ME, email: 'karim@exemple.fr', aud: 'authenticated', role: 'authenticated' } };
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);

const match = (rows, sp) => {
  let out = rows;
  for (const [k, v] of sp) {
    if (v.startsWith('eq.')) { const val = v.slice(3); out = out.filter((x) => !(k in x) || String(x[k]) === val); }
    if (v.startsWith('neq.')) { const val = v.slice(4); out = out.filter((x) => !(k in x) || String(x[k]) !== val); }
  }
  return out;
};
await ctx.route('**/*.supabase.co/**', async (r) => {
  const req = r.request(); const u = new URL(req.url()); const method = req.method();
  if (u.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
  if (u.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
  if (u.pathname.startsWith('/functions/v1/')) return r.fulfill({ json: {} });
  if (u.pathname === '/rest/v1/rpc/my_trainings') return r.fulfill({ json: trainings });
  if (u.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
  const t = u.pathname.replace('/rest/v1/', '');
  const rows = match(D[t] || [], u.searchParams);
  if (method === 'GET' || method === 'HEAD') return r.fulfill({ json: rows, headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  return r.fulfill({ status: 201, json: rows.length ? rows[0] : { id: 'new-1' } });
});

const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => { errors.push(e.message); console.log('   [erreur page]', e.message); });
let n = 0; const made = [];
const open = async (waitFor = '.bt-total') => { await p.goto(`http://localhost:${PORT}/poseur`); await p.waitForSelector(waitFor, { timeout: 15000 }); await p.waitForTimeout(1200); };
const shot = async (name) => {
  // Le pointeur hors de l'écran utile : un élément qui apparaît sous un pointeur immobile (le calendrier de la fenêtre
  // « Copier cette journée ») prendrait son état « survolé » selon l'instant d'arrivée, ce qui n'est pas un rendu.
  await p.mouse.move(2, 2);
  await p.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur()).catch(() => {});
  await p.waitForTimeout(500);
  const f = `${SH}/${String(++n).padStart(2, '0')}-${name}.png`;
  await p.screenshot({ path: f, animations: 'disabled', caret: 'hide' });
  made.push(f); console.log('📸', f, `${(fs.statSync(f).size / 1000).toFixed(0)} ko`);
};

// 1 · Journée vide
await open();
await shot('journee-vide');

// 2 · Journée avec un chantier prévu, une ligne saisie et un panier
D.planning = [plan('p1', W1, '08:00', '12:00')];
D.time_entries = [entry('e1', W2, '13:00', '16:30', { meal_allowance: true })];
await open();
await shot('journee-prevu-et-saisie');

// 3 · Pointage en cours (ouvert à la borne, 95 minutes plus tôt)
D.active_sessions = [{ user_id: ME, company_id: CO, worksite_id: 'w1', planning_id: 'p1', work_date: today, started_at: new Date(FIXED.getTime() - 95 * 60000).toISOString() }];
await open();
await shot('pointage-en-cours');
D.active_sessions = [];

// 4 · Fiche d'une intervention (éditeur) ouverte sur la ligne saisie
D.planning = []; D.time_entries = [entry('e1', W2, '13:00', '16:30')];
await open();
await p.locator('[data-testid=card-entry]').click();
await p.waitForSelector('.bt-ed');
await p.waitForTimeout(800);
await shot('editeur');

// 5 · Documents du chantier, ouverts depuis l'éditeur
await p.locator('.bt-ed-doc').click();
await p.waitForSelector('.bt-doc-tab, [data-testid=chantier-documents]', { timeout: 10000 }).catch(() => {});
await p.waitForTimeout(1200);
await shot('documents-chantier');

// 6 · Question « pause » à l'envoi (dix heures d'affilée sans pause)
D.time_entries = [entry('e1', W1, '07:00', '17:00')];
await open();
await p.locator('.bt-send', { hasText: 'Envoyer ma journée' }).click();
await p.waitForSelector('[data-testid=pause-ask]', { timeout: 10000 }).catch(() => {});
await p.waitForTimeout(900);
await shot('question-pause');

// 7 · « Copier cette journée » (calendrier à choisir) : react-day-picker
D.time_entries = [entry('e1', W1, '08:00', '12:00')];
await open();
await p.locator('.bt-dup').click();
await p.waitForSelector('.rdp, [role=grid]', { timeout: 10000 }).catch(() => {});
await p.waitForTimeout(1000);
await shot('copier-journee');

// 8 · Réserve à lever : carte + formulaire (ReserveLiftForm)
D.time_entries = [entry('e1', W1, '08:00', '12:00', { status: 'submitted', reception: 'avec', observation: 'Fissure enduit au-dessus de la porte', reserve_resolved_at: null, reserve_resolved_by: null, reserve_resolution: null, reserve_fixed_at: null, reserve_fixed_by: null, reserve_fix_note: null })];
await open();
await p.locator('[data-testid=card-lift]').click();
await p.waitForSelector('[data-testid=reserve-lift-form]', { timeout: 10000 }).catch(() => {});
await p.waitForTimeout(900);
await shot('reserve-formulaire');

// 9 · Menu du compte ouvert
D.time_entries = [entry('e1', W1, '08:00', '12:00')];
await open();
await p.locator('[data-guide="menu.compte"]').click();
await p.waitForSelector('[role=menu]', { timeout: 10000 });
await p.waitForTimeout(900);
await shot('menu-compte');

// 10 · Vue Semaine
await p.keyboard.press('Escape');
await p.waitForTimeout(500);
await p.locator('[data-guide="menu.compte"]').click();
await p.locator('[role=menuitem]', { hasText: 'Ma semaine' }).click();
await p.waitForTimeout(2000);
await shot('semaine');

// 11 · Formations (un contenu à voir)
trainings = [{ id: 't1', title: 'Pose du placo en sécurité', kind: 'video', video_url: 'https://exemple.fr/placo', document_name: null, document_path: null, document_mime: null, created_at: '2026-10-01T08:00:00Z', seen_at: null, video_path: null, video_size: null, video_duration: null }];
await open();
const hasTrainingMenu = await (async () => {
  await p.locator('[data-guide="menu.compte"]').click();
  await p.waitForTimeout(500);
  const m = p.locator('[data-testid=menu-formations]');
  if (await m.count()) { await m.click(); await p.waitForTimeout(1800); return true; }
  await p.keyboard.press('Escape'); return false;
})();
console.log(hasTrainingMenu ? '(formations : onglet ouvert)' : '(formations : pas d’entrée au menu avec cette simulation)');
await shot('formations');
trainings = [];

// 12 · Mon équipe (chef d'équipe)
D.users[0].role = 'lead';
D.time_entries = [entry('e1', W1, '08:00', '12:00')];
await open();
await p.locator('[data-testid=team-day]').scrollIntoViewIfNeeded().catch(() => {});
await p.waitForSelector('[data-testid=team-day]', { timeout: 10000 }).catch(() => {});
await p.waitForTimeout(900);
await shot('mon-equipe-chef');

console.log(`\n${made.length} capture(s) dans ${SH}${errors.length ? `, ${errors.length} erreur(s) de page` : ''}`);
await b.close(); srv.close();
process.exit(errors.length ? 1 : 0);
