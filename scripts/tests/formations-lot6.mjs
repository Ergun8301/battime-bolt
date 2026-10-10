// Formations (lot 6, oct. 2026), sur les VRAIES pages : « Salariés » du bureau
// (/admin) et l'appli du salarié (/poseur). UNE base simulée partagée par les
// navigateurs (aucune vraie base, aucun e-mail : send-push est simulé et compté).
// Horloge figée au mercredi 14 octobre 2026, 10:00 à Paris. Noms fictifs.
//
// Lancer : npm run build, puis
//   node scripts/tests/formations-lot6.mjs out docs/captures-lot6 [port]
// Captures « avant » (build de la base, captures seulement, aucune vérification) :
//   AVANT=1 node scripts/tests/formations-lot6.mjs <build d'avant> docs/captures-lot6 [port]
// (playwright-core doit être résoluble.)
//
// La base simulée a deux états (variable MIG) :
//   'non'  migration 20261010210000 pas appliquée : trainings / training_views →
//          404 PGRST205, my_trainings / set_training_seen → 404 PGRST202. Tout doit
//          être EXACTEMENT comme avant (comparé au texte des captures « avant »).
//   'oui'  migration appliquée : droits par colonne, RLS et fonctions rejoués ici
//          avec les règles du SQL (supabase/tests/lot6_formations.mjs les prouve
//          sur un vrai Postgres).
//
//   O1 sans migration : ni « Formations » dans « Salariés », ni dans le menu du téléphone
//   O2 « Formations » (même hauteur que « Demandes de congé ») ; liste « x/y vues »
//   O3 lien : javascript: refusé sur place ; youtu.be → « YouTube ✓ » ; « Certains
//      salariés » ; POST (colonnes permises) ; send-push aux 2 seulement ; aucun e-mail
//   O4 document : liste par chantier, sans photo ni facture ; « Toute l'équipe » ; vide
//   O5 « qui l'a vue » : ✓ date / — pas encore ; « Ouvrir ↗ » (nouvel onglet, noopener)
//   O6 « Retirer » (confirmation) → PATCH archived_at ; « retirées (1) » ; « Remettre »
//   O7 téléphone : menu « Formations », fenêtre sans défilement horizontal (titres longs)
//   O8 jamais de DELETE, jamais d'heures ni de planning écrits, chiffres inchangés
//   O9 ?demo=3 : jamais un salarié de démonstration dans la liste ni dans l'envoi
//   W1 salarié sans migration : ni bandeau, ni menu ; aucune écriture au chargement
//   W2 « 2 formations à voir › » ; menu « Formations » avec pastille
//   W3 la liste : pas encore vues d'abord ; vrais liens (nouvel onglet), lien signé ; aucune iframe
//   W4 « Vue » → set_training_seen ; « ✓ Vue le 14/10 » ; « Annuler » ; le bandeau suit
//   W5 lien hostile en base : aucun lien, « Lien indisponible »
//   W6 tout vu : plus de bandeau, le menu reste ; aucune formation : pas de menu
//   W7 chef d'équipe : pareil
//   W8 pas de réseau sur « Vue » : la case revient, message
//   W9 formation retirée pendant la session : message, la liste se relit
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-lot6', PORT = '5701'] = process.argv;
const AVANT = process.env.AVANT === '1';
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
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ─── Horloge figée : mercredi 14 octobre 2026, 10:00 (Paris) ──────────────────
const NOW = new Date('2026-10-14T10:00:00+02:00');
const TODAY = '2026-10-14';

// ─── Base simulée ─────────────────────────────────────────────────────────────
const CO = 'c0000000-0000-0000-0000-0000000000aa', CO2 = 'c0000000-0000-0000-0000-0000000000bb';
const ADMIN = 'u-admin', SAM = 'u-sam', ALEX = 'u-alex', CHLOE = 'u-chloe', DINA = 'u-dina';
const TEAM = [ALEX, CHLOE, DINA, SAM];
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Exemple', city: 'Lyon', product_type: 'Fenêtres', is_active: true };
const W2 = { id: 'w2', company_id: CO, client_name: 'Résidence Test', city: 'Bron', product_type: null, is_active: true };
const WS = { w1: W1, w2: W2 };
const u = (id, first_name, last_name, role = 'worker', extra = {}) => ({ id, company_id: CO, first_name, last_name, role, email: `${id}@exemple.fr`, is_active: true, created_at: '2026-01-01', ...extra });
const USERS = [u(ADMIN, 'Admin', 'Test', 'admin'), u(ALEX, 'Alex', 'Exemple'), u(CHLOE, 'Chloé', 'Démo', 'lead'), u(DINA, 'Dina', 'Essai'), u(SAM, 'Sam', 'Test'),
  u('u-ancien', 'Ancien', 'Test', 'worker', { is_active: false }), u('u-autre', 'Autre', 'Salarié', 'worker', { company_id: CO2 })];
const COMPANY = { id: CO, name: 'Entreprise Test', ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35, accountant_email: null };
const slot = (id, user_id, date, w, start, end, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: w?.id ?? null, work_date: date, absence_type: null, estimated_start: start, estimated_end: end,
  notes: null, position: null, added_by_worker: false, created_by: ADMIN, created_at: '2026-10-01T06:00:00Z', ...extra });
const PLANNING = [slot('p-s3', SAM, TODAY, W1, '08:00:00', '12:00:00'), slot('p-a3', ALEX, TODAY, W2, '13:30:00', '17:00:00'), slot('p-c2', CHLOE, '2026-10-13', W1, '08:00:00', '17:00:00')];
const entry = (id, user_id, date, w, status, start, end, minutes, extra = {}) => ({ id, company_id: CO, user_id, work_date: date, worksite_id: w?.id ?? null, planning_id: null, status, start_time: start, end_time: end,
  total_minutes: minutes, break_minutes: 0, meal_allowance: false, reception: null, reserve_resolved_at: null, reserve_fixed_at: null, observation: null, locked: false, exported_at: null, gap_before: null, source: null,
  exit_forgotten: false, modified_at: null, modified_by: null, created_at: `${date}T12:00:00Z`, submitted_at: status === 'draft' ? null : `${date}T18:00:00Z`, ...extra });
const ENTRIES = [
  entry('e-s1', SAM, TODAY, W1, 'submitted', '08:00:00', '11:30:00', 210, { planning_id: 'p-s3' }),
  entry('e-c2', CHLOE, '2026-10-13', W1, 'validated', '08:00:00', '16:00:00', 480, { planning_id: 'p-c2' }),
];
const doc = (id, w, label, file_name, mime_type, category = null, created_at = '2026-10-05T09:00:00Z') => ({ id, company_id: CO, worksite_id: w.id, uploaded_by: ADMIN, label, file_path: `${CO}/${w.id}/${id}.bin`, file_name, mime_type, size_bytes: 1000, created_at, work_date: null, time_entry_id: null, photo_no: null, category });
const DOCS = [
  doc('d-livret', W1, 'Livret sécurité', 'livret.pdf', 'application/pdf', null, '2026-10-09T09:00:00Z'),
  doc('d-plan', W2, 'Plan de pose', 'plan.pdf', 'application/pdf', 'plan', '2026-10-08T09:00:00Z'),
  doc('d-photo', W1, null, 'IMG_0001.jpg', 'image/jpeg', 'photo', '2026-10-07T09:00:00Z'),
  doc('d-facture', W1, 'Facture 12', 'facture.pdf', 'application/pdf', 'facture', '2026-10-06T09:00:00Z'),
  doc('d-devis', W2, 'Devis 3', 'devis.pdf', 'application/pdf', 'devis', '2026-10-05T09:00:00Z'),
  doc('d-notice', W2, null, 'notice-echafaudage.pdf', 'application/pdf', null, '2026-10-04T09:00:00Z'),
  { ...doc('d-autre', W1, 'Autre entreprise', 'x.pdf', 'application/pdf'), company_id: CO2, file_path: `${CO2}/w9/x.pdf` },
];
const tr = (id, title, extra = {}) => ({ id, company_id: CO, title, kind: 'video', video_url: null, document_id: null, all_team: true, assignee_ids: [], created_by: ADMIN, created_at: '2026-10-10T08:00:00Z', archived_at: null, ...extra });
const TRAININGS = [
  tr('t-harnais', 'Port du harnais', { video_url: 'https://www.youtube.com/watch?v=abc123', created_at: '2026-10-11T08:00:00Z' }),
  tr('t-livret', 'Livret sécurité chantier', { kind: 'document', document_id: 'd-livret', all_team: false, assignee_ids: [ALEX, SAM], created_at: '2026-10-09T08:00:00Z' }),
  tr('t-gestes', 'Gestes et postures', { video_url: 'https://vimeo.com/123456', created_at: '2026-10-12T08:00:00Z' }),
  tr('t-habil', 'Habilitation nacelle', { video_url: 'https://drive.google.com/file/d/ID/view?usp=sharing', all_team: false, assignee_ids: [ALEX], created_at: '2026-10-08T08:00:00Z' }),
];
const VIEWS = [
  { training_id: 't-harnais', user_id: ALEX, company_id: CO, seen_at: '2026-10-12T12:32:00Z' },
  { training_id: 't-harnais', user_id: CHLOE, company_id: CO, seen_at: '2026-10-13T07:05:00Z' },
  { training_id: 't-livret', user_id: SAM, company_id: CO, seen_at: '2026-10-10T15:00:00Z' },
];
let MIG = 'oui';
let pushSent = 2;
let EXTRA_MY = []; // lignes « hostiles » ajoutées à la réponse de my_trainings (défense en profondeur)
let OFFLINE_SEEN = false; // la prochaine requête set_training_seen est coupée (pas de réseau)
const D = {};
const freshDb = () => {
  for (const k of Object.keys(D)) delete D[k];
  Object.assign(D, {
    users: USERS.map((x) => ({ ...x })), companies: [{ ...COMPANY }], worksites: Object.values(WS).map((x) => ({ ...x })),
    planning: PLANNING.map((x) => ({ ...x })), time_entries: ENTRIES.map((x) => ({ ...x })), active_sessions: [],
    documents: DOCS.map((x) => ({ ...x })), trainings: TRAININGS.map((x) => ({ ...x, assignee_ids: [...x.assignee_ids] })), training_views: VIEWS.map((x) => ({ ...x })),
    user_payroll: [], invitations: [], month_closures: [], user_closures: [], leave_requests: [], push_subscriptions: [], kiosks: [],
    day_tasks: [], task_templates: [], meetings: [], meeting_participants: [],
  });
  EXTRA_MY = []; OFFLINE_SEEN = false;
};
freshDb();
const NEW_TABLES = new Set(['trainings', 'training_views']);
const NEW_FNS = new Set(['my_trainings', 'set_training_seen']);
const EMAIL_FNS = ['invite-worker', 'weekly-digest', 'send-payroll-export', 'cert-expiry-alerts', 'send-email', 'send-reminder-email'];
const userOf = (id) => D.users.find((x) => x.id === id);
const isAdmin = (uid) => userOf(uid)?.role === 'admin' && userOf(uid)?.is_active !== false;
const teamMember = (id) => { const x = userOf(id); return !!x && x.company_id === CO && x.is_active !== false && ['worker', 'lead'].includes(x.role); };

// ─── Les règles du SQL, rejouées (supabase/tests/lot6_formations.mjs) ─────────
class Refus extends Error { constructor(message, code = 'P0001', status = 400) { super(message); this.code = code; this.status = status; } }
let idSeq = 0;
const stamp = () => new Date(NOW.getTime() + (++idSeq) * 1000).toISOString();
const URL_RE = /^https:\/\/(www\.youtube\.com|m\.youtube\.com|youtube\.com|youtu\.be|vimeo\.com|www\.vimeo\.com|player\.vimeo\.com|drive\.google\.com|docs\.google\.com)\/[^\s<>"\\]*$/;
const visible = (t, uid, rows) => {
  if (t === 'trainings') return rows.filter((x) => x.company_id === CO && isAdmin(uid));
  if (t === 'training_views') return rows.filter((x) => x.company_id === CO && (isAdmin(uid) || x.user_id === uid));
  if (t === 'documents') return rows.filter((x) => x.company_id === CO);
  return rows;
};
function insertTraining(uid, body) {
  const allowed = ['company_id', 'title', 'kind', 'video_url', 'document_id', 'all_team', 'assignee_ids'];
  const bad = Object.keys(body).filter((k) => !allowed.includes(k));
  if (bad.length) throw new Refus(`permission denied for table trainings (${bad.join(', ')})`, '42501', 403);
  if (!isAdmin(uid) || body.company_id !== CO) throw new Refus('new row violates row-level security policy for table "trainings"', '42501', 403);
  const title = String(body.title || '').trim();
  if (title.length < 2 || title.length > 120) throw new Refus('new row for relation "trainings" violates check constraint "trainings_title_check"', '23514');
  if (body.video_url != null && (String(body.video_url).length > 500 || !URL_RE.test(body.video_url))) throw new Refus('new row for relation "trainings" violates check constraint "trainings_video_url_check"', '23514');
  if (!((body.kind === 'video' && body.video_url && !body.document_id) || (body.kind === 'document' && !body.video_url))) throw new Refus('violates check constraint "trainings_source"', '23514');
  if (body.kind === 'document' && !body.document_id) throw new Refus('Choisissez un document.', '22023');
  if (body.document_id && !D.documents.some((d) => d.id === body.document_id && d.company_id === CO)) throw new Refus('Document introuvable dans votre entreprise.', '42501');
  let ids = [];
  if (!body.all_team) {
    ids = Array.from(new Set((body.assignee_ids || []).filter(Boolean))).sort();
    if (!ids.length) throw new Refus('Choisissez au moins un salarié.', '22023');
    if (ids.some((id) => !teamMember(id))) throw new Refus('Salarié introuvable dans votre entreprise.', '42501');
  }
  const row = { id: `t-new-${++idSeq}`, company_id: CO, title, kind: body.kind, video_url: body.video_url ?? null, document_id: body.document_id ?? null, all_team: !!body.all_team, assignee_ids: ids, created_by: uid, created_at: stamp(), archived_at: null };
  D.trainings.push(row);
  return row;
}
function patchTrainings(uid, body, params) {
  const allowed = ['title', 'kind', 'video_url', 'document_id', 'all_team', 'assignee_ids', 'archived_at'];
  const bad = Object.keys(body).filter((k) => !allowed.includes(k));
  if (bad.length) throw new Refus(`permission denied for table trainings (${bad.join(', ')})`, '42501', 403);
  const hit = filterRows(visible('trainings', uid, D.trainings), params);
  for (const x of hit) {
    Object.assign(x, body);
    if ('archived_at' in body) x.archived_at = body.archived_at ? stamp() : null; // heure du serveur
  }
  return hit;
}
const docOf = (t) => (t.document_id ? D.documents.find((d) => d.id === t.document_id && d.company_id === t.company_id) || null : null);
function myTrainings(uid) {
  const me = userOf(uid);
  if (!me || me.is_active === false || me.company_id !== CO || !['worker', 'lead'].includes(me.role)) return [];
  const rows = D.trainings
    .filter((t) => t.company_id === CO && !t.archived_at && (t.all_team || t.assignee_ids.includes(uid)) && (t.kind === 'video' || docOf(t)))
    .map((t) => {
      const d = docOf(t); const v = D.training_views.find((x) => x.training_id === t.id && x.user_id === uid);
      return { id: t.id, title: t.title, kind: t.kind, video_url: t.video_url, document_name: d ? (d.label || d.file_name || 'Document') : null, document_path: d?.file_path ?? null,
        document_mime: d?.mime_type ?? null, created_at: t.created_at, seen_at: v?.seen_at ?? null };
    })
    .sort((a, z) => Number(!!a.seen_at) - Number(!!z.seen_at) || z.created_at.localeCompare(a.created_at));
  return [...rows, ...EXTRA_MY];
}
function setSeen(uid, { p_training, p_seen }) {
  const me = userOf(uid);
  if (!me || me.is_active === false) throw new Refus('Session invalide.', '42501', 403);
  if (!['worker', 'lead'].includes(me.role)) throw new Refus('Réservé aux salariés.', '42501', 403);
  const t = D.trainings.find((x) => x.id === p_training && x.company_id === CO && !x.archived_at && (x.all_team || x.assignee_ids.includes(uid)));
  if (!t) throw new Refus('Cette formation n\'existe pas, ou ne vous est pas destinée.', 'P0002', 404);
  const cur = D.training_views.find((x) => x.training_id === t.id && x.user_id === uid);
  if (p_seen !== false) {
    if (cur) return cur.seen_at;
    const v = { training_id: t.id, user_id: uid, company_id: CO, seen_at: NOW.toISOString() };
    D.training_views.push(v);
    return v.seen_at;
  }
  if (cur) D.training_views = D.training_views.filter((x) => x !== cur);
  return null;
}

// ─── Réseau simulé ────────────────────────────────────────────────────────────
const writes = []; // toute requête hors GET (REST, RPC, fonctions, stockage)
const gets = [];
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or']);
function filterRows(rows, params) {
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
}
const sortRows = (rows, order) => {
  if (!order) return rows;
  const keys = order.split(',').map((o) => { const [k, dir] = o.split('.'); return { k, desc: dir === 'desc' }; });
  return [...rows].sort((a, z) => { for (const { k, desc } of keys) { const x = String(a[k] ?? ''); const y = String(z[k] ?? ''); if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1); } return 0; });
};
const sessionFor = (uid) => {
  const now = Math.floor(NOW.getTime() / 1000) + 3600; const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 864000, aal: 'aal1' })}.sig`;
  return { access_token: jwt, refresh_token: 'r', expires_at: now + 864000, expires_in: 864000, token_type: 'bearer', user: { id: uid, email: `${uid}@exemple.fr`, aud: 'authenticated', role: 'authenticated' } };
};
const MISSING_TABLE = (t) => ({ status: 404, json: { code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache`, details: null, hint: null } });
const MISSING_FN = (fn) => ({ status: 404, json: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache`, details: null, hint: null } });
const errors = [];
const newCtx = async (uid, viewport) => {
  const ctx = await b.newContext({ viewport, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const session = sessionFor(uid);
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.addInitScript(() => {
    window.__toasts = [];
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        const list = n.matches?.('[data-sonner-toast]') ? [n] : [...(n.querySelectorAll?.('[data-sonner-toast]') || [])];
        for (const t of list) setTimeout(() => window.__toasts.push((t.textContent || '').trim()), 80);
      }
    }).observe(document, { childList: true, subtree: true });
    // Jamais d'e-mail : toute tentative d'ouvrir « mailto: » est comptée ; jamais de fenêtre ouverte par script.
    window.__mailto = 0; window.__opened = [];
    const isMail = (u) => /^mailto:/i.test(String(u || ''));
    window.open = function (u) { if (isMail(u)) window.__mailto++; window.__opened.push(String(u)); return null; };
    document.addEventListener('click', (e) => {
      const a = e.target?.closest?.('a[href]');
      if (!a) return;
      if (isMail(a.getAttribute('href'))) window.__mailto++;
      // Un lien « nouvel onglet » n'est pas suivi pendant le test : on note où il mène.
      if (a.target === '_blank') { window.__opened.push(a.href); e.preventDefault(); }
    }, true);
  });
  await ctx.clock.setFixedTime(NOW);
  await ctx.route((url) => url.hostname !== 'localhost' && !url.hostname.endsWith('.supabase.co'), (r) => r.abort());
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(); const url = new URL(req.url()); const m = req.method();
    let body = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname === '/storage/v1/object/sign/chantier-docs' && m === 'POST') {
      writes.push({ m: 'SIGN', t: 'chantier-docs', body, by: uid });
      return r.fulfill({ json: (body?.paths || []).map((p) => ({ path: p, signedURL: `/object/sign/chantier-docs/${p}?token=t-${uid}`, error: null })) });
    }
    if (url.pathname.startsWith('/storage/v1/')) return r.fulfill({ json: [] });
    if (url.pathname.startsWith('/functions/v1/')) {
      const fn = url.pathname.replace('/functions/v1/', '');
      writes.push({ m: 'FN', t: fn, body, by: uid });
      if (fn === 'send-push') return r.fulfill({ json: { mode: 'admin', sent: pushSent, failed: 0, purged: 0 } });
      return r.fulfill({ json: {} });
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.replace('/rest/v1/rpc/', '');
      if (m === 'GET' || m === 'HEAD') gets.push({ t: `rpc/${fn}`, by: uid, missing: NEW_FNS.has(fn) && MIG !== 'oui' }); else writes.push({ m: 'RPC', t: fn, body, by: uid });
      if (NEW_FNS.has(fn)) {
        if (MIG !== 'oui') return r.fulfill(MISSING_FN(fn));
        if (fn === 'set_training_seen' && OFFLINE_SEEN) { OFFLINE_SEEN = false; return r.abort('internetdisconnected'); }
        try {
          if (fn === 'my_trainings') return r.fulfill({ json: myTrainings(uid) });
          if (fn === 'set_training_seen') return r.fulfill({ json: setSeen(uid, body) });
        } catch (e) {
          return r.fulfill({ status: e.status || 400, json: { code: e.code, message: e.message, details: null, hint: null } });
        }
      }
      if (fn === 'company_has_kiosk') return r.fulfill({ json: false });
      return r.fulfill({ json: [] });
    }
    const t = url.pathname.replace('/rest/v1/', '');
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const reply = (rows, status = 200, total = rows.length, off = 0) => {
      if (single) return rows.length ? r.fulfill({ status, json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none', details: null, hint: null } });
      return r.fulfill({ status, json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${total}`, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' } });
    };
    if (NEW_TABLES.has(t) && MIG === 'non') { if (m === 'GET' || m === 'HEAD') gets.push({ t, p: new URLSearchParams(url.searchParams), by: uid, missing: true }); else writes.push({ m, t, body, by: uid }); return r.fulfill(MISSING_TABLE(t)); }
    if (m === 'GET' || m === 'HEAD') {
      gets.push({ t, p: new URLSearchParams(url.searchParams), by: uid });
      const sel = url.searchParams.get('select') || '*';
      let rows = sortRows(filterRows(visible(t, uid, D[t] || []), url.searchParams), url.searchParams.get('order')).map((x) => {
        if (t === 'trainings') return { ...x, ...(sel.includes('document:documents') ? { document: docOf(x) ? (({ label, file_name, file_path, mime_type }) => ({ label, file_name, file_path, mime_type }))(docOf(x)) : null } : {}) };
        if (t === 'documents') return { ...x, ...(sel.includes('worksite:worksites') ? { worksite: WS[x.worksite_id] ? { client_name: WS[x.worksite_id].client_name } : null } : {}) };
        if (t !== 'planning' && t !== 'time_entries') return x;
        return { ...x, ...(sel.includes('worksite:worksites') ? { worksite: x.worksite_id ? WS[x.worksite_id] : null } : {}), ...(sel.includes('user:users') ? { user: userOf(x.user_id) || null } : {}) };
      });
      const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.get('limit');
      const total = rows.length;
      if (off || lim) rows = rows.slice(off, lim ? off + Number(lim) : undefined);
      return reply(rows, 200, total, off);
    }
    writes.push({ m, t, q: url.search, body, by: uid });
    try {
      if (t === 'trainings' && m === 'POST') return reply([insertTraining(uid, Array.isArray(body) ? body[0] : body)], 201);
      if (t === 'trainings' && m === 'PATCH') return reply(patchTrainings(uid, body, url.searchParams));
      if (NEW_TABLES.has(t)) throw new Refus(`permission denied for table ${t}`, '42501', 403);
    } catch (e) {
      return r.fulfill({ status: e.status || 400, json: { code: e.code, message: e.message, details: null, hint: null } });
    }
    if (m === 'POST') { const list = (Array.isArray(body) ? body : [body]).map((x) => ({ id: `x-${++idSeq}`, ...x })); D[t] = [...(D[t] || []), ...list]; return reply(list, 201); }
    const hit = filterRows(D[t] || [], url.searchParams);
    if (m === 'PATCH') { for (const x of hit) Object.assign(x, body); return reply(hit); }
    if (m === 'DELETE') { D[t] = (D[t] || []).filter((x) => !hit.includes(x)); return reply(hit); }
    return reply([]);
  });
  return ctx;
};

// ─── Outils ───────────────────────────────────────────────────────────────────
let ok = 0, ko = 0; const fails = [];
const check = (c, m) => { if (AVANT) return; if (c) { ok++; console.log('  ✅', m); } else { ko++; fails.push(m); console.log('  ❌', m); } };
const section = (t) => { if (!AVANT) console.log(`\n═══ ${t}`); };
const shot = async (loc, name, opts = {}) => {
  const page = typeof loc.page === 'function' ? loc.page() : loc;
  const keepToasts = opts.toasts; delete opts.toasts;
  const toaster = (v) => page.evaluate((v) => document.querySelectorAll('[data-sonner-toaster]').forEach((t) => { t.style.visibility = v; }), v).catch(() => {});
  if (!keepToasts) { await toaster('hidden'); await new Promise((r) => setTimeout(r, 200)); }
  await loc.screenshot({ path: path.join(SH, `${name}.png`), ...opts }).catch((e) => console.log('   (capture impossible :', e.message.split('\n')[0], ')'));
  if (!keepToasts) await toaster('');
};
const since = (n) => writes.slice(n);
const of = (list, m, t) => list.filter((w) => w.m === m && (t == null || w.t === t));
const sameSet = (a, z) => JSON.stringify([...a].sort()) === JSON.stringify([...z].sort());
const txt = async (loc) => (await loc.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const toastsSince = async (p, k) => (await p.evaluate((k) => (window.__toasts || []).slice(k), k)).join(' | ');
const toastMark = (p) => p.evaluate(() => (window.__toasts || []).length);
const mailtos = (p) => p.evaluate(() => window.__mailto || 0);
const noOverflow = (p, sel = null) => p.evaluate((sel) => {
  const el = sel ? document.querySelector(sel) : document.documentElement;
  return !!el && el.scrollWidth <= el.clientWidth + 1;
}, sel);

const pages = [];
const track = (p, who) => { p.on('pageerror', (e) => { errors.push(`${who} : ${e.message}`); console.log(`   [erreur page ${who}]`, e.message); }); pages.push(p); return p; };
const office = await newCtx(ADMIN, { width: 1366, height: 900 });
const op = track(await office.newPage(), 'bureau');
const worker = await newCtx(SAM, { width: 390, height: 844 });
const wp = track(await worker.newPage(), 'salarié');

const openOffice = async (p = op, q = '') => {
  await p.goto(`http://localhost:${PORT}/admin${q}`);
  await p.waitForSelector('.bt-pl-gridwrap .bt-pl-name', { timeout: 25000 });
  await p.waitForTimeout(1300);
};
const openSalaries = async (p = op) => { await p.locator('.bt-pl-segbtn', { hasText: 'Salariés' }).click(); await p.waitForSelector('[role=dialog]'); await p.waitForTimeout(400); };
const dlg = (p = op) => p.locator('[role=dialog]').last();
const closeDlg = async (p = op) => { await p.keyboard.press('Escape'); await p.waitForTimeout(350); };
const openTrainings = async (p = op) => { await openSalaries(p); await p.click('[data-testid=salaries-trainings]'); await p.waitForSelector('[data-testid=trainings-dialog]'); await p.waitForTimeout(700); };
const openMobileOffice = async (ctx) => {
  const mp = track(await ctx.newPage(), 'bureau mobile');
  await mp.goto(`http://localhost:${PORT}/admin`); await mp.waitForSelector('.bt-pl-m-card, .bt-pl-m-ibtn', { timeout: 25000 }); await mp.waitForTimeout(1300);
  return mp;
};
const openMobileMenu = async (mp) => { await mp.locator('button[aria-label="Menu"]').first().click(); await mp.waitForSelector('.bt-mm-sheet'); await mp.waitForTimeout(500); };
const openWorker = async (p = wp) => { await p.goto(`http://localhost:${PORT}/poseur`); await p.waitForSelector('.bt-total', { timeout: 20000 }); await p.waitForTimeout(1200); };
const openWorkerMenu = async (p = wp) => { await p.getByRole('button', { name: 'Mon compte et menu' }).click(); await p.waitForSelector('[role=menu]'); await p.waitForTimeout(300); };
const menuTexts = async (p = wp) => (await p.locator('[role=menu] [role=menuitem]').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
const stats = async () => txt(op.locator('.bt-pl-stats').first());
const workerTotal = async (p = wp) => txt(p.locator('.bt-total').first());

// ═══ AVANT : captures du build d'avant (aucune vérification) ═════════════════
const TEXTS = path.join(SH, 'avant-textes.json');
const domTexts = async () => {
  MIG = 'non'; freshDb();
  const out = {};
  await openOffice(); await openSalaries();
  out.salaries = await txt(dlg());
  await shot(dlg(), `${AVANT ? 'avant' : 'sans-migration'}-bureau-salaries`);
  await closeDlg();
  const mob = await newCtx(ADMIN, { width: 390, height: 844 }); const mp = await openMobileOffice(mob);
  await openMobileMenu(mp);
  out.menuBureau = await txt(mp.locator('.bt-mm-sheet'));
  await shot(mp, `${AVANT ? 'avant' : 'sans-migration'}-bureau-menu-mobile`);
  await mob.close();
  await openWorker();
  out.journee = await txt(wp.locator('.bt-day-scroll, .bt-phbody').first());
  await shot(wp, `${AVANT ? 'avant' : 'sans-migration'}-salarie-ma-journee`);
  await openWorkerMenu();
  out.menuSalarie = await menuTexts();
  await shot(wp, `${AVANT ? 'avant' : 'sans-migration'}-salarie-menu`);
  await wp.keyboard.press('Escape'); await wp.waitForTimeout(200);
  return out;
};
if (AVANT) {
  const t = await domTexts();
  fs.writeFileSync(TEXTS, `${JSON.stringify(t, null, 2)}\n`);
  console.log(`Captures « avant » et textes écrits dans ${SH}`);
  await b.close(); srv.close();
  process.exit(0);
}

// ═══ O1 / W1 · migration PAS appliquée : exactement comme avant ══════════════
section('O1 / W1 · migration pas appliquée : « Salariés », menu du téléphone, appli du salarié comme avant');
const W0 = writes.length;
const sans = await domTexts();
{
  check(gets.some((g) => g.t === 'trainings' && g.missing), 'bureau : la lecture tentée reçoit « table absente » (PGRST205)');
  check(gets.filter((g) => g.t === 'trainings' && g.missing).length === 2, 'table absente : une seule lecture par page (ordinateur, téléphone), pas une de plus à l’ouverture de « Salariés » ou du menu');
  check(!sans.salaries.includes('Formations') && !sans.menuBureau.includes('Formations'), 'aucun « Formations » ni dans « Salariés » ni dans le menu du téléphone');
  check(gets.some((g) => g.t === 'rpc/my_trainings' && g.missing), 'salarié : my_trainings lue par un GET, reçoit « fonction absente » (PGRST202)');
  check(!sans.menuSalarie.join('|').includes('Formations') && !/formations? à voir/.test(sans.journee), 'salarié : ni bandeau, ni entrée de menu');
  check(!since(W0).some((w) => NEW_FNS.has(w.t) || NEW_TABLES.has(w.t)), 'aucune écriture du lot, aucun appel de ses fonctions en POST au chargement (salarié et bureau)');
  if (fs.existsSync(TEXTS)) {
    const avant = JSON.parse(fs.readFileSync(TEXTS, 'utf8'));
    check(avant.salaries === sans.salaries, '« Salariés » : même texte que le build d’avant');
    check(avant.menuBureau === sans.menuBureau, 'menu du téléphone (bureau) : même texte que le build d’avant');
    check(avant.journee === sans.journee, '« Ma journée » : même texte que le build d’avant');
    check(JSON.stringify(avant.menuSalarie) === JSON.stringify(sans.menuSalarie), `menu du salarié : mêmes entrées que le build d’avant (${sans.menuSalarie.length})`);
  } else {
    console.log('   (pas de textes « avant » : lancer d’abord AVANT=1 sur le build d’avant)');
  }
}
const statsBase = await stats();
await openWorker();
const totalBase = await workerTotal();

// ═══ O2 · migration appliquée : le bouton, la liste ═══════════════════════════
section('O2 · « Formations » dans « Salariés » ; la liste « x/y vues »');
MIG = 'oui'; freshDb();
await openOffice();
check(await stats() === statsBase, `chiffres du cockpit identiques avec la migration (${statsBase})`);
{
  await openSalaries();
  const btn = op.locator('[data-testid=salaries-trainings]');
  check(await btn.count() === 1 && (await txt(btn)) === 'Formations', 'bouton « Formations » dans « Salariés »');
  const hConge = await dlg().getByRole('button', { name: /Demandes de congé/ }).evaluate((e) => e.getBoundingClientRect().height);
  const hForm = await btn.evaluate((e) => e.getBoundingClientRect().height);
  check(Math.abs(hConge - hForm) < 0.5, `même hauteur que « Demandes de congé » (${hForm} px), petit bouton discret`);
  await shot(dlg(), 'apres-bureau-salaries');
  await btn.click(); await op.waitForSelector('[data-testid=trainings-dialog]'); await op.waitForTimeout(800);
  const items = op.locator('[data-testid=tr-item]');
  check(await items.count() === 4, `4 formations actives (${await items.count()})`);
  const titles = await op.locator('[data-testid=tr-item] [data-testid=tr-title-text]').allInnerTexts();
  check(titles.join('|') === 'Gestes et postures|Port du harnais|Livret sécurité chantier|Habilitation nacelle', `plus récentes d’abord (${titles.join(' · ')})`);
  const counts = (await op.locator('[data-testid=tr-item] [data-testid=tr-count]').allInnerTexts()).map((s) => s.trim());
  check(counts.join('|') === '0/4 vue|2/4 vues|1/2 vue|0/1 vue', `« x/y vues » : ${counts.join(' · ')}`);
  const sub = await txt(items.nth(2).locator('.bt-fo-s'));
  check(sub === 'Document · Livret sécurité · 2 salariés · 09/10', `sous-titre d’un document : « ${sub} »`);
  check((await txt(items.nth(1).locator('.bt-fo-s'))) === 'YouTube · Toute l’équipe · 11/10', 'sous-titre d’une vidéo : « YouTube · Toute l’équipe · 11/10 »');
  await shot(dlg(), 'apres-bureau-formations-liste');
}

// ═══ O3 · ajouter un lien ═════════════════════════════════════════════════════
section('O3 · lien : refusé sur place, puis YouTube ✓ ; « Certains salariés » ; notification aux 2 seulement');
const WO = writes.length; // O8 : à partir d'ici, aucune écriture planning / heures
{
  await op.click('[data-testid=tr-add-open]');
  const save = op.locator('[data-testid=tr-save]');
  await op.fill('[data-testid=tr-title]', 'x');
  check(await save.isDisabled(), 'titre d’un caractère : « Ajouter » désactivé');
  await op.fill('[data-testid=tr-title]', '  Consignes   échafaudage ');
  await op.fill('[data-testid=tr-link]', 'javascript:alert(1)');
  check((await txt(op.locator('[data-testid=tr-link-error]'))) === 'Lien refusé : YouTube, Vimeo ou Google Drive uniquement.' && await save.isDisabled(), 'javascript: refusé sur place, « Ajouter » désactivé');
  await shot(dlg(), 'apres-bureau-lien-refuse');
  for (const bad of ['https://evil.com/video', 'data:text/html,x', 'https://youtube.com.evil.com/x', 'https://www.youtube.com/']) {
    await op.fill('[data-testid=tr-link]', bad);
    check(await op.locator('[data-testid=tr-link-error]').count() === 1 && await save.isDisabled(), `refusé sur place : ${bad}`);
  }
  await op.fill('[data-testid=tr-link]', 'https://drive.google.com/file/d/ID/view');
  check(await op.locator('[data-testid=tr-drive-hint]').count() === 1, 'Google Drive : rappel « Tous les utilisateurs disposant du lien »');
  await op.fill('[data-testid=tr-link]', 'youtu.be/abc');
  check((await txt(op.locator('[data-testid=tr-link-ok]'))) === 'YouTube ✓', 'youtu.be/abc → « YouTube ✓ »');
  await op.click('[data-testid=tr-pick]');
  check(await save.isDisabled(), '« Certains salariés » sans personne : « Ajouter » désactivé');
  const people = await op.locator('[data-testid=tr-person]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
  check(sameSet(people, TEAM), `liste : les 4 salariés et chef d’équipe actifs, ni le bureau, ni l’archivé, ni l’autre entreprise (${people.join(', ')})`);
  await op.locator(`[data-testid=tr-person][data-id=${ALEX}]`).check();
  await op.locator(`[data-testid=tr-person][data-id=${SAM}]`).check();
  await shot(dlg(), 'apres-bureau-ajout-lien');
  const n = writes.length; const k = await toastMark(op);
  await save.click(); await op.waitForTimeout(1300);
  const post = of(since(n), 'POST', 'trainings');
  check(post.length === 1, 'une seule insertion (POST /rest/v1/trainings)');
  const body = post[0]?.body || {};
  check(JSON.stringify(Object.keys(body).sort()) === JSON.stringify(['all_team', 'assignee_ids', 'company_id', 'document_id', 'kind', 'title', 'video_url']), `colonnes envoyées : ${Object.keys(body).sort().join(', ')} (ni id, ni created_by, ni archived_at)`);
  check(body.company_id === CO && body.title === 'Consignes échafaudage' && body.kind === 'video' && body.video_url === 'https://youtu.be/abc' && body.document_id === null && body.all_team === false && sameSet(body.assignee_ids, [ALEX, SAM]),
    'corps : cette entreprise, titre nettoyé, lien https normalisé, 2 salariés');
  const push = of(since(n), 'FN', 'send-push');
  check(push.length === 1 && sameSet(push[0].body.user_ids, [ALEX, SAM]), `send-push une fois, aux 2 salariés seulement (${push[0]?.body.user_ids?.join(', ')})`);
  check(push[0]?.body.body === 'Nouvelle formation : Consignes échafaudage' && push[0]?.body.title === 'Entreprise Test' && push[0]?.body.url === '/poseur' && /^formation-/.test(push[0]?.body.tag || ''), 'notification : « Nouvelle formation : … », titre = l’entreprise, ouvre /poseur');
  check(!since(n).some((w) => w.m === 'FN' && EMAIL_FNS.includes(w.t)) && await mailtos(op) === 0, 'aucune fonction d’e-mail, aucun mailto');
  check((await toastsSince(op, k)).includes('Formation ajoutée · 2 appareils prévenus'), 'message « Formation ajoutée · 2 appareils prévenus »');
  check(await op.locator('[data-testid=tr-item]').count() === 5 && await op.locator('[data-testid=tr-form]').count() === 0, 'la liste a 5 formations ; le formulaire est refermé');
  check((await txt(op.locator('[data-testid=tr-item]').first().locator('[data-testid=tr-count]'))) === '0/2 vue', 'nouvelle formation : « 0/2 vue »');
  // send-push « 0 appareil » : message sans chiffre.
  pushSent = 0;
  await op.click('[data-testid=tr-add-open]');
  await op.fill('[data-testid=tr-title]', 'Rangement du dépôt');
  await op.fill('[data-testid=tr-link]', 'https://player.vimeo.com/video/42');
  const k2 = await toastMark(op);
  await save.click(); await op.waitForTimeout(1200);
  const t2 = await toastsSince(op, k2);
  check(t2.includes('Formation ajoutée') && !t2.includes('appareil'), '0 appareil : « Formation ajoutée », sans chiffre');
  pushSent = 2;
}

// ═══ O4 · ajouter un document ════════════════════════════════════════════════
section('O4 · document déjà téléversé : par chantier, ni photo ni facture ; « Toute l’équipe »');
{
  await op.click('[data-testid=tr-add-open]');
  await op.fill('[data-testid=tr-title]', 'Livret d’accueil');
  await op.click('[data-testid=tr-kind-document]');
  await op.waitForSelector('[data-testid=tr-doc]');
  check(gets.some((g) => g.t === 'documents' && g.p.get('company_id') === `eq.${CO}`), 'documents lus pour CETTE entreprise');
  const groups = await op.locator('[data-testid=tr-doc] optgroup').evaluateAll((els) => els.map((g) => `${g.label}: ${[...g.querySelectorAll('option')].map((o) => o.textContent).join(', ')}`));
  check(groups.join(' / ') === 'Villa Exemple: Livret sécurité · 09/10 / Résidence Test: Plan de pose · 08/10, notice-echafaudage.pdf · 04/10', `par chantier, sans photo, facture, devis ni document d’une autre entreprise (${groups.join(' / ')})`);
  check(await op.locator('[data-testid=tr-save]').isDisabled(), 'aucun document choisi : « Ajouter » désactivé');
  await op.selectOption('[data-testid=tr-doc]', 'd-plan');
  check(await op.locator('[data-testid=tr-all]').getAttribute('aria-pressed') === 'true', '« Toute l’équipe » par défaut');
  await shot(dlg(), 'apres-bureau-ajout-document');
  const n = writes.length;
  await op.click('[data-testid=tr-save]'); await op.waitForTimeout(1300);
  const body = of(since(n), 'POST', 'trainings')[0]?.body || {};
  check(body.kind === 'document' && body.document_id === 'd-plan' && body.video_url === null && body.all_team === true && Array.isArray(body.assignee_ids) && body.assignee_ids.length === 0, 'POST : kind document, document_id, aucun lien, toute l’équipe');
  const push = of(since(n), 'FN', 'send-push');
  check(push.length === 1 && sameSet(push[0].body.user_ids, TEAM), 'send-push à toute l’équipe (4 comptes actifs, ni bureau ni archivé)');
  // Aucun document proposable : message.
  await closeDlg();
  // Les documents proposables sont supprimés depuis « Documents » (ON DELETE SET NULL côté formations).
  D.documents = D.documents.filter((d) => ['d-photo', 'd-facture', 'd-devis', 'd-autre'].includes(d.id));
  for (const t of D.trainings) if (t.document_id && !D.documents.some((d) => d.id === t.document_id)) t.document_id = null;
  await openTrainings();
  await op.click('[data-testid=tr-add-open]'); await op.click('[data-testid=tr-kind-document]');
  await op.waitForSelector('[data-testid=tr-doc-empty]');
  check((await txt(op.locator('[data-testid=tr-doc-empty]'))) === 'Aucun document : ajoutez-le d’abord dans « Documents » d’un chantier.', 'aucun document proposable : « ajoutez-le d’abord dans « Documents » d’un chantier »');
  const gone = op.locator('[data-testid=tr-item]', { hasText: 'Livret sécurité chantier' });
  check((await txt(gone.locator('[data-testid=tr-doc-gone]'))) === 'document retiré', 'document supprimé depuis : « document retiré » au bureau');
  await op.click('[data-testid=tr-cancel]');
  await closeDlg();
  D.documents = DOCS.map((x) => ({ ...x }));
  D.trainings.find((t) => t.id === 't-livret').document_id = 'd-livret';
}

// ═══ O5 · qui l'a vue ═════════════════════════════════════════════════════════
section('O5 · qui l’a vue ; « Ouvrir ↗ » dans un nouvel onglet');
{
  await openTrainings();
  const row = op.locator('[data-testid=tr-item]', { hasText: 'Port du harnais' });
  await row.locator('[data-testid=tr-head]').click(); await op.waitForTimeout(400);
  const who = (await row.locator('[data-testid=tr-who-row]').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  check(who.join(' | ') === '✓ Alex Exemple 12/10 14:32 | ✓ Chloé Démo 13/10 09:05 | — Dina Essai pas encore | — Sam Test pas encore', `par prénom : ${who.join(' | ')}`);
  const a = row.locator('[data-testid=tr-open]');
  const attrs = await a.evaluate((e) => ({ href: e.getAttribute('href'), target: e.target, rel: e.rel }));
  check(attrs.href === 'https://www.youtube.com/watch?v=abc123' && attrs.target === '_blank' && /noopener/.test(attrs.rel) && /noreferrer/.test(attrs.rel), `« Ouvrir ↗ » : ${attrs.href}, nouvel onglet, rel="${attrs.rel}"`);
  await shot(dlg(), 'apres-bureau-qui-a-vu');
  const n = writes.length;
  const drow = op.locator('[data-testid=tr-item]', { hasText: 'Livret sécurité chantier' });
  await drow.locator('[data-testid=tr-head]').click(); await op.waitForTimeout(700);
  const sign = of(since(n), 'SIGN');
  check(sign.length === 1 && JSON.stringify(sign[0].body?.paths) === JSON.stringify([`${CO}/w1/d-livret.bin`]), 'document : lien signé demandé pour SON chemin seulement (bucket privé chantier-docs)');
  const dh = await drow.locator('[data-testid=tr-open]').getAttribute('href');
  check(/\/storage\/v1\/object\/sign\/chantier-docs\/.+d-livret\.bin\?token=/.test(dh || ''), `document : « Ouvrir ↗ » = lien signé (${(dh || '').slice(-40)})`);
  check(await op.locator('iframe').count() === 0, 'aucune iframe');
}

// ═══ O6 · retirer, remettre ═══════════════════════════════════════════════════
section('O6 · « Retirer » (confirmation) puis « Remettre » ; rien ne s’efface');
{
  const row = op.locator('[data-testid=tr-item]', { hasText: 'Habilitation nacelle' });
  await row.locator('[data-testid=tr-head]').click(); await op.waitForTimeout(300);
  await row.locator('[data-testid=tr-archive]').click();
  check((await txt(row.locator('.bt-fo-confirm'))).startsWith('Les salariés ne la verront plus ; les « Vue » restent.'), 'confirmation : « Les salariés ne la verront plus ; les « Vue » restent. »');
  const n = writes.length;
  await row.locator('[data-testid=tr-archive-yes]').click(); await op.waitForTimeout(1000);
  const patch = of(since(n), 'PATCH', 'trainings');
  check(patch.length === 1 && JSON.stringify(Object.keys(patch[0].body)) === '["archived_at"]' && !!patch[0].body.archived_at && patch[0].q.includes('id=eq.t-habil'), 'PATCH archived_at seulement, sur cette formation');
  check(!!D.trainings.find((t) => t.id === 't-habil').archived_at, 'formation retirée (archived_at posé)');
  const link = op.locator('[data-testid=tr-show-archived]');
  check((await txt(link)) === 'Afficher les formations retirées (1)', '« Afficher les formations retirées (1) »');
  await link.click(); await op.waitForTimeout(300);
  await shot(dlg(), 'apres-bureau-retirees');
  const arow = op.locator('[data-testid=tr-archived-item]', { hasText: 'Habilitation nacelle' });
  await arow.locator('[data-testid=tr-head]').click(); await op.waitForTimeout(300);
  const n2 = writes.length;
  await arow.locator('[data-testid=tr-restore]').click(); await op.waitForTimeout(1000);
  const p2 = of(since(n2), 'PATCH', 'trainings');
  check(p2.length === 1 && p2[0].body.archived_at === null && !D.trainings.find((t) => t.id === 't-habil').archived_at, '« Remettre » : PATCH archived_at = null');
  check(await op.locator('[data-testid=tr-show-archived]').count() === 0, 'plus de formation retirée');
  await closeDlg();
}

// ═══ O7 · téléphone du bureau ═════════════════════════════════════════════════
section('O7 · téléphone (390 px) : menu « Formations », fenêtre sans débordement');
{
  D.trainings.push(tr('t-long', `Consignes de sécurité pour le montage et le démontage des échafaudages roulants en hauteur — version complète ${'x'.repeat(8)}`.slice(0, 120), { video_url: 'https://youtu.be/long', created_at: '2026-10-13T08:00:00Z' }));
  D.users.push(u('u-longnom', 'Maximilien-Alexandre', 'De La Fontaine-Beauregard-Essai'));
  const mob = await newCtx(ADMIN, { width: 390, height: 844 }); const mp = await openMobileOffice(mob);
  await openMobileMenu(mp);
  const item = mp.locator('[data-testid=mm-trainings]');
  check(await item.count() === 1 && (await txt(item)) === 'Formations', 'menu du téléphone : « Formations »');
  await shot(mp, 'apres-bureau-menu-mobile');
  await item.click(); await mp.waitForSelector('[data-testid=trainings-dialog]'); await mp.waitForTimeout(900);
  await mp.locator('[data-testid=tr-item]', { hasText: 'Consignes de sécurité' }).locator('[data-testid=tr-head]').click(); await mp.waitForTimeout(300);
  await mp.click('[data-testid=tr-add-open]'); await mp.click('[data-testid=tr-pick]'); await mp.waitForTimeout(200);
  const fits = await mp.locator('[data-testid=trainings-dialog]').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  check(fits && await noOverflow(mp), 'fenêtre et page sans défilement horizontal (titre de 120 caractères, nom très long)');
  await shot(mp, 'apres-bureau-formations-390');
  await mob.close();
  D.trainings = D.trainings.filter((t) => t.id !== 't-long'); D.users = D.users.filter((x) => x.id !== 'u-longnom');
}

// ═══ O9 · aperçu avec salariés de démonstration ══════════════════════════════
section('O9 · ?demo=3 : jamais un salarié de démonstration dans la liste ni dans l’envoi');
{
  await openOffice(op, '?demo=3');
  check(await op.locator('.bt-pl-gridwrap tbody:not(.bt-pl-ghostbody) .bt-pl-name').count() >= 7, 'grille : les 3 salariés de démonstration sont affichés (aperçu)');
  await openTrainings();
  await op.click('[data-testid=tr-add-open]'); await op.click('[data-testid=tr-pick]');
  const ids = await op.locator('[data-testid=tr-person]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
  check(ids.length === 4 && !ids.some((id) => id.startsWith('demo-')), `liste : ${ids.length} vrais comptes, aucun « demo-… »`);
  await op.click('[data-testid=tr-all]');
  await op.fill('[data-testid=tr-title]', 'Tri des déchets');
  await op.fill('[data-testid=tr-link]', 'https://www.youtube.com/watch?v=tri');
  const n = writes.length;
  await op.click('[data-testid=tr-save]'); await op.waitForTimeout(1200);
  const push = of(since(n), 'FN', 'send-push')[0];
  check(!!push && sameSet(push.body.user_ids, TEAM) && !push.body.user_ids.some((id) => id.startsWith('demo-')), 'send-push « toute l’équipe » : les 4 vrais comptes, aucun « demo-… »');
  check(of(since(n), 'POST', 'trainings')[0]?.body.assignee_ids?.length === 0, 'POST : aucune liste (toute l’équipe)');
  await closeDlg();
}

// ═══ O8 · jamais d'effacement, jamais des heures ═════════════════════════════
section('O8 · jamais de DELETE, jamais d’heures ni de planning écrits');
{
  const all = since(WO);
  check(!all.some((w) => w.m === 'DELETE' && NEW_TABLES.has(w.t)), 'aucun DELETE sur trainings ni training_views');
  check(!all.some((w) => NEW_TABLES.has(w.t) && w.t === 'training_views'), 'le bureau n’écrit jamais de « Vue »');
  check(!all.some((w) => ['planning', 'time_entries', 'active_sessions'].includes(w.t)), 'aucune écriture planning / heures / chrono');
  await openOffice();
  check(await stats() === statsBase, `chiffres du cockpit inchangés après les ajouts (${statsBase})`);
}

// ═══ W2 · le salarié : bandeau, menu ═════════════════════════════════════════
section('W2 · salarié : « 2 formations à voir › », menu « Formations » avec pastille');
freshDb();
const WW = writes.length;
await openWorker();
{
  check(await workerTotal() === totalBase, `« Ma journée » : total inchangé (${totalBase})`);
  const banner = wp.locator('[data-testid=trainings-banner]');
  check(await banner.count() === 1 && (await txt(banner)) === '2 2 formations à voir ›', `bandeau : « ${await txt(banner)} »`);
  await shot(wp, 'apres-salarie-ma-journee');
  await openWorkerMenu();
  const m = wp.locator('[data-testid=menu-formations]');
  check(await m.count() === 1 && (await txt(m)) === 'Formations 2', `menu : « ${await txt(m)} » (pastille 2)`);
  await shot(wp, 'apres-salarie-menu');
  await wp.keyboard.press('Escape'); await wp.waitForTimeout(200);
}

// ═══ W3 · la liste ════════════════════════════════════════════════════════════
section('W3 · la liste : pas encore vues d’abord ; vrais liens ; lien signé ; aucune iframe');
{
  const n = writes.length;
  await wp.click('[data-testid=trainings-banner]'); await wp.waitForSelector('[data-testid=trainings-list]'); await wp.waitForTimeout(900);
  check((await txt(wp.locator('.bt-phdr-back'))) === 'Formations', 'en-tête « Formations » avec retour');
  const rows = (await wp.locator('[data-testid=training-row]').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  check(rows.length === 3 && rows[0].startsWith('Gestes et postures Vimeo · ajoutée le 12 oct.') && rows[1].startsWith('Port du harnais YouTube · ajoutée le 11 oct.') && rows[2].startsWith('Livret sécurité chantier Livret sécurité · ajoutée le 9 oct.'),
    `pas encore vues d’abord, puis la vue (${rows.map((r) => r.split(' · ')[0]).join(' / ')})`);
  check(!rows.some((r) => r.includes('Habilitation')), 'la formation d’Alex seul n’apparaît pas');
  const seenFlags = await wp.locator('[data-testid=training-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-seen')));
  check(seenFlags.join('') === '001', 'la vue est en dernier (grisée)');
  const links = await wp.locator('[data-testid=training-open]').evaluateAll((els) => els.map((e) => ({ href: e.getAttribute('href'), target: e.target, rel: e.rel })));
  check(links[0]?.href === 'https://vimeo.com/123456' && links[1]?.href === 'https://www.youtube.com/watch?v=abc123', 'vidéos : le lien tel quel');
  check(links.length === 3 && links.every((l) => l.target === '_blank' && /noopener/.test(l.rel) && /noreferrer/.test(l.rel)), 'chaque « Ouvrir ↗ » : nouvel onglet, rel="noopener noreferrer"');
  const sign = of(since(n), 'SIGN');
  check(sign.length >= 1 && sign.every((s) => JSON.stringify(s.body?.paths) === JSON.stringify([`${CO}/w1/d-livret.bin`])), 'document : lien signé demandé pour SON chemin (dossier de l’entreprise)');
  check(/\/storage\/v1\/object\/sign\/chantier-docs\/.+d-livret\.bin\?token=/.test(links[2]?.href || ''), 'document : « Ouvrir ↗ » = lien signé');
  check(await wp.locator('iframe').count() === 0, 'aucune iframe');
  await wp.locator('[data-testid=training-open]').first().click(); await wp.waitForTimeout(200);
  check((await wp.evaluate(() => window.__opened)).includes('https://vimeo.com/123456') && wp.url().endsWith('/poseur'), 'toucher « Ouvrir ↗ » vise le lien dans un nouvel onglet ; l’appli reste ouverte');
  check(!of(since(n), 'RPC', 'set_training_seen').length, 'ouvrir ne coche PAS « Vue » tout seul');
  await shot(wp, 'apres-salarie-formations');
}

// ═══ W4 · « Vue » ═════════════════════════════════════════════════════════════
section('W4 · « Vue » : set_training_seen, « ✓ Vue le 14/10 », « Annuler », le bandeau suit');
{
  const row = wp.locator('[data-testid=training-row]', { hasText: 'Port du harnais' });
  const n = writes.length; const k = await toastMark(wp);
  await row.locator('[data-testid=training-seen]').click(); await wp.waitForTimeout(1200);
  const rpc = of(since(n), 'RPC', 'set_training_seen');
  check(rpc.length === 1 && JSON.stringify(rpc[0].body) === JSON.stringify({ p_training: 't-harnais', p_seen: true }), 'RPC set_training_seen { p_training, p_seen: true }');
  const btn = wp.locator('[data-testid=training-row]', { hasText: 'Port du harnais' }).locator('[data-testid=training-seen]');
  check((await txt(btn)) === '✓ Vue le 14/10' && await btn.getAttribute('aria-pressed') === 'true', `la ligne : « ${await txt(btn)} »`);
  check((await toastsSince(wp, k)).includes('Formation marquée « Vue »'), 'message « Formation marquée « Vue » » avec « Annuler »');
  await shot(wp, 'apres-salarie-vue', { toasts: true });
  const n2 = writes.length;
  await wp.locator('[data-sonner-toast] button', { hasText: 'Annuler' }).first().click(); await wp.waitForTimeout(1200);
  const undo = of(since(n2), 'RPC', 'set_training_seen');
  check(undo.length === 1 && undo[0].body.p_seen === false, '« Annuler » : set_training_seen { p_seen: false }');
  check((await txt(wp.locator('[data-testid=training-row]', { hasText: 'Port du harnais' }).locator('[data-testid=training-seen]'))) === '○ Vue', 'la ligne revient à « ○ Vue »');
  await wp.locator('[data-testid=training-row]', { hasText: 'Port du harnais' }).locator('[data-testid=training-seen]').click(); await wp.waitForTimeout(1200);
  await wp.click('.bt-phdr-back'); await wp.waitForTimeout(900);
  check((await txt(wp.locator('[data-testid=trainings-banner]'))) === '1 1 formation à voir ›', 'retour sur « Ma journée » : « 1 formation à voir › »');
  check(D.training_views.some((v) => v.training_id === 't-harnais' && v.user_id === SAM), 'base : la « Vue » de Sam est enregistrée (pour lui seul)');
}

// ═══ W5 · lien hostile ════════════════════════════════════════════════════════
section('W5 · lien hostile renvoyé par la base : aucun lien');
{
  EXTRA_MY = [{ id: 't-hostile', title: 'Lien piégé', kind: 'video', video_url: 'javascript:alert(1)', document_name: null, document_path: null, document_mime: null, created_at: '2026-10-13T09:00:00Z', seen_at: null },
    { id: 't-http', title: 'Lien en clair', kind: 'video', video_url: 'http://youtu.be/abc', document_name: null, document_path: null, document_mime: null, created_at: '2026-10-13T08:00:00Z', seen_at: null }];
  await openWorker(); await openWorkerMenu(); await wp.click('[data-testid=menu-formations]'); await wp.waitForTimeout(900);
  const row = wp.locator('[data-testid=training-row]', { hasText: 'Lien piégé' });
  check(await row.locator('a').count() === 0 && (await txt(row.locator('[data-testid=training-na]'))) === 'Lien indisponible', 'javascript: → « Lien indisponible », aucun lien');
  check(await wp.locator('[data-testid=training-row]', { hasText: 'Lien en clair' }).locator('a').count() === 0, 'http: → aucun lien');
  check(await wp.locator('a[href^="javascript"], a[href^="JAVASCRIPT"], a[href^="data:"], a[href^="http:"]').count() === 0, 'aucun a[href^=javascript|data|http:] dans la page');
  await shot(wp, 'apres-salarie-lien-indisponible');
  EXTRA_MY = [];
}

// ═══ W8 · pas de réseau ═══════════════════════════════════════════════════════
section('W8 · pas de réseau sur « Vue » : la case revient, message');
{
  await openWorker(); await openWorkerMenu(); await wp.click('[data-testid=menu-formations]'); await wp.waitForTimeout(900);
  OFFLINE_SEEN = true;
  const k = await toastMark(wp);
  const btn = wp.locator('[data-testid=training-row]', { hasText: 'Gestes et postures' }).locator('[data-testid=training-seen]');
  await btn.click(); await wp.waitForTimeout(1300);
  check((await txt(btn)) === '○ Vue' && await btn.getAttribute('aria-pressed') === 'false', 'la case revient à « ○ Vue »');
  check((await toastsSince(wp, k)).includes('Pas de réseau : réessayez.'), 'message « Pas de réseau : réessayez. »');
  check(!D.training_views.some((v) => v.training_id === 't-gestes' && v.user_id === SAM), 'rien d’enregistré');
}

// ═══ W9 · retirée pendant la session ══════════════════════════════════════════
section('W9 · formation retirée pendant la session : message, la liste se relit');
{
  D.trainings.find((t) => t.id === 't-gestes').archived_at = NOW.toISOString();
  const k = await toastMark(wp);
  await wp.locator('[data-testid=training-row]', { hasText: 'Gestes et postures' }).locator('[data-testid=training-seen]').click(); await wp.waitForTimeout(1500);
  check((await toastsSince(wp, k)).includes('Cette formation n’est plus disponible.'), 'message « Cette formation n’est plus disponible. » (P0002, pas « mise à jour en attente »)');
  check(await wp.locator('[data-testid=training-row]', { hasText: 'Gestes et postures' }).count() === 0, 'la liste est relue : la formation retirée a disparu');
}

// ═══ W6 · tout vu, puis rien ═════════════════════════════════════════════════
section('W6 · tout vu : plus de bandeau, le menu reste ; aucune formation : pas de menu');
{
  await openWorker();
  check(await wp.locator('[data-testid=trainings-banner]').count() === 0, 'tout vu : plus de bandeau');
  await openWorkerMenu();
  check(await wp.locator('[data-testid=menu-formations]').count() === 1 && await wp.locator('[data-testid=menu-formations-badge]').count() === 0, 'menu « Formations » toujours là, sans pastille');
  await wp.keyboard.press('Escape');
  D.trainings = D.trainings.filter((t) => !t.all_team && !t.assignee_ids.includes(SAM));
  await openWorker(); await openWorkerMenu();
  check(await wp.locator('[data-testid=menu-formations]').count() === 0 && await wp.locator('[data-testid=trainings-banner]').count() === 0, 'aucune formation : ni menu, ni bandeau');
  await wp.keyboard.press('Escape');
}

// ═══ W7 · chef d'équipe ═══════════════════════════════════════════════════════
section('W7 · chef d’équipe : pareil');
{
  freshDb();
  const lead = await newCtx(CHLOE, { width: 390, height: 844 }); const lp = track(await lead.newPage(), 'chef');
  await openWorker(lp);
  check((await txt(lp.locator('[data-testid=trainings-banner]'))) === '1 1 formation à voir ›', 'Chloé (chef d’équipe) : « 1 formation à voir › » (elle a vu « Port du harnais »)');
  await lp.click('[data-testid=trainings-banner]'); await lp.waitForTimeout(900);
  const n = writes.length;
  await lp.locator('[data-testid=training-row]', { hasText: 'Gestes et postures' }).locator('[data-testid=training-seen]').click(); await lp.waitForTimeout(1200);
  check(of(since(n), 'RPC', 'set_training_seen').length === 1 && D.training_views.some((v) => v.training_id === 't-gestes' && v.user_id === CHLOE), 'Chloé coche « Vue » (pour elle seule)');
  await lead.close();
}

// ═══ Fin ═════════════════════════════════════════════════════════════════════
section('Fin');
{
  const all = since(WW);
  check(!all.some((w) => ['planning', 'time_entries', 'active_sessions'].includes(w.t)) && !all.some((w) => w.m === 'DELETE'), 'salarié : aucune écriture d’heures, de planning ni d’effacement');
  check(!all.some((w) => NEW_TABLES.has(w.t)), 'salarié : jamais d’écriture directe dans trainings / training_views (seulement la fonction)');
}
check(errors.length === 0, `aucune erreur de page (${errors.length}${errors.length ? ` : ${errors.slice(0, 3).join(' ; ')}` : ''})`);
check(!writes.some((w) => w.m === 'FN' && EMAIL_FNS.includes(w.t)), 'aucune fonction d’e-mail de tout le test');
{
  let m = 0; for (const p of pages) { try { m += await mailtos(p); } catch { /* page fermée */ } }
  check(m === 0, 'aucun « mailto: » de tout le test');
  const src = ['lib/trainings.ts', 'components/trainings-admin.tsx', 'components/poseur-trainings.tsx'].map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
  check(src.length > 0 && !/<iframe|mailto|sendReminder|send-email|resend/i.test(src.replace(/\/\/[^\n]*/g, '')), 'le code du lot n’a ni iframe, ni mailto, ni fonction d’e-mail');
}
console.log(`\n${ok} ✅ / ${ko} ❌`);
if (fails.length) console.log(`Échecs :\n - ${fails.join('\n - ')}`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
