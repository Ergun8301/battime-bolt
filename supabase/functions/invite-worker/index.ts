// Edge Function : invite-worker
// Le bureau (ADMIN) invite un salarié : on crée le compte (service role), on
// envoie l'email d'invitation, et on enregistre l'invitation.
//
// SÉCURITÉ (durci — point 1 de l'audit) :
//   - verify_jwt = true  -> seul un utilisateur CONNECTÉ peut appeler.
//   - On vérifie EN PLUS que l'appelant est ADMIN.
//   - On rattache l'invité à l'entreprise de l'APPELANT (company_id dérivé du
//     serveur, jamais pris dans le corps de la requête).
//   - Le rôle est forcé à 'worker' (impossible de créer un admin par ici).
//   => Un salarié ne peut NI inviter, NI créer un compte, NI viser une autre
//      entreprise. C'est le même verrou « admin » que sur le paiement Stripe.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...(init ?? {}),
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
    if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // ── Qui appelle ? (jeton porté par le header Authorization) ──
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return jsonResponse({ error: "Non authentifié" }, { status: 401 });
    const { data: { user: caller }, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller) return jsonResponse({ error: "Session invalide" }, { status: 401 });

    // ── L'appelant DOIT être admin. On rattache à SON entreprise (pas celle du corps). ──
    const { data: callerProfile, error: profErr } = await supabaseAdmin
      .from("users").select("role, company_id").eq("id", caller.id).single();
    if (profErr || !callerProfile || callerProfile.role !== "admin") {
      return jsonResponse({ error: "Réservé à l'administrateur de l'entreprise" }, { status: 403 });
    }
    const company_id = callerProfile.company_id as string;

    // ── Données de l'invité (rôle forcé à 'worker') ──
    const payload = await req.json().catch(() => ({}));
    const email = String(payload?.email ?? "").trim();
    const first_name = String(payload?.first_name ?? "").trim();
    const last_name = String(payload?.last_name ?? "").trim();
    const phone = payload?.phone ? String(payload.phone).trim() : null;
    const role = "worker";
    if (!email || !first_name || !last_name) {
      return jsonResponse({ error: "Champs requis manquants (email, prénom, nom)" }, { status: 400 });
    }

    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { first_name, last_name, company_id, role, phone },
    });
    if (inviteError) return jsonResponse({ error: inviteError.message }, { status: 400 });

    const invRow: Record<string, unknown> = { company_id, email, first_name, last_name, role };
    if (phone) invRow.phone = phone;
    const { error: insertError } = await supabaseAdmin.from("invitations").insert(invRow);
    if (insertError) return jsonResponse({ error: insertError.message }, { status: 400 });

    return jsonResponse({ success: true }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[invite-worker] error:", e);
    return jsonResponse({ error: message }, { status: 500 });
  }
});
