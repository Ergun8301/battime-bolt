// Lot 11 — la fonction `kiosk` elle-même, de bout en bout, contre une base
// SIMULÉE (une petite imitation de PostgREST en mémoire, branchée sur fetch).
// Aucune vraie base, aucun réseau. Lancé par kiosk-function.test.ts (dans un
// Deno à part, sans le package.json du site : supabase-js vient de jsr), ou :
//   DENO_NO_PACKAGE_JSON=1 deno test -A supabase/functions/_shared/kiosk-function.check.ts
//
// Ce qui est vérifié (les règles du lot 11) :
//   · relier une tablette DÉCONNECTE les anciennes de la même entreprise (et
//     seulement celles-là, et seulement les plus anciennes), sans rien supprimer ;
//   · la position de la tablette n'est plus enregistrée ;
//   · « unpair » : la tablette se déconnecte elle-même, avec son jeton ;
//   · « create_pairing » rend l'id du code, « cancel_pairing » le périme ;
//   · plafond d'essais ratés : 10 par adresse, plus de 60 en tout → 429 ;
//   · plus de GPS : ticket.needs_gps toujours faux, un scan « loin » passe ;
//   · l'arrivée va sur le chantier prévu quand il est unique ;
//   · « Heures clôturées par le bureau. » (mois ou salarié) ;
//   · « settings » n'écrit plus require_gps.

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

const URL_BASE = 'http://supabase.test';
Deno.env.set('SUPABASE_URL', URL_BASE);
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key');
Deno.env.set('KIOSK_SECRET', 'cle-de-test');

// ── La base simulée ──────────────────────────────────────────────────────────
let db: Db = {};
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
/** Horodatage réel, strictement croissant (comme now() d'une transaction à l'autre). */
let tick = 0;
const nowIso = () => { tick = Math.max(Date.now(), tick + 1); return new Date(tick).toISOString(); };
/** Il y a `min` minutes (négatif = dans le futur). */
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const calls: { method: string; table: string; body?: unknown; query: string; prefer: string }[] = [];
let rpcResult: (name: string, args: Row) => { status: number; body: unknown } = () => ({ status: 200, body: [] });
let insertError: Record<string, { status: number; body: unknown } | undefined> = {};

const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [k, raw] of params) {
    if (SKIP.has(k)) continue;
    const dot = raw.indexOf('.');
    const op = raw.slice(0, dot); const val = raw.slice(dot + 1);
    const cur = row[k];
    const s = cur == null ? null : String(cur);
    if (op === 'eq' && s !== val) return false;
    if (op === 'neq' && s === val) return false;
    if (op === 'is' && !(val === 'null' ? cur == null : s === val)) return false;
    if (op === 'gt' && !(s != null && s > val)) return false;
    if (op === 'gte' && !(s != null && s >= val)) return false;
    if (op === 'lt' && !(s != null && s < val)) return false;
    if (op === 'lte' && !(s != null && s <= val)) return false;
    if (op === 'in' && !val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(cur))) return false;
  }
  return true;
}
const DEFAULTS: Record<string, () => Row> = {
  kiosks: () => ({ revoked_at: null, last_seen_at: null }),
  kiosk_pairings: () => ({ used_at: null, kiosk_id: null }),
};
function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : String(input));
  const method = (init?.method || req?.method || 'GET').toUpperCase();
  const headers = new Headers(init?.headers || req?.headers);
  const bodyText = init?.body != null ? String(init.body) : req ? await req.text() : '';

  if (url.pathname === '/auth/v1/user') {
    const tok = (headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const u = (db.auth || []).find((x) => x.token === tok);
    return u ? reply(200, { id: u.id, aud: 'authenticated', role: 'authenticated', email: `${u.id}@x.fr` }) : reply(401, { msg: 'invalid token' });
  }
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    const name = url.pathname.slice('/rest/v1/rpc/'.length);
    calls.push({ method, table: `rpc:${name}`, body: bodyText ? JSON.parse(bodyText) : null, query: url.search, prefer: '' });
    const r = rpcResult(name, bodyText ? JSON.parse(bodyText) : {});
    return reply(r.status, r.body);
  }
  if (!url.pathname.startsWith('/rest/v1/')) return reply(404, { message: 'inconnu' });
  const table = url.pathname.slice('/rest/v1/'.length);
  const prefer = headers.get('Prefer') || '';
  const accept = headers.get('Accept') || '';
  const params = url.searchParams;
  const body = bodyText ? JSON.parse(bodyText) : undefined;
  calls.push({ method, table, body, query: url.search, prefer });
  const rows = (db[table] ||= []);
  const wantObject = accept.includes('vnd.pgrst.object');
  const out = (list: Row[], status = 200) => {
    if (wantObject) return list.length === 1 ? reply(status, list[0]) : reply(406, { code: 'PGRST116', message: `${list.length} lignes` });
    return reply(status, list, { 'Content-Range': `0-${Math.max(0, list.length - 1)}/${list.length}` });
  };

  if (method === 'GET' || method === 'HEAD') {
    let list = rows.filter((r) => matches(r, params));
    const order = params.get('order');
    if (order) {
      const [col, dir] = order.split('.');
      list = list.slice().sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (dir === 'desc' ? -1 : 1));
    }
    const limit = params.get('limit');
    if (limit) list = list.slice(0, Number(limit));
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'Content-Range': `*/${list.length}` } });
    return out(list);
  }
  if (method === 'POST') {
    const forced = insertError[table];
    if (forced) return reply(forced.status, forced.body);
    const items = (Array.isArray(body) ? body : [body]) as Row[];
    const conflict = params.get('on_conflict');
    const saved: Row[] = [];
    for (const it of items) {
      const existing = conflict ? rows.find((r) => r[conflict] === it[conflict]) : undefined;
      if (existing && prefer.includes('merge-duplicates')) { Object.assign(existing, it); saved.push(existing); continue; }
      const row: Row = { id: uuid(), created_at: nowIso(), ...(DEFAULTS[table]?.() || {}), ...it };
      rows.push(row); saved.push(row);
    }
    return prefer.includes('return=representation') ? out(saved, 201) : reply(201, undefined);
  }
  if (method === 'PATCH') {
    const list = rows.filter((r) => matches(r, params));
    for (const r of list) Object.assign(r, body);
    return prefer.includes('return=representation') ? out(list) : reply(204, undefined);
  }
  return reply(405, { message: 'méthode' });
}

// ── La fonction, chargée avec Deno.serve et fetch détournés ──────────────────
let handler: ((req: Request) => Promise<Response>) | null = null;
const realServe = Deno.serve;
const realFetch = globalThis.fetch;
async function loadFunction() {
  if (handler) return handler;
  Object.defineProperty(Deno, 'serve', {
    configurable: true, writable: true,
    value: (h: (req: Request) => Promise<Response>) => { handler = h; return { finished: Promise.resolve(), shutdown: async () => {} }; },
  });
  globalThis.fetch = fakeFetch as typeof fetch;
  try {
    // Chemin construit : le fichier de la fonction n'entre pas dans la
    // vérification de types de ce test (ses types d'Edge Runtime viennent de jsr).
    const spec = new URL(['..', 'kiosk', 'index.ts'].join('/'), import.meta.url).href;
    await import(spec);
  } finally {
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: realServe });
  }
  if (!handler) throw new Error('Deno.serve non appelé');
  return handler;
}

async function call(body: Row, opts: { token?: string; ip?: string } = {}) {
  const h = await loadFunction();
  globalThis.fetch = fakeFetch as typeof fetch;
  try {
    const res = await h(new Request('http://fonction.test/kiosk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        'x-forwarded-for': opts.ip || '203.0.113.1',
      },
      body: JSON.stringify(body),
    }));
    return { status: res.status, json: await res.json() as Row };
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function sha256Hex(s: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const CO = 'c0000000-0000-4000-8000-000000000001';
const CO2 = 'c0000000-0000-4000-8000-000000000002';
const AUTRE = 'w0000000-0000-4000-8000-00000000000a';
const VILLA = 'w0000000-0000-4000-8000-00000000000b';
const ECOLE = 'w0000000-0000-4000-8000-00000000000c';

function freshDb(): Db {
  calls.length = 0;
  insertError = {};
  rpcResult = () => ({ status: 200, body: [] });
  return {
    auth: [{ id: 'u-admin', token: 'jwt-admin' }, { id: 'u-karim', token: 'jwt-karim' }, { id: 'u-admin2', token: 'jwt-admin2' }],
    companies: [{ id: CO, name: 'Martin Menuiserie', kiosk_enabled: true }, { id: CO2, name: 'Autre Société', kiosk_enabled: true }],
    users: [
      { id: 'u-admin', company_id: CO, role: 'admin', is_active: true, first_name: 'Paul' },
      { id: 'u-karim', company_id: CO, role: 'worker', is_active: true, first_name: 'Karim' },
      { id: 'u-admin2', company_id: CO2, role: 'admin', is_active: true, first_name: 'Zoé' },
    ],
    worksites: [
      { id: AUTRE, company_id: CO, client_name: 'Autre' },
      { id: VILLA, company_id: CO, client_name: 'Villa Dupont' },
      { id: ECOLE, company_id: CO, client_name: 'École Jean Moulin' },
    ],
    kiosk_settings: [], kiosks: [], kiosk_pairings: [], kiosk_pair_failures: [], kiosk_punches: [],
    planning: [], active_sessions: [],
  };
}

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: unknown, msg: string) { if (!c) throw new Error(msg); }

/** Une tablette déjà reliée (jeton connu). */
async function addKiosk(company: string, token: string, createdAt: string, extra: Row = {}) {
  const row: Row = {
    id: uuid(), company_id: company, name: 'Borne', worksite_id: company === CO ? AUTRE : null,
    token_hash: await sha256Hex(token), seed_salt: 'sel', latitude: null, longitude: null, accuracy_m: null,
    created_at: createdAt, last_seen_at: createdAt, revoked_at: null, ...extra,
  };
  db.kiosks.push(row);
  return row;
}

Deno.test({
  name: 'Lot 11 — relier une tablette déconnecte les anciennes (même entreprise, plus anciennes), sans GPS',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    const old1 = await addKiosk(CO, 't-old1', ago(2 * 24 * 60));
    const old2 = await addKiosk(CO, 't-old2', ago(90));
    const other = await addKiosk(CO2, 't-other', ago(2 * 24 * 60));
    // Une tablette « du futur » : reliée au même instant que la nouvelle (horodatage plus grand).
    const future = await addKiosk(CO, 't-future', ago(-24 * 60));

    const cp = await call({ action: 'create_pairing' }, { token: 'jwt-admin' });
    eq(cp.status, 200, 'create_pairing');
    ok(/^\d{6}$/.test(String(cp.json.code)), 'code à 6 chiffres');
    ok(typeof cp.json.pairing_id === 'string' && cp.json.pairing_id, 'create_pairing rend l’id du code');
    const pairingRow = db.kiosk_pairings.find((p) => p.id === cp.json.pairing_id)!;
    eq(pairingRow.worksite_id, AUTRE, 'sans lieu choisi : le lieu « Autre »');

    const pr = await call({ action: 'pair', code: cp.json.code, lat: 48.85, lng: 2.35, accuracy: 12 });
    eq(pr.status, 200, `pair ${JSON.stringify(pr.json)}`);
    const created = db.kiosks.find((k) => k.id === pr.json.kiosk_id)!;
    eq([created.latitude, created.longitude, created.accuracy_m], [null, null, null], 'position de la tablette non enregistrée');
    ok(created.revoked_at == null, 'la nouvelle tablette est active');
    ok(old1.revoked_at && old2.revoked_at, 'les deux anciennes tablettes de l’entreprise sont déconnectées');
    ok(other.revoked_at == null, 'la tablette d’une AUTRE entreprise reste active');
    ok(future.revoked_at == null, 'une tablette reliée après (horodatage plus récent) n’est pas déconnectée');
    eq(db.kiosks.length, 5, 'aucune tablette supprimée');
    eq((pr.json.settings as Row).require_gps, false, 'réglages : require_gps toujours faux');
    ok(!calls.some((c) => c.method === 'DELETE'), 'aucun DELETE');
  },
});

Deno.test({
  name: 'Lot 11 — « unpair » : la tablette se déconnecte elle-même, avec son jeton seulement',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    const k = await addKiosk(CO, 't-moi', ago(60));
    const k2 = await addKiosk(CO, 't-autre', ago(30));
    const bad = await call({ action: 'unpair', kiosk_id: k.id, token: 'mauvais' });
    eq(bad.status, 401, 'mauvais jeton refusé');
    ok(k.revoked_at == null, 'mauvais jeton : rien ne change');
    const r = await call({ action: 'unpair', kiosk_id: k.id, token: 't-moi' });
    eq([r.status, r.json.success], [200, true], 'unpair');
    ok(k.revoked_at, 'la tablette est déconnectée');
    ok(k2.revoked_at == null, 'seulement elle');
    const again = await call({ action: 'unpair', kiosk_id: k.id, token: 't-moi' });
    eq(again.status, 200, 'rejouable');
    const sync = await call({ action: 'sync', kiosk_id: k.id, token: 't-moi' });
    eq(sync.status, 410, 'ensuite sync → 410 (borne retirée)');
  },
});

Deno.test({
  name: 'Lot 11 — « cancel_pairing » périme le code ; seulement ceux de son entreprise',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    const a = await call({ action: 'create_pairing' }, { token: 'jwt-admin' });
    const b = await call({ action: 'create_pairing' }, { token: 'jwt-admin' });
    ok(a.json.code && b.json.code, 'deux codes (deux admins, deux fenêtres)');
    // Un admin d'une autre entreprise ne peut pas périmer ce code.
    const foreign = await call({ action: 'cancel_pairing', pairing_id: a.json.pairing_id }, { token: 'jwt-admin2' });
    eq(foreign.json.cancelled, 0, 'autre entreprise : rien de périmé');
    const c = await call({ action: 'cancel_pairing', pairing_id: a.json.pairing_id }, { token: 'jwt-admin' });
    eq([c.status, c.json.cancelled], [200, 1], 'code périmé');
    const p = await call({ action: 'pair', code: a.json.code });
    eq(p.status, 400, 'un code périmé ne relie plus');
    const p2 = await call({ action: 'pair', code: b.json.code });
    eq(p2.status, 200, 'l’autre code (non périmé) marche toujours');
    const noAuth = await call({ action: 'cancel_pairing', pairing_id: b.json.pairing_id });
    eq(noAuth.status, 401, 'sans jeton admin : refusé');
    const garbage = await call({ action: 'cancel_pairing', pairing_id: 'pas-un-id' }, { token: 'jwt-admin' });
    eq(garbage.status, 200, 'id inconnu : rien à faire, pas d’erreur');
  },
});

Deno.test({
  name: 'Lot 11 — essais de code ratés : 10 par adresse, plus de 60 en tout → 429',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    const cp = await call({ action: 'create_pairing' }, { token: 'jwt-admin' });
    const recent = () => new Date(Date.now() - 60_000).toISOString();
    for (let i = 0; i < 10; i++) db.kiosk_pair_failures.push({ id: i + 1, ip: '198.51.100.7', created_at: recent() });
    const blocked = await call({ action: 'pair', code: cp.json.code }, { ip: '198.51.100.7' });
    eq(blocked.status, 429, '10 échecs depuis cette adresse → 429, même avec le bon code');
    // 60 échecs au total (adresses toutes différentes) : encore permis…
    db.kiosk_pair_failures = [];
    for (let i = 0; i < 60; i++) db.kiosk_pair_failures.push({ id: i + 1, ip: `10.0.0.${i}`, created_at: recent() });
    const wrong = await call({ action: 'pair', code: '000000' === cp.json.code ? '000001' : '000000' }, { ip: '192.0.2.1' });
    eq(wrong.status, 400, '60 échecs en tout : un essai de plus est encore examiné (et raté)');
    // … le 61e est enregistré : au-delà de 60, tout le monde attend.
    const after = await call({ action: 'pair', code: cp.json.code }, { ip: '192.0.2.99' });
    eq(after.status, 429, 'plus de 60 échecs en tout → 429, quelle que soit l’adresse');
    // Les échecs de plus de 10 minutes ne comptent plus.
    for (const f of db.kiosk_pair_failures) f.created_at = new Date(Date.now() - 11 * 60_000).toISOString();
    const later = await call({ action: 'pair', code: cp.json.code }, { ip: '192.0.2.99' });
    eq(later.status, 200, 'après 10 minutes : le bon code relie la tablette');
  },
});

Deno.test({
  name: 'Lot 11 — plus de GPS : ticket.needs_gps faux, scan accepté même « loin », settings sans require_gps',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    db.kiosk_settings.push({ company_id: CO, show_planning: false, require_gps: true, active_from: null, active_until: null });
    const k = await addKiosk(CO, 't-k', ago(60), { latitude: 48.8566, longitude: 2.3522, worksite_id: VILLA });
    const { codeAt, deriveSeed } = await import('./kiosk-code.ts');
    const code = await codeAt(await deriveSeed('cle-de-test', String(k.id), 'sel'), Date.now());
    const t = await call({ action: 'ticket', k: k.id, c: code });
    eq(t.status, 200, `ticket ${JSON.stringify(t.json)}`);
    eq(t.json.needs_gps, false, 'needs_gps toujours faux (même require_gps = vrai en base, tablette avec position)');
    const p = await call({ action: 'punch', ticket: t.json.ticket, lat: 43.3, lng: 5.4, accuracy: 5 }, { token: 'jwt-karim' });
    eq([p.status, p.json.kind], [200, 'arrival'], `scan à 650 km accepté : ${JSON.stringify(p.json)}`);
    const s = await call({ action: 'settings', require_gps: true, active_from: '06:00', active_until: '20:00' }, { token: 'jwt-admin' });
    eq(s.status, 200, 'settings');
    const up = calls.filter((c) => c.table === 'kiosk_settings' && c.method === 'POST');
    ok(up.length === 1 && !('require_gps' in (up[0].body as Row)), `settings n’écrit plus require_gps : ${JSON.stringify(up[0]?.body)}`);
    eq([(s.json.settings as Row).active_from, (s.json.settings as Row).active_until, (s.json.settings as Row).require_gps], ['06:00', '20:00', false], 'horaires enregistrés');
  },
});

async function punchAt(kioskExtra: Row, plans: Row[]) {
  db = freshDb();
  const k = await addKiosk(CO, 't-k', ago(60), kioskExtra);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  for (const p of plans) db.planning.push({ user_id: 'u-karim', company_id: CO, work_date: today, absence_type: null, ...p });
  const { codeAt, deriveSeed } = await import('./kiosk-code.ts');
  const code = await codeAt(await deriveSeed('cle-de-test', String(k.id), 'sel'), Date.now());
  const t = await call({ action: 'ticket', k: k.id, c: code });
  const p = await call({ action: 'punch', ticket: t.json.ticket }, { token: 'jwt-karim' });
  const ins = calls.find((c) => c.table === 'active_sessions' && c.method === 'POST');
  return { p, session: ins?.body as Row | undefined };
}

Deno.test({
  name: 'Lot 11 — l’arrivée va sur le chantier prévu quand il est unique',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    // Tablette sur « Autre », un seul chantier prévu (deux créneaux) → ce chantier.
    let r = await punchAt({ worksite_id: AUTRE }, [
      { id: 'pl-am', worksite_id: VILLA, estimated_start: '08:00:00' },
      { id: 'pl-pm', worksite_id: VILLA, estimated_start: '13:30:00' },
    ]);
    eq([r.session?.worksite_id, r.session?.planning_id, r.p.json.worksite_name], [VILLA, 'pl-am', 'Villa Dupont'], 'Autre + un chantier prévu → le chantier prévu (premier créneau)');
    // Deux chantiers prévus → « Autre », comme avant.
    r = await punchAt({ worksite_id: AUTRE }, [
      { id: 'pl-v', worksite_id: VILLA, estimated_start: '08:00:00' },
      { id: 'pl-e', worksite_id: ECOLE, estimated_start: '13:30:00' },
    ]);
    eq([r.session?.worksite_id, r.session?.planning_id], [AUTRE, null], 'deux chantiers prévus → Autre');
    // Rien de prévu → « Autre ».
    r = await punchAt({ worksite_id: AUTRE }, []);
    eq([r.session?.worksite_id, r.p.json.worksite_name], [AUTRE, 'Autre'], 'rien de prévu → Autre');
    // Ancienne borne rattachée à un vrai chantier → ce chantier, même si un autre est prévu.
    r = await punchAt({ worksite_id: ECOLE }, [{ id: 'pl-v', worksite_id: VILLA, estimated_start: '08:00:00' }]);
    eq([r.session?.worksite_id, r.session?.planning_id], [ECOLE, null], 'borne sur un chantier → ce chantier');
    // Borne sans lieu, un chantier prévu → ce chantier.
    r = await punchAt({ worksite_id: null }, [{ id: 'pl-v', worksite_id: VILLA }]);
    eq([r.session?.worksite_id, r.session?.planning_id], [VILLA, 'pl-v'], 'borne sans lieu → le chantier prévu');
  },
});

Deno.test({
  name: 'Lot 11 — « Heures clôturées par le bureau. » (mois ou salarié)',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    insertError.active_sessions = { status: 400, body: { code: 'P0001', message: 'Heures clôturées jusqu’au 15/10 pour ce salarié' } };
    const k = await addKiosk(CO, 't-k', ago(60));
    const { codeAt, deriveSeed } = await import('./kiosk-code.ts');
    const code = await codeAt(await deriveSeed('cle-de-test', String(k.id), 'sel'), Date.now());
    const t = await call({ action: 'ticket', k: k.id, c: code });
    const p = await call({ action: 'punch', ticket: t.json.ticket }, { token: 'jwt-karim' });
    eq([p.status, p.json.code, p.json.error], [409, 'month_closed', 'Heures clôturées par le bureau.'], 'arrivée refusée, message clair');
    // Départ : le mois est clôturé (ancien message de la base).
    db.active_sessions.push({ user_id: 'u-karim', work_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) });
    db.kiosk_punches = [];
    rpcResult = () => ({ status: 400, body: { code: 'P0001', message: 'Ce mois est clôturé' } });
    const t2 = await call({ action: 'ticket', k: k.id, c: code });
    const d = await call({ action: 'punch', ticket: t2.json.ticket }, { token: 'jwt-karim' });
    eq([d.status, d.json.error], [409, 'Heures clôturées par le bureau.'], 'départ refusé, même message');
  },
});
