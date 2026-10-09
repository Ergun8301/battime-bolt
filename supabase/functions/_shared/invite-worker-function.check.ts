// La fonction `invite-worker` elle-même, de bout en bout, contre une base
// SIMULÉE (une petite imitation de PostgREST, de GoTrue et de l'envoi
// d'e-mails, en mémoire, branchée sur fetch). Aucune vraie base, aucun e-mail
// envoyé. Lancé par invite-worker-function.test.ts (dans un Deno à part, sans
// le package.json du site), ou :
//   DENO_NO_PACKAGE_JSON=1 deno test -A supabase/functions/_shared/invite-worker-function.check.ts
//
// La base simulée se comporte comme la vraie sur ce qui compte ici :
// horodatages au format de Postgres (microsecondes, « +00:00 »), comparés
// comme des dates ; date ou uuid invalide dans un filtre → 400, comme
// PostgREST ; ILIKE = LIKE de Postgres (« _ » et « % » jokers, « \ »
// échappe), après la conversion « * » → « % » de PostgREST.
//
// Ce qui est vérifié :
//   · deux renvois SIMULTANÉS pour la même adresse : une invitation reste (la
//     plus récente), quel que soit l'ordre dans lequel les e-mails partent. Avant
//     le correctif, chacun effaçait l'autre et le salarié disparaissait ;
//   · deux invitations créées à la MÊME microseconde : une seule reste (départage
//     par id), le salarié n'est pas compté deux fois ;
//   · un renvoi simple remplace l'ancienne invitation au lieu de s'empiler ;
//   · e-mail refusé (limite d'envoi…) : l'ancienne invitation reste ;
//   · deux renvois simultanés dont le plus récent échoue : le premier reste ;
//   · « l_dupont@… » ne touche jamais « l.dupont@… » (« _ » joker de LIKE),
//     ni au renvoi, ni à l'annulation (compte et invitation) ;
//   · une adresse avec « * » est refusée (PostgREST le lit comme « % ») ;
//   · annulation : si une vérification échoue, rien n'est supprimé ;
//   · une adresse déjà rattachée à une AUTRE entreprise est refusée ;
//   · un administrateur archivé ne peut ni inviter ni annuler ;
//   · annuler une adresse ne touche jamais une autre entreprise ;
//   · une invitation en attente sans date compte comme plus ancienne : retirée ;
//   · jamais touchées : les invitations acceptées, celles d'une autre entreprise.

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

const URL_BASE = 'http://supabase.test';
Deno.env.set('SUPABASE_URL', URL_BASE);
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key');

// ── Horodatages au format de Postgres ────────────────────────────────────────
/** « 2026-10-09T09:52:46.8832+00:00 » : microsecondes, zéros finaux retirés. */
function pgTs(us: number): string {
  const base = new Date(Math.floor(us / 1000)).toISOString().slice(0, 19);
  const frac = String(us % 1_000_000).padStart(6, '0').replace(/0+$/, '');
  return `${base}${frac ? `.${frac}` : ''}+00:00`;
}
/** Date → microsecondes ; null si Postgres la refuserait (22007). */
function tsMicros(v: string): number | null {
  const m = /^(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(v);
  if (!m) return null;
  const ms = Date.parse(`${m[1]}T${m[2]}${m[4]}`);
  return Number.isNaN(ms) ? null : ms * 1000 + Number((m[3] ?? '').padEnd(6, '0'));
}
/** Horodatage réel, strictement croissant (comme now() d'une insertion à l'autre). */
let tickUs = 0;
const nowIso = () => { tickUs = Math.max(Date.now() * 1000, tickUs + 1); return pgTs(tickUs); };
const ago = (min: number) => pgTs((Date.now() - min * 60_000) * 1000);
/** Si posé : toutes les insertions reçoivent CET horodatage (égalité parfaite). */
let sameCreatedAt: string | null = null;

// ── La base simulée ──────────────────────────────────────────────────────────
let db: Db = {};
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TS_COLS = new Set(['created_at', 'accepted_at', 'expires_at']);
/** Les refus (400) de la base simulée : un test normal n'en produit aucun. */
const restErrors: string[] = [];
/** Panne simulée : les requêtes qui vérifient ce prédicat échouent (500). */
let failWhen: ((table: string, params: URLSearchParams) => boolean) | null = null;

class PgError extends Error {
  constructor(public status: number, public body: Row) { super(String(body.message)); }
}
/** LIKE de Postgres (« \ » échappe), après la conversion « * » → « % » de PostgREST. */
function likeToRegExp(pattern: string) {
  const p = pattern.replace(/\*/g, '%');
  const lit = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '\\') {
      if (i + 1 >= p.length) throw new PgError(400, { code: '22025', message: 'LIKE pattern must not end with escape character' });
      re += lit(p[++i]);
    } else if (c === '%') re += '[\\s\\S]*';
    else if (c === '_') re += '[\\s\\S]';
    else re += lit(c);
  }
  return new RegExp(`^${re}$`, 'i');
}
/** Compare une valeur de colonne au filtre, avec le type de la colonne. */
function cmp(col: string, cur: unknown, val: string): number {
  if (TS_COLS.has(col)) {
    const b = tsMicros(val);
    if (b == null) throw new PgError(400, { code: '22007', message: `invalid input syntax for type timestamp with time zone: "${val}"` });
    return tsMicros(String(cur))! - b;
  }
  if (col === 'id') {
    if (!UUID_RE.test(val)) throw new PgError(400, { code: '22P02', message: `invalid input syntax for type uuid: "${val}"` });
    return String(cur).toLowerCase().localeCompare(val.toLowerCase());
  }
  return String(cur).localeCompare(val);
}
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [k, raw] of params) {
    if (SKIP.has(k)) continue;
    const dot = raw.indexOf('.');
    const op = raw.slice(0, dot); const val = raw.slice(dot + 1);
    const cur = row[k];
    if (op === 'is') { if (!(val === 'null' ? cur == null : String(cur) === val)) return false; continue; }
    if (!['eq', 'lt', 'ilike'].includes(op)) throw new PgError(400, { code: 'PGRST100', message: `filtre non simulé : ${k}=${raw}` });
    if (cur == null) return false; // NULL ne vérifie aucune comparaison
    if (op === 'eq' && k === 'id') { if (String(cur) !== val) return false; continue; } // égalité : texte
    if (op === 'eq' && cmp(k, cur, val) !== 0) return false;
    if (op === 'lt' && !(cmp(k, cur, val) < 0)) return false;
    if (op === 'ilike' && !likeToRegExp(val).test(String(cur))) return false;
  }
  return true;
}
function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

// ── L'envoi d'e-mails simulé : chaque envoi attend qu'on le libère ───────────
type Sending = { phone: string; finish: (ok: boolean) => void };
let sending: Sending[] = [];
let autoSend = true;
const sentTo: string[] = [];

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : String(input));
  const method = (init?.method || req?.method || 'GET').toUpperCase();
  const headers = new Headers(init?.headers || req?.headers);
  const bodyText = init?.body != null ? String(init.body) : req ? await req.text() : '';
  const body = bodyText ? JSON.parse(bodyText) : undefined;

  if (url.pathname === '/auth/v1/user') {
    const tok = (headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const u = (db.auth || []).find((x) => x.token === tok);
    return u ? reply(200, { id: u.id, aud: 'authenticated', role: 'authenticated', email: `${u.id}@x.fr` }) : reply(401, { msg: 'invalid token' });
  }
  if (url.pathname === '/auth/v1/invite' && method === 'POST') {
    const phone = String(body?.data?.phone ?? '');
    const ok = autoSend ? true : await new Promise<boolean>((resolve) => sending.push({ phone, finish: resolve }));
    if (!ok) return reply(429, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' });
    sentTo.push(String(body?.email));
    return reply(200, { id: 'u-invite', email: body?.email, invited_at: nowIso() });
  }
  const adminUser = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(url.pathname);
  if (adminUser) {
    const id = decodeURIComponent(adminUser[1]);
    const u = (db.authUsers || []).find((x) => x.id === id);
    if (!u) return reply(404, { code: 404, error_code: 'user_not_found', msg: 'User not found' });
    if (method === 'GET') return reply(200, { id: u.id, email: u.email, last_sign_in_at: u.last_sign_in_at ?? null });
    if (method === 'DELETE') {
      // auth.users supprimé → cascade sur public.users (users_id_fkey).
      db.authUsers = db.authUsers.filter((x) => x.id !== id);
      db.users = db.users.filter((x) => x.id !== id);
      return reply(200, {});
    }
  }
  if (!url.pathname.startsWith('/rest/v1/')) return reply(404, { message: 'inconnu' });
  const table = url.pathname.slice('/rest/v1/'.length);
  const prefer = headers.get('Prefer') || '';
  const accept = headers.get('Accept') || '';
  const params = url.searchParams;
  if (failWhen?.(table, params)) return reply(500, { code: 'XX000', message: 'panne simulée' });
  const rows = (db[table] ||= []);
  const wantObject = accept.includes('vnd.pgrst.object');
  // Comme PostgREST : seules les colonnes demandées par select= reviennent.
  const cols = (params.get('select') || '*').split(',').map((c) => c.trim());
  const project = (r: Row) => (cols.includes('*') ? { ...r } : Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
  const out = (list: Row[], status = 200) => {
    if (wantObject) return list.length === 1 ? reply(status, project(list[0])) : reply(406, { code: 'PGRST116', message: `${list.length} lignes` });
    return reply(status, list.map(project), { 'Content-Range': `0-${Math.max(0, list.length - 1)}/${list.length}` });
  };

  try {
    if (method === 'GET') return out(rows.filter((r) => matches(r, params)));
    if (method === 'HEAD') {
      const n = rows.filter((r) => matches(r, params)).length;
      return new Response(null, { status: 200, headers: { 'Content-Range': `*/${n}` } });
    }
    if (method === 'POST') {
      const items = (Array.isArray(body) ? body : [body]) as Row[];
      const saved = items.map((it) => {
        const row: Row = { id: uuid(), created_at: sameCreatedAt ?? nowIso(), accepted_at: null, ...it };
        rows.push(row);
        return row;
      });
      return prefer.includes('return=representation') ? out(saved, 201) : reply(201, undefined);
    }
    if (method === 'DELETE') {
      const keep = rows.filter((r) => !matches(r, params)); // tout est évalué avant d'effacer
      db[table] = keep;
      return reply(204, undefined);
    }
  } catch (e) {
    if (e instanceof PgError) { restErrors.push(`${method} ${table}${url.search} → ${e.body.message}`); return reply(e.status, e.body); }
    throw e;
  }
  return reply(405, { message: 'méthode' });
}

// ── La fonction, chargée avec Deno.serve et fetch détournés ──────────────────
// fetch reste détourné pendant tout le fichier : deux appels tournent en même
// temps, aucun ne doit repartir sur le vrai réseau.
let handler: ((req: Request) => Promise<Response>) | null = null;
async function loadFunction() {
  if (handler) return handler;
  const realServe = Deno.serve;
  Object.defineProperty(Deno, 'serve', {
    configurable: true, writable: true,
    value: (h: (req: Request) => Promise<Response>) => { handler = h; return { finished: Promise.resolve(), shutdown: async () => {} }; },
  });
  globalThis.fetch = fakeFetch as typeof fetch;
  try {
    // Chemin construit : le fichier de la fonction n'entre pas dans la
    // vérification de types de ce test (ses imports npm: viennent du runtime).
    const spec = new URL(['..', 'invite-worker', 'index.ts'].join('/'), import.meta.url).href;
    await import(spec);
  } finally {
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: realServe });
  }
  if (!handler) throw new Error('Deno.serve non appelé');
  return handler;
}

async function call(body: Row, token = 'jwt-admin') {
  const h = await loadFunction();
  const res = await h(new Request('http://fonction.test/invite-worker', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }));
  return { status: res.status, json: await res.json() as Row };
}

const CO = 'c0000000-0000-4000-8000-000000000001';
const CO2 = 'c0000000-0000-4000-8000-000000000002';
const EMAIL = 'jean.exemple@example.test';
const INV_ANCIENNE = 'a0000000-0000-4000-8000-000000000001';
const INV_ACCEPTEE = 'a0000000-0000-4000-8000-000000000002';
const INV_AUTRE_ENT = 'a0000000-0000-4000-8000-000000000003';

function freshDb(): Db {
  sending = []; autoSend = true; sentTo.length = 0; sameCreatedAt = null; failWhen = null; restErrors.length = 0;
  return {
    auth: [{ id: 'u-admin', token: 'jwt-admin' }, { id: 'u-worker', token: 'jwt-worker' }],
    authUsers: [],
    users: [
      { id: 'u-admin', company_id: CO, role: 'admin', is_active: true, email: 'admin@example.test' },
      { id: 'u-worker', company_id: CO, role: 'worker', is_active: true, email: 'salarie@example.test' },
    ],
    companies: [{ id: CO, name: 'Pizzeria Exemple' }, { id: CO2, name: 'Autre Société' }],
    invitations: [
      // L'invitation en attente, envoyée hier : celle qu'on renvoie.
      { id: INV_ANCIENNE, company_id: CO, email: EMAIL, first_name: 'Jean', last_name: 'Exemple', phone: '0600000000', created_at: ago(24 * 60), accepted_at: null },
      // Déjà acceptée (même adresse) : historique, jamais effacé par un renvoi.
      { id: INV_ACCEPTEE, company_id: CO, email: EMAIL, first_name: 'Jean', last_name: 'Exemple', created_at: ago(48 * 60), accepted_at: ago(47 * 60) },
      // Même adresse dans une AUTRE entreprise : jamais touchée.
      { id: INV_AUTRE_ENT, company_id: CO2, email: EMAIL, first_name: 'Jean', last_name: 'Exemple', created_at: ago(48 * 60), accepted_at: null },
    ],
    time_entries: [], planning: [], push_subscriptions: [],
  };
}

/** Un renvoi, repérable par son téléphone (le reste est identique). */
const resend = (phone: string) => call({ email: EMAIL, first_name: 'Jean', last_name: 'Exemple', phone });
/** En attente dans l'entreprise testée, pour l'adresse de Jean. */
const pending = () => db.invitations.filter((r) => r.company_id === CO && r.email === EMAIL && r.accepted_at == null);
const untouched = () => {
  ok(db.invitations.some((r) => r.id === INV_ACCEPTEE), 'l’invitation déjà acceptée n’est jamais effacée');
  ok(db.invitations.some((r) => r.id === INV_AUTRE_ENT), 'l’invitation d’une autre entreprise n’est jamais touchée');
  eq(restErrors, [], 'aucune requête refusée par la base (filtre ou valeur invalide)');
};

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: unknown, msg: string) { if (!c) throw new Error(msg); }
async function until(cond: () => boolean, what: string) {
  for (let i = 0; i < 400; i++) { if (cond()) return; await new Promise((r) => setTimeout(r, 5)); }
  throw new Error(`délai dépassé : ${what}`);
}

/** Lance deux renvois en même temps et attend que les deux e-mails soient « en cours ». */
async function twoAtOnce() {
  autoSend = false;
  const pA = resend('0600000001');
  const pB = resend('0600000002');
  await until(() => sending.length === 2, 'les deux envois en cours');
  eq(pending().length, 3, 'pendant l’envoi : l’ancienne + les deux nouvelles coexistent');
  const rowOf = (phone: string) => db.invitations.find((r) => r.phone === phone)!;
  // Même ordre que la base : created_at, puis id pour départager une égalité.
  const [older, newer] = [rowOf('0600000001'), rowOf('0600000002')]
    .sort((a, b) => cmp('created_at', a.created_at, String(b.created_at)) || cmp('id', a.id, String(b.id)));
  const promiseOf = (row: Row) => (row.phone === '0600000001' ? pA : pB);
  const sendingOf = (row: Row) => sending.find((s) => s.phone === row.phone)!;
  return { older, newer, promiseOf, sendingOf };
}

const OPTS = { sanitizeOps: false, sanitizeResources: false };

Deno.test({
  ...OPTS,
  name: 'Base simulée — se comporte comme PostgREST (format des dates, valeurs invalides refusées, LIKE)',
  async fn() {
    ok(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,6})?\+00:00$/.test(nowIso()), 'horodatage au format de Postgres');
    eq(tsMicros('2026-10-09T09:52:46.5+00:00'), tsMicros('2026-10-09T09:52:46.500000+00:00'), 'mêmes dates, écritures différentes');
    eq(cmp('created_at', '2026-10-09T09:52:46.5+00:00', '2026-10-09T09:52:46.49+00:00') > 0, true, 'comparées comme des dates, pas comme du texte');
    const get = (q: string) => fakeFetch(`${URL_BASE}/rest/v1/invitations?select=id&${q}`).then((r) => r.status);
    db = freshDb();
    eq(await get('created_at=lt.undefined'), 400, 'date invalide → 400 (22007)');
    eq(await get('id=lt.pas-un-uuid'), 400, 'uuid invalide → 400 (22P02)');
    eq(await get('email=ilike.fin%5C'), 400, 'motif LIKE terminé par « \\ » → 400 (22025)');
    ok(likeToRegExp('l_dupont@x.fr').test('l.dupont@x.fr'), '« _ » est un joker (le piège)');
    ok(!likeToRegExp('l\\_dupont@x.fr').test('l.dupont@x.fr'), '« \\_ » ne reconnaît que « _ »');
    ok(likeToRegExp('l\\_dupont@x.fr').test('L_Dupont@X.fr'), 'majuscules et minuscules confondues');
    ok(likeToRegExp('a*@x.fr').test('abc@x.fr'), 'PostgREST lit « * » comme « % »');
  },
});

Deno.test({
  ...OPTS,
  name: 'Invitations — refus de base : non connecté, pas admin, e-mail manquant',
  async fn() {
    db = freshDb();
    eq((await call({ email: EMAIL }, 'jeton-inconnu')).status, 401, 'jeton inconnu');
    eq((await call({ email: EMAIL, first_name: 'Jean', last_name: 'Exemple' }, 'jwt-worker')).status, 403, 'un salarié ne peut pas inviter');
    const noMail = await call({ first_name: 'Jean', last_name: 'Exemple' });
    eq([noMail.status, noMail.json.error], [400, 'E-mail requis'], 'e-mail manquant');
    eq(sentTo.length, 0, 'aucun e-mail parti');
  },
});

Deno.test({
  ...OPTS,
  name: 'Invitations — renvoi simple : l’ancienne est remplacée, pas empilée',
  async fn() {
    db = freshDb();
    const r = await resend('0600000009');
    eq([r.status, r.json.success], [200, true], 'renvoi');
    eq(pending().map((x) => x.phone), ['0600000009'], 'une seule invitation en attente : la nouvelle');
    untouched();
  },
});

Deno.test({
  ...OPTS,
  name: 'Invitations — renvoi : une invitation en attente sans date (plus ancienne) est retirée aussi',
  async fn() {
    db = freshDb();
    db.invitations.push({ id: 'a0000000-0000-4000-8000-0000000000ff', company_id: CO, email: EMAIL, first_name: 'Jean', last_name: 'Exemple', created_at: null, accepted_at: null });
    const r = await resend('0600000008');
    eq(r.status, 200, 'renvoi');
    eq(pending().map((x) => x.phone), ['0600000008'], 'seule la nouvelle reste (la ligne sans date et celle d’hier sont retirées)');
    untouched();
  },
});

for (const [order, tie] of [
  ['la plus ancienne', false], ['la plus récente', false],
  ['la plus ancienne', true], ['la plus récente', true],
] as const) {
  Deno.test({
    ...OPTS,
    name: tie
      ? `Invitations — deux renvois créés à la même microseconde (e-mail de ${order} parti d’abord) : une seule reste`
      : `Invitations — deux renvois simultanés (e-mail de ${order} parti d’abord) : le salarié reste dans la liste`,
    async fn() {
      db = freshDb();
      if (tie) sameCreatedAt = ago(1 / 60);
      const { older, newer, promiseOf, sendingOf } = await twoAtOnce();
      if (tie) eq(older.created_at, newer.created_at, 'les deux nouvelles ont le même horodatage');
      const [first, second] = order === 'la plus ancienne' ? [older, newer] : [newer, older];
      sendingOf(first).finish(true);
      eq((await promiseOf(first)).status, 200, 'premier envoi');
      sendingOf(second).finish(true);
      eq((await promiseOf(second)).status, 200, 'second envoi');
      const left = pending();
      eq(left.length, 1, tie
        ? 'exactement une invitation en attente (sans départage par id : deux, le salarié compté deux fois)'
        : 'exactement une invitation en attente (avant le correctif : zéro, le salarié disparaissait)');
      eq(left[0].id, newer.id, 'c’est la plus récente qui reste (celle que prend le trigger d’inscription)');
      ok(!db.invitations.some((r) => r.id === INV_ANCIENNE), 'l’invitation d’hier est retirée');
      untouched();
    },
  });
}

Deno.test({
  ...OPTS,
  name: 'Invitations — e-mail refusé : l’ancienne invitation reste',
  async fn() {
    db = freshDb();
    autoSend = false;
    const p = resend('0600000003');
    await until(() => sending.length === 1, 'envoi en cours');
    sending[0].finish(false);
    const r = await p;
    eq(r.status, 400, 'erreur rendue au bureau');
    eq(pending().map((x) => x.id), [INV_ANCIENNE], 'seule l’ancienne invitation reste, la nouvelle est retirée');
    untouched();
  },
});

Deno.test({
  ...OPTS,
  name: 'Invitations — deux renvois simultanés, le plus récent échoue : le premier reste',
  async fn() {
    db = freshDb();
    const { older, newer, promiseOf, sendingOf } = await twoAtOnce();
    sendingOf(older).finish(true);
    eq((await promiseOf(older)).status, 200, 'premier envoi réussi');
    sendingOf(newer).finish(false);
    eq((await promiseOf(newer)).status, 400, 'second envoi refusé');
    eq(pending().map((x) => x.id), [older.id], 'l’invitation réussie reste seule');
    untouched();
  },
});

// ── « _ » est un joker de LIKE : deux salariés aux adresses voisines ─────────
const LEA = 'l.dupont@example.test';
const LUC = 'l_dupont@example.test';
const INV_LEA = 'b0000000-0000-4000-8000-000000000001';
const INV_LUC = 'b0000000-0000-4000-8000-000000000002';
// Comptes : des uuid, comme en base (auth-js refuse un autre identifiant).
const U_LEA = 'd0000000-0000-4000-8000-000000000001';
const U_LUC = 'd0000000-0000-4000-8000-000000000002';
function withNeighbours() {
  db = freshDb();
  db.invitations.push(
    { id: INV_LEA, company_id: CO, email: LEA, first_name: 'Léa', last_name: 'Dupont', created_at: ago(120), accepted_at: null },
    { id: INV_LUC, company_id: CO, email: LUC, first_name: 'Luc', last_name: 'Dupont', created_at: ago(60), accepted_at: null },
  );
  db.users.push(
    { id: U_LEA, company_id: CO, role: 'worker', is_active: true, email: LEA },
    { id: U_LUC, company_id: CO, role: 'worker', is_active: true, email: LUC },
  );
  db.authUsers.push({ id: U_LEA, email: LEA, last_sign_in_at: null }, { id: U_LUC, email: LUC, last_sign_in_at: null });
}

Deno.test({
  ...OPTS,
  name: 'Invitations — renvoi à « l_dupont » : l’invitation de « l.dupont » (une autre salariée) n’est pas touchée',
  async fn() {
    withNeighbours();
    // Écrit avec des majuscules : la casse reste ignorée, seul le joker disparaît.
    const r = await call({ email: 'L_Dupont@Example.test', first_name: 'Luc', last_name: 'Dupont' });
    eq(r.status, 200, 'renvoi');
    ok(db.invitations.some((x) => x.id === INV_LEA), 'l’invitation de Léa (l.dupont) reste (avant : effacée)');
    ok(!db.invitations.some((x) => x.id === INV_LUC), 'l’ancienne invitation de Luc est bien remplacée (casse ignorée)');
    eq(db.invitations.filter((x) => String(x.email).toLowerCase() === LUC && x.accepted_at == null).length, 1, 'une seule invitation en attente pour Luc');
    untouched();
  },
});

Deno.test({
  ...OPTS,
  name: 'Invitations — annuler « l_dupont » ne touche ni le compte ni l’invitation de « l.dupont »',
  async fn() {
    withNeighbours();
    const r = await call({ action: 'revoke', email: LUC });
    eq([r.status, r.json.deleted_account], [200, true], `annulation ${JSON.stringify(r.json)}`);
    ok(!db.users.some((u) => u.id === U_LUC), 'le compte jamais utilisé de Luc est supprimé (avant : laissé en place)');
    ok(!db.invitations.some((x) => x.id === INV_LUC), 'l’invitation de Luc est retirée');
    ok(db.users.some((u) => u.id === U_LEA), 'le compte de Léa reste');
    ok(db.invitations.some((x) => x.id === INV_LEA), 'l’invitation de Léa reste (avant : effacée)');
  },
});

Deno.test({
  ...OPTS,
  name: 'Invitations — une adresse avec « * » est refusée (PostgREST le lirait comme « % »)',
  async fn() {
    db = freshDb();
    const before = db.invitations.length;
    const r = await call({ email: '*@example.test', first_name: 'X', last_name: 'Y' });
    eq(r.status, 400, 'refusée');
    const rv = await call({ action: 'revoke', email: '*@example.test' });
    eq(rv.status, 400, 'annulation refusée aussi');
    eq([db.invitations.length, sentTo.length], [before, 0], 'rien d’effacé, aucun e-mail');
  },
});

for (const [panne, when] of [
  ['la recherche du compte', (t: string, p: URLSearchParams) => t === 'users' && p.has('email')],
  ['le comptage des heures', (t: string) => t === 'time_entries'],
] as const) {
  Deno.test({
    ...OPTS,
    name: `Invitations — annulation : si ${panne} échoue, rien n’est supprimé`,
    async fn() {
      withNeighbours();
      failWhen = when;
      const r = await call({ action: 'revoke', email: LUC });
      eq(r.status, 500, 'erreur rendue au bureau');
      failWhen = null;
      ok(db.authUsers.some((u) => u.id === U_LUC) && db.users.some((u) => u.id === U_LUC), 'le compte de Luc n’est pas supprimé');
      ok(db.invitations.some((x) => x.id === INV_LUC), 'son invitation reste');
    },
  });
}

Deno.test({
  ...OPTS,
  name: 'Invitations — une adresse déjà rattachée à une autre entreprise est refusée',
  async fn() {
    db = freshDb();
    db.users.push({ id: 'e0000000-0000-4000-8000-000000000001', company_id: CO2, role: 'worker', is_active: true, email: 'pris@example.test' });
    const before = db.invitations.length;
    const r = await call({ email: 'Pris@Example.test', first_name: 'Paul', last_name: 'Pris' });
    eq([r.status, r.json.error], [400, 'Un compte existe déjà avec cette adresse.'], 'refusée');
    eq([db.invitations.length, sentTo.length], [before, 0], 'aucune invitation créée, aucun e-mail');
    // Son propre salarié (même entreprise), lui, peut toujours être relancé.
    db.users.push({ id: 'e0000000-0000-4000-8000-000000000002', company_id: CO, role: 'worker', is_active: true, email: EMAIL });
    eq((await resend('0600000007')).status, 200, 'relance d’un salarié de l’entreprise');
    untouched();
  },
});

Deno.test({
  ...OPTS,
  name: 'Invitations — un administrateur archivé ne peut ni inviter ni annuler',
  async fn() {
    db = freshDb();
    db.users.find((u) => u.id === 'u-admin')!.is_active = false;
    eq((await resend('0600000006')).status, 403, 'invitation refusée');
    eq((await call({ action: 'revoke', email: EMAIL })).status, 403, 'annulation refusée');
    eq([pending().map((x) => x.id), sentTo.length], [[INV_ANCIENNE], 0], 'rien ne change, aucun e-mail');
    untouched();
  },
});

Deno.test({
  ...OPTS,
  name: 'Invitations — annuler une adresse ne touche jamais une autre entreprise',
  async fn() {
    withNeighbours();
    // La même adresse que Luc, dans une AUTRE entreprise (compte jamais utilisé).
    const U_AUTRE = 'e0000000-0000-4000-8000-000000000003';
    db.users.push({ id: U_AUTRE, company_id: CO2, role: 'worker', is_active: true, email: LUC });
    db.authUsers.push({ id: U_AUTRE, email: LUC, last_sign_in_at: null });
    db.invitations.push({ id: 'b0000000-0000-4000-8000-000000000003', company_id: CO2, email: LUC, first_name: 'Luc', last_name: 'Autre', created_at: ago(30), accepted_at: null });
    // Une seule ligne par entreprise : on cherche dans la sienne, pas ailleurs.
    db.users = db.users.filter((u) => u.id !== U_LUC);
    db.authUsers = db.authUsers.filter((u) => u.id !== U_LUC);
    const r = await call({ action: 'revoke', email: LUC });
    eq([r.status, r.json.deleted_account], [200, false], 'annulation dans son entreprise (aucun compte à elle)');
    ok(db.users.some((u) => u.id === U_AUTRE) && db.authUsers.some((u) => u.id === U_AUTRE), 'le compte de l’autre entreprise reste');
    ok(db.invitations.some((x) => x.id === 'b0000000-0000-4000-8000-000000000003'), 'l’invitation de l’autre entreprise reste');
    ok(!db.invitations.some((x) => x.id === INV_LUC), 'la sienne est retirée');
    untouched();
  },
});
