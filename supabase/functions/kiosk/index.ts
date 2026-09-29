// Edge Function : kiosk — la borne de pointage QR (lot 1).
//
// UNE SEULE FONCTION, QUATRE PUBLICS, CHACUN SON CONTRÔLE :
//
//   BUREAU (jeton d'un admin connecté)
//     create_pairing  → code à 6 chiffres, valable 10 minutes
//     revoke          → retire une borne, immédiatement
//     settings        → options (planning, GPS) et horaires d'ouverture
//
//   TABLETTE (aucun compte : le code d'appairage, puis son jeton de borne)
//     pair            → échange le code contre un jeton + la graine du QR
//     sync            → « je suis toujours là » ; relit réglages et planning
//
//   SALARIÉ (le QR, puis son propre jeton)
//     ticket          → vérifie le code du QR, rend un ticket de 5 minutes
//                       (le temps de se connecter si besoin)
//     punch           → arrivée ou départ, AU NOM DU SALARIÉ
//
// LE POINTAGE N'EST PAS RÉÉCRIT. L'arrivée est une insertion dans
// `active_sessions`, le départ un appel à `stop_active_session`, tous deux faits
// avec le jeton du salarié — donc ses policies, ses triggers, l'arrondi au
// quart d'heure, le mois clôturé : exactement le chemin de l'appli.
//
// L'interrupteur `companies.kiosk_enabled` est vérifié à CHAQUE action : une
// entreprise qui ne l'a pas n'obtient rien, pas même un code.
//
// Déploiement : `supabase functions deploy kiosk --no-verify-jwt`
// (la tablette et le premier appel du salarié n'ont pas de jeton ; les actions
// qui en demandent un le vérifient elles-mêmes).
//
// Secret recommandé : KIOSK_SECRET (sinon la clé service sert de clé serveur ;
// la changer obligerait à réappairer les tablettes).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  deriveSeed, fromBase64Url, sha256Hex, toBase64Url, verifyCode,
  KIOSK_DIGITS, KIOSK_STEP_SECONDS,
} from '../_shared/kiosk-code.ts';
import {
  checkScan, decideAction, parisDate, parisTime, REFUSAL_MESSAGES,
} from '../_shared/kiosk-rules.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const refuse = (code: keyof typeof REFUSAL_MESSAGES | string, status = 400, extra: Record<string, unknown> = {}) =>
  json({ error: (REFUSAL_MESSAGES as Record<string, string>)[code] || code, code, ...extra }, status);

const PAIRING_TTL_MS = 10 * 60 * 1000;
const TICKET_TTL_MS = 5 * 60 * 1000;
const MAX_PAIR_FAILURES = 10;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVER_KEY = Deno.env.get('KIOSK_SECRET') || SERVICE_KEY;

const enc = new TextEncoder();

async function hmacB64(msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(SERVER_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg))));
}

function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Code d'appairage à 6 chiffres, tiré uniformément. */
function sixDigits(): string {
  const buf = new Uint32Array(1);
  let n: number;
  do { crypto.getRandomValues(buf); n = buf[0]; } while (n >= 4294000000);
  return String(n % 1_000_000).padStart(6, '0');
}

async function companyEnabled(admin: SupabaseClient, companyId: string): Promise<boolean> {
  const { data } = await admin.from('companies').select('kiosk_enabled').eq('id', companyId).maybeSingle();
  return !!(data as { kiosk_enabled?: boolean } | null)?.kiosk_enabled;
}

async function callerFromJwt(admin: SupabaseClient, req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await admin.from('users')
    .select('id, company_id, role, is_active, first_name').eq('id', user.id).maybeSingle();
  if (!profile) return null;
  return { token, profile: profile as { id: string; company_id: string; role: string; is_active: boolean | null; first_name: string | null } };
}

async function loadSettings(admin: SupabaseClient, companyId: string) {
  const { data } = await admin.from('kiosk_settings')
    .select('show_planning, require_gps, active_from, active_until').eq('company_id', companyId).maybeSingle();
  const s = (data || {}) as { show_planning?: boolean; require_gps?: boolean; active_from?: string | null; active_until?: string | null };
  return {
    show_planning: !!s.show_planning,
    require_gps: !!s.require_gps,
    active_from: s.active_from ? s.active_from.slice(0, 5) : null,
    active_until: s.active_until ? s.active_until.slice(0, 5) : null,
  };
}

// ── BUREAU ──────────────────────────────────────────────────────────────────

async function adminAction(admin: SupabaseClient, req: Request, action: string, body: Record<string, unknown>) {
  const caller = await callerFromJwt(admin, req);
  if (!caller) return json({ error: 'Non authentifié' }, 401);
  const { profile } = caller;
  if (profile.role !== 'admin' || profile.is_active === false) return json({ error: "Réservé à l'administrateur" }, 403);
  if (!(await companyEnabled(admin, profile.company_id))) return refuse('kiosk_disabled', 403);

  if (action === 'create_pairing') {
    const name = String(body.name || '').trim().slice(0, 60) || 'Borne';
    let worksiteId = body.worksite_id ? String(body.worksite_id) : null;
    if (worksiteId) {
      const { data: w } = await admin.from('worksites').select('id').eq('id', worksiteId).eq('company_id', profile.company_id).maybeSingle();
      if (!w) return json({ error: 'Lieu inconnu' }, 400);
    } else {
      // Sans lieu choisi : le lieu « Autre » que chaque entreprise possède.
      const { data: w } = await admin.from('worksites').select('id')
        .eq('company_id', profile.company_id).eq('client_name', 'Autre').limit(1).maybeSingle();
      worksiteId = (w as { id: string } | null)?.id ?? null;
    }
    // Un code actif est unique : on retire au sort en cas de collision.
    let code = '';
    for (let i = 0; i < 5; i++) {
      code = sixDigits();
      const { count } = await admin.from('kiosk_pairings').select('id', { count: 'exact', head: true })
        .eq('code_hash', await sha256Hex(code)).is('used_at', null).gt('expires_at', new Date().toISOString());
      if (!count) break;
    }
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
    const { error } = await admin.from('kiosk_pairings').insert({
      company_id: profile.company_id, code_hash: await sha256Hex(code), name,
      worksite_id: worksiteId, created_by: profile.id, expires_at: expiresAt,
    });
    if (error) { console.error('[kiosk] pairing', error); return json({ error: 'Création impossible' }, 500); }
    return json({ code, expires_at: expiresAt });
  }

  if (action === 'revoke') {
    const { data, error } = await admin.from('kiosks').update({ revoked_at: new Date().toISOString() })
      .eq('id', String(body.kiosk_id || '')).eq('company_id', profile.company_id).is('revoked_at', null).select('id');
    if (error) return json({ error: 'Retrait impossible' }, 500);
    return json({ success: true, revoked: (data || []).length });
  }

  if (action === 'settings') {
    const hhmm = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : null);
    const row = {
      company_id: profile.company_id,
      show_planning: body.show_planning === true,
      require_gps: body.require_gps === true,
      active_from: hhmm(body.active_from),
      active_until: hhmm(body.active_until),
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from('kiosk_settings').upsert(row, { onConflict: 'company_id' });
    if (error) return json({ error: 'Enregistrement impossible' }, 500);
    return json({ success: true, settings: await loadSettings(admin, profile.company_id) });
  }

  return json({ error: 'Action inconnue' }, 400);
}

// ── TABLETTE ────────────────────────────────────────────────────────────────

async function pair(admin: SupabaseClient, req: Request, body: Record<string, unknown>) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'inconnue';
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: fails } = await admin.from('kiosk_pair_failures').select('id', { count: 'exact', head: true })
    .eq('ip', ip).gt('created_at', since);
  if ((fails || 0) >= MAX_PAIR_FAILURES) return json({ error: 'Trop d’essais. Réessayez dans quelques minutes.' }, 429);

  const code = String(body.code || '').replace(/\D/g, '');
  const { data: p } = code.length === 6
    ? await admin.from('kiosk_pairings').select('id, company_id, name, worksite_id, created_by')
      .eq('code_hash', await sha256Hex(code)).is('used_at', null).gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const pairing = p as { id: string; company_id: string; name: string; worksite_id: string | null; created_by: string | null } | null;
  if (!pairing) {
    await admin.from('kiosk_pair_failures').insert({ ip });
    return json({ error: 'Code incorrect ou expiré.' }, 400);
  }
  if (!(await companyEnabled(admin, pairing.company_id))) return refuse('kiosk_disabled', 403);

  // Le code est CONSOMMÉ avant de créer la borne : deux tablettes qui tapent le
  // même code au même instant n'en obtiennent qu'une.
  const { data: claimed } = await admin.from('kiosk_pairings').update({ used_at: new Date().toISOString() })
    .eq('id', pairing.id).is('used_at', null).select('id');
  if (!claimed || claimed.length === 0) return json({ error: 'Code déjà utilisé.' }, 409);

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const lat = num(body.lat), lng = num(body.lng), acc = num(body.accuracy);
  const token = randomToken();
  const salt = randomToken(16);
  const { data: k, error } = await admin.from('kiosks').insert({
    company_id: pairing.company_id, name: pairing.name, worksite_id: pairing.worksite_id,
    token_hash: await sha256Hex(token), seed_salt: salt,
    latitude: lat != null && lng != null ? lat : null,
    longitude: lat != null && lng != null ? lng : null,
    accuracy_m: lat != null && lng != null && acc != null ? Math.round(acc) : null,
    created_by: pairing.created_by, last_seen_at: new Date().toISOString(),
  }).select('id').single();
  if (error || !k) { console.error('[kiosk] pair', error); return json({ error: 'Appairage impossible' }, 500); }
  const kioskId = (k as { id: string }).id;
  await admin.from('kiosk_pairings').update({ kiosk_id: kioskId }).eq('id', pairing.id);

  const seed = await deriveSeed(SERVER_KEY, kioskId, salt);
  const { data: c } = await admin.from('companies').select('name').eq('id', pairing.company_id).maybeSingle();
  return json({
    kiosk_id: kioskId, token, seed: toBase64Url(seed),
    step: KIOSK_STEP_SECONDS, digits: KIOSK_DIGITS,
    kiosk_name: pairing.name, company_name: (c as { name?: string } | null)?.name || '',
    settings: await loadSettings(admin, pairing.company_id),
  });
}

async function kioskFromToken(admin: SupabaseClient, body: Record<string, unknown>) {
  const { data } = await admin.from('kiosks')
    .select('id, company_id, name, token_hash, revoked_at')
    .eq('id', String(body.kiosk_id || '')).maybeSingle();
  const k = data as { id: string; company_id: string; name: string; token_hash: string; revoked_at: string | null } | null;
  if (!k || k.token_hash !== await sha256Hex(String(body.token || ''))) return null;
  return k;
}

async function sync(admin: SupabaseClient, body: Record<string, unknown>) {
  const k = await kioskFromToken(admin, body);
  if (!k) return json({ error: 'Borne inconnue', revoked: true }, 401);
  if (k.revoked_at) return json({ error: REFUSAL_MESSAGES.kiosk_revoked, revoked: true }, 410);
  if (!(await companyEnabled(admin, k.company_id))) return json({ error: REFUSAL_MESSAGES.kiosk_disabled, disabled: true }, 403);
  await admin.from('kiosks').update({ last_seen_at: new Date().toISOString() }).eq('id', k.id);

  const settings = await loadSettings(admin, k.company_id);
  const { data: c } = await admin.from('companies').select('name').eq('id', k.company_id).maybeSingle();

  // Planning du jour : prénom + horaire, RIEN D'AUTRE (ni heures faites, ni
  // chantier, ni paie). Seulement si l'entreprise l'a demandé.
  let planning: { first_name: string; start: string | null; end: string | null }[] = [];
  if (settings.show_planning) {
    const { data: rows } = await admin.from('planning')
      .select('estimated_start, estimated_end, absence_type, user:users!user_id(first_name, is_active)')
      .eq('company_id', k.company_id).eq('work_date', parisDate(Date.now())).is('absence_type', null);
    type Row = { estimated_start: string | null; estimated_end: string | null; user: { first_name: string | null; is_active: boolean | null } | null };
    const seen = new Set<string>();
    planning = ((rows || []) as unknown as Row[])
      .filter((r) => r.user && r.user.is_active !== false && r.user.first_name)
      .map((r) => ({ first_name: r.user!.first_name!, start: r.estimated_start?.slice(0, 5) ?? null, end: r.estimated_end?.slice(0, 5) ?? null }))
      .filter((r) => { const key = `${r.first_name}|${r.start}|${r.end}`; if (seen.has(key)) return false; seen.add(key); return true; })
      .sort((a, b) => (a.start || '99').localeCompare(b.start || '99') || a.first_name.localeCompare(b.first_name));
  }
  return json({ revoked: false, kiosk_name: k.name, company_name: (c as { name?: string } | null)?.name || '', settings, planning });
}

// ── SALARIÉ ─────────────────────────────────────────────────────────────────

async function ticket(admin: SupabaseClient, body: Record<string, unknown>) {
  const kioskId = String(body.k || '');
  const code = String(body.c || '');
  const { data } = await admin.from('kiosks')
    .select('id, company_id, name, seed_salt, revoked_at, latitude, longitude').eq('id', kioskId).maybeSingle();
  const k = data as { id: string; company_id: string; name: string; seed_salt: string; revoked_at: string | null; latitude: number | null; longitude: number | null } | null;
  if (!k) return refuse('kiosk_unknown', 404);
  if (k.revoked_at) return refuse('kiosk_revoked', 410);
  if (!(await companyEnabled(admin, k.company_id))) return refuse('kiosk_disabled', 403);
  const seed = await deriveSeed(SERVER_KEY, k.id, k.seed_salt);
  if ((await verifyCode(seed, code, Date.now())) === null) return refuse('code_invalid', 400);

  const payload = toBase64Url(enc.encode(JSON.stringify({ k: k.id, exp: Date.now() + TICKET_TTL_MS })));
  const settings = await loadSettings(admin, k.company_id);
  const { data: c } = await admin.from('companies').select('name').eq('id', k.company_id).maybeSingle();
  return json({
    ticket: `${payload}.${await hmacB64(`kiosk-ticket|${payload}`)}`,
    kiosk_name: k.name,
    company_name: (c as { name?: string } | null)?.name || '',
    // Le téléphone ne demande la position QUE si elle sera réellement contrôlée.
    needs_gps: settings.require_gps && k.latitude != null && k.longitude != null,
  });
}

async function punch(admin: SupabaseClient, req: Request, body: Record<string, unknown>) {
  // 1) Le ticket : signé par nous, pas expiré.
  const [payload, sig] = String(body.ticket || '').split('.');
  if (!payload || !sig || sig !== await hmacB64(`kiosk-ticket|${payload}`)) return refuse('ticket_invalid', 400);
  let t: { k: string; exp: number };
  try { t = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))); } catch { return refuse('ticket_invalid', 400); }
  if (!t.k || !(t.exp > Date.now())) return refuse('ticket_invalid', 400);

  // 2) Le salarié : connecté, actif, de la même entreprise.
  const caller = await callerFromJwt(admin, req);
  if (!caller) return json({ error: 'Connectez-vous pour pointer.', code: 'auth' }, 401);
  const { profile, token } = caller;

  const { data: kd } = await admin.from('kiosks')
    .select('id, company_id, name, worksite_id, revoked_at, latitude, longitude').eq('id', t.k).maybeSingle();
  const kiosk = kd as { id: string; company_id: string; name: string; worksite_id: string | null; revoked_at: string | null; latitude: number | null; longitude: number | null } | null;
  const settings = kiosk ? await loadSettings(admin, kiosk.company_id) : { require_gps: false };
  const { data: last } = await admin.from('kiosk_punches').select('created_at')
    .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle();

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const lat = num(body.lat), lng = num(body.lng);
  const now = Date.now();
  const refusal = checkScan({
    kiosk, user: { company_id: profile.company_id, is_active: profile.is_active },
    companyKioskEnabled: kiosk ? await companyEnabled(admin, kiosk.company_id) : false,
    lastPunchAt: (last as { created_at: string } | null)?.created_at ?? null,
    requireGps: settings.require_gps,
    // La position n'est QUE comparée, jamais enregistrée.
    position: lat != null && lng != null ? { lat, lng, accuracy: num(body.accuracy) } : null,
    nowMs: now,
  });
  if (refusal) return refuse(refusal, refusal === 'double_scan' ? 409 : 403);

  // 3) Arrivée ou départ : même règle que l'appli.
  const today = parisDate(now);
  const { data: sess } = await admin.from('active_sessions').select('work_date').eq('user_id', profile.id).maybeSingle();
  const action = decideAction(sess as { work_date: string } | null, today);
  if (action === 'stale_session') return refuse('stale_session', 409);

  // Le client AU NOM DU SALARIÉ : ses policies, ses triggers, son auth.uid().
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let worksiteName: string | null = null;
  let range: { start: string; end: string } | null = null;

  if (action === 'arrival') {
    const { data: plans } = await admin.from('planning').select('id, worksite_id')
      .eq('user_id', profile.id).eq('work_date', today).is('absence_type', null);
    const planRows = (plans || []) as { id: string; worksite_id: string | null }[];
    // Le lieu de la borne ; à défaut (lieu supprimé), le chantier prévu du jour.
    const worksiteId = kiosk!.worksite_id || planRows.find((p) => p.worksite_id)?.worksite_id || null;
    if (!worksiteId) return json({ error: 'Aucun lieu rattaché à cette borne. Prévenez le bureau.', code: 'no_worksite' }, 409);
    const planningId = planRows.find((p) => p.worksite_id === worksiteId)?.id ?? null;
    const { error } = await asUser.from('active_sessions').insert({
      user_id: profile.id, company_id: profile.company_id, worksite_id: worksiteId,
      planning_id: planningId, work_date: today,
    });
    if (error) {
      if (error.code === '23505') return refuse('double_scan', 409);
      if (/clôturé/i.test(error.message)) return refuse('month_closed', 409);
      console.error('[kiosk] arrival', error);
      return json({ error: 'Arrivée non enregistrée. Réessayez.' }, 500);
    }
    const { data: w } = await admin.from('worksites').select('client_name').eq('id', worksiteId).maybeSingle();
    worksiteName = (w as { client_name?: string } | null)?.client_name ?? null;
  } else {
    const { data, error } = await asUser.rpc('stop_active_session', { p_end: null });
    if (error) {
      if (error.code === 'BT001' || /m[êe]me quart d/i.test(error.message)) return refuse('too_short', 409);
      if (/clôturé/i.test(error.message)) return refuse('month_closed', 409);
      // Deux scans simultanés : le premier a déjà fermé le pointage.
      if (/aucun pointage en cours/i.test(error.message)) return refuse('double_scan', 409);
      console.error('[kiosk] departure', error);
      return json({ error: 'Départ non enregistré. Réessayez.' }, 500);
    }
    const row = (Array.isArray(data) ? data[0] : data) as { start_time: string; end_time: string } | null;
    if (row) range = { start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5) };
  }

  await admin.from('kiosk_punches').insert({ company_id: kiosk!.company_id, kiosk_id: kiosk!.id, user_id: profile.id, kind: action });
  await admin.from('kiosks').update({ last_seen_at: new Date().toISOString() }).eq('id', kiosk!.id);

  return json({
    kind: action, time: parisTime(now), first_name: profile.first_name || '',
    kiosk_name: kiosk!.name, worksite_name: worksiteName, range,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Méthode non prise en charge' }, 405);
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || '');
    switch (action) {
      case 'create_pairing': case 'revoke': case 'settings':
        return await adminAction(admin, req, action, body);
      case 'pair': return await pair(admin, req, body);
      case 'sync': return await sync(admin, body);
      case 'ticket': return await ticket(admin, body);
      case 'punch': return await punch(admin, req, body);
      default: return json({ error: 'Action inconnue' }, 400);
    }
  } catch (e) {
    console.error('[kiosk]', e);
    return json({ error: 'Erreur serveur' }, 500);
  }
});
