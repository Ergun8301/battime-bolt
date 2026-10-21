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
//     fixed_status / fixed_enable / fixed_disable / fixed_regenerate /
//     fixed_point / fixed_radius
//                     → lot 12 : le QR FIXE imprimable (option, désactivée par
//                       défaut). Voir « QR FIXE » plus bas et _shared/fixed-qr.ts
//     pair_lookup     → lot 11 (appairage en un geste) : le patron a scanné le
//                       QR de la tablette ; rend le nom de l'entreprise et 4
//                       codes de vérification (lecture seule, sans effet)
//     pair_confirm    → il touche le code affiché sur SA tablette : la demande
//                       est confirmée (ou refusée). Rien n'est relié encore
//
//   TABLETTE (aucun compte : le code d'appairage, puis son jeton de borne)
//     pair            → échange le code contre un jeton + la graine du QR.
//                       Lot 11 : UNE tablette par entreprise — relier une
//                       nouvelle tablette déconnecte les précédentes
//     pair_request    → lot 11 (appairage en un geste) : la tablette non reliée
//                       demande un identifiant de demande SIGNÉ (10 min, rien
//                       n'est écrit en base) pour son QR « /admin#borne=… »
//     pair_status     → la tablette demande « mon patron a-t-il confirmé ? » avec
//                       son secret d'appareil ; à la confirmation elle reçoit son
//                       jeton et sa graine (même réponse que `pair`)
//     unpair          → lot 11 : la tablette se déconnecte elle-même (appui
//                       long sur le logo, puis « Oui, déconnecter »)
//     sync            → « je suis toujours là » ; relit les réglages (et
//                       l'ancien planning du jour, pour les tablettes qui ont
//                       encore l'ancienne page en cache). Lot 30 : peut joindre
//                       `client_state` (l'état de l'écran de la tablette :
//                       verrou d'écran, icône installée, plein écran, en ligne,
//                       version), validé puis écrit dans kiosks.client_state
//     board           → lot 9 : le planning de la SEMAINE, lecture seule —
//                       prénom, nom, chantier, ville, horaires prévus, « en
//                       cours depuis » (voir _shared/kiosk-board.ts)
//
//   SALARIÉ (le QR, puis son propre jeton)
//     ticket          → vérifie le code du QR, rend un ticket de 5 minutes
//                       (le temps de se connecter si besoin). Lot 12 : aussi le
//                       jeton du QR fixe (f) ; les essais REFUSÉS du QR fixe
//                       sont plafonnés (jamais un QR valable)
//     punch           → arrivée ou départ, AU NOM DU SALARIÉ. Lot 12 : avec un
//                       ticket de QR fixe, la position lue au scan est exigée
//                       et comparée ici ; elle n'est JAMAIS enregistrée.
//                       Elle est DÉCLARÉE par le téléphone : un frein, pas une
//                       preuve de présence
//
// Lot 11 : plus aucun contrôle de position (GPS). La tablette n'envoie plus la
// sienne, le téléphone non plus ; les colonnes `require_gps`, `latitude`,
// `longitude`, `accuracy_m` restent en base mais ne sont plus ni écrites ni lues.
// Lot 12 : la position revient pour le SEUL QR fixe imprimé (lue une fois au
// scan, vérifiée ici, jamais gardée). Le QR de la tablette, qui change chaque
// minute, reste exactement comme avant : aucune position.
//
// Lot 12 — AVANT LA MIGRATION 20261011150000_lot12_qr_fixe_position.sql, tout
// marche comme avant : chaque lecture des colonnes neuves (kiosks.kind…)
// échoue proprement (schemaMissing) et retombe sur l'ancien chemin ;
// fixed_status répond « indisponible » (le bureau ne voit rien).
//
// LE POINTAGE N'EST PAS RÉÉCRIT. L'arrivée est une insertion dans
// `active_sessions`, le départ un appel à `finish_active_session` (lot 9 : la
// même fermeture que l'appli ; à défaut, l'ancien `stop_active_session`), tous
// deux faits avec le jeton du salarié — donc ses policies, ses triggers,
// l'arrondi, le mois clôturé : exactement le chemin de l'appli.
//
// Lot 11 (appairage en un geste) — AVANT LA MIGRATION 20261013090000_lot11_appairage_un_geste.sql
// (tables kiosk_pair_approvals et kiosk_pair_throttle), les quatre actions
// pair_request / pair_status / pair_lookup / pair_confirm répondent
// `200 {available:false}` et rien ne s'écrit : la tablette garde son écran du
// code à 6 chiffres. Le code à 6 chiffres (`pair`) et son compteur d'échecs
// global (kiosk_pair_failures) ne sont PAS touchés. Voir « APPAIRAGE EN UN GESTE ».
//
// Lot 30 (borne robuste) — AVANT LA MIGRATION 20261013170000_lot30_borne_robuste.sql
// (colonnes kiosks.client_state et client_state_at), `sync` répond exactement comme
// avant : l'écriture groupée (« vu à » + état) échoue proprement (schemaMissing), le « vu à »
// seul est écrit comme avant, et la fonction s'en souvient 10 minutes (pas d'erreur à chaque
// sync) ; rien n'est journalisé ni visible. Un `client_state` invalide (pas un objet, trop
// gros, champ mal typé) est ignoré en entier, sans refuser le `sync`. Jamais de
// texte libre, de jeton ni de position : liste blanche dans _shared/kiosk-client-state.ts.
//
// L'interrupteur `companies.kiosk_enabled` est vérifié à CHAQUE action : une
// entreprise qui ne l'a pas n'obtient rien, pas même un code.
//
// Déploiement : `supabase functions deploy kiosk --no-verify-jwt`
// (la tablette et le premier appel du salarié n'ont pas de jeton ; les actions
// qui en demandent un le vérifient elles-mêmes). Fichiers à emporter avec
// index.ts : _shared/kiosk-code.ts, kiosk-rules.ts, fixed-qr.ts, kiosk-board.ts,
// live-place.ts, (lot 11) kiosk-pair.ts et (lot 30) kiosk-client-state.ts.
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
  schemaMissing, ticketBucket, ticketBucketFull, ticketBucketNext, REFUSAL_MESSAGES, type PlannedSlot, type TicketBucketRow,
} from '../_shared/kiosk-rules.ts';
import {
  checkFixedPosition, fixedQrRef, fixedQrSignature, fixedQrToken, fixedRefusalMessage, parsePosition, parseRadius, safeEqual, siteAcceptsFixed, splitFixedToken,
  FIXED_QR_POINT_MAX_ACCURACY_M, FIXED_QR_RADIUS_DEFAULT_M, FIXED_REFUSAL_MESSAGES, FIXED_SALT_PREFIX, type FixedRefusal,
} from '../_shared/fixed-qr.ts';
import {
  buildChoices, displayCodeFromBytes, formatDisplayCode, normalizeDisplayCode, pairBucket, pairThrottleFull,
  pairThrottleNext, pickDecoys, ridBody, ridDecode, ridEncode, secretFingerprint, isDeviceSecret,
  MAX_PAIR_ADMIN_OPS_PER_COMPANY, MAX_PAIR_REQUESTS_PER_BUCKET, PAIR_CLAIM_GRACE_MS, PAIR_CONFIRM_GRACE_MS, PAIR_REFUSAL_MESSAGES, PAIR_REPLACE_ALIVE_MS,
  PAIR_REPLAY_UNSEEN_MS, PAIR_REPLAY_WINDOW_MS, PAIR_REQUEST_TTL_MS, type PairThrottleRow,
} from '../_shared/kiosk-pair.ts';
import {
  buildBoard, parisWeek,
  type BoardPlanning, type BoardSession, type BoardUser, type BoardWorksite,
} from '../_shared/kiosk-board.ts';
import { parseClientState } from '../_shared/kiosk-client-state.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
// Lot 11 : `no-store` — une réponse peut porter un jeton de borne, jamais mise en cache.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
// Lot 12 : les refus du QR fixe s'ajoutent à ceux de la borne. Lot 11 : ceux de l'appairage en un geste aussi.
const MESSAGES: Record<string, string> = { ...REFUSAL_MESSAGES, ...FIXED_REFUSAL_MESSAGES, ...PAIR_REFUSAL_MESSAGES };
const refuse = (code: keyof typeof REFUSAL_MESSAGES | string, status = 400, extra: Record<string, unknown> = {}) =>
  json({ error: MESSAGES[code] || code, code, ...extra }, status);
// Lot 12 : un refus du QR fixe dont l'entreprise est connue — « Scannez la
// tablette » n'est dit que si une tablette est reliée (voir hasTablet).
const refuseFixed = (code: FixedRefusal, status: number, tablet: boolean | undefined, extra: Record<string, unknown> = {}) =>
  json({ error: fixedRefusalMessage(code, tablet), code, ...extra }, status);

const PAIRING_TTL_MS = 10 * 60 * 1000;
const TICKET_TTL_MS = 5 * 60 * 1000;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVER_KEY = Deno.env.get('KIOSK_SECRET') || SERVICE_KEY;

const enc = new TextEncoder();

async function hmacBytes(msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', enc.encode(SERVER_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

async function hmacB64(msg: string): Promise<string> {
  return toBase64Url(await hmacBytes(msg));
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

/** Le lieu « Autre » que chaque entreprise possède (celui des tablettes et du QR fixe) ; `null` s'il manque. */
async function otherWorksiteId(admin: SupabaseClient, companyId: string): Promise<string | null> {
  const { data } = await admin.from('worksites').select('id')
    .eq('company_id', companyId).eq('client_name', 'Autre').limit(1).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// ── BUREAU ──────────────────────────────────────────────────────────────────

/** Actions du QR fixe permises au bureau même quand la borne est coupée : elles ne font que couper (ou lire). */
const CUT_ONLY_ACTIONS = new Set(['fixed_status', 'fixed_disable', 'fixed_regenerate']);

async function adminAction(admin: SupabaseClient, req: Request, action: string, body: Record<string, unknown>) {
  const caller = await callerFromJwt(admin, req);
  if (!caller) return json({ error: 'Non authentifié' }, 401);
  const { profile } = caller;
  if (profile.role !== 'admin' || profile.is_active === false) return json({ error: "Réservé à l'administrateur" }, 403);
  // Lot 12 : borne coupée par BEMEXO (kiosk_enabled faux) — le bureau garde la
  // main pour COUPER son QR fixe : en lire l'état, le désactiver, le régénérer
  // (le QR imprimé ne doit pas rester valable en attendant qu'on rallume). Tout
  // le reste (l'activer, le point, le rayon, les tablettes) demande la borne allumée.
  const borneOn = await companyEnabled(admin, profile.company_id);
  if (!borneOn && !CUT_ONLY_ACTIONS.has(action)) return refuse('kiosk_disabled', 403);

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
      worksiteId = await otherWorksiteId(admin, profile.company_id);
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
    // Lot 12 : « Déconnecter la tablette » ne retire que des TABLETTES. Une
    // fenêtre du bureau restée ouverte avec l'ancienne version du site (qui
    // prendrait la ligne du QR fixe pour une tablette) ne coupe donc jamais le
    // QR imprimé : seuls fixed_disable / fixed_regenerate le font. Colonne
    // `kind` absente (migration pas passée) : la règle d'avant.
    const cut = (onlyTablets: boolean) => {
      let q = admin.from('kiosks').update({ revoked_at: new Date().toISOString() })
        .eq('id', String(body.kiosk_id || '')).eq('company_id', profile.company_id).is('revoked_at', null);
      if (onlyTablets) q = q.neq('kind', 'fixe');
      return q.select('id');
    };
    let { data, error } = await cut(true);
    if (schemaMissing(error)) ({ data, error } = await cut(false));
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

  // Lot 11 : appairage en un geste. Branches explicites (la fin d'adminAction
  // répond « Action inconnue » à tout le reste). Jamais dans CUT_ONLY_ACTIONS :
  // elles demandent la borne allumée, comme relier une tablette.
  if (action === 'pair_lookup') return await pairLookup(admin, profile, body);
  if (action === 'pair_confirm') return await pairConfirm(admin, profile, body);

  if (action.startsWith('fixed_')) return await fixedAdmin(admin, profile, action, body, borneOn);

  return json({ error: 'Action inconnue' }, 400);
}

// ── QR FIXE (lot 12) ────────────────────────────────────────────────────────
// Une ligne de `kiosks` avec kind = 'fixe' (au plus une active par entreprise,
// index unique partiel). Elle n'a pas de jeton de tablette utilisable (empreinte
// d'un jeton jeté aussitôt) : sync, board et unpair la refusent comme une borne
// inconnue. Son sel commence par « fixe. ». Activer = créer la ligne ;
// désactiver = poser revoked_at ; régénérer = les deux (rien n'est supprimé :
// les pointages faits avec l'ancien QR gardent leur ligne). Le point de
// référence et le rayon vivent dans `kiosk_settings` : ils survivent à une
// régénération.

const FIXED_QR_NAME = 'QR fixe';

interface FixedPoint { lat: number; lng: number; radius: number; accuracy_m: number | null; at: string | null }

/** Point de référence + rayon ; `undefined` = colonnes absentes (migration pas passée). */
async function loadFixedPoint(admin: SupabaseClient, companyId: string): Promise<FixedPoint | null | undefined> {
  const { data, error } = await admin.from('kiosk_settings')
    .select('fixed_qr_latitude, fixed_qr_longitude, fixed_qr_accuracy_m, fixed_qr_point_at, fixed_qr_radius_m')
    .eq('company_id', companyId).maybeSingle();
  if (error) { if (schemaMissing(error)) return undefined; throw error; }
  const s = (data || {}) as { fixed_qr_latitude?: number | string | null; fixed_qr_longitude?: number | string | null; fixed_qr_accuracy_m?: number | null; fixed_qr_point_at?: string | null; fixed_qr_radius_m?: number | null };
  const radius = parseRadius(s.fixed_qr_radius_m) ?? FIXED_QR_RADIUS_DEFAULT_M;
  if (s.fixed_qr_latitude == null || s.fixed_qr_longitude == null) return { lat: NaN, lng: NaN, radius, accuracy_m: null, at: null };
  return { lat: Number(s.fixed_qr_latitude), lng: Number(s.fixed_qr_longitude), radius, accuracy_m: s.fixed_qr_accuracy_m ?? null, at: s.fixed_qr_point_at ?? null };
}
const pointSet = (p: FixedPoint | null | undefined): p is FixedPoint => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

/** La ligne « fixe » active de l'entreprise ; `undefined` = colonne `kind` absente. */
async function activeFixedRow(admin: SupabaseClient, companyId: string) {
  const { data, error } = await admin.from('kiosks')
    .select('id, seed_salt, created_at, last_seen_at, kind')
    .eq('company_id', companyId).eq('kind', 'fixe').is('revoked_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) { if (schemaMissing(error)) return undefined; throw error; }
  return data as { id: string; seed_salt: string; created_at: string; last_seen_at: string | null } | null;
}

/** Une tablette est-elle reliée (non retirée) ? `undefined` = on ne peut pas le savoir (colonne absente, panne). */
async function hasTablet(admin: SupabaseClient, companyId: string): Promise<boolean | undefined> {
  const { count, error } = await admin.from('kiosks').select('id', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('kind', 'tablette').is('revoked_at', null);
  if (error) return undefined;
  return (count || 0) > 0;
}

/** Combien de pointages récents le bureau voit sous le QR fixe. */
const RECENT_FIXED_PUNCHES = 20;

/**
 * Les derniers pointages faits avec un QR fixe, pour le bureau de l'entreprise :
 * qui, arrivée ou départ, quand, « dans la zone : oui ». Jamais de coordonnées
 * (il n'y en a nulle part). « Dans la zone » est la position DÉCLARÉE par le
 * téléphone : l'écran le dit, ce n'est pas une preuve de présence.
 */
async function recentFixedPunches(admin: SupabaseClient, companyId: string) {
  const { data, error } = await admin.from('kiosk_punches').select('user_id, kind, created_at, in_zone')
    .eq('company_id', companyId).not('in_zone', 'is', null)
    .order('created_at', { ascending: false }).limit(RECENT_FIXED_PUNCHES);
  if (error) { console.error('[kiosk] fixed recent', error.code); return []; }
  const punches = (data || []) as { user_id: string; kind: string; created_at: string; in_zone: boolean | null }[];
  if (!punches.length) return [];
  const ids = [...new Set(punches.map((x) => x.user_id))];
  const { data: us } = await admin.from('users').select('id, first_name, last_name').eq('company_id', companyId).in('id', ids);
  const names = new Map(((us || []) as { id: string; first_name: string | null; last_name: string | null }[])
    .map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Salarié']));
  return punches.map((x) => ({ name: names.get(x.user_id) || 'Salarié', kind: x.kind, at: x.created_at, in_zone: x.in_zone === true }));
}

async function fixedStatus(admin: SupabaseClient, companyId: string) {
  const [row, point] = await Promise.all([activeFixedRow(admin, companyId), loadFixedPoint(admin, companyId)]);
  if (row === undefined || point === undefined) return json({ available: false });
  const [{ data: c }, tablet, borneOn, recent] = await Promise.all([
    admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
    hasTablet(admin, companyId),
    companyEnabled(admin, companyId),
    recentFixedPunches(admin, companyId),
  ]);
  let uses7d = 0;
  if (row) {
    const { count } = await admin.from('kiosk_punches').select('id', { count: 'exact', head: true })
      .eq('kiosk_id', row.id).gt('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
    uses7d = count || 0;
  }
  return json({
    available: true,
    enabled: !!row,
    // Faux = borne coupée par BEMEXO : le QR fixe ne marche pas, le bureau peut seulement le couper.
    kiosk_enabled: borneOn,
    // Faux = aucune tablette reliée : le QR fixe est alors le seul pointage en direct.
    has_tablet: tablet,
    company_name: (c as { name?: string } | null)?.name || '',
    // Le jeton est recalculé, jamais lu en base : le bureau peut réimprimer.
    token: row ? await fixedQrToken(SERVER_KEY, row.id, row.seed_salt) : null,
    ref: row ? fixedQrRef(row.id) : null,
    created_at: row?.created_at ?? null,
    last_used_at: row?.last_seen_at ?? null,
    uses_7d: uses7d,
    recent,
    // Le point lui-même n'est pas renvoyé : seulement s'il est posé, sa précision et sa date.
    point: { set: pointSet(point), accuracy_m: pointSet(point) ? point.accuracy_m : null, at: pointSet(point) ? point.at : null },
    radius_m: point?.radius ?? FIXED_QR_RADIUS_DEFAULT_M,
  });
}

async function createFixedRow(admin: SupabaseClient, companyId: string, createdBy: string) {
  // Même lieu que la tablette : « Autre » (l'arrivée va sur le chantier prévu
  // du salarié quand il est unique, voir arrivalPlace).
  return await admin.from('kiosks').insert({
    company_id: companyId, name: FIXED_QR_NAME, worksite_id: await otherWorksiteId(admin, companyId), kind: 'fixe',
    // Aucun jeton de tablette : l'empreinte d'un jeton aléatoire jeté aussitôt.
    token_hash: await sha256Hex(randomToken()), seed_salt: FIXED_SALT_PREFIX + randomToken(16),
    latitude: null, longitude: null, accuracy_m: null, created_by: createdBy, last_seen_at: null,
  }).select('id').single();
}

async function revokeFixedRows(admin: SupabaseClient, companyId: string) {
  return await admin.from('kiosks').update({ revoked_at: new Date().toISOString() })
    .eq('company_id', companyId).eq('kind', 'fixe').is('revoked_at', null).select('id');
}

async function fixedAdmin(admin: SupabaseClient, profile: { id: string; company_id: string }, action: string, body: Record<string, unknown>, borneOn: boolean) {
  const companyId = profile.company_id;
  if (action === 'fixed_status') return await fixedStatus(admin, companyId);

  // Migration absente : rien ne s'écrit, le bureau ne voit pas l'option.
  const current = await activeFixedRow(admin, companyId);
  if (current === undefined) return refuse('fixed_unavailable', 409);

  if (action === 'fixed_enable' || action === 'fixed_regenerate') {
    // Activer (moins sécurisé) et régénérer (l'ancien QR imprimé ne marche plus)
    // demandent une confirmation explicite, donnée à l'écran.
    if (body.confirm !== true) return refuse('confirm_required', 400);
    // Borne coupée : on régénère un QR qui existe (l'ancien cesse de marcher),
    // on n'en crée pas un de plus — activer demande la borne allumée.
    if (!borneOn && !current) return refuse('kiosk_disabled', 403);
    if (action === 'fixed_enable' && current) return await fixedStatus(admin, companyId);
    if (action === 'fixed_regenerate') {
      const { error } = await revokeFixedRows(admin, companyId);
      if (error) { console.error('[kiosk] fixed_regenerate', error); return json({ error: 'Régénération impossible' }, 500); }
    }
    const { error } = await createFixedRow(admin, companyId, profile.id);
    // 23505 : un autre admin vient de l'activer au même instant (index unique) — il est actif.
    if (error && error.code !== '23505') { console.error('[kiosk] fixed_enable', error); return json({ error: 'Activation impossible' }, 500); }
    return await fixedStatus(admin, companyId);
  }

  if (action === 'fixed_disable') {
    const { error } = await revokeFixedRows(admin, companyId);
    if (error) { console.error('[kiosk] fixed_disable', error); return json({ error: 'Désactivation impossible' }, 500); }
    return await fixedStatus(admin, companyId);
  }

  if (action === 'fixed_point') {
    // Le point de référence, posé depuis le téléphone du bureau À L'ENDROIT DU
    // QR. Précision 100 m ou mieux, sinon on le dit et on redemande.
    const pos = parsePosition(body);
    if (!pos) return refuse('position_missing', 400);
    if (pos.accuracy === null || pos.accuracy > FIXED_QR_POINT_MAX_ACCURACY_M) {
      return refuse('point_imprecise', 400, { accuracy_m: pos.accuracy === null ? null : Math.round(pos.accuracy) });
    }
    const { error } = await admin.from('kiosk_settings').upsert({
      company_id: companyId, fixed_qr_latitude: pos.lat, fixed_qr_longitude: pos.lng,
      fixed_qr_accuracy_m: Math.round(pos.accuracy), fixed_qr_point_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' });
    if (error) { console.error('[kiosk] fixed_point', error.code); return json({ error: 'Enregistrement impossible' }, 500); }
    return await fixedStatus(admin, companyId);
  }

  if (action === 'fixed_radius') {
    const radius = parseRadius(body.radius_m);
    if (radius === null) return json({ error: 'Rayon entre 100 et 1 000 m.' }, 400);
    const { error } = await admin.from('kiosk_settings').upsert({
      company_id: companyId, fixed_qr_radius_m: radius, updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' });
    if (error) { console.error('[kiosk] fixed_radius', error.code); return json({ error: 'Enregistrement impossible' }, 500); }
    return await fixedStatus(admin, companyId);
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

  const tablet = await createTablet(admin, {
    companyId: pairing.company_id, name: pairing.name, worksiteId: pairing.worksite_id, createdBy: pairing.created_by,
  });
  if (!tablet) return json({ error: 'Appairage impossible' }, 500);
  await admin.from('kiosk_pairings').update({ kiosk_id: tablet.kiosk_id }).eq('id', pairing.id);
  return json(tablet);
}

/** La réponse que reçoit une tablette qui vient d'être reliée (et que `pair_status` rejoue à l'identique) : jeton, graine du QR, réglages. */
async function tabletReply(
  admin: SupabaseClient,
  kiosk: { id: string; company_id: string; name: string; seed_salt: string },
  token: string,
) {
  const seed = await deriveSeed(SERVER_KEY, kiosk.id, kiosk.seed_salt);
  const { data: c } = await admin.from('companies').select('name').eq('id', kiosk.company_id).maybeSingle();
  return {
    kiosk_id: kiosk.id, token, seed: toBase64Url(seed),
    step: KIOSK_STEP_SECONDS, digits: KIOSK_DIGITS,
    kiosk_name: kiosk.name, company_name: (c as { name?: string } | null)?.name || '',
    settings: await loadSettings(admin, kiosk.company_id),
  };
}

/**
 * Crée la ligne `kiosks` d'une tablette et déconnecte les anciennes — la même
 * fabrication pour le code à 6 chiffres (`pair`) et pour le QR (`pair_status`).
 * `token` n'est donné que par `pair_status` (jeton dérivé, donc rejouable) ;
 * `pair` garde un jeton tiré au hasard. `null` = la ligne n'a pas pu être créée.
 */
async function createTablet(
  admin: SupabaseClient,
  p: { companyId: string; name: string; worksiteId: string | null; createdBy: string | null; token?: string },
) {
  // Lot 11 : la position de la tablette n'est plus relevée (plus de contrôle GPS).
  const token = p.token ?? randomToken();
  const salt = randomToken(16);
  const { data: k, error } = await admin.from('kiosks').insert({
    company_id: p.companyId, name: p.name, worksite_id: p.worksiteId,
    token_hash: await sha256Hex(token), seed_salt: salt,
    latitude: null, longitude: null, accuracy_m: null,
    created_by: p.createdBy, last_seen_at: new Date(Date.now()).toISOString(),
  }).select('id, created_at').single();
  if (error || !k) { console.error('[kiosk] pair', error?.code); return null; }
  const { id: kioskId, created_at: createdAt } = k as { id: string; created_at: string };

  // Lot 11 — UNE tablette par entreprise : la dernière reliée gagne. Les
  // autres tablettes encore actives de CETTE entreprise sont déconnectées
  // (revoked_at, jamais supprimées : leurs scans restent). Seulement celles
  // reliées AVANT celle-ci : deux tablettes reliées au même instant ne se
  // déconnectent pas l'une l'autre. Un échec ici ne fait pas échouer
  // l'appairage (le bureau garde « Déconnecter la tablette »).
  // Lot 12 : seulement les TABLETTES (kind = 'tablette') — relier une tablette
  // ne coupe jamais le QR fixe imprimé. Colonne absente (migration pas passée,
  // donc aucun QR fixe possible) : la règle d'avant, telle quelle.
  const replaceOld = (onlyTablets: boolean) => {
    let q = admin.from('kiosks').update({ revoked_at: new Date().toISOString() })
      .eq('company_id', p.companyId).is('revoked_at', null).neq('id', kioskId).lt('created_at', createdAt);
    if (onlyTablets) q = q.eq('kind', 'tablette');
    return q;
  };
  let { error: replaceErr } = await replaceOld(true);
  if (schemaMissing(replaceErr)) ({ error: replaceErr } = await replaceOld(false));
  if (replaceErr) console.error('[kiosk] pair: anciennes tablettes', replaceErr.code);

  return await tabletReply(admin, { id: kioskId, company_id: p.companyId, name: p.name, seed_salt: salt }, token);
}

// ── APPAIRAGE EN UN GESTE (lot 11) ─────────────────────────────────────────
// La tablette non reliée affiche un QR ; le patron le scanne avec son téléphone,
// touche le code de vérification qu'affiche SA tablette, et c'est fini. Règles
// pures et explications : _shared/kiosk-pair.ts.
//
//   pair_request   (tablette)  identifiant de demande SIGNÉ, 10 min. RIEN n'est
//                              écrit en base (une route publique qui écrirait
//                              grossirait sans fin, sans DELETE pour purger).
//   pair_lookup    (bureau)    nom de l'entreprise + 4 codes ; lecture seule.
//   pair_confirm   (bureau)    la bonne réponse = une ligne dans
//                              kiosk_pair_approvals ; une mauvaise = la demande
//                              est brûlée. NE crée aucune tablette, ne révoque rien.
//   pair_status    (tablette)  avec son secret d'appareil : à la confirmation,
//                              la ligne `kiosks` est créée ICI (l'ancienne tablette
//                              n'est révoquée qu'une fois la nouvelle servie). Le
//                              jeton est DÉRIVÉ (HMAC de l'identifiant et du
//                              secret) : si la réponse se perd, la tablette
//                              redemande et reçoit le même jeton, sans doublon.
//
// Journaux : seulement `error.code`. Jamais le corps, l'identifiant de demande,
// le secret d'appareil, le code, le jeton ni la graine. Aucun DELETE.

interface ApprovalRow {
  rid_hash: string; secret_hash: string; company_id: string; approved_by: string;
  approved_at: string | null; cancelled_at: string | null; claimed_at: string | null; kiosk_id: string | null;
}
const APPROVAL_COLUMNS = 'rid_hash, secret_hash, company_id, approved_by, approved_at, cancelled_at, claimed_at, kiosk_id';

/** Une remise dont la ligne `kiosks` n'est pas (encore) visible : « en cours » pendant 30 s, puis « servie ». */
const PAIR_CLAIM_IN_FLIGHT_MS = 30 * 1000;

const ridMac = async (body: Uint8Array) => (await hmacBytes(`bemexo-pair-rid|${toBase64Url(body)}`)).slice(0, 16);
/** Le code de vérification : le même pour tous les identifiants d'un même secret d'appareil (`sh`). */
const ridCode = async (sh: string) => displayCodeFromBytes(await hmacBytes(`bemexo-pair-code|${sh}`));
const pairToken = async (rid: string, deviceSecret: string) => toBase64Url(await hmacBytes(`bemexo-pair-token|${rid}|${deviceSecret}`));
/**
 * `cf-connecting-ip` seul, posé par la passerelle : le premier `x-forwarded-for`
 * est écrit par le client et ferait tourner le plafond. Sans lui : « inconnue »
 * (alors aucun plafond d'adresse). L'en-tête réel est à confirmer sur la plateforme.
 */
const pairClientIp = (req: Request) => (req.headers.get('cf-connecting-ip') || '').trim() || 'inconnue';

/** L'identifiant de demande s'il est bien formé ET signé par nous, sinon `null`. */
async function parseRid(value: unknown) {
  const d = typeof value === 'string' ? ridDecode(value) : null;
  if (!d || !safeEqual(toBase64Url(await ridMac(d.body)), toBase64Url(d.mac))) return null;
  return { rid: value as string, exp: d.exp, sh: d.sh };
}

/** Table absente (migration pas passée) ou droit retiré (42501) : la voie est « indisponible », jamais un plafond silencieusement perdu. */
const pairUnavailable = (error: { code?: string } | null | undefined) => schemaMissing(error) || error?.code === '42501';

/** Plafond de débit par seau (voir kiosk-pair.ts) : jamais bloquant sur une panne, jamais lié à kiosk_pair_failures. */
async function throttleHit(admin: SupabaseClient, scope: 'req' | 'co', key: string, max: number): Promise<'ok' | 'throttled' | 'missing'> {
  const bucket = pairBucket(scope, await hmacB64(`pair-throttle|${scope}|${key}`));
  const { data, error } = await admin.from('kiosk_pair_throttle').select('hits, window_start').eq('bucket', bucket).maybeSingle();
  if (error) {
    if (pairUnavailable(error)) return 'missing';
    console.error('[kiosk] pair throttle', error.code);
    return 'ok';
  }
  const row = (data as PairThrottleRow | null) ?? null;
  const now = Date.now();
  if (pairThrottleFull(row, now, max)) return 'throttled'; // plein : plus aucune écriture
  const { error: werr } = await admin.from('kiosk_pair_throttle').upsert({ bucket, ...pairThrottleNext(row, now) }, { onConflict: 'bucket' });
  if (werr) {
    if (pairUnavailable(werr)) return 'missing';
    console.error('[kiosk] pair throttle', werr.code);
  }
  return 'ok';
}

/** UNIQUE chemin d'écriture de kiosk_pair_approvals (confirmation, refus, mauvais code). */
async function insertApproval(
  admin: SupabaseClient,
  row: { rid_hash: string; secret_hash: string; company_id: string; approved_by: string; approved_at?: string; cancelled_at?: string },
): Promise<'ok' | 'used' | 'missing' | 'error'> {
  const { error } = await admin.from('kiosk_pair_approvals').insert(row);
  if (!error) return 'ok';
  if (error.code === '23505') return 'used'; // clé primaire : une autre action a gagné au même instant
  if (schemaMissing(error)) return 'missing';
  console.error('[kiosk] pair approval', error.code);
  return 'error';
}

/** La ligne d'approbation d'un identifiant ; `'missing'` = migration pas passée. */
async function readApproval(admin: SupabaseClient, ridHash: string): Promise<ApprovalRow | null | 'missing'> {
  const { data, error } = await admin.from('kiosk_pair_approvals').select(APPROVAL_COLUMNS).eq('rid_hash', ridHash).maybeSingle();
  if (error) {
    if (schemaMissing(error)) return 'missing';
    throw new Error(`pair: lecture des approbations (${error.code})`);
  }
  return (data as ApprovalRow | null) ?? null;
}

/** Le compte est-il du personnel BEMEXO Support ? Lecture seule côté client : le serveur refuse aussi. */
async function supportGuard(admin: SupabaseClient, userId: string): Promise<Response | null> {
  const { data, error } = await admin.from('support_staff').select('user_id').eq('user_id', userId).maybeSingle();
  if (error) {
    if (schemaMissing(error)) return null; // pas de table = pas de personnel support
    console.error('[kiosk] support_staff', error.code);
    return json({ error: 'Erreur serveur' }, 500); // on échoue fermé pour une écriture
  }
  return data ? refuse('support_readonly', 403) : null;
}

/** Contrôles 4 et 5 des actions du bureau : garde support, puis plafond de l'entreprise (un compte support ne consomme pas le débit d'un client). */
async function pairAdminGate(admin: SupabaseClient, profile: { id: string; company_id: string }): Promise<Response | null> {
  const support = await supportGuard(admin, profile.id);
  if (support) return support;
  const hit = await throttleHit(admin, 'co', profile.company_id, MAX_PAIR_ADMIN_OPS_PER_COMPANY);
  if (hit === 'missing') return json({ available: false });
  if (hit === 'throttled') return refuse('pair_throttled', 429);
  return null;
}

/** Contrôles 6 et 7 : identifiant bien formé et signé, pas périmé, pas déjà confirmé ni refusé. */
type CheckedPairRequest = { response: Response } | { response?: undefined; rid: string; exp: number; sh: string; ridHash: string };
async function checkPairRequest(admin: SupabaseClient, body: Record<string, unknown>): Promise<CheckedPairRequest> {
  const parsed = await parseRid(body.request_id);
  if (!parsed) return { response: refuse('pair_request_invalid', 400) };
  // Un peu de marge après la fin : le patron scanne un QR que la tablette vient de renouveler, puis se connecte.
  if (Date.now() >= parsed.exp * 1000 + PAIR_CONFIRM_GRACE_MS) return { response: refuse('pair_request_expired', 410) };
  const ridHash = await sha256Hex(parsed.rid);
  const row = await readApproval(admin, ridHash);
  if (row === 'missing') return { response: json({ available: false }) };
  if (row) return { response: refuse('pair_request_used', 409) };
  return { ...parsed, ridHash };
}

/** Une tablette active de l'entreprise : sa dernière activité (vue, sinon créée) et si elle est « en service » (vue il y a moins de 15 min). */
interface ActiveTablet { createdMs: number; seenMs: number; alive: boolean }

/**
 * TOUTES les tablettes actives de l'entreprise (la règle « une seule » est née
 * après des tablettes déjà reliées : il peut en rester plusieurs, et la remise
 * les révoque toutes). Une seule vivante suffit à parler d'une tablette en service.
 */
async function activeTablets(admin: SupabaseClient, companyId: string): Promise<ActiveTablet[]> {
  const read = (onlyTablets: boolean) => {
    let q = admin.from('kiosks').select('created_at, last_seen_at').eq('company_id', companyId).is('revoked_at', null);
    if (onlyTablets) q = q.eq('kind', 'tablette');
    return q.order('created_at', { ascending: false }).limit(50);
  };
  let { data, error } = await read(true);
  if (schemaMissing(error)) ({ data, error } = await read(false));
  if (error) throw new Error(`pair: lecture des tablettes (${error.code})`);
  const now = Date.now();
  return ((data || []) as { created_at: string; last_seen_at: string | null }[]).map((k) => {
    const createdMs = Date.parse(k.created_at);
    const seenMs = Date.parse(k.last_seen_at || k.created_at);
    return { createdMs, seenMs, alive: Number.isFinite(seenMs) && now - seenMs < PAIR_REPLACE_ALIVE_MS };
  });
}

/**
 * La tablette actuelle de l'entreprise : « en service » si l'une des actives a
 * été vue il y a moins de 15 min. `null` = aucune. L'ancienneté (de la plus
 * récemment vue) est calculée ici (horloge du serveur), pas par le navigateur.
 */
async function currentTablet(admin: SupabaseClient, companyId: string): Promise<{ alive: boolean; seen_ago_s: number | null } | null> {
  const tablets = await activeTablets(admin, companyId);
  if (tablets.length === 0) return null;
  const seen = Math.max(...tablets.map((t) => t.seenMs).filter(Number.isFinite));
  if (!Number.isFinite(seen)) return { alive: false, seen_ago_s: null };
  return { alive: tablets.some((t) => t.alive), seen_ago_s: Math.round(Math.max(0, Date.now() - seen) / 1000) };
}

/** Les 4 codes montrés au patron — déterministes (calculés de `sh`) : on ne les élimine pas en comparant plusieurs appels. */
async function pairChoices(sh: string): Promise<string[]> {
  const real = await ridCode(sh);
  const candidates = await Promise.all(Array.from({ length: 24 }, async (_, k) =>
    displayCodeFromBytes(await hmacBytes(`bemexo-pair-decoy|${sh}|${k}`))));
  const slot = (await hmacBytes(`bemexo-pair-slot|${sh}`))[0] % 4;
  return buildChoices(real, pickDecoys(real, candidates), slot).map(formatDisplayCode);
}

async function companyName(admin: SupabaseClient, companyId: string): Promise<string> {
  const { data } = await admin.from('companies').select('name').eq('id', companyId).maybeSingle();
  return (data as { name?: string } | null)?.name || '';
}

// TABLETTE — « je veux être reliée ».
async function pairRequest(admin: SupabaseClient, req: Request, body: Record<string, unknown>) {
  // Disponible seulement si les deux tables se lisent : un QR qui ne pourra
  // jamais aboutir n'est jamais affiché (la tablette garde alors son écran du code).
  const probe = await admin.from('kiosk_pair_approvals').select('rid_hash').limit(1);
  if (probe.error) {
    if (pairUnavailable(probe.error)) return json({ available: false });
    console.error('[kiosk] pair_request', probe.error.code);
    return json({ error: 'Erreur serveur' }, 500);
  }
  // Plafond par adresse (30 par seau et par 10 min). Sans adresse lisible il
  // n'y en a pas : la sécurité de cette voie n'en dépend pas, et un en-tête
  // absent ne doit pas bloquer toutes les tablettes.
  const ip = pairClientIp(req);
  if (ip !== 'inconnue') {
    const hit = await throttleHit(admin, 'req', ip, MAX_PAIR_REQUESTS_PER_BUCKET);
    if (hit === 'missing') return json({ available: false });
    if (hit === 'throttled') return refuse('pair_throttled', 429);
  } else {
    const throttleProbe = await admin.from('kiosk_pair_throttle').select('bucket').limit(1);
    if (throttleProbe.error && pairUnavailable(throttleProbe.error)) return json({ available: false });
  }

  // La tablette renvoie son secret à chaque renouvellement du QR : le code de
  // vérification reste le même pendant tout l'épisode.
  const fresh = !isDeviceSecret(body.device_secret);
  const deviceSecret = isDeviceSecret(body.device_secret) ? body.device_secret : randomToken(32);
  const sh = await secretFingerprint(deviceSecret);
  const exp = Math.floor(Date.now() / 1000) + PAIR_REQUEST_TTL_MS / 1000;
  let rid = '';
  do { // le fragment ne doit jamais ressembler à un lien d'authentification pour `home-redirect`
    const bytes = ridBody(exp, crypto.getRandomValues(new Uint8Array(8)), fromBase64Url(sh));
    rid = ridEncode(bytes, await ridMac(bytes));
  } while (/access_token/i.test(rid));
  return json({
    available: true,
    request_id: rid,
    ...(fresh ? { device_secret: deviceSecret } : {}),
    display_code: formatDisplayCode(await ridCode(sh)),
    expires_at: new Date(exp * 1000).toISOString(),
    ttl_s: PAIR_REQUEST_TTL_MS / 1000,
  });
}

// TABLETTE — « mon patron a-t-il confirmé ? »
async function pairStatus(admin: SupabaseClient, body: Record<string, unknown>) {
  const parsed = await parseRid(body.request_id);
  // Mal formé, mal signé, périmé : la même réponse (aucun oracle).
  if (!parsed) return json({ status: 'expired' });
  const { rid, exp } = parsed;
  const ridHash = await sha256Hex(rid);
  const found = await readApproval(admin, ridHash);
  if (found === 'missing') return json({ available: false });

  // La ligne ne compte que pour le détenteur du secret d'appareil : sinon elle
  // est traitée comme « pas de ligne » (jamais de différence visible entre
  // « mauvais secret » et « pas encore confirmé »).
  const deviceSecret = isDeviceSecret(body.device_secret) ? body.device_secret : '';
  const fp = deviceSecret ? await secretFingerprint(deviceSecret) : '';
  const row = found && fp && safeEqual(fp, found.secret_hash) ? found : null;
  const now = Date.now();
  if (!row) return json({ status: now >= exp * 1000 ? 'expired' : 'pending' });
  if (row.cancelled_at) return json({ status: 'cancelled' });
  // Une confirmation de dernière seconde reste livrable 3 min après l'expiration.
  if (!row.claimed_at && now >= exp * 1000 + PAIR_CLAIM_GRACE_MS) return json({ status: 'expired' });
  // Borne coupée : rien n'est consommé, la tablette continue de demander.
  if (!(await companyEnabled(admin, row.company_id))) return json({ status: 'suspended' });
  if (row.claimed_at) return await replayDelivery(admin, row, rid, deviceSecret, now);

  // Une tablette VIVANTE reliée depuis la confirmation (par code à 6 chiffres, par exemple) :
  // la remise la révoquerait sans que le patron l'ait vue. La demande est annulée côté
  // tablette (un QR neuf), il reconfirmera avec le second geste. Les tablettes muettes
  // qui se réveillent ne sont pas distinguées (rien ne dit si le patron a accepté de les remplacer).
  const approvedMs = Date.parse(row.approved_at || '');
  if ((await activeTablets(admin, row.company_id)).some((t) => t.alive && t.createdMs > approvedMs && t.createdMs <= now)) return json({ status: 'cancelled' });

  // Remise atomique : une seule interrogation gagne.
  const claimedAt = new Date(now).toISOString();
  const { data: won, error: claimErr } = await admin.from('kiosk_pair_approvals').update({ claimed_at: claimedAt })
    .eq('rid_hash', ridHash).is('claimed_at', null).is('cancelled_at', null).select('rid_hash');
  if (claimErr) { console.error('[kiosk] pair_status', claimErr.code); return json({ error: 'Erreur serveur' }, 500); }
  if (!won || won.length === 0) {
    const again = await readApproval(admin, ridHash);
    return again && again !== 'missing' && again.claimed_at
      ? await replayDelivery(admin, again, rid, deviceSecret, now)
      : json({ status: 'pending' });
  }

  const tablet = await createTablet(admin, {
    companyId: row.company_id, name: 'Borne', worksiteId: await otherWorksiteId(admin, row.company_id),
    createdBy: row.approved_by, token: await pairToken(rid, deviceSecret),
  });
  if (!tablet) {
    // Rien n'a été relié : on défait la remise (la tablette réessaie au prochain tour).
    await admin.from('kiosk_pair_approvals').update({ claimed_at: null }).eq('rid_hash', ridHash).eq('claimed_at', claimedAt);
    return json({ error: 'Appairage impossible' }, 500);
  }
  const { error: linkErr } = await admin.from('kiosk_pair_approvals').update({ kiosk_id: tablet.kiosk_id }).eq('rid_hash', ridHash);
  if (linkErr) console.error('[kiosk] pair_status kiosk_id', linkErr.code); // meilleur effort : le rejeu ne dépend pas de ce lien
  return json({ status: 'approved', ...tablet });
}

/** Écart toléré entre la création et le premier `last_seen_at` (la création le pose elle-même, à quelques millisecondes près). */
const PAIR_NEVER_SERVED_MS = 5 * 1000;
/** Aucun appel de la tablette depuis sa création. */
const neverServed = (k: { created_at: string; last_seen_at: string | null }) =>
  !k.last_seen_at || Date.parse(k.last_seen_at) - Date.parse(k.created_at) < PAIR_NEVER_SERVED_MS;

/** Réponse perdue : le détenteur du secret redemande (3 min, 30 min si la tablette n'a jamais servi) et reçoit le MÊME jeton, sans créer une deuxième tablette. */
async function replayDelivery(admin: SupabaseClient, row: ApprovalRow, rid: string, deviceSecret: string, now: number) {
  const claimedMs = Date.parse(row.claimed_at || '');
  if (!Number.isFinite(claimedMs) || now - claimedMs >= PAIR_REPLAY_UNSEEN_MS) return json({ status: 'used' });
  const token = await pairToken(rid, deviceSecret);
  const { data, error } = await admin.from('kiosks').select('id, company_id, name, seed_salt, revoked_at, created_at, last_seen_at')
    .eq('token_hash', await sha256Hex(token)).maybeSingle();
  if (error) throw new Error(`pair: lecture des tablettes (${error.code})`);
  const k = data as { id: string; company_id: string; name: string; seed_salt: string; revoked_at: string | null; created_at: string; last_seen_at: string | null } | null;
  // Pas encore visible : l'autre interrogation est peut-être en train de la créer.
  if (!k) return json({ status: now - claimedMs < PAIR_CLAIM_IN_FLIGHT_MS ? 'pending' : 'used' });
  if (k.revoked_at) return json({ status: 'used' }); // remplacée entre-temps : le jeton ne sert plus
  // Au-delà de 3 min, seulement une tablette qui n'a jamais servi (aucun appel depuis sa création) : celle-là n'a pas de détenteur.
  if (now - claimedMs >= PAIR_REPLAY_WINDOW_MS && !neverServed(k)) return json({ status: 'used' });
  return json({ status: 'approved', ...(await tabletReply(admin, k, token)) });
}

// BUREAU — « voici la tablette que j'ai scannée ».
async function pairLookup(admin: SupabaseClient, profile: { id: string; company_id: string }, body: Record<string, unknown>) {
  const gate = await pairAdminGate(admin, profile);
  if (gate) return gate;
  const checked = await checkPairRequest(admin, body);
  if (checked.response) return checked.response;
  const now = Date.now();
  const [replaces, name, choices] = await Promise.all([
    currentTablet(admin, profile.company_id), companyName(admin, profile.company_id), pairChoices(checked.sh),
  ]);
  return json({
    available: true,
    company_name: name,
    choices, // jamais le vrai code seul, jamais de champ `display_code`
    expires_at: new Date(checked.exp * 1000).toISOString(),
    age_s: Math.round(Math.max(0, now - (checked.exp * 1000 - PAIR_REQUEST_TTL_MS)) / 1000),
    replaces,
  });
}

// BUREAU — « c'est bien ma tablette » (ou « ce n'est pas la mienne »).
async function pairConfirm(admin: SupabaseClient, profile: { id: string; company_id: string }, body: Record<string, unknown>) {
  const gate = await pairAdminGate(admin, profile);
  if (gate) return gate;
  const checked = await checkPairRequest(admin, body);
  if (checked.response) return checked.response;
  // L'entreprise vient TOUJOURS de la base (le profil de l'appelant), jamais du corps.
  const mine = { rid_hash: checked.ridHash, secret_hash: checked.sh, company_id: profile.company_id, approved_by: profile.id };
  // Une écriture qui n'a pas abouti : perdue contre une autre action (clé primaire), migration absente, panne.
  const failed = (r: 'used' | 'missing' | 'error') =>
    r === 'used' ? refuse('pair_request_used', 409) : r === 'missing' ? json({ available: false }) : json({ error: 'Erreur serveur' }, 500);

  if (body.decline === true) {
    const r = await insertApproval(admin, { ...mine, cancelled_at: new Date(Date.now()).toISOString() });
    return r === 'ok' ? json({ ok: true, declined: true }) : failed(r);
  }
  if (body.confirm !== true) return refuse('confirm_required', 400);

  // Un mauvais code brûle la demande : la tablette en affiche une neuve.
  if (!safeEqual(normalizeDisplayCode(String(body.code ?? '')), await ridCode(checked.sh))) {
    const r = await insertApproval(admin, { ...mine, cancelled_at: new Date(Date.now()).toISOString() });
    return r === 'ok' ? refuse('pair_code_wrong', 409) : failed(r);
  }

  // Second geste : une tablette en service ne se remplace pas d'un seul toucher.
  // Rien n'est écrit : la demande reste confirmable.
  const tablet = await currentTablet(admin, profile.company_id);
  if (tablet?.alive && body.replace !== true) return refuse('replace_required', 409);

  const r = await insertApproval(admin, { ...mine, approved_at: new Date(Date.now()).toISOString() });
  if (r !== 'ok') return failed(r);
  return json({ ok: true, company_name: await companyName(admin, profile.company_id), replaces: tablet !== null });
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

/** Lot 30 — colonnes d'état absentes (migration pas passée) : on ne retente qu'après ce délai. */
const STATE_COLUMNS_RETRY_MS = 10 * 60 * 1000;
/** Heure à laquelle on a appris que les colonnes manquent (0 = on ne sait pas, ou elles existent). */
let stateColumnsAbsentAt = 0;

/**
 * « Vu à » de la tablette, et — Lot 30 — l'état de son écran, en UNE SEULE écriture de `kiosks`
 * ({ last_seen_at, client_state, client_state_at } : 288 écritures par jour et par tablette, comme avant).
 *
 * Avant la migration (colonnes absentes, PGRST204 / 42703), l'écriture groupée échoue : on écrit alors le « vu à »
 * seul — exactement l'écriture d'avant — et on s'en souvient 10 minutes, pour ne pas provoquer une erreur de la
 * base à chaque `sync` ; rien n'est journalisé. Un état invalide est ignoré en entier (écriture d'avant). Toute
 * autre erreur de l'écriture groupée (panne, droit retiré) est journalisée (le code seulement), et le « vu à »
 * est quand même écrit. Ne lève que si l'écriture d'avant lèverait.
 */
async function touchKiosk(admin: SupabaseClient, kioskId: string, rawState: unknown) {
  const at = new Date(Date.now()).toISOString();
  const state = rawState === undefined ? null : parseClientState(rawState);
  if (state) {
    const sinceAbsent = Date.now() - stateColumnsAbsentAt;
    // `sinceAbsent < 0` : l'horloge a reculé, on ne se fie pas à l'ancienne mémoire.
    if (stateColumnsAbsentAt === 0 || sinceAbsent >= STATE_COLUMNS_RETRY_MS || sinceAbsent < 0) {
      try {
        const { error } = await admin.from('kiosks')
          .update({ last_seen_at: at, client_state: state, client_state_at: at }).eq('id', kioskId);
        if (!error) { stateColumnsAbsentAt = 0; return; }
        if (schemaMissing(error)) stateColumnsAbsentAt = Date.now() || 1;
        else console.error('[kiosk] client_state', error.code);
      } catch (e) {
        console.error('[kiosk] client_state', (e as { code?: string })?.code ?? 'erreur');
      }
    }
  }
  await admin.from('kiosks').update({ last_seen_at: at }).eq('id', kioskId);
}

async function sync(admin: SupabaseClient, body: Record<string, unknown>) {
  const k = await kioskFromToken(admin, body);
  if (!k) return json({ error: 'Borne inconnue', revoked: true }, 401);
  if (k.revoked_at) return json({ error: REFUSAL_MESSAGES.kiosk_revoked, revoked: true }, 410);
  if (!(await companyEnabled(admin, k.company_id))) return json({ error: REFUSAL_MESSAGES.kiosk_disabled, disabled: true }, 403);
  // « Vu à » + (lot 30) l'état de l'écran, facultatif (une ancienne page n'en envoie pas) : une seule écriture.
  await touchKiosk(admin, k.id, body.client_state);

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
    // Lot 12 : seulement les chronos d'aujourd'hui (une sortie oubliée n'allume rien).
    admin.from('active_sessions').select('user_id, worksite_id, planning_id, work_date, started_at')
      .eq('company_id', k.company_id).eq('work_date', parisDate(Date.now())),
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

const clientIp = (req: Request) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'inconnue';

// Lot 12 — QR FIXE : les essais REFUSÉS sont plafonnés (30 en 10 minutes par
// couple adresse + QR visé), SANS jamais gêner un QR valable : le jeton est
// vérifié d'abord, et le plafond ne change que la réponse d'un essai qui échoue
// déjà (429 au lieu de 400). Le QR de la tablette (k/c) n'y touche pas.
// Aucune adresse n'est gardée : un « seau » de 12 bits d'une empreinte de
// (adresse, QR visé), une ligne par seau, réécrite après 10 minutes — voir
// kiosk-rules.ts. Table absente (migration pas passée) ou panne : aucun plafond,
// jamais bloquant. (L'adresse est lue comme pour l'appairage ; si elle est
// falsifiée, le plafond est contourné, ce qui ne donne aucun accès : le jeton
// est une signature.)
async function noteFixedFailure(admin: SupabaseClient, ip: string, scope: string): Promise<'throttled' | 'noted'> {
  const bucket = ticketBucket(await hmacB64(`ticket-failure|${ip}|${scope}`));
  const { data, error } = await admin.from('kiosk_ticket_failures').select('failures, window_start').eq('bucket', bucket).maybeSingle();
  if (error) { if (!schemaMissing(error)) console.error('[kiosk] ticket failure', error.code); return 'noted'; }
  const row = (data as TicketBucketRow | null) ?? null;
  const now = Date.now();
  if (ticketBucketFull(row, now)) return 'throttled'; // plein : plus aucune écriture
  const { error: werr } = await admin.from('kiosk_ticket_failures').upsert({ bucket, ...ticketBucketNext(row, now) }, { onConflict: 'bucket' });
  if (werr && !schemaMissing(werr)) console.error('[kiosk] ticket failure', werr.code);
  return 'noted';
}

async function ticket(admin: SupabaseClient, req: Request, body: Record<string, unknown>) {
  if (body.f) return await ticketFixed(admin, clientIp(req), body);

  const kioskId = String(body.k || '');
  const code = String(body.c || '');
  const { data } = await admin.from('kiosks')
    .select('id, company_id, name, seed_salt, revoked_at').eq('id', kioskId).maybeSingle();
  const k = data as { id: string; company_id: string; name: string; seed_salt: string; revoked_at: string | null } | null;
  // Lot 12 : une ligne « QR fixe » n'a pas de QR qui change chaque minute (sa
  // graine n'est donnée à personne) : refusée ici comme une borne inconnue.
  if (!k || k.seed_salt.startsWith(FIXED_SALT_PREFIX)) return refuse('kiosk_unknown', 404);
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

// Lot 12 — le QR fixe imprimé : /pointer#f=<id>.<signature>. Le ticket rendu
// porte `fq` (et non `k`) : la position sera exigée au pointage.
async function ticketFixed(admin: SupabaseClient, ip: string, body: Record<string, unknown>) {
  // Un jeton faux : refusé, compté (au-delà de 30 par seau, 429 au lieu de 400).
  const invalid = async (scope: string) =>
    (await noteFixedFailure(admin, ip, scope)) === 'throttled'
      ? json({ error: 'Trop d’essais. Réessayez dans quelques minutes.', code: 'throttled' }, 429)
      : refuse('fixed_invalid', 400);
  const parts = splitFixedToken(String(body.f || ''));
  if (!parts) return await invalid('forme');
  const { data, error } = await admin.from('kiosks')
    .select('id, company_id, seed_salt, revoked_at, kind').eq('id', parts.id).maybeSingle();
  if (error) {
    if (schemaMissing(error)) return refuse('fixed_unavailable', 404);
    throw error;
  }
  const k = data as { id: string; company_id: string; seed_salt: string; revoked_at: string | null; kind: string } | null;
  if (!k || k.kind !== 'fixe' || !safeEqual(parts.sig, await fixedQrSignature(SERVER_KEY, k.id, k.seed_salt))) {
    return await invalid(parts.id);
  }
  // Signature juste mais QR régénéré ou désactivé : le dire (vieille feuille au mur).
  if (k.revoked_at) return refuseFixed('fixed_revoked', 410, await hasTablet(admin, k.company_id));
  if (!(await companyEnabled(admin, k.company_id))) return refuse('kiosk_disabled', 403);
  const [point, tablet, { data: c }] = await Promise.all([
    loadFixedPoint(admin, k.company_id),
    hasTablet(admin, k.company_id),
    admin.from('companies').select('name').eq('id', k.company_id).maybeSingle(),
  ]);
  if (point === undefined) return refuse('fixed_unavailable', 404);
  if (!pointSet(point)) return refuseFixed('fixed_no_point', 409, tablet);

  const payload = toBase64Url(enc.encode(JSON.stringify({ fq: k.id, exp: Date.now() + TICKET_TTL_MS })));
  return json({
    ticket: `${payload}.${await hmacB64(`kiosk-ticket|${payload}`)}`,
    kiosk_name: FIXED_QR_NAME,
    company_name: (c as { name?: string } | null)?.name || '',
    needs_gps: false,
    // La page /pointer lit la position UNE fois, juste avant le pointage.
    needs_position: true,
    radius_m: point.radius,
    // Pour dire la vérité à l'écran : « Scannez la tablette » seulement s'il y en a une.
    has_tablet: tablet,
  });
}

// Réglage par chantier (fiche client) : le QR fixe et la puce NFC (même lien)
// peuvent y être refusés. Colonne absente (migration pas passée) ou lecture
// impossible : accepté, comme avant.
async function fixedAllowedOn(admin: SupabaseClient, worksiteId: string): Promise<boolean> {
  const { data, error } = await admin.from('worksites').select('fixed_qr_allowed').eq('id', worksiteId).maybeSingle();
  if (error) { if (!schemaMissing(error)) console.error('[kiosk] fixed_qr_allowed', error.code); return true; }
  return siteAcceptsFixed(data as { fixed_qr_allowed?: boolean | null } | null);
}

async function punch(admin: SupabaseClient, req: Request, body: Record<string, unknown>) {
  // 1) Le ticket : signé par nous, pas expiré.
  const [payload, sig] = String(body.ticket || '').split('.');
  if (!payload || !sig || sig !== await hmacB64(`kiosk-ticket|${payload}`)) return refuse('ticket_invalid', 400);
  let t: { k?: string; fq?: string; exp: number };
  try { t = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))); } catch { return refuse('ticket_invalid', 400); }
  // Lot 12 : `fq` = ticket d'un QR fixe (position exigée plus bas).
  const fixed = !t.k && !!t.fq;
  if (!(t.k || fixed) || !(t.exp > Date.now())) return refuse('ticket_invalid', 400);

  // 2) Le salarié : connecté, actif, de la même entreprise.
  const caller = await callerFromJwt(admin, req);
  if (!caller) return json({ error: 'Connectez-vous pour pointer.', code: 'auth' }, 401);
  const { profile, token } = caller;

  type PunchKiosk = { id: string; company_id: string; name: string; worksite_id: string | null; revoked_at: string | null };
  let kiosk: PunchKiosk | null;
  if (!fixed) {
    const { data: kd } = await admin.from('kiosks')
      .select('id, company_id, name, worksite_id, revoked_at').eq('id', t.k).maybeSingle();
    kiosk = kd as PunchKiosk | null;
  } else {
    // QR fixe : la ligne doit être « fixe » (et la migration passée).
    const { data: kd, error: ke } = await admin.from('kiosks')
      .select('id, company_id, name, worksite_id, revoked_at, kind').eq('id', t.fq).maybeSingle();
    if (ke) { if (schemaMissing(ke)) return refuse('fixed_unavailable', 404); throw ke; }
    const row = kd as (PunchKiosk & { kind: string }) | null;
    kiosk = row && row.kind === 'fixe' ? row : null;
    if (kiosk?.revoked_at) return refuseFixed('fixed_revoked', 410, await hasTablet(admin, kiosk.company_id));
  }
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

  // 2 bis) Lot 12 — QR fixe : la position lue au scan, comparée ICI (distance
  // au point de référence ≤ rayon + marge de précision). Elle n'est écrite
  // NULLE PART (ni table, ni journal) : seul « dans la zone : oui » est gardé.
  // Cette position est DÉCLARÉE par le téléphone, que le serveur ne peut pas
  // contrôler : c'est un frein, pas une preuve de présence.
  if (fixed) {
    const point = await loadFixedPoint(admin, kiosk!.company_id);
    if (point === undefined) return refuse('fixed_unavailable', 404);
    const pos = parsePosition(body);
    const verdict = checkFixedPosition(pointSet(point) ? point : null, point ? point.radius : FIXED_QR_RADIUS_DEFAULT_M, pos);
    if (verdict !== 'ok') {
      return refuseFixed(verdict, verdict === 'fixed_no_point' ? 409 : 403, await hasTablet(admin, kiosk!.company_id),
        verdict === 'position_imprecise' && pos?.accuracy != null ? { accuracy_m: Math.round(pos.accuracy) } : {});
    }
  }

  // 3) Arrivée ou départ : même règle que l'appli.
  const today = parisDate(now);
  const { data: sess } = await admin.from('active_sessions').select('work_date').eq('user_id', profile.id).maybeSingle();
  let action = decideAction(sess as { work_date: string } | null, today);
  if (action === 'stale_session') {
    // Lot 12 : la sortie oubliée d'un jour précédent ne bloque plus la borne.
    // Elle est fermée en brouillon « sortie oubliée » (comme le fait le cron de
    // nuit), puis ce scan est une arrivée normale. Migration absente ou jour
    // clos (rien n'a été fermé) : l'ancien refus.
    const closed = await admin.rpc('close_forgotten_sessions', { p_user: profile.id });
    if (closed.error || !closed.data) {
      if (closed.error && !rpcMissing(closed.error)) console.error('[kiosk] close_forgotten', closed.error);
      return refuse('stale_session', 409);
    }
    action = 'arrival';
  }

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
    // QR fixe ou puce NFC (même lien) : refusés si le bureau l'a décoché pour ce chantier.
    if (fixed && !(await fixedAllowedOn(admin, worksiteId))) {
      return refuseFixed('site_refused', 403, await hasTablet(admin, kiosk!.company_id));
    }
    // Lot 12 : arrivée par `kiosk_open_session` (service seulement) — le chrono
    // est inséré au nom du salarié (tous ses gardes s'appliquent) et marqué QR,
    // seule façon de COMMENCER une journée quand une tablette est reliée.
    // Migration absente : l'insertion d'avant, au nom du salarié.
    let { error } = await admin.rpc('kiosk_open_session', {
      p_user: profile.id, p_worksite: worksiteId, p_planning: place.planningId, p_date: today,
    });
    if (rpcMissing(error)) {
      ({ error } = await asUser.from('active_sessions').insert({
        user_id: profile.id, company_id: profile.company_id, worksite_id: worksiteId,
        planning_id: place.planningId, work_date: today,
      }));
    }
    if (error) {
      if (error.code === '23505') return refuse('double_scan', 409);
      if (isClosedError(error.message)) return refuse('month_closed', 409);
      console.error('[kiosk] arrival', error);
      return json({ error: 'Arrivée non enregistrée. Réessayez.' }, 500);
    }
    const { data: w } = await admin.from('worksites').select('client_name').eq('id', worksiteId).maybeSingle();
    worksiteName = (w as { client_name?: string } | null)?.client_name ?? null;
  } else {
    // QR fixe ou puce NFC : même réglage du chantier pour le départ (celui du pointage en cours).
    if (fixed) {
      const { data: cur } = await admin.from('active_sessions').select('worksite_id').eq('user_id', profile.id).maybeSingle();
      const openSite = (cur as { worksite_id: string | null } | null)?.worksite_id;
      if (openSite && !(await fixedAllowedOn(admin, openSite))) {
        return refuseFixed('site_refused', 403, await hasTablet(admin, kiosk!.company_id));
      }
    }
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

  // Lot 12 : un scan du QR fixe garde « dans la zone : oui » (in_zone : position déclarée
  // par le téléphone, pas une preuve), aucune coordonnée.
  await admin.from('kiosk_punches').insert({
    company_id: kiosk!.company_id, kiosk_id: kiosk!.id, user_id: profile.id, kind: action,
    ...(fixed ? { in_zone: true } : {}),
  });
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
      case 'fixed_status': case 'fixed_enable': case 'fixed_disable': case 'fixed_regenerate':
      case 'fixed_point': case 'fixed_radius':
      case 'pair_lookup': case 'pair_confirm':
        return await adminAction(admin, req, action, body);
      case 'pair': return await pair(admin, req, body);
      case 'pair_request': return await pairRequest(admin, req, body);
      case 'pair_status': return await pairStatus(admin, body);
      case 'unpair': return await unpair(admin, body);
      case 'sync': return await sync(admin, body);
      case 'board': return await board(admin, body);
      case 'ticket': return await ticket(admin, req, body);
      case 'punch': return await punch(admin, req, body);
      default: return json({ error: 'Action inconnue' }, 400);
    }
  } catch (e) {
    console.error('[kiosk]', e);
    return json({ error: 'Erreur serveur' }, 500);
  }
});
