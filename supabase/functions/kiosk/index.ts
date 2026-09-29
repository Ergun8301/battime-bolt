// Edge Function : kiosk — la borne de pointage QR.
//
// DÉPLOIEMENT : `supabase functions deploy kiosk --no-verify-jwt`
//   La tablette n'a pas de compte : elle s'authentifie par son secret, pas par
//   un JWT. Chaque action vérifie donc elle-même qui appelle.
//
// TROIS APPELANTS, TROIS PREUVES :
//   - le BUREAU (admin actif) : son JWT        → admin_state, create_pairing,
//                                                revoke, update_settings
//   - la TABLETTE             : son secret     → pair (code 6 chiffres), sync
//   - le SALARIÉ              : son JWT        → scan
//
// LE POINTAGE N'EST PAS RÉÉCRIT ICI. Le scan appelle `active_sessions` et
// `stop_active_session()` avec le JETON DU SALARIÉ : RLS, trigger de garde,
// mois clôturé, arrondi au quart d'heure — tout s'applique exactement comme
// depuis son téléphone. La clé service ne sert qu'aux tables `kiosk_*`.
//
// INTERRUPTEUR : rien ne fonctionne si `companies.kiosk_enabled` est faux.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  checkScan,
  deriveTotpKey,
  KIOSK_PAIRING_MINUTES,
  randomHex,
  randomPairingCode,
  sha256Hex,
  stepAt,
} from "../_shared/kiosk-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

/** Client agissant AU NOM de l'appelant : la RLS s'applique. */
function asUser(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

type Profile = { id: string; company_id: string | null; role: string; is_active: boolean | null; first_name: string | null };

async function caller(req: Request): Promise<{ jwt: string; profile: Profile } | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return null;
  const { data } = await admin.from("users")
    .select("id, company_id, role, is_active, first_name").eq("id", user.id).maybeSingle();
  return data ? { jwt, profile: data as Profile } : null;
}

async function kioskEnabled(companyId: string): Promise<boolean> {
  const { data } = await admin.from("companies").select("kiosk_enabled").eq("id", companyId).maybeSingle();
  return !!(data as { kiosk_enabled?: boolean } | null)?.kiosk_enabled;
}

async function settingsOf(companyId: string) {
  const { data } = await admin.from("kiosk_settings")
    .select("show_planning, require_gps, awake_from, awake_until").eq("company_id", companyId).maybeSingle();
  const s = (data ?? {}) as Record<string, unknown>;
  const hhmm = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : null);
  return {
    show_planning: !!s.show_planning,
    require_gps: !!s.require_gps,
    awake_from: hhmm(s.awake_from),
    awake_until: hhmm(s.awake_until),
  };
}

/** Date et heure à Paris : la même horloge que `stop_active_session()`. */
function parisNow(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const hhmmOrNull = (v: unknown) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : null);

// ═══════════════════════════════════════════════════════════════════════════
// BUREAU
// ═══════════════════════════════════════════════════════════════════════════
async function handleAdmin(action: string, body: Record<string, unknown>, req: Request) {
  const c = await caller(req);
  if (!c) return json({ error: "Non authentifié" }, 401);
  const p = c.profile;
  if (p.role !== "admin" || p.is_active === false || !p.company_id) return json({ error: "Réservé au bureau" }, 403);
  const companyId = p.company_id;
  if (!(await kioskEnabled(companyId))) return json({ error: "Borne non activée" }, 403);

  if (action === "admin_state") {
    const [{ data: devices }, settings, { data: worksites }] = await Promise.all([
      admin.from("kiosk_devices")
        .select("id, name, worksite_id, paired_at, last_seen_at, latitude")
        .eq("company_id", companyId).is("revoked_at", null).order("paired_at"),
      settingsOf(companyId),
      admin.from("worksites").select("id, client_name")
        .eq("company_id", companyId).eq("is_active", true).order("client_name"),
    ]);
    return json({
      devices: (devices ?? []).map((d: Record<string, unknown>) => ({
        id: d.id, name: d.name, worksite_id: d.worksite_id, paired_at: d.paired_at,
        last_seen_at: d.last_seen_at, has_position: d.latitude != null,
      })),
      settings,
      worksites: worksites ?? [],
    });
  }

  if (action === "create_pairing") {
    const name = String(body.name ?? "").trim().slice(0, 60) || "Borne";
    const worksiteId = String(body.worksite_id ?? "");
    const { data: ws } = await admin.from("worksites").select("id")
      .eq("id", worksiteId).eq("company_id", companyId).maybeSingle();
    if (!ws) return json({ error: "Choisissez un chantier / établissement." }, 400);
    const code = randomPairingCode();
    const expires = new Date(Date.now() + KIOSK_PAIRING_MINUTES * 60_000).toISOString();
    const { error } = await admin.from("kiosk_pairings").insert({
      company_id: companyId, code_hash: await sha256Hex(code), name, worksite_id: worksiteId,
      created_by: p.id, expires_at: expires,
    });
    if (error) throw error;
    return json({ code, expires_at: expires });
  }

  if (action === "revoke") {
    const { error } = await admin.from("kiosk_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", String(body.device_id ?? "")).eq("company_id", companyId).is("revoked_at", null);
    if (error) throw error;
    return json({ ok: true });
  }

  if (action === "update_settings") {
    const cur = await settingsOf(companyId);
    const next = {
      company_id: companyId,
      show_planning: typeof body.show_planning === "boolean" ? body.show_planning : cur.show_planning,
      require_gps: typeof body.require_gps === "boolean" ? body.require_gps : cur.require_gps,
      awake_from: "awake_from" in body ? hhmmOrNull(body.awake_from) : cur.awake_from,
      awake_until: "awake_until" in body ? hhmmOrNull(body.awake_until) : cur.awake_until,
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from("kiosk_settings").upsert(next);
    if (error) throw error;
    return json({ settings: await settingsOf(companyId) });
  }

  return json({ error: "Action inconnue" }, 400);
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLETTE
// ═══════════════════════════════════════════════════════════════════════════
async function handlePair(body: Record<string, unknown>, req: Request) {
  const code = String(body.code ?? "").replace(/\D/g, "");
  // Frein : 10 essais ratés par adresse IP et par 10 minutes.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "inconnue";
  const ipHash = await sha256Hex(`kiosk:${ip}`);
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await admin.from("kiosk_pair_attempts")
    .select("ip_hash", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
  if ((count ?? 0) >= 10) return json({ error: "Trop d'essais. Réessayez dans quelques minutes." }, 429);

  const { data: pairing } = code.length === 6
    ? await admin.from("kiosk_pairings")
      .select("id, company_id, name, worksite_id, created_by, expires_at")
      .eq("code_hash", await sha256Hex(code)).is("used_at", null)
      .gt("expires_at", new Date().toISOString()).maybeSingle()
    : { data: null };
  if (!pairing || !(await kioskEnabled(pairing.company_id))) {
    await admin.from("kiosk_pair_attempts").insert({ ip_hash: ipHash });
    return json({ error: "Code invalide ou expiré." }, 400);
  }

  // Un seul usage, même en cas de double envoi simultané.
  const { data: claimed } = await admin.from("kiosk_pairings")
    .update({ used_at: new Date().toISOString() }).eq("id", pairing.id).is("used_at", null).select("id");
  if (!claimed?.length) return json({ error: "Code déjà utilisé." }, 400);

  const secret = randomHex(32);
  const lat = num(body.lat), lng = num(body.lng);
  const { data: device, error } = await admin.from("kiosk_devices").insert({
    company_id: pairing.company_id, name: pairing.name, worksite_id: pairing.worksite_id,
    token_hash: await sha256Hex(secret), totp_key: await deriveTotpKey(secret),
    latitude: lat, longitude: lng, accuracy_m: lat != null && lng != null ? num(body.accuracy) : null,
    created_by: pairing.created_by, last_seen_at: new Date().toISOString(),
  }).select("id").single();
  if (error) throw error;
  return json({ device_id: device.id, secret });
}

async function handleSync(body: Record<string, unknown>) {
  const secret = String(body.secret ?? "");
  if (!secret) return json({ error: "revoked" }, 401);
  const { data: d } = await admin.from("kiosk_devices")
    .select("id, company_id, name, worksite_id, revoked_at, latitude")
    .eq("token_hash", await sha256Hex(secret)).maybeSingle();
  if (!d || d.revoked_at || !(await kioskEnabled(d.company_id))) return json({ error: "revoked" }, 401);

  const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
  // Position ratée à l'appairage : la tablette peut la fournir plus tard, une fois.
  const lat = num(body.lat), lng = num(body.lng);
  if (d.latitude == null && lat != null && lng != null) Object.assign(patch, { latitude: lat, longitude: lng, accuracy_m: num(body.accuracy) });
  await admin.from("kiosk_devices").update(patch).eq("id", d.id);

  const [{ data: company }, settings] = await Promise.all([
    admin.from("companies").select("name").eq("id", d.company_id).maybeSingle(),
    settingsOf(d.company_id),
  ]);

  // Planning du jour : prénom + horaire, RIEN D'AUTRE (ni heures faites, ni coût).
  let planning: { first_name: string; start: string | null; end: string | null }[] = [];
  if (settings.show_planning) {
    const { data: rows } = await admin.from("planning")
      .select("user_id, estimated_start, estimated_end")
      .eq("company_id", d.company_id).eq("worksite_id", d.worksite_id)
      .eq("work_date", parisNow().date).is("absence_type", null)
      .order("estimated_start", { ascending: true });
    const ids = [...new Set((rows ?? []).map((r: Record<string, unknown>) => String(r.user_id)))];
    const { data: people } = ids.length
      ? await admin.from("users").select("id, first_name").in("id", ids)
      : { data: [] };
    const names = new Map((people ?? []).map((u: Record<string, unknown>) => [String(u.id), String(u.first_name ?? "")]));
    planning = (rows ?? []).map((r: Record<string, unknown>) => ({
      first_name: (names.get(String(r.user_id)) ?? "").trim() || "—",
      start: typeof r.estimated_start === "string" ? r.estimated_start.slice(0, 5) : null,
      end: typeof r.estimated_end === "string" ? r.estimated_end.slice(0, 5) : null,
    }));
  }

  return json({
    server_time: Date.now(),
    device: { id: d.id, name: d.name },
    company_name: (company as { name?: string } | null)?.name ?? "",
    settings: { show_planning: settings.show_planning, awake_from: settings.awake_from, awake_until: settings.awake_until },
    planning,
    needs_position: settings.require_gps && d.latitude == null,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SALARIÉ
// ═══════════════════════════════════════════════════════════════════════════
const REFUSALS: Record<string, [number, string]> = {
  device_unknown: [404, "Borne inconnue. Rescannez le QR affiché sur la borne."],
  other_company: [403, "Cette borne n'appartient pas à votre entreprise."],
  kiosk_off: [403, "La borne de pointage n'est pas activée pour votre entreprise."],
  revoked: [403, "Cette borne a été retirée par le bureau."],
  code_invalid: [400, "QR expiré. Rescannez la borne."],
  need_position: [428, "Votre position est nécessaire pour pointer sur cette borne."],
  too_far: [403, "Vous semblez trop loin de la borne (plus de 200 m)."],
};

async function handleScan(body: Record<string, unknown>, req: Request) {
  const c = await caller(req);
  if (!c) return json({ error: "Non authentifié", reason: "auth" }, 401);
  const deviceId = String(body.device_id ?? "");
  const now = Date.now();

  const { data: device } = /^[0-9a-f-]{36}$/i.test(deviceId)
    ? await admin.from("kiosk_devices")
      .select("id, company_id, worksite_id, revoked_at, totp_key, latitude, longitude").eq("id", deviceId).maybeSingle()
    : { data: null };

  const [enabled, settings, { data: last }] = await Promise.all([
    device ? kioskEnabled(device.company_id) : Promise.resolve(false),
    device ? settingsOf(device.company_id) : Promise.resolve(null),
    admin.from("kiosk_scans").select("created_at, direction")
      .eq("user_id", c.profile.id).neq("direction", "pending")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const lat = num(body.lat), lng = num(body.lng);
  const verdict = await checkScan({
    device, kioskEnabled: enabled, user: c.profile, code: String(body.code ?? ""), nowMs: now,
    lastScanAtMs: last ? Date.parse(last.created_at) : null,
    requireGps: !!settings?.require_gps,
    position: lat != null && lng != null ? { lat, lng } : null,
  });

  if (!verdict.ok) {
    if (verdict.reason === "duplicate") {
      return json({ status: "duplicate", direction: last!.direction, time: parisNow(new Date(last!.created_at)).time });
    }
    const [status, error] = REFUSALS[verdict.reason];
    return json({ error, reason: verdict.reason }, status);
  }

  // Verrou : un seul scan par salarié et par minute serveur.
  const { data: claim, error: claimErr } = await admin.from("kiosk_scans").insert({
    company_id: device!.company_id, device_id: device!.id, user_id: c.profile.id, minute: stepAt(now),
  }).select("id").single();
  if (claimErr || !claim) {
    return json({ status: "duplicate", direction: last?.direction ?? "in", time: parisNow().time });
  }
  const release = () => admin.from("kiosk_scans").delete().eq("id", claim.id);

  // ── Arrivée ou départ : LA MÊME RÈGLE que l'écran du salarié ─────────────
  // Un chrono ouvert → on le ferme. Aucun → on en ouvre un.
  const db = asUser(c.jwt);
  const { data: open, error: readErr } = await db.from("active_sessions")
    .select("user_id").eq("user_id", c.profile.id).maybeSingle();
  if (readErr) { await release(); return json({ error: "Lecture du pointage impossible. Réessayez." }, 500); }

  const at = parisNow();
  let direction: "in" | "out";
  if (open) {
    const { error } = await db.rpc("stop_active_session", {});
    if (error) {
      await release();
      if ((error as { code?: string }).code === "BT001") {
        return json({ error: "Arrivée enregistrée il y a moins d'un quart d'heure : rien à clôturer pour l'instant.", reason: "too_short" }, 409);
      }
      return json({ error: error.message || "Départ impossible." }, 400);
    }
    direction = "out";
  } else {
    const { data: plan } = await db.from("planning").select("id")
      .eq("user_id", c.profile.id).eq("work_date", at.date).eq("worksite_id", device!.worksite_id)
      .limit(1).maybeSingle();
    const { error } = await db.from("active_sessions").insert({
      user_id: c.profile.id, company_id: device!.company_id, worksite_id: device!.worksite_id,
      planning_id: (plan as { id?: string } | null)?.id ?? null, work_date: at.date,
    });
    if (error) {
      await release();
      if (error.code === "23505") return json({ status: "duplicate", direction: "in", time: at.time });
      return json({ error: error.message || "Arrivée impossible." }, 400);
    }
    direction = "in";
  }

  await Promise.all([
    admin.from("kiosk_scans").update({ direction }).eq("id", claim.id),
    admin.from("kiosk_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device!.id),
  ]);
  return json({ status: "ok", direction, time: at.time, first_name: c.profile.first_name ?? "" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");
    switch (action) {
      case "pair": return await handlePair(body, req);
      case "sync": return await handleSync(body);
      case "scan": return await handleScan(body, req);
      case "admin_state":
      case "create_pairing":
      case "revoke":
      case "update_settings":
        return await handleAdmin(action, body, req);
      default: return json({ error: "Action inconnue" }, 400);
    }
  } catch (e) {
    console.error("kiosk:", e);
    return json({ error: "Erreur serveur" }, 500);
  }
});
