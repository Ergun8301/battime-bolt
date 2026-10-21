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

// Lot 11 (appairage de la tablette en un seul geste), en toute fin de fichier :
//   · AVANT la migration (tables simulées absentes, PGRST205) : les 4 actions
//     pair_request / pair_status / pair_lookup / pair_confirm répondent
//     `200 {available:false}` sans rien écrire ni rien journaliser ;
//   · APRÈS : demande → confirmation (bon code parmi 4) → remise du jeton, avec la
//     même réponse que `pair` ; jeton dérivé et REJOUABLE (réponse perdue), remise
//     atomique, usage unique, expiration (horloge simulée), secret d'appareil,
//     rôles, mode support, second geste « remplacer la tablette en service »,
//     plafonds (adresse, entreprise) séparés du compteur du code à 6 chiffres,
//     aucun secret en base ni dans les journaux, aucun DELETE.

// Lot 30 (borne robuste), en toute fin de fichier :
//   · `sync` accepte un `client_state` (l'état de l'écran de la tablette) : AVANT la
//     migration (colonnes kiosks.client_state / client_state_at absentes, simulées par
//     PGRST204 / 42703) la réponse est identique, rien n'est visible ni journalisé ;
//     APRÈS, seuls les cinq champs de la liste blanche sont écrits (copie nettoyée),
//     avec la date du serveur, et remplacent l'état précédent ;
//   · état invalide, mal typé, trop gros : ignoré en entier, `sync` répond pareil ;
//   · aucun jeton, aucune graine, aucun texte libre en base ni dans les journaux ;
//   · un jeton ne peut écrire que SA tablette (entreprise étrangère, tablette
//     coupée ou retirée : rien d'écrit) ; une panne de la base n'empêche pas `sync`.

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
// Lot 11 (appairage) : horloge simulée — `Date.now()` avance de `clockOffset` ms. La fonction n'utilise
// `Date.now()` (jamais `new Date()` sans argument) que pour les durées de vie du nouveau chemin.
let clockOffset = 0;
const realNow = Date.now.bind(Date);
Date.now = () => realNow() + clockOffset;
const advance = (ms: number) => { clockOffset += ms; };
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
let siteColMigrated = false;
// Lot 30 : les colonnes kiosks.client_state / client_state_at existent-elles ? Par défaut NON (production aujourd'hui).
let lot30Migrated = false;
const LOT30_COLS = ['client_state', 'client_state_at'];
/** Lot 30 : panne simulée de l'écriture de l'état (PATCH de kiosks qui porte client_state). */
let clientStateFail: { status: number; body: unknown } | undefined;
// Lot 11 (appairage) : les deux tables neuves sont-elles là ? Par défaut NON ; support_staff aussi absente.
const pairTables: Record<string, boolean> = { kiosk_pair_approvals: false, kiosk_pair_throttle: false, support_staff: false };
/** Lectures qui échouent (panne simulée), par table. */
let readError: Record<string, { status: number; body: unknown } | undefined> = {};
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
  kiosks: () => ({ revoked_at: null, last_seen_at: null, ...(qrFixeMigrated ? { kind: 'tablette' } : {}), ...(lot30Migrated ? { client_state: null, client_state_at: null } : {}) }),
  kiosk_pairings: () => ({ used_at: null, kiosk_id: null }),
  kiosk_settings: (): Row => (qrFixeMigrated ? { fixed_qr_radius_m: 200, fixed_qr_latitude: null, fixed_qr_longitude: null } : {}),
  // Lot 11 : ni `id` ni `created_at` automatiques pour ces deux tables (elles n'ont pas de colonne `id`).
  kiosk_pair_approvals: () => ({ approved_at: null, cancelled_at: null, claimed_at: null, kiosk_id: null, created_at: nowIso() }),
  kiosk_pair_throttle: () => ({}),
};
const NO_AUTO_COLUMNS = new Set(['kiosk_pair_approvals', 'kiosk_pair_throttle']);
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
  if (table in pairTables && !pairTables[table]) {
    return reply(404, { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` });
  }
  if (method === 'GET' && readError[table]) return reply(readError[table]!.status, readError[table]!.body);
  // Réglage par chantier (QR fixe / NFC) : colonne absente tant que la migration n'est pas passée.
  if (method === 'GET' && table === 'worksites' && !siteColMigrated && (params.get('select') || '').includes('fixed_qr_allowed')) {
    return reply(400, { code: '42703', message: 'column worksites.fixed_qr_allowed does not exist' });
  }
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
  if (table === 'kiosks') {
    const written = Object.keys((Array.isArray(body) ? body[0] : body) || {});
    // Lot 30 : migration pas passée → toute requête qui cite les colonnes neuves reçoit l'erreur de PostgREST.
    if (!lot30Migrated) {
      const cited = [...params.keys(), ...(params.get('select') || '').split(',').map((c) => c.trim()), ...written];
      const hit = LOT30_COLS.find((c) => cited.includes(c));
      if (hit) {
        return (method === 'POST' || method === 'PATCH') && written.includes(hit)
          ? reply(400, { code: 'PGRST204', message: `Could not find the '${hit}' column of 'kiosks' in the schema cache` })
          : reply(400, { code: '42703', message: `column kiosks.${hit} does not exist` });
      }
    }
    if (method === 'PATCH' && clientStateFail && written.includes('client_state')) return reply(clientStateFail.status, clientStateFail.body);
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
      // Lot 11 : la clé primaire de kiosk_pair_approvals (rid_hash) est unique, comme en base.
      if (table === 'kiosk_pair_approvals' && rows.some((r) => r.rid_hash === it.rid_hash)) {
        return reply(409, { code: '23505', message: 'duplicate key value violates unique constraint "kiosk_pair_approvals_pkey"' });
      }
      const row: Row = { ...(NO_AUTO_COLUMNS.has(table) ? {} : { id: uuid(), created_at: nowIso() }), ...(DEFAULTS[table]?.() || {}), ...it };
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

/** `ip: ''` = aucun en-tête d'adresse (x-forwarded-for absent) ; `headers` s'ajoutent (ex. cf-connecting-ip). */
let activeCalls = 0;
async function call(body: Row, opts: { token?: string; ip?: string; headers?: Record<string, string> } = {}) {
  const h = await loadFunction();
  // Lot 11 : des appels simultanés (Promise.all) partagent le faux `fetch` ; il n'est retiré qu'après le dernier.
  activeCalls++;
  globalThis.fetch = fakeFetch as typeof fetch;
  try {
    const res = await h(new Request('http://fonction.test/kiosk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.ip === '' ? {} : { 'x-forwarded-for': opts.ip || '203.0.113.1', 'cf-connecting-ip': opts.ip || '203.0.113.1' }),
        ...(opts.headers || {}),
      },
      body: JSON.stringify(body),
    }));
    return { status: res.status, json: await res.json() as Row, headers: res.headers };
  } finally {
    if (--activeCalls === 0) globalThis.fetch = realFetch;
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
  readError = {};
  rpcResult = defaultRpc;
  qrFixeMigrated = false;
  siteColMigrated = false;
  lot30Migrated = false; clientStateFail = undefined;
  // Lot 11 : horloge remise à l'heure, tables de l'appairage et support_staff absentes.
  clockOffset = 0; tick = 0;
  for (const t of Object.keys(pairTables)) pairTables[t] = false;
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
    ...(qrFixeMigrated ? { kind: 'tablette' } : {}), ...(lot30Migrated ? { client_state: null, client_state_at: null } : {}), ...extra,
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
  name: 'QR fixe / puce NFC — réglage par chantier : refusé seulement là où le bureau l’a décoché',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb(); migrate();
    const token = await enableFixed();
    // Migration pas passée : la colonne n'existe pas, le QR fixe est accepté comme avant.
    db.worksites.find((w) => w.id === AUTRE)!.fixed_qr_allowed = false;
    let t = await call({ action: 'ticket', f: token });
    let p = await call({ action: 'punch', ticket: t.json.ticket, ...at(10, 10) }, { token: 'jwt-karim' });
    eq([p.status, p.json.kind], [200, 'arrival'], `colonne absente : accepté comme avant (${JSON.stringify(p.json)})`);

    // Migration passée, chantier décoché : arrivée refusée, rien d'écrit, l'autre moyen proposé.
    db = freshDb(); migrate(); siteColMigrated = true;
    const token2 = await enableFixed();
    db.worksites.find((w) => w.id === AUTRE)!.fixed_qr_allowed = false;
    t = await call({ action: 'ticket', f: token2 });
    p = await call({ action: 'punch', ticket: t.json.ticket, ...at(10, 10) }, { token: 'jwt-karim' });
    eq([p.status, p.json.code], [403, 'site_refused'], 'chantier décoché : refusé');
    ok(/NFC/.test(String(p.json.error)) && String(p.json.error).endsWith('Ajoutez votre intervention à la main.'), `message clair : « ${p.json.error} »`);
    eq([db.active_sessions.length, db.kiosk_punches.length], [0, 0], '… aucun chrono, aucun pointage');

    // Un autre chantier (coché) prévu aujourd'hui : l'arrivée y va, acceptée.
    db.planning.push({ id: 'p-villa', company_id: CO, user_id: 'u-karim', worksite_id: VILLA, work_date: parisToday(), estimated_start: '08:00:00', absence_type: null });
    p = await call({ action: 'punch', ticket: t.json.ticket, ...at(10, 10) }, { token: 'jwt-karim' });
    eq([p.status, p.json.kind, db.active_sessions[0]?.worksite_id], [200, 'arrival', VILLA], 'chantier coché : accepté');

    // Départ : le chantier du pointage en cours est décoché entre-temps → refusé.
    db.kiosk_punches.at(-1)!.created_at = ago(120);
    db.worksites.find((w) => w.id === VILLA)!.fixed_qr_allowed = false;
    p = await call({ action: 'punch', ticket: t.json.ticket, ...at(10, 10) }, { token: 'jwt-karim' });
    eq([p.status, p.json.code, db.active_sessions.length], [403, 'site_refused', 1], 'départ refusé, le pointage reste en cours');
    // La tablette, elle, n'est jamais concernée par ce réglage.
    ok(!calls.some((c) => c.table === 'rpc:finish_active_session'), 'aucune fermeture tentée');
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

// ═════════════════════════════════════════════════════════════════════════════
// LOT 11 — APPAIRAGE DE LA TABLETTE EN UN SEUL GESTE
// ═════════════════════════════════════════════════════════════════════════════
// pair_request (tablette) → pair_lookup + pair_confirm (patron) → pair_status
// (tablette, remise du jeton). Voir le bloc « APPAIRAGE EN UN GESTE » de la fonction.
const { toBase64Url: b64u } = await import('./kiosk-code.ts');
const { hammingDistance, normalizeDisplayCode } = await import('./kiosk-pair.ts');

/** Passe la base simulée « après migration du lot 11 » (les deux tables neuves existent). */
function migratePair() { pairTables.kiosk_pair_approvals = true; pairTables.kiosk_pair_throttle = true; }
/** Base prête pour l'appairage en un geste : migration passée, un admin de plus et trois comptes qui n'ont pas le droit. */
function pairDb(): Db {
  const d = freshDb();
  d.auth.push({ id: 'u-lead', token: 'jwt-lead' }, { id: 'u-off', token: 'jwt-off' }, { id: 'u-support', token: 'jwt-support' });
  d.users.push(
    { id: 'u-lead', company_id: CO, role: 'lead', is_active: true, first_name: 'Léa' },
    { id: 'u-off', company_id: CO, role: 'admin', is_active: false, first_name: 'Ancien' },
    { id: 'u-support', company_id: CO, role: 'admin', is_active: true, first_name: 'Support' },
  );
  db = d;
  migratePair();
  return d;
}

interface Req { rid: string; secret: string; code: string; res: Row }
/** Ce que fait la tablette : demander un QR. Sans `secret`, la fonction en tire un ; avec, elle garde le même code. */
async function pairRequest(secret?: string, opts: { ip?: string; headers?: Record<string, string> } = {}): Promise<Req> {
  const r = await call({ action: 'pair_request', ...(secret ? { device_secret: secret } : {}) }, opts);
  if (r.status !== 200 || r.json.available !== true) throw new Error(`pair_request ${r.status} ${JSON.stringify(r.json)}`);
  return { rid: String(r.json.request_id), secret: secret ?? String(r.json.device_secret), code: String(r.json.display_code), res: r.json };
}
const lookup = (rid: string, token = 'jwt-admin', extra: Row = {}) => call({ action: 'pair_lookup', request_id: rid, ...extra }, { token });
const confirmCode = (rid: string, code: string, token = 'jwt-admin', extra: Row = {}) =>
  call({ action: 'pair_confirm', request_id: rid, code, confirm: true, ...extra }, { token });
const pairStatus = (rid: string, secret: string) => call({ action: 'pair_status', request_id: rid, device_secret: secret });
/** Tablette + confirmation du patron, prêtes à être remises. */
async function confirmedRequest(token = 'jwt-admin', extra: Row = {}): Promise<Req> {
  const q = await pairRequest();
  const c = await confirmCode(q.rid, q.code, token, extra);
  if (c.status !== 200) throw new Error(`pair_confirm ${c.status} ${JSON.stringify(c.json)}`);
  return q;
}
/** Capture tout ce qui sort par console.log / warn / error pendant `fn`. */
async function spyConsole<T>(fn: () => Promise<T>): Promise<{ result: T; out: string }> {
  const lines: string[] = [];
  const saved = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  const grab = (...a: unknown[]) => { lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x) ?? String(x))).join(' ')); };
  console.log = grab; console.warn = grab; console.error = grab; console.info = grab;
  try { return { result: await fn(), out: lines.join('\n') }; } finally { Object.assign(console, saved); }
}
const approvalRows = () => (db.kiosk_pair_approvals || []);

Deno.test({
  name: 'Lot 11 appairage — AVANT la migration : les 4 actions répondent « indisponible », rien ne s’écrit, rien ne se journalise',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    const { result: r, out } = await spyConsole(async () => ({
      req: await call({ action: 'pair_request' }),
      st: await call({ action: 'pair_status', request_id: 'A'.repeat(60), device_secret: 'B'.repeat(43) }),
      lk: await call({ action: 'pair_lookup', request_id: 'A'.repeat(60) }, { token: 'jwt-admin' }),
      cf: await call({ action: 'pair_confirm', request_id: 'A'.repeat(60), code: 'K7M 4QX', confirm: true }, { token: 'jwt-admin' }),
      unknown: await call({ action: 'pair_inexistante' }),
    }));
    eq([r.req.status, r.req.json], [200, { available: false }], 'pair_request : indisponible');
    // Identifiant mal signé : la réponse de la tablette ne dit rien de plus (expiré), la base n'est pas lue.
    eq([r.st.status, r.st.json.status], [200, 'expired'], 'pair_status avec un identifiant inconnu : expiré');
    eq([r.lk.status, r.lk.json], [200, { available: false }], 'pair_lookup (bureau, jeton valable) : indisponible');
    eq([r.cf.status, r.cf.json], [200, { available: false }], 'pair_confirm : indisponible');
    eq([r.unknown.status, r.unknown.json], [400, { error: 'Action inconnue' }], 'action inconnue : 400 sans « code » (le front en dépend)');
    ok(!('code' in r.unknown.json), 'action inconnue : aucun champ code');
    eq(out, '', 'aucune sortie console (ni erreur, ni avertissement)');
    ok(!db.kiosk_pair_approvals && !db.kiosk_pair_throttle, 'aucune ligne écrite');
    // Une demande signée AVANT la panne ou le retour arrière : pair_status répond aussi « indisponible ».
    pairTables.kiosk_pair_approvals = true; pairTables.kiosk_pair_throttle = true;
    const q = await pairRequest();
    pairTables.kiosk_pair_approvals = false; pairTables.kiosk_pair_throttle = false;
    const st = await pairStatus(q.rid, q.secret);
    eq([st.status, st.json], [200, { available: false }], 'pair_status : indisponible dès que la table manque');
    // Le code à 6 chiffres : inchangé.
    const cp = await call({ action: 'create_pairing' }, { token: 'jwt-admin' });
    const pr = await call({ action: 'pair', code: cp.json.code });
    eq(pr.status, 200, 'pair (code à 6 chiffres) : comme avant');
    ok(['kiosk_id', 'token', 'seed', 'step', 'digits', 'kiosk_name', 'company_name', 'settings'].every((k) => k in pr.json), 'pair : mêmes clés qu’avant');
    // Une seule des deux tables ne suffit pas : pas de QR qui ne pourrait jamais aboutir.
    pairTables.kiosk_pair_throttle = true;
    eq((await call({ action: 'pair_request' })).json, { available: false }, 'approbations absentes, débit présent : indisponible');
    pairTables.kiosk_pair_throttle = false; pairTables.kiosk_pair_approvals = true;
    eq((await call({ action: 'pair_request' })).json, { available: false }, 'approbations présentes, débit absent : indisponible');
    eq((await call({ action: 'pair_request' }, { ip: '' })).json, { available: false }, '… même sans adresse lisible');
  },
});

Deno.test({
  name: 'Lot 11 appairage — nominal : demande, confirmation, remise (mêmes clés que « pair »), le jeton sert',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    const q = await pairRequest();
    ok(/^[A-Za-z0-9_-]{60}$/.test(q.rid) && !/access_token/i.test(q.rid), 'identifiant de 60 signes, jamais « access_token »');
    ok(/^[A-Za-z0-9_-]{43}$/.test(q.secret), 'secret d’appareil de 43 signes');
    ok(/^[2-9A-HJKMNP-RT-Y]{3} [2-9A-HJKMNP-RT-Y]{3}$/.test(q.code), `code de vérification « K7M 4QX » (${q.code})`);
    eq(q.res.ttl_s, 600, 'durée de vie : 10 minutes');
    eq(Math.round((Date.parse(String(q.res.expires_at)) - Date.now()) / 1000 / 10) * 10, 600, 'expires_at dans 10 minutes');
    eq([approvalRows().length, db.kiosks.length], [0, 0], 'la demande n’écrit RIEN (ni approbation, ni tablette)');
    ok(!calls.some((c) => c.method === 'POST' && c.table === 'kiosk_pair_approvals'), 'aucune écriture dans les approbations');

    const old = await addKiosk(CO, 't-ancienne', ago(60 * 24));
    const lk = await lookup(q.rid);
    eq([lk.status, lk.json.available, lk.json.company_name], [200, true, 'Martin Menuiserie'], `pair_lookup ${JSON.stringify(lk.json)}`);
    eq(Object.keys(lk.json).sort(), ['age_s', 'available', 'choices', 'company_name', 'expires_at', 'replaces'], 'pair_lookup : ni display_code, ni device_secret');
    ok((lk.json.choices as string[]).includes(q.code), 'le code de la tablette est parmi les 4');
    eq(approvalRows().length, 0, 'pair_lookup n’écrit rien');

    const st0 = await pairStatus(q.rid, q.secret);
    eq([st0.status, st0.json.status], [200, 'pending'], 'avant la confirmation : en attente');
    const cf = await confirmCode(q.rid, q.code);
    eq([cf.status, cf.json.ok, cf.json.company_name, cf.json.replaces], [200, true, 'Martin Menuiserie', true], `pair_confirm ${JSON.stringify(cf.json)}`);
    // La confirmation seule ne relie rien et ne révoque rien.
    eq([db.kiosks.length, old.revoked_at], [1, null], 'confirmation : aucune ligne kiosks créée, l’ancienne tablette n’est pas révoquée');
    eq(approvalRows().length, 1, 'une ligne d’approbation');
    const row = approvalRows()[0];
    eq([row.company_id, row.approved_by, row.claimed_at, row.cancelled_at != null, row.rid_hash, row.secret_hash],
      [CO, 'u-admin', null, false, await sha256Hex(q.rid), String(row.secret_hash)], 'approbation : entreprise et admin venus de la base, empreintes seulement');
    ok(String(row.rid_hash).length === 64 && String(row.secret_hash).length === 22, 'empreinte SHA-256 de l’identifiant (64), empreinte tronquée du secret (22)');
    ok(typeof row.approved_at === 'string', 'approved_at posé');

    const st = await pairStatus(q.rid, q.secret);
    eq([st.status, st.json.status], [200, 'approved'], `pair_status après confirmation ${JSON.stringify(st.json)}`);
    for (const k of ['kiosk_id', 'token', 'seed', 'step', 'digits', 'kiosk_name', 'company_name', 'settings']) ok(k in st.json, `la réponse porte « ${k} » comme pair`);
    eq([st.json.step, st.json.digits, st.json.kiosk_name, st.json.company_name], [60, 8, 'Borne', 'Martin Menuiserie'], 'pas, chiffres, nom');
    eq((st.json.settings as Row).require_gps, false, 'réglages : require_gps faux');
    const k = db.kiosks.find((x) => x.id === st.json.kiosk_id)!;
    eq([k.company_id, k.created_by, k.latitude, k.longitude, k.accuracy_m, k.worksite_id, k.name], [CO, 'u-admin', null, null, null, AUTRE, 'Borne'],
      'ligne kiosks : entreprise, créée par l’admin, aucune position, lieu « Autre »');
    ok(!calls.some((c) => c.method === 'POST' && c.table === 'kiosks' && 'kind' in (c.body as Row)), 'la colonne kind n’est pas écrite (le défaut de la base suffit)');
    eq(k.token_hash, await sha256Hex(String(st.json.token)), 'seule l’empreinte du jeton est en base');
    ok(old.revoked_at, 'la remise révoque l’ancienne tablette');
    ok(typeof approvalRows()[0].claimed_at === 'string' && approvalRows()[0].kiosk_id === k.id, 'approbation : remise datée, tablette notée');
    // Le jeton marche comme celui du code à 6 chiffres.
    const sync = await call({ action: 'sync', kiosk_id: st.json.kiosk_id, token: st.json.token });
    eq([sync.status, sync.json.revoked, sync.json.company_name], [200, false, 'Martin Menuiserie'], 'sync avec le jeton reçu');
    const board = await call({ action: 'board', kiosk_id: st.json.kiosk_id, token: st.json.token });
    eq(board.status, 200, `board avec le jeton reçu (${JSON.stringify(board.json).slice(0, 80)})`);
    // La graine reçue produit un code que le serveur accepte (QR de pointage).
    const { codeAt, fromBase64Url } = await import('./kiosk-code.ts');
    const qrCode = await codeAt(fromBase64Url(String(st.json.seed)), Date.now());
    eq((await call({ action: 'ticket', k: st.json.kiosk_id, c: qrCode })).status, 200, 'la graine reçue produit un QR de pointage valable');
    ok(!calls.some((c) => c.method === 'DELETE'), 'aucun DELETE');
  },
});

Deno.test({
  name: 'Lot 11 appairage — la dernière tablette gagne, seulement à la remise : même entreprise, plus anciennes, tablettes seulement',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    // Avant la migration du QR fixe : pas de colonne kind → la règle d'avant (repli).
    pairDb();
    const oldA = await addKiosk(CO, 't-a', ago(3 * 24 * 60));
    const oldB = await addKiosk(CO, 't-b', ago(40));
    const other = await addKiosk(CO2, 't-autre', ago(3 * 24 * 60));
    const future = await addKiosk(CO, 't-futur', ago(-60));
    const q = await confirmedRequest('jwt-admin', { replace: true }); // « future » (vue dans le futur) compte comme en service
    eq([oldA.revoked_at, oldB.revoked_at, future.revoked_at], [null, null, null], 'confirmée mais pas remise : personne n’est révoqué');
    const st = await pairStatus(q.rid, q.secret);
    eq(st.json.status, 'approved', 'remise');
    ok(oldA.revoked_at && oldB.revoked_at, 'les deux anciennes tablettes de l’entreprise sont déconnectées');
    ok(other.revoked_at == null && future.revoked_at == null, 'une autre entreprise, ou une tablette plus récente : intactes');
    eq(db.kiosks.length, 5, 'rien n’est supprimé');

    // Après la migration du QR fixe : seulement kind = tablette ; le QR fixe reste actif.
    pairDb(); migrate();
    await enableFixed();
    const fixed = db.kiosks.find((k) => k.kind === 'fixe')!;
    const tab = await addKiosk(CO, 't-tab', ago(120));
    const q2 = await confirmedRequest();
    eq((await pairStatus(q2.rid, q2.secret)).json.status, 'approved', 'remise (QR fixe en place)');
    ok(tab.revoked_at && fixed.revoked_at == null, 'l’ancienne tablette est révoquée, le QR fixe imprimé reste actif');
    ok(calls.some((c) => c.table === 'kiosks' && c.method === 'PATCH' && c.query.includes('kind=eq.tablette')), 'la règle ne vise que kind = tablette');
  },
});

Deno.test({
  name: 'Lot 11 appairage — réponse perdue : la remise se rejoue (même jeton, une seule ligne) 3 minutes, pas plus',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    const q = await confirmedRequest();
    const first = await pairStatus(q.rid, q.secret); // la réponse « se perd » : la tablette ne la reçoit jamais
    eq(first.json.status, 'approved', 'première remise');
    const again = await pairStatus(q.rid, q.secret);
    eq([again.status, again.json.status, again.json.token, again.json.seed, again.json.kiosk_id],
      [200, 'approved', first.json.token, first.json.seed, first.json.kiosk_id], 'rejeu : le même jeton, la même graine, la même tablette');
    for (const k of ['step', 'digits', 'kiosk_name', 'company_name', 'settings']) eq(again.json[k], first.json[k], `rejeu : « ${k} » identique`);
    eq(db.kiosks.length, 1, 'une seule ligne kiosks');
    // La tablette a servi (un appel avec son jeton après sa création) : plus de rejeu au-delà de 3 minutes.
    // (`sync` pose `last_seen_at` avec l'horloge réelle ; le harnais ne simule que `Date.now`.)
    advance(60_000);
    db.kiosks[0].last_seen_at = new Date(Date.now()).toISOString();
    advance(2 * 60_000 + 5_000);
    const late = await pairStatus(q.rid, q.secret);
    eq([late.json.status, 'token' in late.json], ['used', false], 'après 3 minutes, tablette servie : « servie », sans jeton');
  },
});

Deno.test({
  name: 'Lot 11 appairage — rejeu : tablette remplacée entre-temps, création qui échoue après la remise',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    const q = await confirmedRequest();
    const first = await pairStatus(q.rid, q.secret);
    // La tablette est remplacée (révoquée) avant le rejeu : le jeton ne sert plus.
    db.kiosks.find((k) => k.id === first.json.kiosk_id)!.revoked_at = ago(0.5);
    const replay = await pairStatus(q.rid, q.secret);
    eq([replay.json.status, 'token' in replay.json], ['used', false], 'ligne révoquée : « servie »');

    // La création de la tablette échoue après la remise : la remise est défaite, la tablette réessaie.
    pairDb();
    const q2 = await confirmedRequest();
    insertError.kiosks = { status: 500, body: { code: 'XX000', message: 'panne simulée' } };
    const { result: bad, out } = await spyConsole(() => pairStatus(q2.rid, q2.secret));
    eq([bad.status, bad.json.error], [500, 'Appairage impossible'], 'création impossible : 500');
    eq(approvalRows()[0].claimed_at, null, '… la remise est défaite (claimed_at redevient nul)');
    eq(db.kiosks.length, 0, '… aucune tablette orpheline');
    ok(!out.includes(q2.rid) && !out.includes(q2.secret), 'journaux : ni identifiant ni secret');
    insertError = {};
    const retry = await pairStatus(q2.rid, q2.secret);
    eq(retry.json.status, 'approved', 'au tour suivant la remise réussit');
    eq(db.kiosks.length, 1, 'une seule tablette');

    // Cas intermédiaire : la remise est posée, la ligne kiosks n'est pas encore visible (autre interrogation en cours).
    pairDb();
    const q3 = await confirmedRequest();
    approvalRows()[0].claimed_at = new Date(Date.now()).toISOString();
    eq((await pairStatus(q3.rid, q3.secret)).json.status, 'pending', 'remise < 30 s sans ligne visible : en cours');
    advance(45_000);
    eq((await pairStatus(q3.rid, q3.secret)).json.status, 'used', 'remise > 30 s sans ligne : « servie »');
  },
});

Deno.test({
  name: 'Lot 11 appairage — usage unique : 2e confirmation refusée, deux remises simultanées = une seule tablette',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    const q = await pairRequest();
    eq((await confirmCode(q.rid, q.code)).status, 200, '1re confirmation');
    const second = await confirmCode(q.rid, q.code);
    eq([second.status, second.json.code], [409, 'pair_request_used'], '2e confirmation : 409 « a déjà servi »');
    eq(second.json.error, 'Ce QR a déjà servi. Scannez celui qui s’affiche sur la tablette.', 'texte exact');
    const lk = await lookup(q.rid);
    eq([lk.status, lk.json.code], [409, 'pair_request_used'], 'pair_lookup sur une demande confirmée : 409 aussi');
    const [a, b] = await Promise.all([pairStatus(q.rid, q.secret), pairStatus(q.rid, q.secret)]);
    eq(db.kiosks.length, 1, 'deux pair_status simultanés : une seule ligne kiosks');
    const approved = [a, b].filter((x) => x.json.status === 'approved');
    ok(approved.length >= 1, 'au moins un des deux reçoit le jeton');
    ok([a, b].every((x) => x.json.status === 'approved' || x.json.status === 'pending'), `l’autre : le même jeton ou « en cours » (${a.json.status}, ${b.json.status})`);
    if (approved.length === 2) eq(a.json.token, b.json.token, 'jamais deux jetons différents');
    // Après coup, tout rejeu rend le même jeton.
    eq((await pairStatus(q.rid, q.secret)).json.token, approved[0].json.token, 'le jeton reste unique');
    // Un 2e secret d'appareil ne dérobe rien : il ne voit qu'une attente.
    const thief = await pairStatus(q.rid, b64u(crypto.getRandomValues(new Uint8Array(32))));
    eq([thief.json.status, 'token' in thief.json], ['pending', false], 'autre secret : « en attente », jamais de jeton');
  },
});

Deno.test({
  name: 'Lot 11 appairage — secret d’appareil et identifiant falsifié : aucun jeton, aucun oracle',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    const q = await confirmedRequest();
    const same = (x: Row) => JSON.stringify(x);
    const waiting = await pairStatus((await pairRequest()).rid, 'Z'.repeat(43)); // une demande pas encore confirmée
    for (const [label, secret] of [['mauvais secret', b64u(crypto.getRandomValues(new Uint8Array(32)))], ['secret vide', ''], ['secret mal formé', 'trop-court']] as const) {
      const r = await call({ action: 'pair_status', request_id: q.rid, ...(secret ? { device_secret: secret } : {}) });
      eq([r.status, r.json.status, 'token' in r.json], [200, 'pending', false], `${label} : « en attente », jamais de jeton`);
      eq(same(r.json), same(waiting.json), `${label} : même réponse qu’une demande pas encore confirmée`);
    }
    const noSecret = await call({ action: 'pair_status', request_id: q.rid });
    eq(noSecret.json.status, 'pending', 'seul l’identifiant (visible dans le QR) : « en attente »');
    eq(db.kiosks.length, 0, 'aucune tablette créée par tous ces essais');
    ok(approvalRows()[0].claimed_at === null, 'et la demande n’est pas consommée');
    // Identifiant falsifié : un signe changé au milieu (corps), à la fin (signature), longueur fausse.
    const flip = (rid: string, i: number) => rid.slice(0, i) + (rid[i] === 'A' ? 'B' : 'A') + rid.slice(i + 1);
    for (const bad of [flip(q.rid, 20), flip(q.rid, 59), q.rid.slice(0, 59), q.rid + 'A', 'n-importe-quoi', '']) {
      const st = await pairStatus(bad, q.secret);
      eq([st.status, st.json.status], [200, 'expired'], `identifiant falsifié « ${bad.slice(0, 12)}… » : expiré`);
      const lk = await lookup(bad);
      eq([lk.status, lk.json.code], [400, 'pair_request_invalid'], 'bureau : pair_request_invalid');
      const cf = await confirmCode(bad, q.code);
      eq([cf.status, cf.json.code], [400, 'pair_request_invalid'], 'bureau : confirmation refusée aussi');
    }
    eq((await call({ action: 'pair_lookup' }, { token: 'jwt-admin' })).json.code, 'pair_request_invalid', 'sans identifiant : invalide');
    // Un identifiant signé avec une autre clé serveur (autre déploiement) : refusé.
    const other = await pairRequest();
    const swapped = other.rid.slice(0, 45) + q.rid.slice(45); // corps de l'un, signature (partielle) de l'autre
    eq((await pairStatus(swapped, other.secret)).json.status, 'expired', 'corps et signature de deux identifiants : refusé');
  },
});

Deno.test({
  name: 'Lot 11 appairage — expiration (horloge simulée) : 10 min, remise jusqu’à exp + 3 min',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    // Jamais confirmée : « en attente » puis « expirée » ; le bureau est refusé après 10 minutes.
    const q = await pairRequest();
    advance(5 * 60_000);
    eq((await pairStatus(q.rid, q.secret)).json.status, 'pending', 'à 5 min : en attente');
    advance(5 * 60_000 + 2_000);
    eq((await pairStatus(q.rid, q.secret)).json.status, 'expired', '> 10 min sans confirmation : expirée (côté tablette)');
    // Le patron qui a scanné un QR proche de sa fin (la tablette l'a déjà renouvelé) a encore 2 min pour se connecter.
    const late = await lookup(q.rid);
    eq([late.status, late.json.available], [200, true], 'pair_lookup à exp + 2 s : encore accepté (marge de 2 min)');
    advance(2 * 60_000);
    const lk = await lookup(q.rid), cf = await confirmCode(q.rid, q.code);
    eq([lk.status, lk.json.code, cf.status, cf.json.code], [410, 'pair_request_expired', 410, 'pair_request_expired'], 'pair_lookup et pair_confirm après exp + 2 min : 410');
    eq(lk.json.error, 'Ce QR a expiré. Scannez celui qui s’affiche sur la tablette.', 'texte exact');
    eq(approvalRows().length, 0, 'rien n’a été écrit');

    // Confirmée à exp + 1 min 50 s (marge du patron qui se connecte), remise à exp + 2 min 50 s : livrée.
    const qLate = await pairRequest();
    advance(Date.parse(String(qLate.res.expires_at)) + 110_000 - Date.now());
    eq((await confirmCode(qLate.rid, qLate.code)).status, 200, 'confirmation à exp + 1 min 50 s : acceptée');
    advance(60_000);
    eq((await pairStatus(qLate.rid, qLate.secret)).json.status, 'approved', 'remise à exp + 2 min 50 s : livrée (la marge de confirmation reste sous celle de la remise)');

    // Confirmée à exp − 1 s, remise à exp + 2 min : livrée.
    const q2 = await pairRequest();
    const exp2 = Date.parse(String(q2.res.expires_at));
    advance(exp2 - 1_000 - Date.now());
    eq((await confirmCode(q2.rid, q2.code, 'jwt-admin', { replace: true })).status, 200, 'confirmation à exp − 1 s : acceptée');
    advance(60_000 + 1_000 + 60_000);
    const st = await pairStatus(q2.rid, q2.secret);
    eq([st.json.status, typeof st.json.token], ['approved', 'string'], 'remise à exp + 2 min : livrée');

    // Remise après exp + 3 min : expirée, aucune tablette.
    const q3 = await pairRequest();
    const exp3 = Date.parse(String(q3.res.expires_at));
    advance(exp3 - 1_000 - Date.now());
    // La tablette de q2, reliée il y a moins de 15 min, est en service : second geste.
    eq((await confirmCode(q3.rid, q3.code, 'jwt-admin', { replace: true })).status, 200, 'confirmée à exp − 1 s');
    const kiosksBefore = db.kiosks.length;
    advance(1_000 + 3 * 60_000 + 1_000);
    eq((await pairStatus(q3.rid, q3.secret)).json.status, 'expired', 'remise après exp + 3 min : expirée');
    eq(db.kiosks.length, kiosksBefore, 'aucune ligne kiosks');
  },
});

Deno.test({
  name: 'Lot 11 appairage — rôles, mode support, borne coupée',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    const q = await pairRequest();
    const noToken = await call({ action: 'pair_lookup', request_id: q.rid });
    eq([noToken.status, noToken.json.error], [401, 'Non authentifié'], 'sans jeton : 401');
    eq((await call({ action: 'pair_confirm', request_id: q.rid, code: q.code, confirm: true }, { token: 'jwt-inconnu' })).status, 401, 'jeton inconnu : 401');
    for (const [label, token] of [['salarié', 'jwt-karim'], ['chef d’équipe', 'jwt-lead'], ['admin inactif', 'jwt-off']] as const) {
      const r = await lookup(q.rid, token), c = await confirmCode(q.rid, q.code, token);
      eq([r.status, r.json.error, c.status, c.json.error], [403, 'Réservé à l\'administrateur', 403, 'Réservé à l\'administrateur'], `${label} : 403`);
    }
    eq(approvalRows().length, 0, 'aucun refus n’a écrit quoi que ce soit');

    // Mode support : le compte est dans support_staff (même admin de sa propre entreprise) → refusé, sans consommer le débit.
    pairTables.support_staff = true; db.support_staff = [{ user_id: 'u-support' }];
    const before = (db.kiosk_pair_throttle || []).length;
    const callsBefore = calls.length;
    const sup = await lookup(q.rid, 'jwt-support');
    eq([sup.status, sup.json.code, sup.json.error], [403, 'support_readonly', 'Compte support BEMEXO : lecture seule. Utilisez le compte du patron pour associer une tablette.'], 'support : 403 support_readonly');
    eq((await confirmCode(q.rid, q.code, 'jwt-support')).json.code, 'support_readonly', 'support : confirmation refusée aussi');
    eq((db.kiosk_pair_throttle || []).length, before, 'support : le débit de l’entreprise n’est pas consommé');
    ok(!calls.slice(callsBefore).some((c) => c.table === 'kiosk_pair_throttle'), 'support : le débit n’est ni lu ni écrit');
    eq(approvalRows().length, 0, 'support : aucune approbation');
    eq((await lookup(q.rid, 'jwt-admin')).status, 200, 'un admin normal (table support_staff présente) passe');
    // Une panne de lecture de support_staff : on échoue fermé (500), jamais ouvert.
    readError.support_staff = { status: 500, body: { code: 'XX000', message: 'panne' } };
    const down = await spyConsole(() => lookup(q.rid, 'jwt-admin'));
    eq(down.result.status, 500, 'support_staff illisible : 500 (échec fermé)');
    ok(!down.out.includes(q.rid), '… sans fuite dans les journaux');
    readError = {};
    // Table support_staff absente : pas du personnel support, pas d'erreur 500.
    pairTables.support_staff = false;
    eq((await lookup(q.rid, 'jwt-admin')).status, 200, 'support_staff absente : pas d’erreur');

    // Borne coupée par BEMEXO.
    db.companies[0].kiosk_enabled = false;
    const off = await lookup(q.rid), offC = await confirmCode(q.rid, q.code);
    eq([off.status, off.json.code, offC.status, offC.json.code], [403, 'kiosk_disabled', 403, 'kiosk_disabled'], 'borne coupée : 403 kiosk_disabled');
    eq(approvalRows().length, 0, 'borne coupée : rien d’écrit');
    db.companies[0].kiosk_enabled = true;

    // Borne coupée APRÈS la confirmation : la remise attend, sans rien consommer, puis réussit une fois rallumée.
    const q2 = await confirmedRequest();
    db.companies[0].kiosk_enabled = false;
    const susp = await pairStatus(q2.rid, q2.secret);
    eq([susp.status, susp.json.status], [200, 'suspended'], 'borne coupée : « suspendue »');
    eq([approvalRows().find((r) => r.rid_hash === approvalRows()[approvalRows().length - 1].rid_hash)!.claimed_at, db.kiosks.length], [null, 0], '… rien de consommé, aucune tablette');
    advance(60_000);
    eq((await pairStatus(q2.rid, q2.secret)).json.status, 'suspended', 'toujours suspendue une minute plus tard');
    db.companies[0].kiosk_enabled = true;
    eq((await pairStatus(q2.rid, q2.secret)).json.status, 'approved', 'rallumée : la remise réussit');
  },
});

Deno.test({
  name: 'Lot 11 appairage — mauvais code, refus, concurrence, erreurs d’écriture',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    // Mauvais code : la demande est brûlée.
    let q = await pairRequest();
    const wrong = await confirmCode(q.rid, 'ACD EFG');
    eq([wrong.status, wrong.json.code], [409, 'pair_code_wrong'], 'mauvais code : 409');
    eq(wrong.json.error, 'Ce n’est pas le bon code. La demande est annulée : scannez le nouveau QR sur la tablette.', 'texte exact');
    eq(approvalRows().length, 1, 'une ligne écrite');
    ok(approvalRows()[0].cancelled_at && approvalRows()[0].approved_at == null, '… refusée (cancelled_at), pas confirmée');
    const retry = await confirmCode(q.rid, q.code);
    eq([retry.status, retry.json.code], [409, 'pair_request_used'], 'plus aucune confirmation possible, même avec le bon code');
    const st = await pairStatus(q.rid, q.secret);
    eq([st.json.status, 'token' in st.json, db.kiosks.length], ['cancelled', false, 0], 'pair_status : annulée, aucune tablette');
    // Un code mal écrit (casse, espaces, tiret) est reconnu ; un signe étranger est un mauvais code.
    q = await pairRequest();
    eq((await confirmCode(q.rid, q.code.toLowerCase().replace(' ', '-'))).status, 200, 'code saisi en minuscules avec un tiret : reconnu');
    q = await pairRequest();
    eq((await confirmCode(q.rid, '')).json.code, 'pair_code_wrong', 'code vide : mauvais code');
    q = await pairRequest();
    eq((await call({ action: 'pair_confirm', request_id: q.rid, code: q.code }, { token: 'jwt-admin' })).json.code, 'confirm_required', 'sans « confirm: true » : confirmation requise');
    eq(approvalRows().length, 3, '… sans écriture pour la confirmation requise');

    // Refus explicite (« Non, ce n'est pas ma tablette »).
    q = await pairRequest();
    const dec = await call({ action: 'pair_confirm', request_id: q.rid, decline: true }, { token: 'jwt-admin' });
    eq([dec.status, dec.json.ok, dec.json.declined], [200, true, true], 'refus explicite');
    eq((await pairStatus(q.rid, q.secret)).json.status, 'cancelled', '… la tablette voit « annulée »');
    eq((await call({ action: 'pair_confirm', request_id: q.rid, decline: true }, { token: 'jwt-admin' })).json.code, 'pair_request_used', 'refuser deux fois : 409');

    // Concurrence : refus + confirmation en même temps, deux mauvais codes en même temps → une seule ligne, jamais de 500.
    q = await pairRequest();
    const n0 = approvalRows().length;
    const [d1, c1] = await Promise.all([
      call({ action: 'pair_confirm', request_id: q.rid, decline: true }, { token: 'jwt-admin' }), confirmCode(q.rid, q.code, 'jwt-admin2')]);
    eq(approvalRows().length, n0 + 1, 'refus et confirmation simultanés : une seule ligne');
    eq([d1.status, c1.status].sort(), [200, 409], 'l’un réussit, l’autre 409');
    q = await pairRequest();
    const n1 = approvalRows().length;
    const [w1, w2] = await Promise.all([confirmCode(q.rid, 'ACD EFG'), confirmCode(q.rid, 'HJK MNP')]);
    eq(approvalRows().length, n1 + 1, 'deux mauvais codes simultanés : une seule ligne');
    eq([w1.status, w2.status], [409, 409], 'jamais de 500');
    eq([w1.json.code, w2.json.code].sort(), ['pair_code_wrong', 'pair_request_used'], 'l’un « mauvais code », l’autre « déjà servi »');
    q = await pairRequest();
    const n2 = approvalRows().length;
    const [k1, k2] = await Promise.all([confirmCode(q.rid, q.code), confirmCode(q.rid, q.code)]);
    eq([approvalRows().length, [k1.status, k2.status].sort()], [n2 + 1, [200, 409]], 'deux confirmations simultanées : une seule gagne');

    // Une erreur d'écriture autre que 23505 : 500, sans fuite dans les journaux.
    q = await pairRequest();
    insertError.kiosk_pair_approvals = { status: 500, body: { code: 'XX000', message: `boom ${q.rid}`, details: `Failing row contains (${q.secret}, ${q.rid})` } };
    const bad = await spyConsole(() => confirmCode(q.rid, q.code));
    eq([bad.result.status, bad.result.json.error], [500, 'Erreur serveur'], 'erreur d’écriture : 500');
    ok(!bad.out.includes(q.rid) && !bad.out.includes(q.secret) && !bad.out.includes('boom'), 'journaux : seulement le code d’erreur, jamais le détail');
    ok(bad.out.includes('XX000'), '… le code d’erreur y est');
    insertError = {};
    eq((await confirmCode(q.rid, q.code)).status, 200, 'l’erreur n’a rien consommé : la confirmation passe ensuite');
  },
});

Deno.test({
  name: 'Lot 11 appairage — remplacement : second geste imposé par le serveur quand la tablette actuelle est vivante',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    // Pas de tablette : rien à protéger de plus.
    let q = await pairRequest();
    eq((await lookup(q.rid)).json.replaces, null, 'sans tablette : replaces = null');
    const first = await confirmCode(q.rid, q.code);
    eq([first.status, first.json.replaces], [200, false], 'sans tablette : un seul geste, replaces = false');

    // Tablette vue il y a 2 min : vivante.
    pairDb();
    const live = await addKiosk(CO, 't-vivante', ago(60), { last_seen_at: ago(2) });
    q = await pairRequest();
    const lk = await lookup(q.rid);
    const rep = lk.json.replaces as Row;
    eq(rep.alive, true, 'vue il y a 2 min : en service');
    ok(Number(rep.seen_ago_s) >= 118 && Number(rep.seen_ago_s) <= 125, `seen_ago_s ≈ 120 (${rep.seen_ago_s})`);
    const noReplace = await confirmCode(q.rid, q.code);
    eq([noReplace.status, noReplace.json.code, noReplace.json.error], [409, 'replace_required', 'La tablette actuelle est en service. Confirmez son remplacement.'], 'sans second geste : 409 replace_required');
    eq(approvalRows().length, 0, 'rien d’écrit : la demande reste confirmable');
    eq((await confirmCode(q.rid, q.code, 'jwt-admin', { replace: false })).json.code, 'replace_required', 'replace: false ne compte pas');
    eq((await confirmCode(q.rid, q.code, 'jwt-admin', { replace: 'oui' })).json.code, 'replace_required', 'seul « true » compte');
    const withReplace = await confirmCode(q.rid, q.code, 'jwt-admin', { replace: true });
    eq([withReplace.status, withReplace.json.ok, withReplace.json.replaces], [200, true, true], 'avec replace: true : confirmée');
    ok(live.revoked_at == null, 'confirmation : la tablette en service n’est pas encore touchée');
    eq((await pairStatus(q.rid, q.secret)).json.status, 'approved', 'remise');
    ok(live.revoked_at, 'la tablette en service est révoquée à la remise');

    // Un mauvais code avec une tablette vivante : brûlé quand même (le code d'abord, le second geste ensuite).
    pairDb();
    await addKiosk(CO, 't-vivante', ago(60), { last_seen_at: ago(1) });
    q = await pairRequest();
    eq((await confirmCode(q.rid, 'ACD EFG')).json.code, 'pair_code_wrong', 'mauvais code : annulée');

    // Tablette vue il y a 2 h : reliée mais muette, un seul geste.
    pairDb();
    await addKiosk(CO, 't-muette', ago(3 * 60), { last_seen_at: ago(120) });
    q = await pairRequest();
    const l2 = (await lookup(q.rid)).json.replaces as Row;
    ok(l2.alive === false && Number(l2.seen_ago_s) >= 7190, `vue il y a 2 h : alive = faux (${JSON.stringify(l2)})`);
    eq((await confirmCode(q.rid, q.code)).status, 200, 'tablette muette : confirmation sans second geste');
    // Jamais vue (last_seen_at nul) : l'ancienneté se compte depuis la création.
    pairDb();
    await addKiosk(CO, 't-neuve', ago(1), { last_seen_at: null });
    q = await pairRequest();
    eq(((await lookup(q.rid)).json.replaces as Row).alive, true, 'créée il y a 1 min, jamais vue : en service');
    // Une tablette retirée, ou celle d'une autre entreprise, ne compte pas.
    pairDb();
    await addKiosk(CO, 't-retiree', ago(60), { last_seen_at: ago(1), revoked_at: ago(0.5) });
    await addKiosk(CO2, 't-autre', ago(60), { last_seen_at: ago(1) });
    q = await pairRequest();
    eq((await lookup(q.rid)).json.replaces, null, 'tablette retirée / autre entreprise : replaces = null');
    // Le QR fixe n'est pas une tablette (après la migration du QR fixe).
    pairDb(); migrate();
    await enableFixed();
    q = await pairRequest();
    eq((await lookup(q.rid)).json.replaces, null, 'le QR fixe n’est pas « une tablette en service »');
  },
});

Deno.test({
  name: 'Lot 11 appairage — plusieurs tablettes actives (reliquat) : une tablette neuve et muette ne masque pas une plus ancienne vivante',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    const vivante = await addKiosk(CO, 't-ancienne-vivante', ago(3 * 24 * 60), { last_seen_at: ago(2) });
    await addKiosk(CO, 't-recente-morte', ago(60), { last_seen_at: ago(50) });
    const q = await pairRequest();
    const rep = (await lookup(q.rid)).json.replaces as Row;
    eq(rep.alive, true, 'une seule vivante suffit : tablette en service');
    ok(Number(rep.seen_ago_s) >= 118 && Number(rep.seen_ago_s) <= 125, `ancienneté de la plus récemment vue (${rep.seen_ago_s})`);
    const one = await confirmCode(q.rid, q.code);
    eq([one.status, one.json.code], [409, 'replace_required'], 'sans second geste : refusé, la vivante n’est pas révoquée en silence');
    eq((await confirmCode(q.rid, q.code, 'jwt-admin', { replace: true })).status, 200, 'avec le second geste : confirmée');
    ok(vivante.revoked_at == null, 'la confirmation ne révoque rien');
  },
});

Deno.test({
  name: 'Lot 11 appairage — plafond illisible (42501) avec une adresse connue : « indisponible », pas de plafond perdu en silence',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    readError.kiosk_pair_throttle = { status: 403, body: { code: '42501', message: 'permission denied' } };
    const { result: r, out } = await spyConsole(async () => ({
      req: await call({ action: 'pair_request' }, { ip: '198.51.100.5' }),
      lk: await lookup('A'.repeat(60)),
    }));
    eq([r.req.status, r.req.json], [200, { available: false }], 'pair_request : indisponible');
    eq([r.lk.status, r.lk.json], [200, { available: false }], 'pair_lookup : indisponible aussi (plafond d’entreprise)');
    eq(out, '', 'rien dans les journaux');
    // Toute autre panne de lecture reste « jamais bloquant ».
    readError.kiosk_pair_throttle = { status: 500, body: { code: 'XX000', message: 'panne' } };
    const { result: other } = await spyConsole(() => call({ action: 'pair_request' }, { ip: '198.51.100.5' }));
    eq([other.status, other.json.available], [200, true], 'autre panne : la demande passe (fail-open)');
  },
});

Deno.test({
  name: 'Lot 11 appairage — réponse perdue puis tablette hors ligne : la remise se rejoue tant que la tablette n’a jamais servi (30 min)',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    const q = await confirmedRequest();
    const first = await pairStatus(q.rid, q.secret); // la réponse se perd, la tablette reste hors ligne
    eq(first.json.status, 'approved', 'première remise');
    advance(10 * 60_000);
    const again = await pairStatus(q.rid, q.secret);
    eq([again.json.status, again.json.token, again.json.kiosk_id], ['approved', first.json.token, first.json.kiosk_id], 'après 10 min, tablette jamais servie : même jeton, même ligne');
    eq(db.kiosks.length, 1, 'toujours une seule ligne kiosks (aucune tablette fantôme)');
    advance(21 * 60_000);
    eq(((await pairStatus(q.rid, q.secret)).json as Row).status, 'used', 'après 30 min : « servie »');

    // Une tablette qui a servi (appel avec son jeton après sa création) n'est plus rejouée après 3 min.
    pairDb();
    const q2 = await confirmedRequest();
    const got = await pairStatus(q2.rid, q2.secret);
    advance(60_000);
    eq((await call({ action: 'sync', kiosk_id: got.json.kiosk_id, token: got.json.token })).status, 200, 'la tablette se synchronise');
    db.kiosks[0].last_seen_at = new Date(Date.now()).toISOString(); // `sync` pose l'horloge réelle, le harnais ne simule que Date.now
    advance(4 * 60_000);
    eq((await pairStatus(q2.rid, q2.secret)).json.status, 'used', 'tablette déjà servie, > 3 min : « servie », sans jeton');
  },
});

Deno.test({
  name: 'Lot 11 appairage — une tablette vivante reliée entre la confirmation et la remise n’est pas révoquée en silence',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    const q = await confirmedRequest(); // aucune tablette : un seul geste suffit
    advance(30_000);
    const code = await addKiosk(CO, 't-par-code', new Date(Date.now()).toISOString(), { last_seen_at: new Date(Date.now()).toISOString() }); // reliée par code à 6 chiffres entre-temps
    const st = await pairStatus(q.rid, q.secret);
    eq(st.json.status, 'cancelled', 'la remise est refusée : la tablette reçoit un QR neuf');
    ok(code.revoked_at == null && db.kiosks.length === 1, 'la tablette reliée par code reste active, aucune ligne créée');
    ok(approvalRows()[0].claimed_at === null, 'la confirmation n’est pas consommée');
    // Le patron reconfirme un QR neuf : cette fois la tablette vivante demande le second geste.
    const q2 = await pairRequest();
    eq((await confirmCode(q2.rid, q2.code)).json.code, 'replace_required', 'nouvelle confirmation : second geste demandé');
    eq((await confirmCode(q2.rid, q2.code, 'jwt-admin', { replace: true })).status, 200, 'avec le second geste');
    eq((await pairStatus(q2.rid, q2.secret)).json.status, 'approved', 'remise');
    ok(code.revoked_at, 'la tablette est révoquée, en connaissance de cause');
  },
});

Deno.test({
  name: 'Lot 11 appairage — l’entreprise vient de la base : l’admin de CO2 relie à CO2, jamais à CO',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    const q = await pairRequest();
    const lk2 = await lookup(q.rid, 'jwt-admin2');
    eq(lk2.json.company_name, 'Autre Société', 'pair_lookup ne renvoie que le nom de l’entreprise de l’appelant');
    eq((await lookup(q.rid, 'jwt-admin')).json.company_name, 'Martin Menuiserie', '… (l’admin de CO voit CO)');
    ok(!JSON.stringify(lk2.json).includes('Martin'), 'aucune trace de CO dans la réponse de CO2');
    // Le corps tente d'imposer une entreprise : ignoré.
    const cf = await confirmCode(q.rid, q.code, 'jwt-admin2', { company_id: CO, companyId: CO, approved_by: 'u-admin' });
    eq([cf.status, cf.json.company_name], [200, 'Autre Société'], 'confirmation par l’admin de CO2');
    eq([approvalRows()[0].company_id, approvalRows()[0].approved_by], [CO2, 'u-admin2'], 'l’approbation porte CO2 et l’admin de CO2');
    const st = await pairStatus(q.rid, q.secret);
    const k = db.kiosks.find((x) => x.id === st.json.kiosk_id)!;
    eq([st.json.status, k.company_id, k.created_by, st.json.company_name], ['approved', CO2, 'u-admin2', 'Autre Société'], 'la tablette est reliée à CO2');
    ok(!db.kiosks.some((x) => x.company_id === CO), 'rien n’est relié à CO');
  },
});

Deno.test({
  name: 'Lot 11 appairage — pair_lookup : 4 codes, distance ≥ 3, déterministes, vrai code jamais seul, âge de la demande',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    const q = await pairRequest();
    const lk = await lookup(q.rid);
    const choices = lk.json.choices as string[];
    eq(choices.length, 4, '4 codes');
    eq(new Set(choices).size, 4, 'distincts');
    ok(choices.every((c) => /^[2-9A-HJKMNP-RT-Y]{3} [2-9A-HJKMNP-RT-Y]{3}$/.test(c)), 'formatés « K7M 4QX »');
    ok(choices.includes(q.code), 'contient le vrai code');
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      ok(hammingDistance(normalizeDisplayCode(choices[i]), normalizeDisplayCode(choices[j])) >= 3, `${choices[i]} / ${choices[j]} : distance de Hamming ≥ 3`);
    }
    ok(!('display_code' in lk.json) && !('device_secret' in lk.json) && !('request_id' in lk.json), 'ni display_code, ni device_secret, ni request_id');
    // Mêmes 4 codes, même ordre : à chaque appel, pour un autre admin, pour un autre identifiant du même secret.
    eq((await lookup(q.rid)).json.choices, choices, 'deuxième appel : identique');
    eq((await lookup(q.rid, 'jwt-admin2')).json.choices, choices, 'autre admin : identique');
    const renewed = await pairRequest(q.secret);
    ok(renewed.rid !== q.rid, 'le renouvellement donne un autre identifiant');
    eq((await lookup(renewed.rid)).json.choices, choices, 'autre identifiant du même secret : identique (le patron ne voit rien bouger)');
    // Un autre secret : d'autres codes (pas de cohabitation de deux tablettes sur les mêmes leurres).
    const other = await pairRequest();
    ok(JSON.stringify((await lookup(other.rid)).json.choices) !== JSON.stringify(choices), 'un autre secret : d’autres codes');
    // La position du vrai code et les leurres sont les mêmes pour tous : sur 12 secrets le rang varie.
    const slots = new Set<number>();
    for (let i = 0; i < 12; i++) { const r = await pairRequest(); const c = (await lookup(r.rid)).json.choices as string[]; slots.add(c.indexOf(r.code)); }
    ok(slots.size > 1, `le rang du vrai code varie d’une tablette à l’autre (${[...slots].join(',')})`);
    // Âge de la demande : valeur du serveur (horloge simulée).
    const a0 = (await lookup(q.rid)).json.age_s as number;
    ok(a0 >= 0 && a0 <= 2, `âge d’une demande neuve : ${a0} s`);
    advance(2 * 60_000);
    const a2 = (await lookup(q.rid)).json.age_s as number;
    ok(a2 >= 120 && a2 <= 124, `âge après 2 min : ${a2} s`);
    eq(Date.parse(String((await lookup(q.rid)).json.expires_at)), Date.parse(String(q.res.expires_at)), 'expires_at = celui de la demande');
  },
});

Deno.test({
  name: 'Lot 11 appairage — code de vérification stable : le secret renvoyé donne le même code',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    const first = await call({ action: 'pair_request' });
    ok(typeof first.json.device_secret === 'string' && /^[A-Za-z0-9_-]{43}$/.test(String(first.json.device_secret)), 'sans secret : la fonction en rend un');
    const again = await call({ action: 'pair_request', device_secret: first.json.device_secret });
    eq(again.json.display_code, first.json.display_code, 'avec ce secret : le même code de vérification');
    ok(again.json.request_id !== first.json.request_id, '… un autre identifiant');
    ok(!('device_secret' in again.json), '… et le secret n’est pas renvoyé');
    for (const bad of ['trop-court', 'x'.repeat(44), 42, null, '!'.repeat(43)]) {
      const r = await call({ action: 'pair_request', device_secret: bad });
      ok(typeof r.json.device_secret === 'string' && r.json.device_secret !== bad, `secret mal formé (${JSON.stringify(bad).slice(0, 14)}) : ignoré, un nouveau est tiré`);
      ok(r.json.display_code !== first.json.display_code, '… et le code change');
    }
    // Les deux identifiants du même secret se confirment et se remettent : le jeton, lui, dépend de l'identifiant confirmé.
    const a = String(first.json.request_id), b = String(again.json.request_id), secret = String(first.json.device_secret);
    eq((await confirmCode(a, String(first.json.display_code))).status, 200, 'confirmation de l’ancien identifiant');
    eq((await pairStatus(b, secret)).json.status, 'pending', 'le nouveau identifiant n’est pas confirmé pour autant');
    eq((await pairStatus(a, secret)).json.status, 'approved', 'l’ancien est remis (la tablette l’interroge jusqu’à son horizon)');
  },
});

Deno.test({
  name: 'Lot 11 appairage — plafonds : par adresse (30), par entreprise (20), espaces séparés, indépendants du code à 6 chiffres',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    const A = '198.51.100.20';
    for (let i = 0; i < 30; i++) eq((await call({ action: 'pair_request' }, { ip: A })).status, 200, `pair_request n° ${i + 1} depuis A`);
    const over = await call({ action: 'pair_request' }, { ip: A });
    eq([over.status, over.json.code, over.json.error], [429, 'pair_throttled', 'Trop d’essais. Réessayez dans quelques minutes.'], '31e pair_request du même seau : 429');
    eq((await call({ action: 'pair_request' }, { ip: '198.51.100.21' })).status, 200, 'autre adresse : acceptée');
    // cf-connecting-ip prime sur x-forwarded-for.
    eq((await call({ action: 'pair_request' }, { ip: A, headers: { 'cf-connecting-ip': '198.51.100.99' } })).status, 200, 'x-forwarded-for « pleine » mais cf-connecting-ip différent : acceptée');
    eq((await call({ action: 'pair_request' }, { ip: '198.51.100.77', headers: { 'cf-connecting-ip': A } })).status, 429, 'cf-connecting-ip « pleine » : refusée malgré un autre x-forwarded-for');
    // Le premier x-forwarded-for est écrit par le client : seul cf-connecting-ip compte. Un client qui le
    // fait tourner ne contourne rien (et ne vise pas le seau d'un autre) : sans cf-connecting-ip, pas de plafond d'adresse.
    const bucketsBefore = (db.kiosk_pair_throttle || []).length;
    for (let i = 0; i < 40; i++) {
      const r = await call({ action: 'pair_request' }, { ip: '', headers: { 'x-forwarded-for': `192.0.2.${i}, 203.0.113.9` } });
      if (r.status !== 200) throw new Error(`x-forwarded-for seul : pair_request n° ${i + 1} → ${r.status}`);
    }
    eq((db.kiosk_pair_throttle || []).length, bucketsBefore, 'x-forwarded-for seul : aucun seau lu ni écrit (rien à faire tourner)');
    // Le plafond se desserre après 10 minutes.
    advance(10 * 60_000 + 1_000);
    eq((await call({ action: 'pair_request' }, { ip: A })).status, 200, 'après 10 minutes : de nouveau permis');
    // Aucune adresse lisible : aucun plafond d'adresse (un en-tête absent ne bloque pas toutes les tablettes).
    for (let i = 0; i < 100; i++) {
      const r = await call({ action: 'pair_request' }, { ip: '' });
      if (r.status !== 200) throw new Error(`adresse inconnue : pair_request n° ${i + 1} → ${r.status}`);
    }

    // Opérations du bureau : 20 par 10 min et par entreprise.
    pairDb();
    const q = await pairRequest();
    for (let i = 0; i < 20; i++) eq((await lookup(q.rid)).status, 200, `pair_lookup n° ${i + 1}`);
    const lim = await lookup(q.rid);
    eq([lim.status, lim.json.code], [429, 'pair_throttled'], '21e opération du bureau : 429');
    eq((await confirmCode(q.rid, q.code)).status, 429, 'pair_confirm aussi (même plafond)');
    eq((await lookup(q.rid, 'jwt-admin2')).status, 200, 'une autre entreprise : son propre plafond');
    eq(approvalRows().length, 0, 'rien n’a été confirmé pendant le plafond');
    eq((await call({ action: 'pair_request' })).status, 200, 'le plafond du bureau ne bloque pas les tablettes');
    advance(10 * 60_000 + 1_000);
    const q2 = await pairRequest();
    eq((await confirmCode(q2.rid, q2.code)).status, 200, 'après 10 minutes : le bureau peut de nouveau confirmer');
    // Espaces de seaux séparés : demandes anonymes < 2048, bureau ≥ 2048.
    const buckets = (db.kiosk_pair_throttle || []).map((r) => r.bucket as number);
    ok(buckets.length > 0 && buckets.every((b) => Number.isInteger(b) && b >= 0 && b < 4096), 'seaux entre 0 et 4095');
    for (const c of calls.filter((x) => x.table === 'kiosk_pair_throttle' && x.method === 'POST')) {
      eq(Object.keys(c.body as Row).sort(), ['bucket', 'hits', 'window_start'], 'seulement un seau, un compteur et une date de fenêtre');
    }
    ok(!/198\.51|203\.0\.113|Martin|c0000000/.test(JSON.stringify(db.kiosk_pair_throttle) + JSON.stringify(calls.filter((x) => x.table === 'kiosk_pair_throttle').map((c) => [c.query, c.body]))),
      'aucune adresse ni identifiant d’entreprise dans la table de débit');

    // Un déluge de demandes anonymes ne bloque aucun bureau (deux espaces) — et réciproquement.
    pairDb();
    for (let i = 0; i < 40; i++) await call({ action: 'pair_request' }, { ip: `203.0.113.${i}` });
    for (let i = 0; i < 5; i++) await call({ action: 'pair_request' }, { ip: A });
    const reqBuckets = (db.kiosk_pair_throttle || []).map((r) => r.bucket as number);
    ok(reqBuckets.every((b) => b < 2048), `demandes anonymes : seaux 0-2047 seulement (${reqBuckets.length} seaux)`);
    const q3 = await pairRequest();
    for (let i = 0; i < 20; i++) await lookup(q3.rid);
    ok((db.kiosk_pair_throttle || []).filter((r) => (r.bucket as number) >= 2048).length === 1, 'opérations du bureau : un seau d’entreprise dans 2048-4095');
    eq((await call({ action: 'pair_request' }, { ip: '203.0.113.200' })).status, 200, 'bureau « plein » : les tablettes demandent toujours');

    // Indépendance du compteur du code à 6 chiffres (kiosk_pair_failures).
    pairDb();
    const recent = () => new Date(Date.now() - 60_000).toISOString();
    for (let i = 0; i < 61; i++) db.kiosk_pair_failures.push({ id: i + 1, ip: `10.9.0.${i}`, created_at: recent() });
    const calls0 = calls.length;
    const r61 = await pairRequest();
    eq((await lookup(r61.rid)).status, 200, '61 échecs de « pair » : pair_lookup fonctionne');
    eq((await confirmCode(r61.rid, r61.code)).status, 200, '… et la confirmation');
    eq((await pairStatus(r61.rid, r61.secret)).json.status, 'approved', '… et la remise');
    ok(!calls.slice(calls0).some((c) => c.table === 'kiosk_pair_failures'), 'les actions nouvelles ne lisent ni n’écrivent kiosk_pair_failures');
    // Et l'inverse : 31 pair_request d'une adresse ne bloquent pas « pair » avec le bon code.
    pairDb();
    const cp = await call({ action: 'create_pairing' }, { token: 'jwt-admin' });
    for (let i = 0; i < 31; i++) await call({ action: 'pair_request' }, { ip: A });
    const ok6 = await call({ action: 'pair', code: cp.json.code }, { ip: A });
    eq(ok6.status, 200, '31 pair_request : « pair » avec le bon code passe');
    eq(db.kiosk_pair_failures.length, 0, '… et aucun échec n’a été compté');
  },
});

Deno.test({
  name: 'Lot 11 appairage — secrets : rien en clair en base ni dans les journaux, aucun DELETE, Cache-Control: no-store',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    pairDb();
    await addKiosk(CO, 't-ancienne', ago(60), { last_seen_at: ago(2) });
    const heads: Record<string, string | null> = {};
    const { result: scenario, out } = await spyConsole(async () => {
      const r = await call({ action: 'pair_request' });
      heads.pair_request = r.headers.get('Cache-Control');
      const rid = String(r.json.request_id), secret = String(r.json.device_secret), code = String(r.json.display_code);
      const lk = await lookup(rid);
      heads.pair_lookup = lk.headers.get('Cache-Control');
      await confirmCode(rid, 'ACD EFG'); // un mauvais code d'abord (journaux)
      const r2 = await call({ action: 'pair_request', device_secret: secret });
      const rid2 = String(r2.json.request_id);
      const lk2 = await lookup(rid2);
      const noRepl = await confirmCode(rid2, code); // replace_required
      const cf = await confirmCode(rid2, code, 'jwt-admin', { replace: true });
      heads.pair_confirm = cf.headers.get('Cache-Control');
      const st = await pairStatus(rid2, secret);
      heads.pair_status = st.headers.get('Cache-Control');
      const replay = await pairStatus(rid2, secret);
      const bad = await pairStatus(rid2, 'Q'.repeat(43));
      return { rid, rid2, secret, code, st, lk2, noRepl, cf, replay, bad };
    });
    eq(scenario.st.json.status, 'approved', 'le scénario complet aboutit');
    eq(heads, { pair_request: 'no-store', pair_lookup: 'no-store', pair_confirm: 'no-store', pair_status: 'no-store' }, 'Cache-Control: no-store sur les réponses des 4 actions');
    ok((await call({ action: 'sync', kiosk_id: scenario.st.json.kiosk_id, token: scenario.st.json.token })).headers.get('Cache-Control') === 'no-store', 'et sur toutes les autres');
    ok(!calls.some((c) => c.method === 'DELETE'), 'aucun DELETE (le harnais renverrait 405)');
    // Rien de sensible envoyé à la base : ni identifiant en clair, ni secret d'appareil, ni jeton, ni graine, ni code.
    const sent = JSON.stringify(calls.map((c) => [c.method, c.table, c.query, c.body]));
    const token = String(scenario.st.json.token), seed = String(scenario.st.json.seed);
    const secrets: [string, string][] = [['identifiant (1)', scenario.rid], ['identifiant (2)', scenario.rid2], ['secret d’appareil', scenario.secret], ['jeton', token], ['graine', seed],
      ['code', scenario.code.replace(' ', '')], ['code formaté', scenario.code]];
    for (const [label, value] of secrets) {
      ok(!sent.includes(value), `base : ${label} jamais envoyé en clair`);
      ok(!out.includes(value), `journaux : ${label} jamais écrit`);
    }
    ok(!sent.includes('device_secret') && !sent.includes('request_id'), 'base : aucun champ « device_secret » ni « request_id »');
    // Ce qui est en base : des empreintes.
    for (const row of approvalRows()) {
      ok(/^[0-9a-f]{64}$/.test(String(row.rid_hash)) && /^[A-Za-z0-9_-]{22}$/.test(String(row.secret_hash)), 'approbation : empreintes seulement');
      eq(Object.keys(row).sort(), ['approved_at', 'approved_by', 'cancelled_at', 'claimed_at', 'company_id', 'created_at', 'kiosk_id', 'rid_hash', 'secret_hash'], 'approbation : les colonnes de la migration, pas une de plus');
    }
    ok(!JSON.stringify(db).includes(token) && !JSON.stringify(db).includes(scenario.secret), 'ni le jeton ni le secret nulle part dans la base');
    // Les nouvelles actions n'écrivent que dans leurs tables (et la remise dans kiosks) — jamais kiosk_pairings ni kiosk_pair_failures.
    const written = new Set(calls.filter((c) => c.method !== 'GET' && c.method !== 'HEAD' && !c.table.startsWith('rpc:')).map((c) => c.table));
    ok([...written].every((t) => ['kiosk_pair_approvals', 'kiosk_pair_throttle', 'kiosks'].includes(t)), `tables écrites : ${[...written].join(', ')}`);
  },
});

// ════════════════════════════════════════════════════════════════════════════
// LOT 30 — l'état de l'écran de la tablette (client_state), joint à `sync`
// ════════════════════════════════════════════════════════════════════════════

/** Passe la base simulée « après la migration du lot 30 » (les deux colonnes existent, NULL partout). */
function migrate30() {
  lot30Migrated = true;
  for (const k of db.kiosks) if (!('client_state' in k)) { k.client_state = null; k.client_state_at = null; }
}
const GOOD_STATE = { wake: 'held', standalone: true, fullscreen: false, online: true, version: 'a3f09c1d' };
const syncOf = (k: Row, token: string, state?: unknown, extra: Row = {}) =>
  call({ action: 'sync', kiosk_id: k.id, token, ...(state !== undefined ? { client_state: state } : {}), ...extra });
const kioskPatches = () => calls.filter((c) => c.table === 'kiosks' && c.method === 'PATCH');
const statePatches = () => kioskPatches().filter((c) => 'client_state' in ((c.body as Row) || {}));

Deno.test({
  name: 'Lot 30 — AVANT la migration : sync identique avec ou sans client_state, rien de visible, rien de journalisé',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    const k = await addKiosk(CO, 't-k', ago(60), { last_seen_at: ago(30) });
    const base = await syncOf(k, 't-k');
    eq(base.status, 200, 'sync sans état');
    eq(kioskPatches().length, 1, 'sans état : une seule écriture (le « vu à »), exactement comme avant');
    calls.length = 0;
    const seenBefore = String(k.last_seen_at);
    advance(60_000);
    const { result: withState, out } = await spyConsole(() => syncOf(k, 't-k', GOOD_STATE));
    eq(withState.status, 200, 'sync avec état, colonnes absentes');
    eq(withState.json, base.json, 'réponse identique, octet pour octet');
    eq(withState.headers.get('Cache-Control'), 'no-store', 'Cache-Control: no-store');
    ok(String(k.last_seen_at) > seenBefore, 'le « vu à » est bien écrit');
    ok(!('client_state' in k) && !('client_state_at' in k), 'aucune colonne ni valeur n’apparaît en base');
    eq(out, '', 'rien n’est journalisé (ni erreur, ni avertissement)');
    eq(statePatches().length, 1, 'UNE tentative d’écriture groupée, refusée proprement par la base (PGRST204)');
    eq(kioskPatches().length, 2, 'deux requêtes en tout : la tentative groupée, puis le « vu à » seul (l’écriture d’avant)');
    eq(Object.keys(kioskPatches()[1].body as Row), ['last_seen_at'], 'le repli n’écrit que le « vu à », exactement comme avant');
    // Plus de tentative si la tablette n'envoie rien (ancienne page).
    calls.length = 0;
    await syncOf(k, 't-k');
    eq([statePatches().length, kioskPatches().length], [0, 1], 'ancienne page (sans état) : aucune tentative, une seule écriture');
    // Les syncs suivants n'insistent pas : pas d'erreur de la base à chaque sync (la fonction s'en souvient 10 minutes).
    calls.length = 0;
    for (let i = 0; i < 3; i++) { advance(5 * 60_000 / 3); await syncOf(k, 't-k', GOOD_STATE); }
    eq([statePatches().length, kioskPatches().length], [0, 3], 'trois syncs avec état : trois écritures du « vu à », aucune tentative groupée (aucune erreur répétée)');
    // Passé le délai, la fonction retente (la migration a pu passer entre-temps).
    calls.length = 0;
    advance(10 * 60_000);
    await syncOf(k, 't-k', GOOD_STATE);
    eq([statePatches().length, kioskPatches().length], [1, 2], 'au bout de 10 minutes : une nouvelle tentative, puis le « vu à » seul');
  },
});

Deno.test({
  name: 'Lot 30 — la migration passe pendant que la fonction tourne : l’état est écrit au plus 10 minutes plus tard, sans rien casser',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    const k = await addKiosk(CO, 't-k', ago(60));
    const { result: r1, out } = await spyConsole(() => syncOf(k, 't-k', GOOD_STATE));
    eq(r1.status, 200, 'avant la migration : sync 200');
    eq(out, '', 'avant la migration : rien de journalisé');
    migrate30();
    advance(2 * 60_000);
    await syncOf(k, 't-k', GOOD_STATE);
    eq(k.client_state, null, '2 minutes après la migration : la fonction se souvient encore que les colonnes manquaient (pas de nouvelle erreur)');
    advance(9 * 60_000);
    const { result: r2, out: out2 } = await spyConsole(() => syncOf(k, 't-k', GOOD_STATE));
    eq(r2.status, 200, 'sync 200');
    eq(k.client_state, GOOD_STATE, '11 minutes après : l’état est écrit');
    eq(out2, '', 'sans rien journaliser');
    calls.length = 0;
    await syncOf(k, 't-k', { wake: 'denied' });
    eq(kioskPatches().length, 1, 'ensuite : UNE seule écriture par sync');
  },
});

Deno.test({
  name: 'Lot 30 — APRÈS la migration : l’état est écrit (copie nettoyée), avec la date du serveur ; un nouvel état REMPLACE l’ancien',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    const k = await addKiosk(CO, 't-k', ago(60), { last_seen_at: ago(30) });
    migrate30();
    const base = await syncOf(k, 't-k');
    calls.length = 0;
    const { result: r, out } = await spyConsole(() => syncOf(k, 't-k', GOOD_STATE));
    eq(r.status, 200, 'sync');
    eq(r.json, base.json, 'la réponse ne change pas (la tablette n’a rien de nouveau à lire)');
    eq(k.client_state, GOOD_STATE, 'client_state écrit');
    ok(Math.abs(Date.parse(String(k.client_state_at)) - Date.now()) < 5000, `client_state_at = l’heure du serveur (${k.client_state_at})`);
    eq(out, '', 'rien n’est journalisé');
    const at1 = String(k.client_state_at);
    advance(7 * 60_000);
    await syncOf(k, 't-k', { wake: 'denied', standalone: false });
    eq(k.client_state, { wake: 'denied', standalone: false }, 'le nouvel état remplace l’ancien (aucun champ périmé n’est gardé)');
    ok(String(k.client_state_at) > at1, 'la date avance');
    // Un `sync` sans état (ancienne page) ne touche pas à l'état gardé.
    const keepAt = String(k.client_state_at);
    await syncOf(k, 't-k');
    eq([k.client_state, k.client_state_at], [{ wake: 'denied', standalone: false }, keepAt], 'sans client_state : l’état gardé est laissé tel quel');
    // UNE seule écriture par sync (288 par jour et par tablette, comme avant le lot 30) : « vu à » + état + date ensemble.
    calls.length = 0;
    await syncOf(k, 't-k', { wake: 'held' });
    eq(kioskPatches().length, 1, 'UN seul PATCH de kiosks par sync (pas deux)');
    eq(Object.keys(kioskPatches()[0].body as Row).sort(), ['client_state', 'client_state_at', 'last_seen_at'], '… qui porte « vu à », état et date d’état');
    calls.length = 0;
    await syncOf(k, 't-k');
    eq([kioskPatches().length, Object.keys(kioskPatches()[0].body as Row)], [1, ['last_seen_at']], 'sans état (ancienne page) : un PATCH, le « vu à » seul');
    calls.length = 0;
    await syncOf(k, 't-k', { wake: 'peut-etre' });
    eq([kioskPatches().length, Object.keys(kioskPatches()[0].body as Row)], [1, ['last_seen_at']], 'état invalide : un PATCH, le « vu à » seul');
    // Une tablette qui n'a jamais rien envoyé garde NULL.
    const other = await addKiosk(CO2, 't-o', ago(60));
    eq([other.client_state, other.client_state_at], [null, null], 'une autre tablette : NULL tant qu’elle n’a rien envoyé');
  },
});

Deno.test({
  name: 'Lot 30 — état invalide, mal typé ou trop gros : ignoré en entier, sync répond pareil, aucune écriture, aucun journal',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    const k = await addKiosk(CO, 't-k', ago(60));
    migrate30();
    const base = await syncOf(k, 't-k');
    const big: Row = { ...GOOD_STATE };
    for (let i = 0; i < 400; i++) big[`k${i}`] = 'x'.repeat(30);
    const bads: [string, unknown][] = [
      ['un tableau', [GOOD_STATE]], ['un texte', 'wake=held'], ['un nombre', 42], ['null', null], ['un booléen', true], ['objet vide', {}],
      ['verrou inconnu', { wake: 'peut-etre' }], ['verrou numérique', { wake: 1 }], ['booléen en texte', { standalone: 'true' }], ['booléen en nombre', { online: 1 }],
      ['version avec espace', { version: 'a b' }], ['version trop longue', { version: 'x'.repeat(25) }], ['version non texte', { version: 12345678 }], ['version avec balise', { version: '<script>' }],
      ['champs inconnus seulement', { token: 'x', note: 'texte libre' }], ['plusieurs milliers de signes', big], ['un seul gros champ', { ...GOOD_STATE, blob: 'x'.repeat(10_000) }],
      ['un champ valable + un mal typé', { ...GOOD_STATE, fullscreen: 'oui' }],
    ];
    for (const [label, bad] of bads) {
      calls.length = 0;
      const { result: r, out } = await spyConsole(() => syncOf(k, 't-k', bad));
      eq(r.status, 200, `${label} : sync répond 200`);
      eq(r.json, base.json, `${label} : réponse identique`);
      eq([k.client_state, k.client_state_at], [null, null], `${label} : rien d’écrit`);
      eq(statePatches().length, 0, `${label} : aucune tentative d’écriture`);
      eq(out, '', `${label} : rien de journalisé`);
    }
    // Les types exotiques arrivés par le JSON du corps (jamais d'erreur 500).
    const exotic = JSON.parse('{"__proto__":{"wake":"held"},"standalone":true,"wake":{"a":[1,2,3]}}');
    const raw = await syncOf(k, 't-k', exotic);
    eq(raw.status, 200, '« __proto__ » et valeur imbriquée : 200, pas de 500');
    eq([k.client_state, k.client_state_at], [null, null], '… et rien d’écrit (verrou mal formé)');
  },
});

Deno.test({
  name: 'Lot 30 — secrets : ni jeton, ni graine, ni texte libre, ni position dans la base ni dans les journaux',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    const k = await addKiosk(CO, 't-jeton-secret-42', ago(60));
    migrate30();
    const evil = { ...GOOD_STATE, token: 't-jeton-secret-42', seed: 'graine-secrete-99', note: 'texte libre à ne pas garder', lat: 48.8566, lng: 2.3522, kiosk_id: String(k.id) };
    const { result: r, out } = await spyConsole(() => syncOf(k, 't-jeton-secret-42', evil));
    eq(r.status, 200, 'sync');
    eq(k.client_state, GOOD_STATE, 'seule la liste blanche est gardée');
    eq(Object.keys(k.client_state as Row).sort(), ['fullscreen', 'online', 'standalone', 'version', 'wake'], 'cinq champs, pas un de plus');
    const stored = JSON.stringify(k.client_state);
    for (const secret of ['jeton-secret', 'graine-secrete', 'texte libre', '48.85', '2.35']) {
      ok(!stored.includes(secret), `base : « ${secret} » n’est pas dans l’état écrit`);
      ok(!out.includes(secret), `journaux : « ${secret} » n’est jamais écrit`);
    }
    ok(JSON.stringify(k.client_state).length <= 256, `état écrit : ${JSON.stringify(k.client_state).length} octets ≤ 256 (la base le refuserait au-delà)`);
    const sent = JSON.stringify(statePatches().map((c) => c.body));
    ok(!sent.includes('graine') && !sent.includes('texte libre') && !sent.includes('jeton-secret'), 'le corps envoyé à la base ne contient que la copie nettoyée');
  },
});

Deno.test({
  name: 'Lot 30 — entreprise étrangère : un jeton n’écrit que SA tablette ; coupée, retirée ou inconnue : rien',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    const a = await addKiosk(CO, 't-a', ago(60));
    const b = await addKiosk(CO2, 't-b', ago(60));
    migrate30();
    // Le jeton de A avec l'identifiant de B : refusé, B inchangée.
    const x = await call({ action: 'sync', kiosk_id: b.id, token: 't-a', client_state: GOOD_STATE });
    eq(x.status, 401, 'jeton de A + tablette de B → 401');
    eq([a.client_state, b.client_state], [null, null], 'ni A ni B n’ont reçu d’état');
    // Un jeton d'administrateur n'est pas un jeton de tablette.
    const adm = await call({ action: 'sync', kiosk_id: a.id, token: 'jwt-admin', client_state: GOOD_STATE });
    eq(adm.status, 401, 'le JWT d’un administrateur n’écrit pas l’état d’une tablette');
    eq(a.client_state, null, 'A inchangée');
    // Chacun écrit le sien.
    eq((await syncOf(a, 't-a', { wake: 'held' })).status, 200, 'A écrit');
    eq((await syncOf(b, 't-b', { wake: 'denied' })).status, 200, 'B écrit');
    eq([a.client_state, b.client_state], [{ wake: 'held' }, { wake: 'denied' }], 'chacune a SON état');
    // Un corps qui prétend une autre entreprise ne change rien : l'entreprise vient de la tablette.
    await syncOf(a, 't-a', { wake: 'unsupported' }, { company_id: CO2 });
    eq([a.client_state, b.client_state], [{ wake: 'unsupported' }, { wake: 'denied' }], 'un company_id dans le corps est sans effet');
    // Tablette retirée : 410, rien d'écrit.
    const before = JSON.stringify(a.client_state);
    a.revoked_at = new Date().toISOString();
    calls.length = 0;
    const gone = await syncOf(a, 't-a', GOOD_STATE);
    eq(gone.status, 410, 'tablette retirée → 410');
    eq([JSON.stringify(a.client_state), statePatches().length], [before, 0], 'retirée : état inchangé, aucune écriture');
    // Borne coupée par BEMEXO : 403, rien d'écrit.
    a.revoked_at = null;
    (db.companies.find((c) => c.id === CO) as Row).kiosk_enabled = false;
    calls.length = 0;
    const off = await syncOf(a, 't-a', GOOD_STATE);
    eq(off.status, 403, 'borne coupée → 403');
    eq([JSON.stringify(a.client_state), statePatches().length], [before, 0], 'coupée : état inchangé, aucune écriture');
    // Jeton inconnu.
    const bad = await call({ action: 'sync', kiosk_id: a.id, token: 'pas-le-bon', client_state: GOOD_STATE });
    eq([bad.status, statePatches().length], [401, 0], 'jeton inconnu → 401, aucune écriture');
  },
});

Deno.test({
  name: 'Lot 30 — panne de la base à l’écriture de l’état : sync reste 200, seul le code de l’erreur est journalisé',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    const k = await addKiosk(CO, 't-k-secret', ago(60));
    migrate30();
    const base = await syncOf(k, 't-k-secret');
    calls.length = 0;
    clientStateFail = { status: 500, body: { code: 'XX000', message: 'boom t-k-secret a3f09c1d' } };
    const { result: r, out } = await spyConsole(() => syncOf(k, 't-k-secret', GOOD_STATE));
    eq(r.status, 200, 'sync répond 200 malgré la panne');
    eq(r.json, base.json, 'réponse identique');
    ok(/client_state/.test(out) && /XX000/.test(out), `journal : « ${out.trim()} »`);
    ok(!out.includes('t-k-secret') && !out.includes('a3f09c1d') && !out.includes('boom'), 'le journal ne cite ni jeton, ni état, ni message de la base');
    eq(k.client_state, null, 'rien d’écrit');
    ok(Date.parse(String(k.last_seen_at)) > Date.now() - 5000, 'le « vu à » est quand même écrit (repli)');
    eq([statePatches().length, kioskPatches().length], [1, 2], 'tentative groupée refusée, puis le « vu à » seul');
    clientStateFail = { status: 403, body: { code: '42501', message: 'permission denied for column client_state' } };
    const { result: r2, out: out2 } = await spyConsole(() => syncOf(k, 't-k-secret', GOOD_STATE));
    eq(r2.status, 200, 'droit refusé : sync reste 200');
    ok(/42501/.test(out2), 'droit refusé : le code est journalisé (une migration mal posée se voit)');
  },
});

Deno.test({
  name: 'Lot 30 — seul `sync` écrit l’état ; aucune autre action, aucun DELETE',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    db = freshDb();
    const k = await addKiosk(CO, 't-k', ago(60));
    migrate30();
    calls.length = 0;
    const withState = { client_state: GOOD_STATE };
    await call({ action: 'board', kiosk_id: k.id, token: 't-k', ...withState });
    await call({ action: 'settings', active_from: '06:00', active_until: '20:00', ...withState }, { token: 'jwt-admin' });
    await call({ action: 'create_pairing', ...withState }, { token: 'jwt-admin' });
    await call({ action: 'pair_request', ...withState });
    await call({ action: 'ticket', k: k.id, c: '00000000', ...withState });
    await call({ action: 'revoke', kiosk_id: 'inconnu', ...withState }, { token: 'jwt-admin' });
    eq(statePatches().length, 0, 'board, settings, create_pairing, pair_request, ticket, revoke : aucune écriture de client_state');
    eq(k.client_state, null, 'l’état de la tablette est resté NULL');
    await call({ action: 'unpair', kiosk_id: k.id, token: 't-k', ...withState });
    eq(statePatches().length, 0, 'unpair non plus');
    ok(!calls.some((c) => c.method === 'DELETE'), 'aucun DELETE');
    const k2 = await addKiosk(CO, 't-k2', ago(30));
    await syncOf(k2, 't-k2', GOOD_STATE);
    eq(statePatches().length, 1, 'sync : une écriture');
    eq((statePatches()[0].body as Row).client_state, GOOD_STATE, 'avec la copie nettoyée');
  },
});
