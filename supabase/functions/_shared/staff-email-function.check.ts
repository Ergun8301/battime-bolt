// La fonction `send-staff-email` ELLE-MÊME, de bout en bout (son index.ts réel, avec
// supabase-js et le vrai email.ts), contre un monde SIMULÉ : une petite imitation de
// PostgREST, de GoTrue et de l'API Resend, en mémoire, branchée sur fetch.
// Aucune vraie base, AUCUN e-mail envoyé, aucune vraie clé : `fetch` est détourné
// pendant tout le fichier, rien ne peut sortir sur le réseau. Lancé par
// staff-email-function.test.ts (dans un Deno à part, sans le package.json du site), ou :
//   DENO_NO_PACKAGE_JSON=1 deno test -A supabase/functions/_shared/staff-email-function.check.ts
//
// Ce qui est vérifié, par la porte d'entrée (jeton + corps JSON), comme un vrai appel :
//   · 401 sans jeton ou avec un jeton invalide ; 403 pour un salarié, un chef d'équipe, un
//     administrateur archivé, le support BEMEXO ; jamais un appel à Resend dans ces cas ;
//   · le destinataire vient de la base, même si la requête en propose un autre ;
//   · le vrai email.ts ajoute le lien et les en-têtes de désabonnement ;
//   · plafond (429 + message exact), PDF invalide, désabonné, absence de la migration
//     (rien ne part, aucune erreur pour « état »), absence de clé d'envoi (rien n'est réservé) ;
//   · Resend qui refuse (422) ou qui répond mal (500) : « non envoyé » / « incertain », UN seul appel ;
//   · aucun journal de la fonction ne contient d'adresse, de texte de message ni de PDF.
import { fakePdfBase64, makeWorld, reserveInMemory, ADMIN, ADMIN2, ARCHIVE, CO, LUCAS, NINA, SARA, SUPPORT, type World } from './staff-email-fake.ts';

type Row = Record<string, unknown>;

const URL_BASE = 'http://supabase.test';
Deno.env.set('SUPABASE_URL', URL_BASE);
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'cle-service-factice');
Deno.env.set('EMAIL_UNSUBSCRIBE_SECRET', 'secret-factice');
Deno.env.set('RESEND_API_KEY', 'cle-resend-factice');

const TOKENS: Record<string, string> = {
  'jwt-admin': ADMIN, 'jwt-admin2': ADMIN2, 'jwt-archive': ARCHIVE, 'jwt-support': SUPPORT, 'jwt-worker': LUCAS, 'jwt-lead': NINA,
};

let w: World = makeWorld();
/** La migration est-elle appliquée ? (sinon les tables et fonctions neuves répondent comme PostgREST le fait.) */
let migrated = true;
/** Support : la table existe-t-elle ? */
let supportTable = true;
const resendCalls: { body: Row; headers: Record<string, string> }[] = [];
let resendStatus = 200;
const otherHosts: string[] = [];
const consoleOut: string[] = [];

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

/** Filtres PostgREST utiles ici : eq, in, is. */
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [k, raw] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    const dot = raw.indexOf('.'); const op = raw.slice(0, dot); const val = raw.slice(dot + 1);
    const cur = row[k];
    if (op === 'eq') { if (String(cur) !== val) return false; continue; }
    if (op === 'is') { if (!(val === 'null' ? cur == null : String(cur) === val)) return false; continue; }
    if (op === 'in') {
      const list = val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''));
      if (!list.includes(String(cur))) return false;
      continue;
    }
    throw new Error(`filtre non simulé : ${k}=${raw}`);
  }
  return true;
}

const missingTable = (name: string) => reply(404, { code: 'PGRST205', message: `Could not find the table 'public.${name}' in the schema cache` });
const missingFn = (name: string) => reply(404, { code: 'PGRST202', message: `Could not find the function public.${name} in the schema cache` });

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : String(input));
  const method = (init?.method || req?.method || 'GET').toUpperCase();
  const headers = new Headers(init?.headers || req?.headers);
  const bodyText = init?.body != null ? String(init.body) : req ? await req.text() : '';
  const body = bodyText ? JSON.parse(bodyText) : undefined;

  if (url.host === 'api.resend.com') {
    resendCalls.push({ body, headers: Object.fromEntries(headers) });
    return reply(resendStatus, resendStatus < 300 ? { id: 'fake' } : { message: 'détail avec lucas@example.com' });
  }
  if (url.origin !== URL_BASE) { otherHosts.push(url.href); return reply(599, { message: 'hôte inattendu' }); }

  if (url.pathname === '/auth/v1/user') {
    const tok = (headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const id = TOKENS[tok];
    return id ? reply(200, { id, aud: 'authenticated', role: 'authenticated', email: `${id}@example.com` }) : reply(401, { msg: 'invalid token' });
  }
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    const fn = url.pathname.slice('/rest/v1/rpc/'.length);
    if (!migrated) return missingFn(fn);
    if (fn === 'staff_email_used_today') return reply(200, w.journal.filter((j) => j.company_id === body.p_company && j.day === w.day && j.status !== 'failed').length);
    if (fn === 'staff_email_reserve') return reply(200, reserveInMemory(w, { companyId: body.p_company, sentBy: body.p_sent_by, kind: body.p_kind, cap: body.p_cap, items: body.p_items }));
    if (fn === 'staff_email_finish') {
      const j = w.journal.find((x) => x.id === body.p_id && x.company_id === body.p_company && x.status === 'reserved');
      if (j) { j.status = body.p_status; j.reason = body.p_reason; }
      return reply(200, !!j);
    }
    return missingFn(fn);
  }
  if (!url.pathname.startsWith('/rest/v1/')) return reply(404, { message: 'inconnu' });
  const table = url.pathname.slice('/rest/v1/'.length);
  if (method !== 'GET') return reply(405, { message: `écriture inattendue sur ${table}` });
  const params = url.searchParams;
  let rows: Row[];
  switch (table) {
    case 'users': {
      // La table users : la ligne du salarié, complétée par son profil (rôle, entreprise, actif).
      const base: Row[] = w.users.map((u) => ({ ...u, ...(w.profiles[u.id] ?? {}) }));
      for (const [id, p] of Object.entries(w.profiles)) if (!w.users.some((u) => u.id === id)) base.push({ id, ...p });
      rows = base; break;
    }
    case 'companies': rows = Object.entries(w.companies).map(([id, c]) => ({ id, ...c })); break;
    case 'support_staff':
      if (!supportTable) return missingTable('support_staff');
      rows = [...w.support].map((user_id) => ({ user_id })); break;
    case 'email_unsubscribes_v2':
      if (!migrated) return missingTable(table);
      rows = [...w.unsub].map((s) => { const [email, kind] = s.split('|'); return { email, kind }; }); break;
    default: return missingTable(table);
  }
  const out = rows.filter((r) => matches(r, params));
  const cols = (params.get('select') || '*').split(',').map((c) => c.trim());
  const project = (r: Row) => (cols.includes('*') ? { ...r } : Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
  return reply(200, out.map(project), { 'Content-Range': `0-${Math.max(0, out.length - 1)}/${out.length}` });
}

// ── La fonction, chargée avec Deno.serve et fetch détournés ──────────────────
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
    const spec = new URL(['..', 'send-staff-email', 'index.ts'].join('/'), import.meta.url).href;
    await import(spec);
  } finally {
    Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: realServe });
  }
  if (!handler) throw new Error('Deno.serve non appelé');
  return handler;
}

// Tout ce que la fonction écrit dans ses journaux est relevé.
for (const k of ['log', 'warn', 'error', 'info'] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => { consoleOut.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); if (k === 'error' && false) orig(...a); };
}

async function call(body: unknown, token: string | null = 'jwt-admin', method = 'POST', extraHeaders: Record<string, string> = {}) {
  const h = await loadFunction();
  const res = await h(new Request('http://fonction.test/send-staff-email', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  }));
  const text = await res.text();
  return { status: res.status, json: (text && text[0] === '{' ? JSON.parse(text) : text) as Row, headers: res.headers };
}

function fresh() {
  w = makeWorld(); migrated = true; supportTable = true; resendCalls.length = 0; resendStatus = 200; otherHosts.length = 0; consoleOut.length = 0;
}
function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
function ok(c: unknown, msg: string) { if (!c) throw new Error(msg); }
const OPTS = { sanitizeOps: false, sanitizeResources: false };
const MONDAY = '2026-10-19';
const planning = (ids: string[], extra: Row = {}) => ({ action: 'planning', week_start: MONDAY, items: ids.map((id) => ({ user_id: id, mime: 'application/pdf', content_base64: fakePdfBase64(id) })), ...extra });
const results = (r: { json: Row }) => r.json.results as { user_id: string; outcome: string; reason?: string; message: string }[];

Deno.test({ ...OPTS, name: 'Porte d’entrée — méthode, jeton, rôle', async fn() {
  fresh();
  const opt = await call(undefined, null, 'OPTIONS');
  eq(opt.status, 200, 'OPTIONS : 200 (CORS)');
  ok(opt.headers.get('access-control-allow-origin') === '*', 'CORS');
  eq((await call(undefined, 'jwt-admin', 'GET')).status, 405, 'GET : 405');
  eq((await call({ action: 'etat' }, null)).status, 401, 'sans jeton : 401');
  eq((await call({ action: 'etat' }, 'jeton-inconnu')).status, 401, 'jeton invalide : 401');
  for (const [who, tok] of [['salarié', 'jwt-worker'], ['chef d’équipe', 'jwt-lead'], ['administrateur archivé', 'jwt-archive'], ['support BEMEXO', 'jwt-support']]) {
    const r = await call({ action: 'message', user_ids: [LUCAS], message: 'Bonjour' }, tok);
    eq(r.status, 403, `${who} : 403`);
    eq((await call({ action: 'etat' }, tok)).status, 403, `${who} : l’état est refusé aussi`);
  }
  eq(resendCalls.length, 0, 'aucun appel à Resend');
  eq(w.journal.length, 0, 'aucune place prise');
  eq((await call('{pas du json', 'jwt-admin')).status, 400, 'corps illisible : 400');
  eq((await call({ action: 'inconnue' })).status, 400, 'action inconnue : 400');
  eq(otherHosts, [], 'aucun appel vers un hôte inattendu');
} });

Deno.test({ ...OPTS, name: 'État — compteur, adresses, désabonnés (jamais d’adresse renvoyée)', async fn() {
  fresh();
  const r = await call({ action: 'etat' });
  eq(r.status, 200, 'ok');
  eq([r.json.available, r.json.cap, r.json.used, r.json.remaining], [true, 50, 0, 50], 'disponible, 0 sur 50');
  ok(!JSON.stringify(r.json).includes('@'), 'aucune adresse dans la réponse');
  eq(r.json.can_reply, true, 'can_reply : l’entreprise a une adresse (l’aperçu du bureau dit « Répondez à cet e-mail »)');
  const sara = (r.json.workers as Row[]).find((x) => x.id === SARA);
  eq(sara?.unsubscribed, { 'planning-hebdo': true, 'message-bureau': true }, 'Sara désabonnée');
  eq(resendCalls.length, 0, 'lire l’état n’envoie rien');
} });

Deno.test({ ...OPTS, name: 'Planning — le destinataire vient de la base, le vrai email.ts ajoute le désabonnement', async fn() {
  fresh();
  const body = planning([LUCAS], { to: 'pirate@example.com', cc: ['pirate@example.com'], company_id: 'c0000000-0000-4000-8000-000000000002', from: 'pdg@example.com' });
  (body.items[0] as Row).email = 'pirate@example.com';
  const r = await call(body);
  eq(r.status, 200, 'ok');
  eq(results(r).map((x) => x.outcome), ['sent'], 'envoyé');
  eq(resendCalls.length, 1, 'UN appel à Resend');
  const sent = resendCalls[0].body;
  eq(sent.to, ['lucas@example.com'], 'destinataire = adresse de la BASE (jamais celle de la requête)');
  ok(!JSON.stringify(resendCalls[0]).includes('pirate') && !JSON.stringify(resendCalls[0]).includes('pdg@'), 'rien de la requête ne sort chez Resend');
  eq(sent.reply_to, 'bureau@martin-menuiserie.example.com', 'Reply-To : l’entreprise');
  eq(sent.from, 'BEMEXO <notifications@bemexo.com>', 'expéditeur BEMEXO');
  eq(sent.cc, undefined, 'pas de copie');
  eq((sent.attachments as Row[]).map((a) => a.filename), ['planning-semaine-2026-10-19.pdf'], 'nom du fichier fabriqué par la fonction');
  const hd = sent.headers as Record<string, string>;
  ok(hd['List-Unsubscribe']?.includes('/functions/v1/email-unsubscribe?') && hd['List-Unsubscribe']?.includes('k=planning-hebdo'), 'List-Unsubscribe (famille planning-hebdo)');
  eq(hd['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click', 'désabonnement en un clic');
  ok(String(sent.html).includes('https://bemexo.com/desabonnement?') && String(sent.html).includes('Se désabonner'), 'lien « Se désabonner » dans le corps');
  ok(String(sent.text).includes('Se désabonner'), 'version texte');
  eq(resendCalls[0].headers['authorization'], 'Bearer cle-resend-factice', 'la clé passe par l’en-tête Authorization (jamais ailleurs)');
  ok(String(resendCalls[0].headers['idempotency-key']).startsWith('staff-email-'), 'clé d’idempotence');
  eq(w.journal.map((j) => [j.kind, j.status]), [['planning-hebdo', 'sent']], 'journal');
  eq(otherHosts, [], 'aucun appel vers un hôte inattendu');
} });

Deno.test({ ...OPTS, name: 'Doublon — le renvoi d’un planning (PDF différent octet pour octet) dans la minute n’envoie qu’un e-mail', async fn() {
  fresh();
  const mk = (label: string) => ({ action: 'planning', week_start: MONDAY, items: [{ user_id: LUCAS, mime: 'application/pdf', content_base64: fakePdfBase64(label) }] });
  const a = await call(mk('généré à 10:00:01 ID 1'));
  const b = await call(mk('généré à 10:00:02 ID 2'));
  eq([results(a)[0].outcome, results(b)[0].outcome, results(b)[0].reason], ['sent', 'skipped', 'doublon'], 'deuxième envoi : doublon, malgré un PDF différent');
  eq([resendCalls.length, w.journal.length, b.json.used], [1, 1, 1], 'UN seul appel à Resend, une seule place du plafond');
  w.clockMs += 61_000;
  eq(results(await call(mk('encore un autre')))[0].outcome, 'sent', 'plus d’une minute plus tard : accepté de nouveau');
} });

Deno.test({ ...OPTS, name: 'Message — modèle fixe, un e-mail par destinataire, désabonnés écartés', async fn() {
  fresh();
  const r = await call({ action: 'message', user_ids: [LUCAS, NINA, SARA], message: '<script>x</script>\nRéunion demain.' });
  eq(r.status, 200, 'ok');
  eq(results(r).map((x) => x.reason ?? x.outcome), ['sent', 'sent', 'desabonne'], 'Sara (désabonnée) est écartée avec sa raison');
  eq(resendCalls.map((c) => c.body.to), [['lucas@example.com'], ['nina@example.com']], 'un e-mail par destinataire, jamais à Sara');
  for (const c of resendCalls) {
    ok(!String(c.body.html).includes('<script>') && String(c.body.html).includes('&lt;script&gt;'), 'HTML du message échappé');
    ok((c.body.headers as Row)['List-Unsubscribe'] && String((c.body.headers as Row)['List-Unsubscribe']).includes('k=message-bureau'), 'désabonnement message-bureau');
    ok(!('attachments' in c.body) || c.body.attachments === undefined, 'pas de pièce jointe');
  }
  const solo = await call({ action: 'message', user_ids: [SARA], message: 'Seule' });
  eq(results(solo)[0].reason, 'desabonne', 'message à UNE personne désabonnée : bloqué');
  ok(results(solo)[0].message.includes('contactez-la autrement'), 'avec explication');
  eq(resendCalls.length, 2, 'toujours deux appels en tout');
} });

Deno.test({ ...OPTS, name: 'Refus : PDF invalide, semaine invalide, texte trop long — rien ne part, rien n’est réservé', async fn() {
  fresh();
  const bad = planning([LUCAS]); (bad.items[0] as Row).content_base64 = btoa('MZ' + 'x'.repeat(100) + '%%EOF');
  const r = await call(bad);
  eq(results(r)[0].reason, 'pdf-invalide', 'PDF invalide : refusé');
  eq((await call(planning([LUCAS], { week_start: '2026-10-21' }))).status, 400, 'semaine invalide : 400');
  eq((await call({ action: 'message', user_ids: [LUCAS], message: 'x'.repeat(501) })).status, 400, '501 caractères : 400');
  eq([resendCalls.length, w.journal.length], [0, 0], 'rien envoyé, rien réservé');
  const big = await call(JSON.stringify({ action: 'message', user_ids: [LUCAS], message: 'a', pad: 'x'.repeat(13 * 1024 * 1024) }));
  eq(big.status, 413, 'demande de plus de 12 Mo : 413 sans même la lire');
} });

Deno.test({ ...OPTS, name: 'Plafond — 429 et message exact quand les 50 envois du jour sont faits', async fn() {
  fresh();
  for (let i = 0; i < 50; i++) w.journal.push({ id: `j${i}`, company_id: CO, kind: 'message-bureau', user_id: null, mask: 'a***@b.fr', rhash: String(i).padStart(64, '0'), chash: 'a'.repeat(64), day: w.day, status: 'sent', reason: null, created_ms: w.clockMs - 3_600_000 });
  const r = await call({ action: 'message', user_ids: [LUCAS], message: 'Encore un' });
  eq(r.status, 429, '429');
  eq(r.json.error, 'Limite quotidienne atteinte (50). Réessayez demain.', 'message exact');
  eq(resendCalls.length, 0, 'aucun appel à Resend');
  const e = await call({ action: 'etat' });
  eq([e.json.used, e.json.remaining], [50, 0], 'l’état dit 50 sur 50');
} });

Deno.test({ ...OPTS, name: 'Migration pas appliquée : état « pas disponible » sans erreur, envoi refusé, rien ne part', async fn() {
  fresh(); migrated = false;
  const e = await call({ action: 'etat' });
  eq([e.status, e.json], [200, { available: false }], 'état : 200 { available: false }');
  const s = await call({ action: 'message', user_ids: [LUCAS], message: 'Bonjour' });
  eq([s.status, s.json.available], [503, false], 'envoi : 503 « pas encore disponible »');
  const p = await call(planning([LUCAS]));
  eq(p.status, 503, 'planning : 503');
  eq(resendCalls.length, 0, 'aucun appel à Resend');
  // Le lot 5 (support) pas appliqué non plus : personne n'est support, un administrateur envoie normalement.
  fresh(); supportTable = false;
  eq((await call({ action: 'message', user_ids: [LUCAS], message: 'Bonjour' })).status, 200, 'sans table support_staff : un administrateur envoie normalement');
} });

Deno.test({ ...OPTS, name: 'Clé d’envoi absente : refusé AVANT de réserver une place', async fn() {
  fresh();
  const key = Deno.env.get('RESEND_API_KEY');
  Deno.env.set('RESEND_API_KEY', ''); // vide = absent pour la fonction
  try {
    const r = await call({ action: 'message', user_ids: [LUCAS], message: 'Bonjour' });
    eq(r.status, 500, '500 « Envoi d’e-mail non configuré »');
    ok(String(r.json.error).includes('non configuré') && !JSON.stringify(r.json).includes('cle-resend'), 'message sans secret');
    eq(w.journal.length, 0, 'aucune place du plafond consommée');
    eq((await call({ action: 'etat' })).status, 200, 'l’état reste lisible');
  } finally { Deno.env.set('RESEND_API_KEY', key!); }
} });

Deno.test({ ...OPTS, name: 'Resend refuse (422) ou répond mal (500) : non envoyé / incertain, UN seul appel, aucun renvoi', async fn() {
  fresh(); resendStatus = 422;
  const a = await call({ action: 'message', user_ids: [LUCAS], message: 'Un' });
  eq(results(a)[0].outcome, 'failed', '422 : non envoyé');
  eq(resendCalls.length, 1, 'un appel');
  eq(a.json.used, 0, 'la place est rendue');
  resendStatus = 500;
  const b = await call({ action: 'message', user_ids: [LUCAS], message: 'Deux' });
  eq(results(b)[0].outcome, 'uncertain', '500 : incertain');
  eq(resendCalls.length, 2, 'un appel de plus (un par demande, jamais de relance)');
  eq(b.json.used, 1, 'la place est gardée');
  eq(w.journal.map((j) => [j.status, j.reason]), [['failed', 'refus-service'], ['uncertain', 'incertain-http']], 'journal : statut et code court');
  ok(!JSON.stringify([a.json, b.json]).includes('détail'), 'le corps de la réponse de Resend n’est jamais renvoyé');
} });

Deno.test({ ...OPTS, name: 'Rafale : 8 demandes simultanées, jamais plus de 50 e-mails', async fn() {
  fresh();
  const ids: string[] = [];
  for (let i = 0; i < 70; i++) {
    const id = `10000000-0000-4000-8000-${String(500 + i).padStart(12, '0')}`;
    ids.push(id); w.users.push({ id, company_id: CO, role: 'worker', is_active: true, first_name: `R${i}`, email: `r${i}@example.com` });
  }
  const rs = await Promise.all(Array.from({ length: 8 }, (_, k) => call({ action: 'message', user_ids: ids.slice(k * 8, k * 8 + 12), message: `Rafale ${k}` })));
  ok(resendCalls.length <= 50, `jamais plus de 50 appels à Resend (vu : ${resendCalls.length})`);
  eq(resendCalls.length, 50, 'le plafond est utilisé en entier');
  ok(rs.some((r) => results(r).some((x) => x.reason === 'limite')), 'certains reçoivent « Limite quotidienne atteinte »');
} });

Deno.test({ ...OPTS, name: 'Aucun journal de la fonction ne contient adresse, message ou PDF', async fn() {
  fresh();
  const secret = 'Texte-confidentiel-du-patron';
  const pdf = fakePdfBase64('contenu-secret');
  await call({ action: 'message', user_ids: [LUCAS, NINA], message: secret });
  await call({ action: 'planning', week_start: MONDAY, items: [{ user_id: LUCAS, mime: 'application/pdf', content_base64: pdf }] });
  resendStatus = 500;
  await call({ action: 'message', user_ids: [LUCAS], message: `${secret} 2` });
  await call('{pas du json');
  const dump = consoleOut.join('\n') + JSON.stringify(w.journal);
  ok(consoleOut.length > 0, `la fonction journalise bien quelque chose (${consoleOut.length} lignes)`);
  ok(!dump.includes('confidentiel') && !dump.includes('contenu-secret') && !dump.includes(pdf.slice(0, 24)), 'ni le message ni le PDF');
  ok(!/@example\.com/.test(dump.replace(/\*\*\*@example\.com/g, '')), 'aucune adresse complète (seulement « l***@example.com » dans le journal)');
  ok(!dump.includes('cle-resend-factice') && !dump.includes('cle-service-factice') && !dump.includes('secret-factice'), 'aucune clé');
} });
