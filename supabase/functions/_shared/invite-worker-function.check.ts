// La fonction `invite-worker` elle-même, de bout en bout, contre une base
// SIMULÉE (une petite imitation de PostgREST et de l'envoi d'e-mails, en
// mémoire, branchée sur fetch). Aucune vraie base, aucun e-mail envoyé.
// Lancé par invite-worker-function.test.ts (dans un Deno à part, sans le
// package.json du site), ou :
//   DENO_NO_PACKAGE_JSON=1 deno test -A supabase/functions/_shared/invite-worker-function.check.ts
//
// Ce qui est vérifié :
//   · deux renvois SIMULTANÉS pour la même adresse : une invitation reste (la
//     plus récente), quel que soit l'ordre dans lequel les e-mails partent. Avant
//     le correctif, chacun effaçait l'autre et le salarié disparaissait ;
//   · un renvoi simple remplace l'ancienne invitation au lieu de s'empiler ;
//   · e-mail refusé (limite d'envoi…) : l'ancienne invitation reste ;
//   · deux renvois simultanés dont le plus récent échoue : le premier reste ;
//   · jamais touchées : les invitations acceptées, celles d'une autre entreprise.

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

const URL_BASE = 'http://supabase.test';
Deno.env.set('SUPABASE_URL', URL_BASE);
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key');

// ── La base simulée ──────────────────────────────────────────────────────────
let db: Db = {};
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
/** Horodatage réel, strictement croissant (comme now() d'une insertion à l'autre). */
let tick = 0;
const nowIso = () => { tick = Math.max(Date.now(), tick + 1); return new Date(tick).toISOString(); };
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function likeToRegExp(pattern: string) {
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${esc}$`, 'i');
}
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
    if (op === 'lt' && !(s != null && s < val)) return false;
    if (op === 'ilike' && !(s != null && likeToRegExp(val).test(s))) return false;
    if (!['eq', 'neq', 'is', 'lt', 'ilike'].includes(op)) throw new Error(`filtre non simulé : ${k}=${raw}`);
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
  if (!url.pathname.startsWith('/rest/v1/')) return reply(404, { message: 'inconnu' });
  const table = url.pathname.slice('/rest/v1/'.length);
  const prefer = headers.get('Prefer') || '';
  const accept = headers.get('Accept') || '';
  const params = url.searchParams;
  const rows = (db[table] ||= []);
  const wantObject = accept.includes('vnd.pgrst.object');
  const out = (list: Row[], status = 200) => {
    if (wantObject) return list.length === 1 ? reply(status, list[0]) : reply(406, { code: 'PGRST116', message: `${list.length} lignes` });
    return reply(status, list, { 'Content-Range': `0-${Math.max(0, list.length - 1)}/${list.length}` });
  };

  if (method === 'GET') return out(rows.filter((r) => matches(r, params)));
  if (method === 'POST') {
    const items = (Array.isArray(body) ? body : [body]) as Row[];
    const saved = items.map((it) => {
      const row: Row = { id: uuid(), created_at: nowIso(), accepted_at: null, ...it };
      rows.push(row);
      return row;
    });
    return prefer.includes('return=representation') ? out(saved, 201) : reply(201, undefined);
  }
  if (method === 'DELETE') {
    db[table] = rows.filter((r) => !matches(r, params));
    return reply(204, undefined);
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

function freshDb(): Db {
  sending = []; autoSend = true; sentTo.length = 0;
  return {
    auth: [{ id: 'u-admin', token: 'jwt-admin' }, { id: 'u-worker', token: 'jwt-worker' }],
    users: [
      { id: 'u-admin', company_id: CO, role: 'admin', is_active: true },
      { id: 'u-worker', company_id: CO, role: 'worker', is_active: true },
    ],
    companies: [{ id: CO, name: 'Pizzeria Exemple' }, { id: CO2, name: 'Autre Société' }],
    invitations: [
      // L'invitation en attente, envoyée hier : celle qu'on renvoie.
      { id: 'inv-ancienne', company_id: CO, email: EMAIL, first_name: 'Jean', last_name: 'Exemple', phone: '0600000000', created_at: ago(24 * 60), accepted_at: null },
      // Déjà acceptée (même adresse) : historique, jamais effacé par un renvoi.
      { id: 'inv-acceptee', company_id: CO, email: EMAIL, first_name: 'Jean', last_name: 'Exemple', created_at: ago(48 * 60), accepted_at: ago(47 * 60) },
      // Même adresse dans une AUTRE entreprise : jamais touchée.
      { id: 'inv-autre-ent', company_id: CO2, email: EMAIL, first_name: 'Jean', last_name: 'Exemple', created_at: ago(48 * 60), accepted_at: null },
    ],
  };
}

/** Un renvoi, repérable par son téléphone (le reste est identique). */
const resend = (phone: string) => call({ email: EMAIL, first_name: 'Jean', last_name: 'Exemple', phone });
/** En attente dans l'entreprise testée, pour cette adresse. */
const pending = () => db.invitations.filter((r) => r.company_id === CO && r.accepted_at == null);
const untouched = () => {
  ok(db.invitations.some((r) => r.id === 'inv-acceptee'), 'l’invitation déjà acceptée n’est jamais effacée');
  ok(db.invitations.some((r) => r.id === 'inv-autre-ent'), 'l’invitation d’une autre entreprise n’est jamais touchée');
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
  const [older, newer] = [rowOf('0600000001'), rowOf('0600000002')]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const promiseOf = (row: Row) => (row.phone === '0600000001' ? pA : pB);
  const sendingOf = (row: Row) => sending.find((s) => s.phone === row.phone)!;
  return { older, newer, promiseOf, sendingOf };
}

const OPTS = { sanitizeOps: false, sanitizeResources: false };

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

for (const order of ['la plus ancienne', 'la plus récente'] as const) {
  Deno.test({
    ...OPTS,
    name: `Invitations — deux renvois simultanés (e-mail de ${order} parti d’abord) : le salarié reste dans la liste`,
    async fn() {
      db = freshDb();
      const { older, newer, promiseOf, sendingOf } = await twoAtOnce();
      const [first, second] = order === 'la plus ancienne' ? [older, newer] : [newer, older];
      sendingOf(first).finish(true);
      eq((await promiseOf(first)).status, 200, 'premier envoi');
      sendingOf(second).finish(true);
      eq((await promiseOf(second)).status, 200, 'second envoi');
      const left = pending();
      eq(left.length, 1, 'exactement une invitation en attente (avant le correctif : zéro, le salarié disparaissait)');
      eq(left[0].id, newer.id, 'c’est la plus récente qui reste (celle que prend le trigger d’inscription)');
      ok(!db.invitations.some((r) => r.id === 'inv-ancienne'), 'l’invitation d’hier est retirée');
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
    eq(pending().map((x) => x.id), ['inv-ancienne'], 'seule l’ancienne invitation reste, la nouvelle est retirée');
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
