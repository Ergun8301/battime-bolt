// Edge Function : kiosk — la borne de pointage QR (lot 1).
//
// UNE SEULE FONCTION, QUATRE PUBLICS, CHACUN SON CONTRÔLE :
//
//   BUREAU (jeton d'un admin connecté)
//     create_pairing  → code à 6 chiffres, valable 10 minutes (+ son id)
//     cancel_pairing  → lot 11 : périme ce code tout de suite (la fenêtre
//                       « Borne » se ferme ou affiche un code neuf)
//     revoke          → déconnecte une tablette, immédiatement
//     settings        → horaires d'ouverture (écran noir la nuit), facultatifs
//
//   TABLETTE (aucun compte : le code d'appairage, puis son jeton de borne)
//     pair            → échange le code contre un jeton + la graine du QR.
//                       Lot 11 : UNE tablette par entreprise — relier une
//                       nouvelle tablette déconnecte les précédentes
//     unpair          → lot 11 : la tablette se déconnecte elle-même (appui
//                       long sur le logo, puis « Oui, déconnecter »)
//     sync            → « je suis toujours là » ; relit les réglages (et
//                       l'ancien planning du jour, pour les tablettes qui ont
//                       encore l'ancienne page en cache)
//     board           → lot 9 : le planning de la SEMAINE, lecture seule —
//                       prénom, nom, chantier, ville, horaires prévus, « en
//                       cours depuis » (voir _shared/kiosk-board.ts)
//
//   SALARIÉ (le QR, puis son propre jeton)
//     ticket          → vérifie le code du QR, rend un ticket de 5 minutes
//                       (le temps de se connecter si besoin)
//     punch           → arrivée ou départ, AU NOM DU SALARIÉ
//
// Lot 11 : plus aucun contrôle de position (GPS). La tablette n'envoie plus la
// sienne, le téléphone non plus ; les colonnes `require_gps`, `latitude`,
// `longitude`, `accuracy_m` restent en base mais ne sont plus ni écrites ni lues.
//
// LE POINTAGE N'EST PAS RÉÉCRIT. L'arrivée est une insertion dans
// `active_sessions`, le départ un appel à `finish_active_session` (lot 9 : la
// même fermeture que l'appli ; à défaut, l'ancien `stop_active_session`), tous
// deux faits avec le jeton du salarié — donc ses policies, ses triggers,
// l'arrondi, le mois clôturé : exactement le chemin de l'appli.
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
  arrivalPlace, checkScan, decideAction, isClosedError, pairThrottled, parisDate, parisTime, rpcMissing,
  REFUSAL_MESSAGES, type PlannedSlot,
} from '../_shared/kiosk-rules.ts';
import {
  buildBoard, parisWeek,
  type BoardPlanning, type BoardSession, type BoardUser, type BoardWorksite,
} from '../_shared/kiosk-board.ts';

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
  // Une panne de lecture n'est PAS « borne désactivée » : on la fait remonter
  // (500), sinon la tablette effacerait son appairage sur un simple incident.
  const { data, error } = await admin.from('companies').select('kiosk_enabled').eq('id', companyId).maybeSingle();
  if (error) throw error;
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
    .select('show_planning, active_from, active_until').eq('company_id', companyId).maybeSingle();
  const s = (data || {}) as { show_planning?: boolean; active_from?: string | null; active_until?: string | null };
  return {
    show_planning: !!s.show_planning,
    // Lot 11 : le contrôle GPS n'existe plus. La clé reste (toujours fausse)
    // pour les pages déjà en cache qui la lisent.
    require_gps: false,
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
    // Lot 11 : la fenêtre « Borne » n'envoie plus ni nom ni lieu (une seule
    // tablette par entreprise, rattachée au lieu « Autre » ; l'arrivée va sur le
    // chantier prévu du salarié, voir `arrivalPlace`). Nom et lieu restent
    // acceptés pour une ancienne page encore ouverte.
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
    // Les codes encore valables d'un autre admin ne sont PAS périmés : le patron
    // et la secrétaire peuvent avoir la fenêtre ouverte en même temps.
    const { data: row, error } = await admin.from('kiosk_pairings').insert({
      company_id: profile.company_id, code_hash: await sha256Hex(code), name,
      worksite_id: worksiteId, created_by: profile.id, expires_at: expiresAt,
    }).select('id').single();
    if (error) { console.error('[kiosk] pairing', error); return json({ error: 'Création impossible' }, 500); }
    return json({ code, expires_at: expiresAt, pairing_id: (row as { id: string } | null)?.id ?? null });
  }

  if (action === 'cancel_pairing') {
    // Lot 11 : un code n'est valable que tant qu'il est affiché. Fermer la
    // fenêtre (ou passer au code suivant) le périme tout de suite : moins de
    // codes valables en circulation, moins de chances d'en deviner un.
    const nowIso = new Date().toISOString();
    const { data, error } = await admin.from('kiosk_pairings').update({ expires_at: nowIso })
      .eq('id', String(body.pairing_id || '')).eq('company_id', profile.company_id)
      .is('used_at', null).gt('expires_at', nowIso).select('id');
    // Un id mal formé (22P02) : rien à périmer.
    if (error && error.code !== '22P02') { console.error('[kiosk] cancel_pairing', error); return json({ error: 'Annulation impossible' }, 500); }
    return json({ success: true, cancelled: (data || []).length });
  }

  if (action === 'revoke') {
    const { data, error } = await admin.from('kiosks').update({ revoked_at: new Date().toISOString() })
      .eq('id', String(body.kiosk_id || '')).eq('company_id', profile.company_id).is('revoked_at', null).select('id');
    if (error) return json({ error: 'Retrait impossible' }, 500);
    return json({ success: true, revoked: (data || []).length });
  }

  if (action === 'settings') {
    const hhmm = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : null);
    // Lot 9 : `show_planning` n'est plus écrit (la borne affiche toujours la
    // semaine). Lot 11 : `require_gps` non plus (plus de contrôle GPS). Les
    // colonnes restent ; une ligne existante garde ses valeurs, une nouvelle
    // prend celles par défaut de la base (faux).
    const row = {
      company_id: profile.company_id,
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
  // Lot 11 : en plus du plafond par adresse, un plafond toutes adresses
  // confondues (un code deviné remplacerait désormais la vraie tablette).
  const [fromIp, everywhere] = await Promise.all([
    admin.from('kiosk_pair_failures').select('id', { count: 'exact', head: true }).eq('ip', ip).gt('created_at', since),
    admin.from('kiosk_pair_failures').select('id', { count: 'exact', head: true }).gt('created_at', since),
  ]);
  if (pairThrottled(fromIp.count || 0, everywhere.count || 0)) return json({ error: 'Trop d’essais. Réessayez dans quelques minutes.' }, 429);

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

  // Lot 11 : la position de la tablette n'est plus relevée (plus de contrôle GPS).
  const token = randomToken();
  const salt = randomToken(16);
  const { data: k, error } = await admin.from('kiosks').insert({
    company_id: pairing.company_id, name: pairing.name, worksite_id: pairing.worksite_id,
    token_hash: await sha256Hex(token), seed_salt: salt,
    latitude: null, longitude: null, accuracy_m: null,
    created_by: pairing.created_by, last_seen_at: new Date().toISOString(),
  }).select('id, created_at').single();
  if (error || !k) { console.error('[kiosk] pair', error); return json({ error: 'Appairage impossible' }, 500); }
  const { id: kioskId, created_at: createdAt } = k as { id: string; created_at: string };
  await admin.from('kiosk_pairings').update({ kiosk_id: kioskId }).eq('id', pairing.id);

  // Lot 11 — UNE tablette par entreprise : la dernière reliée gagne. Les
  // autres tablettes encore actives de CETTE entreprise sont déconnectées
  // (revoked_at, jamais supprimées : leurs scans restent). Seulement celles
  // reliées AVANT celle-ci : deux tablettes reliées au même instant ne se
  // déconnectent pas l'une l'autre. Un échec ici ne fait pas échouer
  // l'appairage (le bureau garde « Déconnecter la tablette »).
  const { error: replaceErr } = await admin.from('kiosks').update({ revoked_at: new Date().toISOString() })
    .eq('company_id', pairing.company_id).is('revoked_at', null).neq('id', kioskId).lt('created_at', createdAt);
  if (replaceErr) console.error('[kiosk] pair: anciennes tablettes', replaceErr);

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
  // Même règle : une panne n'est pas « borne retirée » (seul un id mal formé,
  // 22P02, veut dire « borne inconnue »).
  const { data, error } = await admin.from('kiosks')
    .select('id, company_id, name, token_hash, revoked_at')
    .eq('id', String(body.kiosk_id || '')).maybeSingle();
  if (error && error.code !== '22P02') throw error;
  const k = data as { id: string; company_id: string; name: string; token_hash: string; revoked_at: string | null } | null;
  if (!k || k.token_hash !== await sha256Hex(String(body.token || ''))) return null;
  return k;
}

// Lot 11 — la tablette se déconnecte elle-même (« Oui, déconnecter » après
// l'appui long). Avec son propre jeton : elle ne peut déconnecter qu'elle.
// Sans cet appel, le bureau la verrait encore « reliée ». Rejouable.
async function unpair(admin: SupabaseClient, body: Record<string, unknown>) {
  const k = await kioskFromToken(admin, body);
  if (!k) return json({ error: 'Borne inconnue', revoked: true }, 401);
  if (!k.revoked_at) {
    const { error } = await admin.from('kiosks').update({ revoked_at: new Date().toISOString() })
      .eq('id', k.id).is('revoked_at', null);
    if (error) { console.error('[kiosk] unpair', error); return json({ error: 'Déconnexion impossible' }, 500); }
  }
  return json({ success: true, revoked: true });
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
  // chantier, ni paie). Seulement si l'entreprise l'a demandé. Lot 9 : la
  // nouvelle borne ne le lit plus (action `board`) ; gardé tel quel pour les
  // tablettes qui ont encore l'ancienne page en cache.
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

// Lot 9 — le planning de la semaine, en lecture seule. Mêmes contrôles que
// `sync` (jeton → 401, borne retirée → 410, interrupteur → 403), mais AUCUNE
// écriture : la tablette l'appelle toutes les 30 secondes.
//
// Rien ne vient du corps de la requête à part le jeton : ni entreprise, ni
// salarié, ni date. Chaque lecture porte `company_id` = celle de la borne, avec
// des colonnes explicites ; `buildBoard` ne garde ensuite que la liste blanche.
async function board(admin: SupabaseClient, body: Record<string, unknown>) {
  const k = await kioskFromToken(admin, body);
  if (!k) return json({ error: 'Borne inconnue', revoked: true }, 401);
  if (k.revoked_at) return json({ error: REFUSAL_MESSAGES.kiosk_revoked, revoked: true }, 410);
  if (!(await companyEnabled(admin, k.company_id))) return json({ error: REFUSAL_MESSAGES.kiosk_disabled, disabled: true }, 403);

  const nowMs = Date.now();
  const week = parisWeek(nowMs);
  const [u, p, s] = await Promise.all([
    // Les mêmes salariés que la grille du bureau (admin-planning.tsx) : poseurs
    // et chefs d'équipe actifs, par prénom.
    admin.from('users').select('id, first_name, last_name')
      .eq('company_id', k.company_id).in('role', ['worker', 'lead']).eq('is_active', true).order('first_name'),
    admin.from('planning')
      .select('id, user_id, worksite_id, work_date, estimated_start, estimated_end, absence_type, position, created_at')
      .eq('company_id', k.company_id).gte('work_date', week.days[0]).lte('work_date', week.days[6]),
    admin.from('active_sessions').select('user_id, worksite_id, planning_id, work_date, started_at')
      .eq('company_id', k.company_id),
  ]);
  if (u.error || p.error || s.error) {
    console.error('[kiosk] board', u.error || p.error || s.error);
    return json({ error: 'Planning indisponible' }, 500);
  }
  const planning = (p.data || []) as BoardPlanning[];
  const sessions = (s.data || []) as BoardSession[];
  // Seulement les chantiers cités cette semaine, et seulement ceux de l'entreprise.
  const siteIds = [...new Set([...planning, ...sessions].map((r) => r.worksite_id).filter((id): id is string => !!id))];
  let worksites: BoardWorksite[] = [];
  if (siteIds.length) {
    const { data, error } = await admin.from('worksites').select('id, client_name, city')
      .eq('company_id', k.company_id).in('id', siteIds);
    if (error) { console.error('[kiosk] board worksites', error); return json({ error: 'Planning indisponible' }, 500); }
    worksites = (data || []) as BoardWorksite[];
  }
  return json(buildBoard({ users: (u.data || []) as BoardUser[], planning, worksites, sessions, nowMs }));
}

// ── SALARIÉ ─────────────────────────────────────────────────────────────────

async function ticket(admin: SupabaseClient, body: Record<string, unknown>) {
  const kioskId = String(body.k || '');
  const code = String(body.c || '');
  const { data } = await admin.from('kiosks')
    .select('id, company_id, name, seed_salt, revoked_at').eq('id', kioskId).maybeSingle();
  const k = data as { id: string; company_id: string; name: string; seed_salt: string; revoked_at: string | null } | null;
  if (!k) return refuse('kiosk_unknown', 404);
  if (k.revoked_at) return refuse('kiosk_revoked', 410);
  if (!(await companyEnabled(admin, k.company_id))) return refuse('kiosk_disabled', 403);
  const seed = await deriveSeed(SERVER_KEY, k.id, k.seed_salt);
  if ((await verifyCode(seed, code, Date.now())) === null) return refuse('code_invalid', 400);

  const payload = toBase64Url(enc.encode(JSON.stringify({ k: k.id, exp: Date.now() + TICKET_TTL_MS })));
  const { data: c } = await admin.from('companies').select('name').eq('id', k.company_id).maybeSingle();
  return json({
    ticket: `${payload}.${await hmacB64(`kiosk-ticket|${payload}`)}`,
    kiosk_name: k.name,
    company_name: (c as { name?: string } | null)?.name || '',
    // Lot 11 : plus de contrôle GPS. Toujours faux (une page /pointer encore
    // en cache lit ce champ : elle ne demandera donc jamais la position).
    needs_gps: false,
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
    .select('id, company_id, name, worksite_id, revoked_at').eq('id', t.k).maybeSingle();
  const kiosk = kd as { id: string; company_id: string; name: string; worksite_id: string | null; revoked_at: string | null } | null;
  const { data: last } = await admin.from('kiosk_punches').select('created_at')
    .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle();

  // Lot 11 : plus de contrôle de position. Une position envoyée par une
  // ancienne page est ignorée (ni comparée, ni enregistrée).
  const now = Date.now();
  const refusal = checkScan({
    kiosk, user: { company_id: profile.company_id, is_active: profile.is_active },
    companyKioskEnabled: kiosk ? await companyEnabled(admin, kiosk.company_id) : false,
    lastPunchAt: (last as { created_at: string } | null)?.created_at ?? null,
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
  let cancelled = false;

  if (action === 'arrival') {
    const { data: plans } = await admin.from('planning').select('id, worksite_id, estimated_start')
      .eq('user_id', profile.id).eq('work_date', today).is('absence_type', null);
    // Lot 11 : la tablette est rattachée au lieu « Autre » (plus de choix du
    // lieu). Est-ce le cas de celle-ci ? (Les anciennes bornes gardent leur chantier.)
    let kioskIsOther = !kiosk!.worksite_id;
    if (kiosk!.worksite_id) {
      const { data: kw } = await admin.from('worksites').select('client_name')
        .eq('id', kiosk!.worksite_id).eq('company_id', kiosk!.company_id).maybeSingle();
      kioskIsOther = !kw || (kw as { client_name?: string | null }).client_name === 'Autre';
    }
    // Un seul chantier prévu aujourd'hui → l'arrivée va dessus ; sinon le lieu
    // de la borne, à défaut le premier chantier prévu (règle d'avant).
    const place = arrivalPlace(kiosk!.worksite_id, kioskIsOther, (plans || []) as PlannedSlot[]);
    if (!place) return json({ error: 'Aucun lieu rattaché à cette borne. Prévenez le bureau.', code: 'no_worksite' }, 409);
    const worksiteId = place.worksiteId;
    const { error } = await asUser.from('active_sessions').insert({
      user_id: profile.id, company_id: profile.company_id, worksite_id: worksiteId,
      planning_id: place.planningId, work_date: today,
    });
    if (error) {
      if (error.code === '23505') return refuse('double_scan', 409);
      if (isClosedError(error.message)) return refuse('month_closed', 409);
      console.error('[kiosk] arrival', error);
      return json({ error: 'Arrivée non enregistrée. Réessayez.' }, 500);
    }
    const { data: w } = await admin.from('worksites').select('client_name').eq('id', worksiteId).maybeSingle();
    worksiteName = (w as { client_name?: string } | null)?.client_name ?? null;
  } else {
    // Lot 9 : « une seule logique » de fermeture, celle de l'appli. Moins d'une
    // minute → le chrono est supprimé et rien n'est enregistré (cancelled).
    // Aucune position à la borne : positions nulles, comme avant.
    const fin = await asUser.rpc('finish_active_session', { p_end: null, p_lat: null, p_lng: null, p_accuracy: null });
    if (rpcMissing(fin.error)) {
      // Migration pas encore passée : l'ancien chemin, inchangé.
      const { data, error } = await asUser.rpc('stop_active_session', { p_end: null });
      if (error) {
        if (error.code === 'BT001' || /m[êe]me quart d/i.test(error.message)) return refuse('too_short', 409);
        if (isClosedError(error.message)) return refuse('month_closed', 409);
        // Deux scans simultanés : le premier a déjà fermé le pointage.
        if (/aucun pointage en cours/i.test(error.message)) return refuse('double_scan', 409);
        console.error('[kiosk] departure', error);
        return json({ error: 'Départ non enregistré. Réessayez.' }, 500);
      }
      const row = (Array.isArray(data) ? data[0] : data) as { start_time: string; end_time: string } | null;
      if (row) range = { start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5) };
    } else if (fin.error) {
      if (isClosedError(fin.error.message)) return refuse('month_closed', 409);
      if (/aucun pointage en cours/i.test(fin.error.message)) return refuse('double_scan', 409);
      console.error('[kiosk] departure', fin.error);
      return json({ error: 'Départ non enregistré. Réessayez.' }, 500);
    } else {
      const row = (Array.isArray(fin.data) ? fin.data[0] : fin.data) as
        { start_time: string | null; end_time: string | null; cancelled: boolean | null } | null;
      if (row?.cancelled) cancelled = true;
      else if (row?.start_time && row?.end_time) range = { start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5) };
    }
  }

  await admin.from('kiosk_punches').insert({ company_id: kiosk!.company_id, kiosk_id: kiosk!.id, user_id: profile.id, kind: action });
  await admin.from('kiosks').update({ last_seen_at: new Date().toISOString() }).eq('id', kiosk!.id);

  return json({
    kind: action, time: parisTime(now), first_name: profile.first_name || '',
    kiosk_name: kiosk!.name, worksite_name: worksiteName, range,
    // Lot 9 : départ moins d'une minute après l'arrivée → rien d'enregistré.
    ...(cancelled ? { cancelled: true } : {}),
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
      case 'create_pairing': case 'cancel_pairing': case 'revoke': case 'settings':
        return await adminAction(admin, req, action, body);
      case 'pair': return await pair(admin, req, body);
      case 'unpair': return await unpair(admin, body);
      case 'sync': return await sync(admin, body);
      case 'board': return await board(admin, body);
      case 'ticket': return await ticket(admin, body);
      case 'punch': return await punch(admin, req, body);
      default: return json({ error: 'Action inconnue' }, 400);
    }
  } catch (e) {
    console.error('[kiosk]', e);
    return json({ error: 'Erreur serveur' }, 500);
  }
});
