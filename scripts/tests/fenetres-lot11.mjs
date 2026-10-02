// Lot 11 — item 7 : « Supprime toute barre de défilement horizontale dans les fenêtres (popups) :
// elles doivent tenir en largeur, ordinateur et mobile. »
//
// Lancer (après npm run build), depuis la racine du dépôt :
//   node scripts/tests/fenetres-lot11.mjs out docs/captures-lot11 [port] [dossier-toutes-captures]
//
// Sonde GLOBALE, sur les VRAIES pages /admin et /poseur (export statique, base Supabase SIMULÉE :
// aucune vraie base, aucune écriture réelle), aux trois tailles 1280×800, 1024×768 (tablette
// paysage) et 390×844 (téléphone), avec des noms, e-mails, adresses et libellés TRÈS longs.
// Chaque fenêtre accessible est ouverte comme le ferait l'utilisateur, puis mesurée :
//   · fenêtre.scrollWidth <= fenêtre.clientWidth + 1 (aucun défilement horizontal) ;
//   · aucun élément (hors conteneur qui coupe déjà avec « … ») ne dépasse le bord droit / gauche ;
//   · aucun conteneur interne n'a de défilement horizontal (tableau trop large…) ;
//   · aucun texte qui ne passe pas à la ligne (bouton « nowrap », e-mail) ne sort de la fenêtre ;
//   · aucune icône écrasée par un titre trop long ;
//   · la fenêtre elle-même tient dans l'écran.
// Défauts déjà signalés à une autre zone : FENETRES_CONNUES=id1,id2 les affiche (⚠️) sans faire
// échouer ; par défaut la sonde est stricte.
// Le script tourne sur N'IMPORTE QUEL build : si le bouton qui ouvre une fenêtre est introuvable
// (renommé, déplacé, fonction absente), la fenêtre est SAUTÉE avec un avertissement, et la liste
// des fenêtres sautées est donnée à la fin. Échec si un débordement est trouvé, ou si trop peu de
// fenêtres ont pu être mesurées (sonde aveugle).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); } catch {
  ({ chromium } = await import(`${process.env.PW_CORE || '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core'}/index.mjs`));
}

const [,, OUT = 'out', SH = 'docs/captures-lot11', PORT = '0', ALL_SHOTS] = process.argv;
fs.mkdirSync(SH, { recursive: true });
if (ALL_SHOTS) fs.mkdirSync(ALL_SHOTS, { recursive: true });
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

// ─── Dates (jour de Paris) ─────────────────────────────────────────────────────
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const day = (n) => { const x = new Date(`${today}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const monday = day(-((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
const inDays = (n) => new Date(Date.now() + n * 86400e3).toISOString();

// ─── Textes TRÈS longs (le pire cas réaliste) ──────────────────────────────────
const CO = 'c0000000-0000-0000-0000-000000000001';
const LONG = {
  company: 'Société Nouvelle de Rénovation et d’Aménagement Intérieur du Grand Lyon Métropole',
  companyMail: 'secretariat.direction.generale@societe-nouvelle-renovation-grand-lyon-metropole.fr',
  accountant: 'service.paie.comptabilite.salaries@cabinet-expertise-comptable-durand-et-associes.fr',
  first: 'Jean-Christophe-Maximilien', last: 'de La Rochefoucauld-Montmorency',
  mail: 'jean-christophe-maximilien.delarochefoucauld-montmorency@entreprise-renovation-grand-lyon.fr',
  client: 'Copropriété Les Jardins Suspendus de la Résidence Saint-Exupéry — Bâtiment C, escalier 4, porte gauche',
  city: 'Saint-Didier-au-Mont-d’Or-lès-Champagne-au-Mont-d’Or',
  address: '1234 avenue du Maréchal-de-Lattre-de-Tassigny, Résidence Les Terrasses du Parc de la Tête d’Or',
  clientMail: 'gestion.syndic.copropriete-jardins-suspendus-saint-exupery@cabinet-gestion-immobiliere-lyonnaise.fr',
  doc: 'Devis-definitif-renovation-complete-appartement-T4-copropriete-jardins-suspendus-batiment-C-version-12-signe-par-le-client.pdf',
  note: 'Mariage de ma sœur à Clermont-Ferrand puis voyage de noces organisé par toute la famille, retour le lundi suivant au plus tard',
  reserve: 'Joint de silicone à reprendre sur toute la longueur de la baignoire, carrelage fissuré derrière le meuble vasque, plinthe décollée dans le couloir',
  kiosk: 'Tablette de l’entrée principale — dépôt de Vénissieux, bâtiment administratif, rez-de-chaussée',
};

// ─── Base simulée du BUREAU ────────────────────────────────────────────────────
const WL = { id: 'w-long', company_id: CO, client_name: LONG.client, city: LONG.city, address: LONG.address, postal_code: '69370', client_email: LONG.clientMail, client_phone: '+33 6 12 34 56 78 90', product_type: 'Rénovation complète salle de bains, cuisine et menuiseries extérieures', description: LONG.reserve, is_active: true, budget_hours: 120, budget_amount: 18500 };
const W1 = { id: 'w1', company_id: CO, client_name: 'Villa Dupont', city: 'Lyon', is_active: true };
const u = (id, first, last, role = 'worker', extra = {}) => ({ id, company_id: CO, first_name: first, last_name: last, role, email: `${id}@x.fr`, is_active: true, created_at: '2026-01-01', ...extra });
const slot = (id, user_id, work_date, ws, extra = {}) => ({ id, company_id: CO, user_id, worksite_id: ws?.id ?? null, work_date, absence_type: null, estimated_start: '08:00:00', estimated_end: '17:00:00', notes: null, created_at: `${work_date}T06:00:00Z`, worksite: ws ?? null, ...extra });
const tEntry = (id, user_id, work_date, ws, extra = {}) => ({ id, company_id: CO, user_id, work_date, worksite_id: ws.id, planning_id: null, status: 'submitted', start_time: '08:00:00', end_time: '12:00:00', break_minutes: 0, total_minutes: 240, reception: null, observation: null, reserve_resolved_at: null, reserve_fixed_at: null, locked: false, exported_at: null, meal_allowance: false, worksite: ws, ...extra });
const adminData = () => ({
  users: [
    u('u-admin', 'Paul', 'Martin', 'admin', { email: 'paul.martin.direction@societe-nouvelle-renovation-grand-lyon-metropole.fr' }),
    u('u-long', LONG.first, LONG.last, 'worker', { email: LONG.mail, phone: '+33 6 12 34 56 78', hourly_rate: 32.5, weekly_hours: 39, payroll_id: '000000000042' }),
    u('u-kevin', 'Kevin', 'Roussel'), u('u-sara', 'Sara', 'Benali'),
  ],
  companies: [{
    id: CO, name: LONG.company, siret: '123 456 789 00012', tva_intra: 'FR12 345678901', address: LONG.address, postal_code: '69370', city: LONG.city,
    phone: '+33 4 78 00 00 00', email: LONG.companyMail, logo_url: '', subscription_status: 'trialing', trial_ends_at: inDays(9),
    auto_reminder_enabled: true, reminder_hour: 17, budget_alerts_enabled: true, travel_paid: false, weekly_hours: 35,
    accountant_email: LONG.accountant, overtime_rate_1: 25, overtime_rate_2: 50,
    ai_enabled: true, kiosk_enabled: true, support_enabled: true, position_tracking_enabled: false, colleagues_planning_visible: false,
  }],
  subscription_plans: [
    { code: 'solo', label: 'Artisan', stripe_price_id: 'price_1', amount_eur: 29, min_workers: 1, max_workers: 3, sort: 1, active: true },
    { code: 'team', label: 'Équipe', stripe_price_id: 'price_2', amount_eur: 59, min_workers: 4, max_workers: 10, sort: 2, active: true },
    { code: 'pme', label: 'Entreprise du bâtiment', stripe_price_id: 'price_3', amount_eur: 99, min_workers: 11, max_workers: null, sort: 3, active: true },
  ],
  worksites: [WL, W1],
  planning: [
    slot('p-long', 'u-long', today, WL, { notes: LONG.reserve }), slot('p-long2', 'u-long', day(1), WL),
    slot('p-kevin', 'u-kevin', today, W1),
    slot('p-sara', 'u-sara', today, null, { absence_type: 'conge', estimated_start: null, estimated_end: null }),
  ],
  time_entries: [
    // Intervention ajoutée par le salarié (hors planning) → pastille « ajouté par le salarié ».
    tEntry('e-extra', 'u-kevin', today, WL, { start_time: '13:00:00', end_time: '17:00:00' }),
    // Réserve à lever (fenêtre « Réserves »).
    tEntry('e-res', 'u-long', day(-1) >= monday ? day(-1) : today, WL, { reception: 'avec', observation: LONG.reserve }),
  ],
  active_sessions: [],
  month_closures: [],
  leave_requests: [
    { id: 'lr1', company_id: CO, user_id: 'u-long', type: 'conge', start_date: day(14), end_date: day(21), note: LONG.note, status: 'pending', created_at: inDays(-1) },
    { id: 'lr2', company_id: CO, user_id: 'u-long', type: 'maladie', start_date: day(-20), end_date: day(-18), note: null, status: 'rejected', decision_note: LONG.note, created_at: inDays(-25) },
  ],
  invitations: [{ id: 'inv1', company_id: CO, email: LONG.mail.replace('jean', 'marie'), first_name: 'Marie-Antoinette', last_name: LONG.last, status: 'pending', created_at: inDays(-2) }],
  documents: [
    { id: 'd1', company_id: CO, worksite_id: WL.id, label: LONG.doc, file_name: LONG.doc, file_path: `${CO}/${WL.id}/d1.pdf`, mime_type: 'application/pdf', size_bytes: 120000, created_at: inDays(-1), uploaded_by: 'u-long', uploader: { first_name: LONG.first, last_name: LONG.last }, work_date: today, time_entry_id: null, category: 'devis' },
  ],
  certifications: [], push_subscriptions: [], company_cost_settings: [], payslips: [],
  support_grants: [], support_access_log: [],
  kiosks: [{ id: 'k1', company_id: CO, name: LONG.kiosk, worksite_id: WL.id, created_at: inDays(-3), last_seen_at: inDays(-0.01), revoked_at: null, worksite: WL }],
  kiosk_settings: [], kiosk_pairings: [], user_closures: [],
});

// ─── Base simulée du SALARIÉ (même entreprise, mêmes noms longs) ───────────────
const ME = 'u-long';
const WA = { id: 'w-autre', company_id: CO, client_name: 'Autre', city: '', is_active: true };
const wEntry = (id, ws, s, e, extra = {}) => {
  const [sh, sm] = s.split(':').map(Number); const [eh, em] = e.split(':').map(Number);
  return { id, company_id: CO, user_id: ME, worksite_id: ws.id, planning_id: null, work_date: today, start_time: `${s}:00`, end_time: `${e}:00`,
    break_minutes: 0, total_minutes: (eh * 60 + em) - (sh * 60 + sm), meal_allowance: false, status: 'draft', locked: false, exported_at: null,
    observation: null, reception: null, gap_before: null, worksite: ws, ...extra };
};
const workerData = () => ({
  users: [{ id: ME, company_id: CO, first_name: LONG.first, last_name: LONG.last, role: 'worker', email: LONG.mail, is_active: true, created_at: '2026-01-01' }],
  companies: [{ id: CO, name: LONG.company, ai_enabled: false, kiosk_enabled: false, position_tracking_enabled: false, travel_paid: false, subscription_status: 'active', trial_ends_at: '2030-01-01', weekly_hours: 35 }],
  worksites: [WL, W1, WA],
  planning: [], time_entries: [wEntry('we1', WL, '08:00', '12:00')], active_sessions: [],
  month_closures: [], leave_requests: [
    { id: 'lr1', company_id: CO, user_id: ME, type: 'conge', start_date: day(14), end_date: day(21), note: LONG.note, status: 'pending', created_at: inDays(-1) },
    { id: 'lr2', company_id: CO, user_id: ME, type: 'maladie', start_date: day(-20), end_date: day(-18), note: null, status: 'rejected', decision_note: LONG.note, created_at: inDays(-25) },
  ],
  documents: [{ id: 'd1', company_id: CO, worksite_id: WL.id, label: LONG.doc, file_name: LONG.doc, file_path: `${CO}/${WL.id}/d1.pdf`, mime_type: 'application/pdf', size_bytes: 120000, created_at: inDays(-1), uploaded_by: ME, uploader: { first_name: LONG.first, last_name: LONG.last }, work_date: today, time_entry_id: 'we1', category: 'devis' }],
  time_entry_corrections: [], time_entry_positions: [], push_subscriptions: [], user_closures: [],
});

// ─── Supabase simulé (lecture : filtres eq/neq/in/is/gte/lte ; écriture : notée, jamais appliquée) ───
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
      if (op === 'gte') return cur != null && String(cur) >= val;
      if (op === 'lte') return cur != null && String(cur) <= val;
      if (op === 'gt') return cur != null && String(cur) > val;
      if (op === 'lt') return cur != null && String(cur) < val;
      if (op === 'is') return val === 'null' ? cur == null : String(cur) === val;
      return true;
    });
  }
  return rows;
};
const writes = [];
const setup = async (ctx, uid, email, getD) => {
  const now = Math.floor(Date.now() / 1000); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', exp: now + 36000, aal: 'aal1' })}.sig`;
  const session = { access_token: jwt, refresh_token: 'r', expires_at: now + 36000, expires_in: 36000, token_type: 'bearer', user: { id: uid, email, aud: 'authenticated', role: 'authenticated' } };
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* */ } }, ['sb-sdperbcquvneohotjono-auth-token', JSON.stringify(session)]);
  await ctx.route('**/*.supabase.co/**', async (r) => {
    const url = new URL(r.request().url()); const m = r.request().method();
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ json: session.user });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/storage/v1/object/sign')) return r.fulfill({ json: [] });
    if (url.pathname.startsWith('/storage/')) return r.fulfill({ json: {} });
    if (url.pathname.startsWith('/functions/v1/')) { writes.push(`fonction ${url.pathname.replace('/functions/v1/', '')}`); return r.fulfill({ json: {} }); }
    if (url.pathname.startsWith('/rest/v1/rpc/')) return r.fulfill({ json: [] });
    const t = url.pathname.replace('/rest/v1/', '');
    if (m !== 'GET' && m !== 'HEAD') { writes.push(`${m} ${t}`); return r.fulfill({ status: 201, json: {} }); }
    // offset / limit respectés : une lecture paginée (fetchAllPaged) s'arrête sur une page vide.
    const all = filterRows(getD()[t] || [], url.searchParams);
    const off = Number(url.searchParams.get('offset') || 0); const lim = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : Infinity;
    const rows = all.slice(off, off + lim);
    if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) return rows.length ? r.fulfill({ json: rows[0] }) : r.fulfill({ status: 406, json: { code: 'PGRST116', message: 'none' } });
    return r.fulfill({ json: rows, headers: { 'content-range': `${off}-${Math.max(off, off + rows.length - 1)}/${all.length}` } });
  });
};

// ─── Mesure, dans la page ──────────────────────────────────────────────────────
const measure = (extraSel) => {
  const desc = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return `<${el.tagName.toLowerCase()}${cls}>${txt ? ` « ${txt} »` : ''}`;
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const boxes = [...document.querySelectorAll(`[role=dialog], [role=alertdialog]${extraSel ? `, ${extraSel}` : ''}`)].filter(visible);
  return boxes.map((d) => {
    const r = d.getBoundingClientRect();
    const innerL = r.left + d.clientLeft; const innerR = innerL + d.clientWidth;
    const issues = []; const culprits = [];
    if (d.scrollWidth > d.clientWidth + 1) issues.push(`la fenêtre défile en largeur (scrollWidth ${d.scrollWidth} > clientWidth ${d.clientWidth})`);
    if (r.left < -1 || r.right > window.innerWidth + 1) issues.push(`la fenêtre sort de l'écran (${Math.round(r.left)} → ${Math.round(r.right)} pour ${window.innerWidth} px)`);
    // Un élément coupé par un conteneur interne (texte « … ») ne déborde pas de la FENÊTRE.
    const clipped = (el) => { for (let a = el.parentElement; a && a !== d; a = a.parentElement) if (getComputedStyle(a).overflowX !== 'visible') return true; return false; };
    for (const el of d.querySelectorAll('*')) {
      if (!visible(el)) continue;
      if (el instanceof SVGElement && el.ownerSVGElement) continue; // intérieur d'une icône : on nomme l'icône ou son bouton
      // Icône écrasée par manque de largeur (titre long à côté d'une icône qui rétrécit).
      if (el instanceof SVGSVGElement) {
        const ir = el.getBoundingClientRect();
        if (ir.height >= 12 && ir.width < ir.height * 0.6) culprits.push([el, `icône écrasée (${Math.round(ir.width)}×${Math.round(ir.height)} px) dans ${desc(el.parentElement)}`]);
      }
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed') continue;
      const er = el.getBoundingClientRect();
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.scrollWidth > el.clientWidth + 1) {
        issues.push(`défilement horizontal interne : ${desc(el)} (${el.scrollWidth} > ${el.clientWidth})`);
      }
      if (er.right > innerR + 1 && !clipped(el)) culprits.push([el, `${desc(el)} dépasse à droite de ${Math.round(er.right - innerR)} px`]);
      // Texte qui ne passe pas à la ligne (bouton « nowrap », e-mail long…) : l'élément tient,
      // mais son CONTENU sort de la fenêtre.
      else if (cs.overflowX === 'visible' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && er.left + el.clientLeft + el.scrollWidth > innerR + 1 && !clipped(el)) {
        culprits.push([el, `${desc(el)} : son contenu sort de la fenêtre (${el.scrollWidth} px pour ${el.clientWidth} px)`]);
      }
      if (er.left < innerL - 1 && !clipped(el)) culprits.push([el, `${desc(el)} dépasse à gauche de ${Math.round(innerL - er.left)} px`]);
    }
    // Un parent qui « déborde » seulement parce qu'un enfant déborde : on ne nomme que l'enfant.
    // (une icône seule <svg> se rattache à son bouton, plus parlant).
    const named = culprits.filter(([el, msg]) => msg.startsWith('icône écrasée') || !(el instanceof SVGElement && culprits.some(([o]) => o !== el && o.contains(el))));
    for (const [el, msg] of named) if (msg.startsWith('icône écrasée') || !named.some(([o, m]) => o !== el && el.contains(o) && !m.startsWith('icône écrasée'))) issues.push(msg);
    const title = (d.querySelector('h2, [data-dialog-title]')?.textContent || d.getAttribute('aria-label') || d.className || '').toString().replace(/\s+/g, ' ').trim().slice(0, 70);
    return { title, width: Math.round(r.width), issues: [...new Set(issues)] };
  });
};

// ─── Ouverture : clique le premier candidat visible (sinon : fenêtre sautée) ───
const clickFirst = async (p, cands, timeout = 2500) => {
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
const waitDialog = (p, sel = '[role=dialog]', timeout = 4000) => p.waitForFunction((s) => [...document.querySelectorAll(s)].some((d) => { const r = d.getBoundingClientRect(); return r.width > 0 && r.height > 0; }), sel, { timeout }).then(() => true).catch(() => false);
const mobMenu = (p) => step(p, ['.bt-pl-m-ibtn[aria-label="Menu"]']);
// Fichier d'import aux titres de colonnes interminables (et sans espace) : étape « correspondance ».
const CSV_CLIENTS = `Nom_complet_du_client_ou_de_la_copropriete_principale;Ville_de_facturation_complete_avec_arrondissement;Code_postal;Adresse_email_du_contact_principal_pour_facturation;Telephone;Adresse\n${LONG.client};${LONG.city};69370;${LONG.clientMail};0612345678;${LONG.address}\n`;
const CSV_WORKERS = `Prenom_usuel_du_salarie_tel_que_sur_le_contrat_de_travail;Nom_de_famille_du_salarie_tel_que_sur_le_contrat_de_travail;Adresse_email_personnelle_pour_invitation;Telephone_portable\n${LONG.first};${LONG.last};${LONG.mail};0612345678\n`;
const upload = async (p, name, csv) => {
  const inp = p.locator('[role=dialog] input[type=file]').first();
  if (!(await inp.count())) return false;
  await inp.setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  return p.waitForFunction(() => /Faites correspondre/.test(document.querySelector('[role=dialog]')?.textContent || ''), null, { timeout: 4000 }).then(() => true).catch(() => false);
};

// ─── Les fenêtres du BUREAU ────────────────────────────────────────────────────
const openSettings = async (p, L) => {
  if (L === 'desk') { if (!(await step(p, ['.bt-pl-acct']))) return false; } else if (!(await mobMenu(p))) return false;
  if (!(await step(p, ['button.bt-pl-acct-item', 'Réglages'], ['.bt-mm-item', 'Réglages'], ['button', "Réglages de l'entreprise"]))) return false;
  await p.waitForSelector('[role=dialog] .bt-set', { timeout: 8000 }).catch(() => {});
  await p.waitForFunction(() => document.querySelector('[role=dialog]')?.textContent?.includes('Journal des accès'), null, { timeout: 5000 }).catch(() => {});
  return true;
};
const openSection = async (p, key) => {
  const btn = p.locator(`[data-testid=set-sec-${key}] > h3 > button`);
  if (await btn.count() && (await btn.getAttribute('aria-expanded')) === 'false') { await btn.click(); await p.waitForTimeout(200); }
  return true;
};
const openSalaries = async (p, L) => (L === 'desk' ? step(p, ['.bt-pl-segbtn', 'Salariés']) : (await mobMenu(p)) && step(p, ['.bt-mm-item', 'Salariés']));
const openClients = async (p, L) => (L === 'desk' ? step(p, ['.bt-pl-segbtn', 'Clients']) : (await mobMenu(p)) && step(p, ['.bt-mm-item', 'Chantiers']));
// Lot 11 : « Exporter » ouvre DIRECTEMENT « Exporter l'équipe » (un seul salarié : lien dans la fenêtre).
const openExportMenu = async (p, L) => (L === 'desk'
  ? step(p, ['[data-testid=bar-export]'], ['.bt-pl-fill', 'Exporter'], ['button', 'Exporter'])
  : (await mobMenu(p)) && step(p, ['[data-testid=mm-export]'], ['.bt-mm-item', 'Export'], ['.bt-mm-item', 'Exporter']));
const teamExportOpen = (p) => p.locator('[role=dialog] h2', { hasText: /Exporter l.équipe/ }).filter({ visible: true }).count().then((n) => n > 0);
const openTeamExport = async (p, L) => {
  if (!(await openExportMenu(p, L))) return false;
  if (await teamExportOpen(p)) return true;
  return step(p, ['.bt-pl-exitem', 'équipe'], ['[role=menuitem]', 'équipe'], ['.bt-mm-subitem', 'équipe'], ['.bt-mm-item', 'équipe'], ['button', "Exporter l'équipe"]);
};
const openGrid = (p, L) => Promise.resolve(true); // le planning est déjà à l'écran
const ADMIN = [
  { id: 'reglages', name: "Réglages de l'entreprise (4 rubriques ouvertes)", shot: true, open: async (p, L) => {
    if (!(await openSettings(p, L))) return false;
    for (const k of ['entreprise', 'paie', 'borne', 'notif']) await openSection(p, k);
    return true;
  } },
  { id: 'reglages-endroit', name: 'Réglages — confirmation légale « Endroit au pointage »', open: async (p, L) => {
    if (!(await openSettings(p, L))) return false;
    await openSection(p, 'borne');
    return step(p, ['[role=dialog] .bt-set-sub:has(label:text-is("Endroit au pointage en direct")) button.bt-set-btn', 'Activer']);
  } },
  { id: 'borne-depuis-reglages', name: 'Borne, ouverte depuis les réglages', open: async (p, L) => {
    if (!(await openSettings(p, L))) return false;
    await openSection(p, 'borne');
    return step(p, ['[data-testid=set-kiosk-open]'], ['[role=dialog] button', 'Relier la tablette'], ['[role=dialog] button', 'Gérer les bornes']);
  } },
  { id: 'borne', name: '📟 Borne', open: async (p, L) => (L === 'desk' ? step(p, ['[data-testid=bar-kiosk]']) : (await mobMenu(p)) && step(p, ['[data-testid=mm-kiosk]'])) },
  { id: 'salaries', name: 'Salariés', open: openSalaries },
  { id: 'nouveau-salarie', name: 'Nouveau salarié', open: async (p, L) => (await openSalaries(p, L)) && step(p, ['[role=dialog] button', 'Nouveau salarié'], ['[role=dialog] button', 'Ajouter un salarié']) },
  { id: 'import-salaries', name: 'Importer des salariés', open: async (p, L) => (await openSalaries(p, L)) && step(p, ['[role=dialog] button', 'Importer']) },
  { id: 'import-salaries-colonnes', name: 'Importer des salariés — correspondance des colonnes', shot: true, open: async (p, L) => (await openSalaries(p, L))
    && (await step(p, ['[role=dialog] button', 'Importer'])) && upload(p, 'export-salaries-ancien-logiciel-de-paie-2026-complet.csv', CSV_WORKERS) },
  { id: 'conges', name: 'Demandes de congé', shot: true, open: async (p, L) => (L === 'desk'
    ? (await openSalaries(p, L)) && step(p, ['[role=dialog] button', /cong/i])
    : (await mobMenu(p)) && step(p, ['.bt-mm-item', 'Demandes de congé'], ['.bt-mm-item', /cong/i])) },
  { id: 'conges-refus', name: 'Demandes de congé — motif du refus', open: async (p, L) => (L === 'desk'
    ? (await openSalaries(p, L)) && (await step(p, ['[role=dialog] button', /cong/i]))
    : (await mobMenu(p)) && (await step(p, ['.bt-mm-item', 'Demandes de congé'], ['.bt-mm-item', /cong/i])))
    && step(p, ['[role=dialog] button[title="Refuser"]']) },
  { id: 'fiche-salarie', name: 'Fiche salarié', shot: true, open: async (p, L) => (await openSalaries(p, L)) && step(p, ['[role=dialog] button', LONG.last]) },
  { id: 'fiche-salarie-bulletin', name: 'Fiche salarié — saisie d’un bulletin (coût réel)', open: async (p, L) => (await openSalaries(p, L))
    && (await step(p, ['[role=dialog] button', LONG.last])) && step(p, ['[role=dialog] button', 'Saisir à la main']) },
  { id: 'nouveau-client', name: 'Nouveau client / chantier', open: async (p, L) => (await openClients(p, L)) && step(p, ['.bt-pl-ddcreate', 'Nouveau client'], ['[role=dialog] button', 'Nouveau client']) },
  { id: 'chantiers', name: 'Chantiers (téléphone)', only: 'mob', open: openClients },
  { id: 'import-clients', name: 'Importer des clients / chantiers', shot: true, open: async (p, L) => (await openClients(p, L)) && step(p, ['.bt-pl-ddcreate', 'Importer'], ['[role=dialog] button', 'Importer']) },
  { id: 'import-clients-colonnes', name: 'Importer des clients — correspondance des colonnes', shot: true, open: async (p, L) => (await openClients(p, L))
    && (await step(p, ['.bt-pl-ddcreate', 'Importer'], ['[role=dialog] button', 'Importer'])) && upload(p, 'export-clients-ancien-logiciel-de-devis-2026-complet.csv', CSV_CLIENTS) },
  { id: 'fiche-client', name: 'Fiche client', open: async (p, L) => (await openClients(p, L)) && step(p, ['.bt-pl-clientrow:has-text("Jardins Suspendus") .bt-pl-clientedit'], ['[role=dialog] [title="Modifier la fiche"]'], ['[role=dialog] button', 'Jardins Suspendus']) },
  { id: 'documents', name: 'Documents du chantier', shot: true, open: async (p, L) => (await openClients(p, L))
    && (await step(p, ['.bt-pl-clientrow:has-text("Jardins Suspendus") .bt-pl-clientedit'], ['[role=dialog] [title="Modifier la fiche"]'], ['[role=dialog] button', 'Jardins Suspendus']))
    && step(p, ['[role=dialog] button', 'Documents'], ['[role=dialog] button', 'Pièces']) },
  { id: 'reserves', name: 'Réserves', open: async (p, L) => (L === 'desk' ? step(p, ['.bt-pl-out', 'Réserves']) : (await mobMenu(p)) && step(p, ['.bt-mm-item', 'Réserves'])) },
  { id: 'cout', name: 'Coût chantiers', open: async (p, L) => (L === 'desk' ? step(p, ['.bt-pl-out', 'Coût chantiers']) : (await mobMenu(p)) && step(p, ['.bt-mm-item', /Co[uû]t/])) },
  { id: 'export-equipe', name: "Exporter l'équipe", shot: true, open: openTeamExport },
  { id: 'export-salarie', name: 'Exporter un salarié', open: async (p, L) => {
    if (!(await openExportMenu(p, L))) return false;
    return step(p, ['[data-testid=export-one-worker]'], ['.bt-pl-exitem', 'salarié'], ['[role=menuitem]', 'salarié'], ['.bt-mm-subitem', 'salarié'], ['.bt-mm-item', 'Exporter un salarié'], ['button', 'Exporter un salarié']);
  } },
  { id: 'cloture', name: 'Clôture du mois', open: async (p, L) => (await openTeamExport(p, L)) && step(p, ['[role=dialog] button', /^Clôturer/]) },
  { id: 'intervention', name: 'Intervention (bulle du planning)', open: async (p, L) => (await openGrid(p, L)) && step(p, ['.bt-pl-grab', 'Jardins Suspendus'], ['.bt-pl-m-bubbtn', 'Jardins Suspendus'], ['.bt-pl-grab'], ['.bt-pl-m-bubbtn']) },
  { id: 'presence', name: 'Présence / absence', open: async (p) => step(p, ['.bt-pl-namebtn', LONG.last], ['.bt-pl-m-top', LONG.last], ['.bt-pl-namebtn'], ['.bt-pl-m-top']) },
  { id: 'absence', name: "Confirmation d'absence", open: async (p) => (await step(p, ['.bt-pl-namebtn', LONG.last], ['.bt-pl-m-top', LONG.last], ['.bt-pl-namebtn'], ['.bt-pl-m-top']))
    && step(p, ['[role=dialog] button', /^Congé/], ['[role=dialog] button', /Cong/]) },
  { id: 'ajout', name: 'Ajouter un client (case vide)', open: async (p) => step(p, ['.bt-pl-cellfill:has(.bt-pl-add)'], ['[data-testid=m-add]'], ['.bt-pl-m-add']) },
  { id: 'extra', name: 'Intervention ajoutée par le salarié', open: async (p) => step(p, ['.bt-pl-extra']) },
  { id: 'attribuer', name: 'Attribuer un client', open: async (p) => (await step(p, ['.bt-pl-extra'])) && step(p, ['[role=dialog] button', /Attribuer/]) },
  { id: 'abonnement', name: 'Choisissez votre abonnement', shot: true, open: async (p, L) => (L === 'desk' ? step(p, ['.bt-pl-trial .cta'], ['button', "S'abonner"]) : (await mobMenu(p)) && step(p, ['.bt-mm-trial .cta'], ['[role=dialog] button', "S'abonner"])) },
  { id: 'menu', name: 'Menu (téléphone)', only: 'mob', open: mobMenu },
  { id: 'assistant', name: 'Assistant BEMEXO (panneau)', extraSel: '.as-panel', waitSel: '.as-panel', open: async (p) => step(p, ['[data-testid=bar-assistant]'], ['[data-testid=m-assistant]']) },
];

// ─── Les fenêtres du SALARIÉ (/poseur) ─────────────────────────────────────────
const tapEntry = (p) => step(p, ['[data-testid=card-entry]']);
const WORKER = [
  { id: 'conges-salarie', name: 'Mes congés (salarié)', shot: true, open: async (p) => (await step(p, ['button[aria-label="Mon compte et menu"]']))
    && (await step(p, ['[role=menuitem]', 'Mes congés']))
    && (await step(p, ['[role=dialog] button', 'Faire une demande']) || true) },
  { id: 'dupliquer', name: 'Dupliquer cette journée', shot: true, open: (p) => step(p, ['.bt-dup']) },
  { id: 'retirer', name: 'Retirer ce chantier ?', shot: true, open: async (p) => (await tapEntry(p)) && step(p, ['.bt-ed-trash'], ['button[aria-label="Retirer ce chantier"]']) },
  { id: 'documents-salarie', name: 'Documents (salarié)', shot: true, open: async (p) => (await tapEntry(p)) && step(p, ['.bt-ed-doc']) },
  { id: 'verification', name: 'Vérification avant envoi', shot: true,
    prep: (D) => { D.time_entries = [wEntry('we1', WL, '06:00', '12:00'), wEntry('we2', W1, '12:00', '18:30')]; },
    open: (p) => step(p, ['.bt-send', 'Envoyer ma journée']) },
  { id: 'deja-envoyee', name: 'Journée déjà envoyée', prep: (D) => { D.time_entries = [wEntry('we1', WL, '08:00', '12:00', { status: 'submitted' })]; }, open: tapEntry },
  { id: 'mois-cloture', name: 'Mois clôturé', prep: (D) => { D.month_closures = [{ company_id: CO, month: `${today.slice(0, 7)}-01` }]; }, open: tapEntry },
  { id: 'autre-chantier', name: 'Sur quel chantier ? (journée vide)', shot: true, prep: (D) => { D.time_entries = []; }, open: (p) => step(p, ['[data-testid=start-other]']) },
  { id: 'endroit', name: "Information sur l'endroit (avant le 1er chrono)",
    prep: (D) => { D.companies[0].position_tracking_enabled = true; D.time_entries = []; D.planning = [{ id: 'p1', company_id: CO, user_id: ME, worksite_id: WL.id, work_date: today, absence_type: null, estimated_start: '08:00:00', estimated_end: '12:00:00', notes: null, worksite: WL }]; },
    open: (p) => step(p, ['[data-testid=card-planned] [data-testid=card-start]']) },
];

// ─── Exécution ─────────────────────────────────────────────────────────────────
const VIEWPORTS = [
  { key: '1280x800', w: 1280, h: 800, L: 'desk', opts: {} },
  { key: '1024x768', w: 1024, h: 768, L: 'desk', opts: { hasTouch: true } },
  { key: '390x844', w: 390, h: 844, L: 'mob', opts: { deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];
const results = []; const skipped = []; const knownHits = [];
// FENETRES_CONNUES=export-equipe,cloture : défauts DÉJÀ signalés à une autre zone — affichés (⚠️),
// mais sans faire échouer. Par défaut : aucun, la sonde est stricte.
const KNOWN = new Set((process.env.FENETRES_CONNUES || '').split(',').map((x) => x.trim()).filter(Boolean));
let ok = 0, ko = 0; const check = (c, m) => { if (c) { ok++; console.log('✅', m); } else { ko++; console.log('❌', m); } };

const runOne = async (vp, app, sc) => {
  const D = app === 'admin' ? adminData() : workerData();
  sc.prep?.(D);
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...vp.opts });
  if (app === 'worker') { await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({ latitude: 45.7578, longitude: 4.832, accuracy: 12 }); }
  await setup(ctx, app === 'admin' ? 'u-admin' : ME, app === 'admin' ? 'paul@exemple.fr' : LONG.mail, () => D);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  try {
    if (app === 'admin') {
      await p.goto(`${BASE}/admin`);
      await p.locator('.bt-pl-acct, .bt-pl-m-ibtn[aria-label="Menu"]').filter({ visible: true }).first().waitFor({ timeout: 20000 });
    } else {
      await p.goto(`${BASE}/poseur`);
      await p.waitForSelector('.bt-total', { timeout: 20000 });
    }
    await p.waitForTimeout(900);
    const opened = await sc.open(p, vp.L);
    const shown = opened && await waitDialog(p, sc.waitSel || '[role=dialog]');
    if (!shown) {
      skipped.push(`${vp.key} · ${app} · ${sc.name}`);
      console.log(`⚠️  ${vp.key} · ${sc.name} : bouton d'ouverture introuvable dans ce build — fenêtre SAUTÉE`);
      return;
    }
    await p.waitForTimeout(450); // fin de l'animation d'ouverture
    await p.mouse.move(2, 2).catch(() => {});
    const boxes = await p.evaluate(measure, sc.extraSel || '');
    const issues = boxes.flatMap((x) => x.issues.map((i) => `[${x.title}] ${i}`));
    results.push({ vp: vp.key, app, id: sc.id, name: sc.name, boxes, issues });
    const label = `${vp.key} · ${sc.name}`;
    if (issues.length && KNOWN.has(sc.id)) {
      knownHits.push(`${label} — ${issues[issues.length - 1]}`);
      console.log(`⚠️  ${label} : défaut CONNU (signalé à sa zone), non compté\n      → ${issues.slice(0, 6).join('\n      → ')}`);
    } else check(issues.length === 0, `${vp.key} · ${sc.name} : ${boxes.length} fenêtre(s), ${boxes.map((x) => `« ${x.title} » ${x.width}px`).join(', ')}${issues.length ? `\n      → ${issues.slice(0, 6).join('\n      → ')}` : ' — tient en largeur'}`);
    const file = `fenetres-${sc.id}-${vp.key}.png`;
    if (sc.shot && (vp.key !== '1024x768' || ['reglages', 'abonnement', 'export-equipe', 'import-clients', 'conges', 'fiche-salarie', 'conges-salarie', 'retirer'].includes(sc.id))) await p.screenshot({ path: path.join(SH, file) });
    if (ALL_SHOTS) await p.screenshot({ path: path.join(ALL_SHOTS, file) });
    if (errs.length) console.log(`   (erreurs de page : ${[...new Set(errs)].slice(0, 2).join(' | ')})`);
  } finally { await ctx.close(); }
};

for (const vp of VIEWPORTS) {
  console.log(`\n═════ ${vp.key} — bureau ═════`);
  for (const sc of ADMIN) if (!sc.only || sc.only === vp.L) await runOne(vp, 'admin', sc);
  console.log(`\n═════ ${vp.key} — salarié ═════`);
  for (const sc of WORKER) await runOne(vp, 'worker', sc);
}

const measured = results.length;
const adminDesk = results.filter((r) => r.app === 'admin' && r.vp === '1280x800').length;
const workerMob = results.filter((r) => r.app === 'worker' && r.vp === '390x844').length;
check(adminDesk >= 15 && workerMob >= 5, `sonde non aveugle : ${adminDesk} fenêtres du bureau mesurées à 1280×800, ${workerMob} fenêtres du salarié à 390×844`);
console.log(`\n${measured} mesures (${[...new Set(results.map((r) => r.id))].length} fenêtres différentes × 3 tailles).`);
if (knownHits.length) console.log(`⚠️  ${knownHits.length} défaut(s) connu(s) non compté(s) (FENETRES_CONNUES=${[...KNOWN].join(',')}) :\n   - ${knownHits.join('\n   - ')}`);
if (skipped.length) console.log(`⚠️  ${skipped.length} fenêtre(s) sautée(s), bouton introuvable dans ce build :\n   - ${skipped.join('\n   - ')}`);
console.log(`Appels qui auraient écrit (simulés, rien n'est appliqué) : ${writes.length ? [...new Set(writes)].join(', ') : 'aucun'}`);
console.log(`\n${ok} ✅ / ${ko} ❌`);
await b.close(); srv.close();
process.exit(ko ? 1 : 0);
