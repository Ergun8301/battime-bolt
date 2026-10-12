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
//
// Lot 12 (QR fixe imprimable + position au scan), en fin de fichier :
//   · AVANT la migration (colonnes absentes, simulées par 42703 / PGRST205) :
//     tout marche comme avant, le QR fixe est « indisponible » ;
//   · APRÈS : activer (confirmation), poser le point (≤ 100 m), rayon,
//     régénérer, désactiver ; scan accepté dans la zone, refusé hors zone,
//     trop imprécis ou sans position ; jeton révoqué / désactivé / faux /
//     autre entreprise ; double scan ; aucune coordonnée gardée ; relier une
//     tablette ne coupe pas le QR fixe ; le QR tournant marche toujours ;
//   · plafond des essais REFUSÉS du QR fixe : jamais un QR valable, jamais la
//     tablette, jamais les échecs d'une autre entreprise, aucune adresse
//     gardée, table bornée ; borne coupée : le bureau peut encore couper le QR
//     fixe (désactiver, régénérer), pas l'activer ; « Déconnecter la tablette »
//     d'une ancienne fenêtre ne coupe pas le QR fixe ; « Scannez la tablette »
//     seulement s'il y en a une ; derniers pointages lisibles par le bureau.

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
// Par défaut, les fonctions du lot 12 sont ABSENTES (base pas encore migrée) :
// la fonction kiosk doit retomber sur le chemin d'avant (insertion au nom du salarié).
const LOT12_FN = new Set(['kiosk_open_session', 'close_forgotten_sessions']);
const defaultRpc = (name: string) => (LOT12_FN.has(name)
  ? { status: 404, body: { code: 'PGRST202', message: `Could not find the function public.${name}` } }
  : { status: 200, body: [] });
let rpcResult: (name: string, args: Row) => { status: number; body: unknown } = defaultRpc;
let insertError: Record<string, { status: number; body: unknown } | undefined> = {};
// Lot 12 (QR fixe) : la migration est-elle passée ? Par défaut NON (comme la
// production aujourd'hui) : toute requête qui cite une colonne neuve reçoit
// l'erreur de PostgREST, la table neuve est « introuvable ».
let qrFixeMigrated = false;
const LOT12_QR_COLS: Record<string, string[]> = {
  kiosks: ['kind'],
  kiosk_punches: ['in_zone'],
  kiosk_settings: ['fixed_qr_latitude', 'fixed_qr_longitude', 'fixed_qr_accuracy_m', 'fixed_qr_point_at', 'fixed_qr_radius_m'],
};

const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [k, raw] of params) {
    if (SKIP.has(k)) continue;
    const dot = raw.indexOf('.');
    const op = raw.slice(0, dot); const val = raw.slice(dot + 1);
    const cur = row[k];
    const s = cur == null ? null : String(cur);
    if (op === 'not') { // not.is.null
      const [inner, innerVal] = [val.slice(0, val.indexOf('.')), val.slice(val.indexOf('.') + 1)];
      if (inner === 'is' && (innerVal === 'null' ? cur != null : s !== innerVal)) continue;
      return false;
    }
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
  kiosks: () => ({ revoked_at: null, last_seen_at: null, ...(qrFixeMigrated ? { kind: 'tablette' } : {}) }),
  kiosk_pairings: () => ({ used_at: null, kiosk_id: null }),
  kiosk_settings: (): Row => (qrFixeMigrated ? { fixed_qr_radius_m: 200, fixed_qr_latitude: null, fixed_qr_longitude: null } : {}),
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
  if (!qrFixeMigrated) {
    if (table === 'kiosk_ticket_failures') return reply(404, { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` });
    const cols = LOT12_QR_COLS[table];
    if (cols) {
      const cited = [...params.keys(), ...(params.get('select') || '').split(',').map((c) => c.trim()), ...Object.keys((Array.isArray(body) ? body[0] : body) || {})];
      const hit = cols.find((c) => cited.includes(c));
      if (hit) {
        return (method === 'POST' || method === 'PATCH') && Object.keys((Array.isArray(body) ? body[0] : body) || {}).includes(hit)
          ? reply(400, { code: 'PGRST204', message: `Could not find the '${hit}' column of '${table}' in the schema cache` })
          : reply(400, { code: '42703', message: `column ${table}.${hit} does not exist` });
      }
    }
  }
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
  rpcResult = defaultRpc;
  qrFixeMigrated = false;
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
    created_at: createdAt, last_seen_at: createdAt, revoked_at: null,
    ...(qrFixeMigrated ? { kind: 'tablette' } : {}), ...extra,
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

Deno.test({
  name: 'Lot 12 — arrivée par kiosk_open_session, sortie oubliée fermée au scan suivant',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - 86400000));
    db = freshDb();
    const opened: Row[] = [];
    let closeN = 1;
    rpcResult = (name, args) => {
      if (name === 'kiosk_open_session') { opened.push(args); return { status: 204, body: undefined }; }
      if (name === 'close_forgotten_sessions') {
        if (closeN > 0) db.active_sessions = db.active_sessions.filter((r) => r.user_id !== args.p_user);
        return { status: 200, body: closeN };
      }
      return { status: 200, body: [] };
    };
    const k = await addKiosk(CO, 't-k', ago(60), { worksite_id: VILLA });
    const { codeAt, deriveSeed } = await import('./kiosk-code.ts');
    const code = await codeAt(await deriveSeed('cle-de-test', String(k.id), 'sel'), Date.now());
    let t = await call({ action: 'ticket', k: k.id, c: code });
    let p = await call({ action: 'punch', ticket: t.json.ticket }, { token: 'jwt-karim' });
    eq([p.status, p.json.kind], [200, 'arrival'], `arrivée : ${JSON.stringify(p.json)}`);
    eq([opened.length, opened[0]?.p_user, opened[0]?.p_worksite, opened[0]?.p_date], [1, 'u-karim', VILLA, today], 'arrivée par kiosk_open_session (au nom du salarié, côté base)');
    ok(!calls.some((c) => c.table === 'active_sessions' && c.method === 'POST'), 'aucune insertion directe quand la fonction existe');

    // Sortie oubliée hier : le scan du matin ferme hier et démarre aujourd'hui.
    db.active_sessions.push({ user_id: 'u-karim', company_id: CO, worksite_id: VILLA, work_date: yesterday, started_at: new Date(Date.now() - 86400000).toISOString() });
    db.kiosk_punches = [];
    t = await call({ action: 'ticket', k: k.id, c: code });
    p = await call({ action: 'punch', ticket: t.json.ticket }, { token: 'jwt-karim' });
    eq([p.status, p.json.kind], [200, 'arrival'], `lendemain : la borne ne bloque plus (${JSON.stringify(p.json)})`);
    ok(calls.some((c) => c.table === 'rpc:close_forgotten_sessions' && (c.body as Row)?.p_user === 'u-karim'), 'sortie oubliée fermée pour CE salarié');
    eq(opened.length, 2, 'puis nouvelle arrivée');

    // Rien n'a pu être fermé (jour clos) : l'ancien refus, clair.
    closeN = 0;
    db.active_sessions = [{ user_id: 'u-karim', company_id: CO, worksite_id: VILLA, work_date: yesterday, started_at: new Date(Date.now() - 86400000).toISOString() }];
    db.kiosk_punches = [];
    t = await call({ action: 'ticket', k: k.id, c: code });
    p = await call({ action: 'punch', ticket: t.json.ticket }, { token: 'jwt-karim' });
    eq([p.status, p.json.code], [409, 'stale_session'], 'rien fermé → refus « pointage d’un autre jour »');
  },
});

// ═════════════════════════════════════════════════════════════════════════════
// LOT 12 — QR FIXE IMPRIMABLE + POSITION AU SCAN
// ═════════════════════════════════════════════════════════════════════════════
// Le dépôt fictif : 45,7578 N / 4,8320 E. 1 m vers le nord ≈ 1 / 111 195 degré.
const REF = { lat: 45.7578, lng: 4.832 };
const at = (m: number, accuracy: number) => ({ lat: REF.lat + m / 111195, lng: REF.lng, accuracy });
const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Passe la base simulée « après migration » (les tablettes existantes deviennent kind = tablette). */
function migrate() {
  qrFixeMigrated = true;
  for (const k of db.kiosks) if (!('kind' in k)) k.kind = 'tablette';
}

/** Active le QR fixe (confirmé) et pose le point ; rend le jeton. */
async function enableFixed(token = 'jwt-admin') {
  const en = await call({ action: 'fixed_enable', confirm: true }, { token });
  if (en.status !== 200 || !en.json.token) throw new Error(`fixed_enable ${JSON.stringify(en.json)}`);
  const pt = await call({ action: 'fixed_point', lat: REF.lat, lng: REF.lng, accuracy: 12 }, { token });
  if (pt.status !== 200) throw new Error(`fixed_point ${JSON.stringify(pt.json)}`);
  return String(en.json.token);
}

/** Toutes les traces écrites vers la base simulée (corps et adresses), pour chercher une coordonnée. */
const everythingSent = () => JSON.stringify(calls.map((c) => [c.table, c.query, c.body]));

Deno.test({
  name: 'Lot 12 QR fixe — AVANT la migration : tout comme avant, le QR fixe est indisponible',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    const st = await call({ action: 'fixed_status' }, { token: 'jwt-admin' });
    eq([st.status, st.json.available], [200, false], 'fixed_status : indisponible (le bureau ne voit rien)');
    const en = await call({ action: 'fixed_enable', confirm: true }, { token: 'jwt-admin' });
    eq([en.status, en.json.code], [409, 'fixed_unavailable'], 'fixed_enable : refusé proprement');
    eq(db.kiosks.length, 0, 'aucune ligne créée');
    const fakeToken = `00000000-0000-4000-8000-000000000999.${'A'.repeat(43)}`;
    const t = await call({ action: 'ticket', f: fakeToken });
    eq([t.status, t.json.code], [404, 'fixed_unavailable'], `ticket f : « pas disponible » (${t.json.error})`);
    ok(String(t.json.error).includes('Ajoutez votre intervention à la main, ou scannez la tablette si votre entreprise en a une.'), '… avec l’autre moyen (formule neutre : on ne sait pas si une tablette est reliée)');
    // Le QR de la tablette : inchangé (aucun plafond, aucune écriture de plus).
    const k = await addKiosk(CO, 't-k', ago(60));
    const bad = await call({ action: 'ticket', k: k.id, c: '00000000' });
    eq([bad.status, bad.json.code], [400, 'code_invalid'], 'code faux : même refus qu’avant');
    ok(!calls.some((c) => c.table === 'kiosk_ticket_failures'), 'tablette : la table des échecs n’est ni lue ni écrite');
    // « Déconnecter la tablette » : comme avant (la colonne kind n’existe pas encore).
    const rv = await call({ action: 'revoke', kiosk_id: k.id }, { token: 'jwt-admin' });
    eq([rv.status, rv.json.revoked, k.revoked_at != null], [200, 1, true], 'revoke avant la migration : comme avant');
    k.revoked_at = null;
    const { codeAt, deriveSeed } = await import('./kiosk-code.ts');
    const code = await codeAt(await deriveSeed('cle-de-test', String(k.id), 'sel'), Date.now());
    const good = await call({ action: 'ticket', k: k.id, c: code });
    eq([good.status, good.json.needs_gps, 'needs_position' in good.json], [200, false, false], 'ticket de la tablette : comme avant, sans position');
    const p = await call({ action: 'punch', ticket: good.json.ticket }, { token: 'jwt-karim' });
    eq([p.status, p.json.kind], [200, 'arrival'], 'pointage à la tablette : comme avant');
    const ins = calls.find((c) => c.table === 'kiosk_punches' && c.method === 'POST');
    ok(ins && !('in_zone' in (ins.body as Row)), 'kiosk_punches : aucune colonne neuve écrite');
  },
});

Deno.test({
  name: 'Lot 12 QR fixe — bureau : activer (confirmation), point ≤ 100 m, rayon, régénérer, désactiver',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb(); migrate();
    let st = await call({ action: 'fixed_status' }, { token: 'jwt-admin' });
    eq([st.status, st.json.available, st.json.enabled, st.json.radius_m, (st.json.point as Row).set], [200, true, false, 200, false], 'désactivé par défaut, rayon 200 m, point non posé');
    eq([st.json.kiosk_enabled, st.json.has_tablet, st.json.recent], [true, false, []], 'statut : borne allumée, aucune tablette reliée, aucun pointage');
    const noConf = await call({ action: 'fixed_enable' }, { token: 'jwt-admin' });
    eq([noConf.status, noConf.json.code, db.kiosks.length], [400, 'confirm_required', 0], 'activer sans confirmation : refusé, rien de créé');
    const worker = await call({ action: 'fixed_enable', confirm: true }, { token: 'jwt-karim' });
    eq(worker.status, 403, 'un salarié ne peut pas activer');
    const anon = await call({ action: 'fixed_status' });
    eq(anon.status, 401, 'sans compte : refusé');
    const en = await call({ action: 'fixed_enable', confirm: true }, { token: 'jwt-admin' });
    eq([en.status, en.json.enabled], [200, true], 'activé après confirmation');
    const row = db.kiosks.find((k) => k.kind === 'fixe')!;
    ok(row && row.company_id === CO && row.worksite_id === AUTRE && String(row.seed_salt).startsWith('fixe.') && row.revoked_at == null, 'une ligne « fixe » de kiosks, lieu « Autre », sel « fixe. »');
    eq(en.json.token, `${row.id}.${String(en.json.token).split('.')[1]}`, 'jeton = id.signature');
    ok(!JSON.stringify(db).includes(String(en.json.token).split('.')[1]), 'la signature n’est stockée nulle part');
    eq(en.json.ref, String(row.id).replace(/-/g, '').slice(-4).toUpperCase(), 'référence courte');
    const again = await call({ action: 'fixed_enable', confirm: true }, { token: 'jwt-admin' });
    eq([again.json.token, db.kiosks.filter((k) => k.kind === 'fixe').length], [en.json.token, 1], 'activer deux fois : le même QR (un seul actif)');
    const other = await call({ action: 'fixed_status' }, { token: 'jwt-admin2' });
    eq(other.json.enabled, false, 'autre entreprise : son propre état (désactivé)');

    // Point de référence : précision 100 m ou mieux, sinon on redemande.
    const vague = await call({ action: 'fixed_point', lat: REF.lat, lng: REF.lng, accuracy: 250 }, { token: 'jwt-admin' });
    eq([vague.status, vague.json.code, vague.json.accuracy_m], [400, 'point_imprecise', 250], 'point à ± 250 m : refusé, précision annoncée');
    ok(/100 m ou mieux/.test(String(vague.json.error)), `message clair (${vague.json.error})`);
    ok(!db.kiosk_settings.some((s) => s.fixed_qr_latitude != null), '… rien d’enregistré');
    const pt = await call({ action: 'fixed_point', lat: REF.lat, lng: REF.lng, accuracy: 12.4 }, { token: 'jwt-admin' });
    eq([pt.status, (pt.json.point as Row).set, (pt.json.point as Row).accuracy_m], [200, true, 12], 'point posé à ± 12 m');
    ok(!JSON.stringify(pt.json).includes('45.7578') && !JSON.stringify(pt.json).includes('4.832'), 'le statut ne renvoie pas les coordonnées du point');
    const s = db.kiosk_settings.find((x) => x.company_id === CO)!;
    eq([s.fixed_qr_latitude, s.fixed_qr_longitude, s.fixed_qr_accuracy_m], [REF.lat, REF.lng, 12], 'point de l’ENTREPRISE gardé dans kiosk_settings');
    eq((await call({ action: 'fixed_radius', radius_m: 50 }, { token: 'jwt-admin' })).status, 400, 'rayon 50 m : refusé');
    eq((await call({ action: 'fixed_radius', radius_m: 500 }, { token: 'jwt-admin' })).json.radius_m, 500, 'rayon 500 m');
    eq((await call({ action: 'fixed_radius', radius_m: 200 }, { token: 'jwt-admin' })).json.radius_m, 200, 'rayon remis à 200 m');

    // Relier une tablette ne coupe pas le QR fixe ; l'ancienne tablette, si.
    const oldTab = await addKiosk(CO, 't-old', ago(60 * 24));
    const cp = await call({ action: 'create_pairing' }, { token: 'jwt-admin' });
    const pr = await call({ action: 'pair', code: cp.json.code });
    eq(pr.status, 200, 'tablette reliée');
    ok(oldTab.revoked_at && row.revoked_at == null, 'la dernière tablette gagne… sauf contre le QR fixe (toujours actif)');
    ok(calls.some((c) => c.table === 'kiosks' && c.method === 'PATCH' && c.query.includes('kind=eq.tablette')), '… la règle ne vise que kind = tablette');
    // Ni sync, ni board, ni unpair avec la ligne fixe.
    for (const action of ['sync', 'board', 'unpair']) {
      eq((await call({ action, kiosk_id: row.id, token: '' })).status, 401, `${action} avec la ligne fixe : borne inconnue (401)`);
    }
    // La ligne fixe n'a pas de QR tournant : un code calculé avec son sel est refusé.
    const { codeAt, deriveSeed } = await import('./kiosk-code.ts');
    const code = await codeAt(await deriveSeed('cle-de-test', String(row.id), String(row.seed_salt)), Date.now());
    const kt = await call({ action: 'ticket', k: row.id, c: code });
    eq([kt.status, kt.json.code], [404, 'kiosk_unknown'], 'ticket « tablette » sur la ligne fixe : refusé');

    // Régénérer : confirmation, l'ancien QR cesse, rien n'est supprimé.
    eq((await call({ action: 'fixed_regenerate' }, { token: 'jwt-admin' })).json.code, 'confirm_required', 'régénérer sans confirmation : refusé');
    const rg = await call({ action: 'fixed_regenerate', confirm: true }, { token: 'jwt-admin' });
    ok(rg.status === 200 && rg.json.enabled && rg.json.token !== en.json.token, 'régénéré : nouveau jeton');
    ok(row.revoked_at, 'l’ancienne ligne est retirée (revoked_at)');
    eq(db.kiosks.filter((k) => k.kind === 'fixe').length, 2, 'aucune ligne supprimée');
    eq((rg.json.point as Row).set, true, 'le point de référence est gardé');
    const ds = await call({ action: 'fixed_disable' }, { token: 'jwt-admin' });
    eq([ds.status, ds.json.enabled, ds.json.token], [200, false, null], 'désactivé');
    ok(db.kiosks.filter((k) => k.kind === 'fixe').every((k) => k.revoked_at), 'toutes les lignes fixes retirées');
    ok(!calls.some((c) => c.method === 'DELETE'), 'aucun DELETE');
  },
});

Deno.test({
  name: 'Lot 12 QR fixe — scan : position exigée, vérifiée côté serveur, jamais gardée',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb(); migrate();
    const token = await enableFixed();
    const fixedRow = db.kiosks.find((k) => k.kind === 'fixe')!;
    let t = await call({ action: 'ticket', f: token });
    eq([t.status, t.json.needs_position, t.json.needs_gps, t.json.radius_m, t.json.company_name, t.json.kiosk_name], [200, true, false, 200, 'Martin Menuiserie', 'QR fixe'], 'ticket : position demandée, rayon 200 m');
    const payload = JSON.parse(new TextDecoder().decode((await import('./kiosk-code.ts')).fromBase64Url(String(t.json.ticket).split('.')[0])));
    ok(payload.fq === fixedRow.id && !payload.k, 'ticket marqué QR fixe (fq), jamais confondu avec la tablette (k)');

    // Sans position (refus, introuvable) : rien d'enregistré, l'autre moyen proposé.
    let p = await call({ action: 'punch', ticket: t.json.ticket }, { token: 'jwt-karim' });
    eq([p.status, p.json.code], [403, 'position_missing'], 'sans position : refusé');
    ok(String(p.json.error).endsWith('Ajoutez votre intervention à la main.') && !/tablette/i.test(String(p.json.error)),
      `aucune tablette reliée : « ${p.json.error} » (jamais « Scannez la tablette »)`);
    eq(t.json.has_tablet, false, 'ticket : has_tablet = faux');
    // Une tablette reliée : l'autre moyen la cite.
    const tabScan = await addKiosk(CO, 't-tab-scan', ago(60));
    const tWith = await call({ action: 'ticket', f: token });
    eq(tWith.json.has_tablet, true, 'ticket : has_tablet = vrai avec une tablette reliée');
    p = await call({ action: 'punch', ticket: tWith.json.ticket }, { token: 'jwt-karim' });
    ok(String(p.json.error).endsWith('Scannez la tablette, ou ajoutez votre intervention à la main.'), `tablette reliée : « ${p.json.error} »`);
    tabScan.revoked_at = ago(1); // retirée : la suite se joue sans tablette
    eq([db.active_sessions.length, db.kiosk_punches.length], [0, 0], '… aucun chrono, aucun pointage');
    // Hors zone, trop imprécis.
    p = await call({ action: 'punch', ticket: t.json.ticket, ...at(400, 10) }, { token: 'jwt-karim' });
    eq([p.status, p.json.code], [403, 'out_of_zone'], '400 m (± 10 m) : hors zone');
    p = await call({ action: 'punch', ticket: t.json.ticket, ...at(20, 400) }, { token: 'jwt-karim' });
    eq([p.status, p.json.code, p.json.accuracy_m], [403, 'position_imprecise', 400], '± 400 m : trop imprécise, même tout près');
    p = await call({ action: 'punch', ticket: t.json.ticket, ...at(270, 60) }, { token: 'jwt-karim' });
    eq(p.json.code, 'out_of_zone', '270 m (± 60 m) : hors zone (200 + 60)');
    eq([db.active_sessions.length, db.kiosk_punches.length], [0, 0], '… toujours rien d’enregistré');

    // Dans la zone (250 m à ± 60 m : marge de précision) : arrivée.
    const pos = at(250, 60);
    p = await call({ action: 'punch', ticket: t.json.ticket, ...pos }, { token: 'jwt-karim' });
    eq([p.status, p.json.kind, p.json.kiosk_name], [200, 'arrival', 'QR fixe'], `250 m (± 60 m) : arrivée (${JSON.stringify(p.json)})`);
    const punchRow = db.kiosk_punches.at(-1)!;
    eq([punchRow.kiosk_id, punchRow.in_zone, punchRow.kind], [fixedRow.id, true, 'arrival'], 'kiosk_punches : la ligne fixe, « dans la zone : oui »');
    eq(db.active_sessions[0]?.worksite_id, AUTRE, 'arrivée sur « Autre » (aucun chantier prévu), comme la tablette');
    // AUCUNE coordonnée gardée : ni dans une table, ni dans une requête vers la base.
    const sent = everythingSent();
    ok(!sent.includes(String(pos.lat)) && !sent.includes(String(pos.lat).slice(0, 9)), 'la latitude du salarié n’est envoyée à aucune table');
    ok(!JSON.stringify(db.kiosk_punches).match(/lat|lng|accuracy/), 'kiosk_punches : aucune coordonnée');
    ok(!JSON.stringify(db.active_sessions).includes(String(pos.lat).slice(0, 7)), 'active_sessions : aucune coordonnée');
    // Le bureau LIT « dans la zone : oui » (qui, quand), sans aucune coordonnée ; l'autre entreprise ne voit rien.
    const stR = await call({ action: 'fixed_status' }, { token: 'jwt-admin' });
    const rec = stR.json.recent as Row[];
    eq([rec.length, rec[0].name, rec[0].kind, rec[0].in_zone], [1, 'Karim', 'arrival', true], 'bureau : le pointage du QR fixe, « dans la zone : oui »');
    ok(typeof rec[0].at === 'string' && !JSON.stringify(rec).match(/lat|lng|accuracy|45\./), '… avec la date, sans coordonnées');
    eq((await call({ action: 'fixed_status' }, { token: 'jwt-admin2' })).json.recent, [], 'autre entreprise : ne voit pas ces pointages');
    eq((await call({ action: 'fixed_status' }, { token: 'jwt-karim' })).status, 403, 'un salarié ne lit pas la liste');

    // Double scan en moins de 60 s : refusé (message neutre).
    t = await call({ action: 'ticket', f: token });
    p = await call({ action: 'punch', ticket: t.json.ticket, ...at(10, 10) }, { token: 'jwt-karim' });
    eq([p.status, p.json.code], [409, 'double_scan'], 'double scan < 60 s : refusé');
    // Départ, plus tard, dans la zone.
    punchRow.created_at = ago(120);
    db.active_sessions[0].work_date = parisToday();
    p = await call({ action: 'punch', ticket: t.json.ticket, ...at(30, 15) }, { token: 'jwt-karim' });
    eq([p.status, p.json.kind, db.kiosk_punches.at(-1)!.in_zone], [200, 'departure', true], 'départ dans la zone');
    ok(calls.some((c) => c.table === 'rpc:finish_active_session' && JSON.stringify(c.body) === JSON.stringify({ p_end: null, p_lat: null, p_lng: null, p_accuracy: null })),
      'départ : finish_active_session SANS position (rien à garder)');

    // Compte inactif / non connecté.
    const noAuth = await call({ action: 'punch', ticket: t.json.ticket, ...at(10, 10) });
    eq([noAuth.status, noAuth.json.code], [401, 'auth'], 'non connecté : se connecter d’abord');
  },
});

Deno.test({
  name: 'Lot 12 QR fixe — jeton révoqué, désactivé, faux, autre entreprise, borne coupée, point absent',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb(); migrate();
    const token = await enableFixed();
    // Un ticket obtenu AVANT la régénération ne sert plus après.
    const before = await call({ action: 'ticket', f: token });
    const rg = await call({ action: 'fixed_regenerate', confirm: true }, { token: 'jwt-admin' });
    const t1 = await call({ action: 'ticket', f: token });
    eq([t1.status, t1.json.code], [410, 'fixed_revoked'], 'ancien QR imprimé : « remplacé ou désactivé »');
    const p1 = await call({ action: 'punch', ticket: before.json.ticket, ...at(10, 10) }, { token: 'jwt-karim' });
    eq([p1.status, p1.json.code], [410, 'fixed_revoked'], 'ticket d’avant la régénération : refusé au pointage aussi');
    const t2 = await call({ action: 'ticket', f: rg.json.token });
    eq(t2.status, 200, 'le nouveau QR marche');
    // Signature modifiée, forme fausse, jeton d'une TABLETTE.
    const [id, sig] = String(rg.json.token).split('.');
    const tampered = `${id}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`;
    eq((await call({ action: 'ticket', f: tampered })).json.code, 'fixed_invalid', 'signature modifiée : QR non valide');
    eq((await call({ action: 'ticket', f: 'n-importe-quoi' })).json.code, 'fixed_invalid', 'jeton mal formé : QR non valide');
    const tab = await addKiosk(CO, 't-tab', ago(60));
    const { fixedQrToken } = await import('./fixed-qr.ts');
    eq((await call({ action: 'ticket', f: await fixedQrToken('cle-de-test', String(tab.id), 'sel') })).json.code, 'fixed_invalid', 'jeton fabriqué sur une tablette : refusé (pas une ligne fixe)');
    eq((await call({ action: 'ticket', f: await fixedQrToken('autre-cle', id, String(db.kiosks.find((k) => k.id === id)!.seed_salt)) })).json.code, 'fixed_invalid', 'jeton signé avec une autre clé : refusé');
    // Autre entreprise : le QR de CO2 scanné par un salarié de CO.
    const token2 = await enableFixed('jwt-admin2');
    const t3 = await call({ action: 'ticket', f: token2 });
    eq([t3.status, t3.json.company_name], [200, 'Autre Société'], 'QR fixe de l’autre entreprise : reconnu…');
    const p3 = await call({ action: 'punch', ticket: t3.json.ticket, ...at(10, 10) }, { token: 'jwt-karim' });
    eq([p3.status, p3.json.code], [403, 'wrong_company'], '… mais un salarié de CO ne peut pas y pointer (même entreprise exigée)');
    // Borne coupée par BEMEXO (kiosk_enabled) : le QR fixe aussi.
    db.companies[0].kiosk_enabled = false;
    eq((await call({ action: 'ticket', f: rg.json.token })).json.code, 'kiosk_disabled', 'borne coupée : QR fixe refusé');
    db.companies[0].kiosk_enabled = true;
    // Désactivé.
    await call({ action: 'fixed_disable' }, { token: 'jwt-admin' });
    eq((await call({ action: 'ticket', f: rg.json.token })).json.code, 'fixed_revoked', 'désactivé : « remplacé ou désactivé »');
    // Point absent : on le dit.
    db.kiosk_settings.find((s) => s.company_id === CO)!.fixed_qr_latitude = null;
    db.kiosk_settings.find((s) => s.company_id === CO)!.fixed_qr_longitude = null;
    const en = await call({ action: 'fixed_enable', confirm: true }, { token: 'jwt-admin' });
    const t4 = await call({ action: 'ticket', f: en.json.token });
    eq([t4.status, t4.json.code], [409, 'fixed_no_point'], 'point de référence pas posé : refus clair');
    await call({ action: 'fixed_point', lat: REF.lat, lng: REF.lng, accuracy: 10 }, { token: 'jwt-admin' });
    eq((await call({ action: 'ticket', f: en.json.token })).status, 200, 'point posé : le QR fixe marche');
  },
});

Deno.test({
  name: 'Lot 12 QR fixe — plafond des essais REFUSÉS : jamais un QR valable, jamais la tablette, aucune adresse gardée',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb(); migrate();
    const token = await enableFixed();
    const [id, sig] = String(token).split('.');
    const bad = (n: number) => `${id}.${'E'.repeat(42)}${'AB'[n % 2]}`; // forme valable, signature fausse
    const A = '198.51.100.9';
    const tablet = await addKiosk(CO, 't-plaf', ago(60));
    const { codeAt, deriveSeed } = await import('./kiosk-code.ts');
    const goodCode = async () => await codeAt(await deriveSeed('cle-de-test', String(tablet.id), 'sel'), Date.now());

    // 30 jetons faux depuis la même adresse : refusés (400) et comptés ; le 31e essai FAUX reçoit « Trop d'essais » (429).
    for (let i = 0; i < 30; i++) eq((await call({ action: 'ticket', f: bad(i) }, { ip: A })).status, 400, `faux n° ${i + 1} : refusé (400)`);
    const sizeBefore = db.kiosk_ticket_failures.length;
    const over = await call({ action: 'ticket', f: bad(31) }, { ip: A });
    eq([over.status, over.json.code], [429, 'throttled'], '31e jeton faux depuis cette adresse : « Trop d’essais » (429)');
    eq(db.kiosk_ticket_failures.length, sizeBefore, '… plus aucune écriture une fois le seau plein');
    // JAMAIS un QR valable : le bon jeton passe, depuis la même adresse, seau plein.
    eq((await call({ action: 'ticket', f: token }, { ip: A })).status, 200, 'QR fixe valable depuis l’adresse « pleine » : accepté');
    // JAMAIS la tablette (k/c inchangé) : un bon code passe, un faux ne compte ni ne bloque.
    const before = calls.length;
    const tk = await call({ action: 'ticket', k: tablet.id, c: await goodCode() }, { ip: A });
    eq([tk.status, 'needs_position' in tk.json], [200, false], 'QR de la tablette depuis l’adresse « pleine » : accepté, sans position');
    const tkBad = await call({ action: 'ticket', k: tablet.id, c: '00000000' }, { ip: A });
    eq([tkBad.status, tkBad.json.code], [400, 'code_invalid'], 'code faux de la tablette : le refus d’avant (400), jamais « Trop d’essais »');
    ok(!calls.slice(before).some((c) => c.table === 'kiosk_ticket_failures'), 'tablette : la table des échecs n’est ni lue ni écrite');
    // Les échecs d'une AUTRE entreprise (un autre QR visé) ne comptent pas pour celui-ci.
    const token2 = await enableFixed('jwt-admin2');
    const id2 = String(token2).split('.')[0];
    const other = (n: number) => `${id2}.${'C'.repeat(42)}${'AB'[n % 2]}`;
    const fromB = '203.0.113.77';
    for (let i = 0; i < 30; i++) await call({ action: 'ticket', f: other(i) }, { ip: fromB });
    eq((await call({ action: 'ticket', f: other(99) }, { ip: fromB })).status, 429, 'l’autre entreprise : son propre seau est plein…');
    eq((await call({ action: 'ticket', f: bad(5) }, { ip: fromB })).status, 400, '… sans toucher à un essai faux visant le QR de CETTE entreprise (autre seau)');
    // Une autre adresse : pas bloquée.
    eq((await call({ action: 'ticket', f: bad(7) }, { ip: '198.51.100.10' })).status, 400, 'autre adresse : le refus normal');
    // Fenêtre passée (10 minutes) : le compteur repart à 1 — sans rien effacer.
    for (const r of db.kiosk_ticket_failures) r.window_start = new Date(Date.now() - 11 * 60_000).toISOString();
    const n = db.kiosk_ticket_failures.length;
    eq((await call({ action: 'ticket', f: bad(8) }, { ip: A })).status, 400, 'après 10 minutes : de nouveau permis');
    eq(db.kiosk_ticket_failures.length, n, '… la ligne est réécrite, la table ne grossit pas');
    // AUCUNE adresse gardée : ni dans la table, ni dans ce qui est envoyé à la base.
    const sentIps = JSON.stringify(calls.filter((c) => c.table === 'kiosk_ticket_failures').map((c) => [c.query, c.body]));
    ok(!/198\.51|203\.0\.113|203\.0\.113\.1/.test(sentIps + JSON.stringify(db.kiosk_ticket_failures)), 'aucune adresse IP (ni claire, ni entière) dans la table des échecs');
    for (const c of calls.filter((x) => x.table === 'kiosk_ticket_failures' && x.method === 'POST')) {
      eq(Object.keys(c.body as Row).sort(), ['bucket', 'failures', 'window_start'], 'seulement un seau, un compteur et une date de fenêtre');
    }
    ok(db.kiosk_ticket_failures.every((r) => Number.isInteger(r.bucket) && (r.bucket as number) >= 0 && (r.bucket as number) < 4096), 'seau entre 0 et 4 095');
    // Une adresse qui change à chaque essai : la table reste bornée par le nombre de seaux, jamais une ligne par essai.
    for (let i = 0; i < 300; i++) await call({ action: 'ticket', f: `${id}.${'D'.repeat(42)}${'AB'[i % 2]}` }, { ip: `10.0.${i >> 8}.${i & 255}` });
    ok(db.kiosk_ticket_failures.length < 300 + n, `adresse changeante : une ligne par SEAU, pas par essai (${db.kiosk_ticket_failures.length} lignes pour 300 essais)`);
    ok(!calls.some((c) => c.method === 'DELETE'), 'aucun DELETE');
  },
});

Deno.test({
  name: 'Lot 12 QR fixe — borne coupée par BEMEXO : le bureau peut couper le QR fixe, pas l’activer',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb(); migrate();
    const token = await enableFixed();
    const row = db.kiosks.find((k) => k.kind === 'fixe')!;
    db.companies[0].kiosk_enabled = false;
    // Lire l'état : permis, et dit que la borne est coupée.
    const st = await call({ action: 'fixed_status' }, { token: 'jwt-admin' });
    eq([st.status, st.json.available, st.json.enabled, st.json.kiosk_enabled], [200, true, true, false], 'borne coupée : le bureau lit l’état du QR fixe (actif, borne coupée)');
    // Le QR imprimé ne marche pas tant que la borne est coupée…
    eq((await call({ action: 'ticket', f: token })).json.code, 'kiosk_disabled', 'QR imprimé refusé tant que la borne est coupée');
    // … mais tout ce qui active ou règle reste refusé.
    for (const b of [{ action: 'fixed_point', lat: REF.lat, lng: REF.lng, accuracy: 10 }, { action: 'fixed_radius', radius_m: 500 },
      { action: 'create_pairing' }, { action: 'settings' }, { action: 'revoke', kiosk_id: row.id }]) {
      const r = await call(b, { token: 'jwt-admin' });
      eq([r.status, r.json.code], [403, 'kiosk_disabled'], `${b.action} : refusé (borne coupée)`);
    }
    ok(row.revoked_at == null, '… le QR fixe est toujours là');
    // Un salarié, lui, n'y touche pas.
    eq((await call({ action: 'fixed_disable' }, { token: 'jwt-karim' })).status, 403, 'un salarié ne peut pas désactiver');
    // Régénérer : permis (l'ancien QR photographié cesse de marcher pour de bon).
    eq((await call({ action: 'fixed_regenerate' }, { token: 'jwt-admin' })).json.code, 'confirm_required', 'régénérer demande toujours confirmation');
    const rg = await call({ action: 'fixed_regenerate', confirm: true }, { token: 'jwt-admin' });
    ok(rg.status === 200 && rg.json.enabled && rg.json.token !== token && row.revoked_at, 'borne coupée : régénéré, l’ancien QR est retiré');
    // Désactiver : permis.
    const ds = await call({ action: 'fixed_disable' }, { token: 'jwt-admin' });
    eq([ds.status, ds.json.enabled, ds.json.kiosk_enabled], [200, false, false], 'borne coupée : désactivé');
    ok(db.kiosks.filter((k) => k.kind === 'fixe').every((k) => k.revoked_at), 'toutes les lignes fixes retirées');
    // Activer, ou régénérer sans QR (ce serait activer) : refusé ; rien n'est créé.
    const count = db.kiosks.length;
    eq([(await call({ action: 'fixed_enable', confirm: true }, { token: 'jwt-admin' })).json.code, (await call({ action: 'fixed_regenerate', confirm: true }, { token: 'jwt-admin' })).json.code],
      ['kiosk_disabled', 'kiosk_disabled'], 'borne coupée : activer ou « régénérer » sans QR actif est refusé');
    eq(db.kiosks.length, count, '… aucune ligne créée');
    ok(!calls.some((c) => c.method === 'DELETE'), 'aucun DELETE');
    // Borne rallumée : tout revient.
    db.companies[0].kiosk_enabled = true;
    eq((await call({ action: 'fixed_enable', confirm: true }, { token: 'jwt-admin' })).status, 200, 'borne rallumée : on peut de nouveau activer');
  },
});

Deno.test({
  name: 'Lot 12 QR fixe — « Déconnecter la tablette » d’une ancienne fenêtre ne coupe jamais le QR fixe',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb(); migrate();
    await enableFixed();
    const row = db.kiosks.find((k) => k.kind === 'fixe')!;
    const tab = await addKiosk(CO, 't-tab', ago(60));
    // L'ancienne fenêtre du bureau prend la ligne fixe pour une tablette et demande à la retirer.
    const r1 = await call({ action: 'revoke', kiosk_id: row.id }, { token: 'jwt-admin' });
    eq([r1.status, r1.json.revoked, row.revoked_at], [200, 0, null], 'revoke sur le QR fixe : rien de retiré (seuls fixed_disable / fixed_regenerate le coupent)');
    const r2 = await call({ action: 'revoke', kiosk_id: tab.id }, { token: 'jwt-admin' });
    eq([r2.status, r2.json.revoked, tab.revoked_at != null], [200, 1, true], 'revoke sur la tablette : retirée, comme avant');
    // Relier une nouvelle tablette : le secours de l'ancienne fenêtre (revoke des plus anciennes) ne touche pas non plus au QR fixe.
    const cp = await call({ action: 'create_pairing' }, { token: 'jwt-admin' });
    const pr = await call({ action: 'pair', code: cp.json.code });
    eq(pr.status, 200, 'tablette reliée');
    for (const k of db.kiosks.filter((x) => x.id !== pr.json.kiosk_id)) await call({ action: 'revoke', kiosk_id: k.id }, { token: 'jwt-admin' });
    ok(row.revoked_at == null, 'le QR fixe reste actif après tous les « revoke » d’une ancienne fenêtre');
    // Un autre admin ne retire pas non plus la tablette d'une autre entreprise.
    const foreign = await call({ action: 'revoke', kiosk_id: pr.json.kiosk_id }, { token: 'jwt-admin2' });
    eq(foreign.json.revoked, 0, 'autre entreprise : rien de retiré');
  },
});

Deno.test({
  name: 'Lot 12 QR fixe — le QR de la tablette (60 s) ne change pas : aucune position, même QR fixe actif',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb(); migrate();
    await enableFixed();
    const k = await addKiosk(CO, 't-k', ago(60));
    const { codeAt, deriveSeed } = await import('./kiosk-code.ts');
    const code = await codeAt(await deriveSeed('cle-de-test', String(k.id), 'sel'), Date.now());
    const t = await call({ action: 'ticket', k: k.id, c: code });
    eq([t.status, t.json.needs_gps, 'needs_position' in t.json, t.json.kiosk_name], [200, false, false, 'Borne'], 'ticket de la tablette : sans position');
    const p = await call({ action: 'punch', ticket: t.json.ticket }, { token: 'jwt-karim' });
    eq([p.status, p.json.kind], [200, 'arrival'], 'pointage à la tablette sans position : accepté');
    const row = db.kiosk_punches.at(-1)!;
    ok(row.kiosk_id === k.id && !('in_zone' in row), 'kiosk_punches : la tablette, sans « dans la zone »');
    // Une position envoyée par erreur avec un ticket de tablette : ignorée, jamais comparée.
    db.kiosk_punches = []; db.active_sessions = [];
    const t2 = await call({ action: 'ticket', k: k.id, c: code });
    const far = await call({ action: 'punch', ticket: t2.json.ticket, lat: 43.3, lng: 5.4, accuracy: 5 }, { token: 'jwt-karim' });
    eq([far.status, far.json.kind], [200, 'arrival'], 'position « à 300 km » avec le QR de la tablette : ignorée (aucun contrôle)');
    ok(!everythingSent().includes('43.3'), '… et jamais envoyée à la base');
    // Le code faux de la tablette : le refus d'avant, rien de plus (aucun plafond, aucune écriture).
    const callsBefore = calls.length;
    const wrong = await call({ action: 'ticket', k: k.id, c: '00000000' }, { ip: '192.0.2.50' });
    eq([wrong.status, wrong.json.code], [400, 'code_invalid'], 'code faux de la tablette : refus d’avant');
    ok(!calls.slice(callsBefore).some((c) => c.table === 'kiosk_ticket_failures'), 'code faux de la tablette : aucun plafond, la table des échecs n’est pas touchée');
  },
});
