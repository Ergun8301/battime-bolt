// Edge Function : invite-worker
// Le bureau (ADMIN) invite un salarié : on enregistre l'invitation, on crée le
// compte (service role) et on envoie l'email d'invitation.
//
// SÉCURITÉ :
//   - verify_jwt = true  -> seul un utilisateur CONNECTÉ peut appeler.
//   - On vérifie EN PLUS que l'appelant est ADMIN et ACTIF.
//   - On rattache l'invité à l'entreprise de l'APPELANT (company_id dérivé du
//     serveur, jamais pris dans le corps de la requête).
//   - Le rôle est forcé à 'worker' (impossible de créer un admin par ici).
//   - L'invitation est enregistrée AVANT la création du compte : c'est elle que
//     le trigger handle_new_user vérifie pour rattacher l'invité à l'entreprise.
//     Les métadonnées du signUp ne sont plus une preuve d'appartenance.
//
// ACTIONS :
//   - (défaut) inviter / renvoyer une invitation (idempotent par e-mail).
//   - action: 'revoke' → annuler une invitation. Si l'invité ne s'est jamais
//     connecté, son compte est supprimé (il n'a rien pu saisir). S'il s'est
//     déjà connecté, on refuse : il faut l'archiver.
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
      .from("users").select("role, company_id, is_active").eq("id", caller.id).single();
    if (profErr || !callerProfile || callerProfile.role !== "admin") {
      return jsonResponse({ error: "Réservé à l'administrateur de l'entreprise" }, { status: 403 });
    }
    // Un compte archivé garde un jeton valide quelques minutes : on le refuse
    // ici aussi (le client service_role ne passe pas par la RLS).
    if (callerProfile.is_active === false) {
      return jsonResponse({ error: "Ce compte a été archivé" }, { status: 403 });
    }
    const company_id = callerProfile.company_id as string;

    const payload = await req.json().catch(() => ({}));
    const action = String(payload?.action ?? "invite");
    const email = String(payload?.email ?? "").trim();
    if (!email) return jsonResponse({ error: "E-mail requis" }, { status: 400 });

    // ── Révocation ──
    if (action === "revoke") {
      const { data: target } = await supabaseAdmin
        .from("users").select("id").eq("company_id", company_id).ilike("email", email).maybeSingle();
      if (target?.id) {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(target.id);
        if (authUser?.user?.last_sign_in_at) {
          return jsonResponse({ error: "Ce salarié s'est déjà connecté : archivez-le plutôt." }, { status: 409 });
        }
        const { count } = await supabaseAdmin
          .from("time_entries").select("id", { count: "exact", head: true }).eq("user_id", target.id);
        if ((count || 0) > 0) {
          return jsonResponse({ error: "Ce compte a déjà des heures : archivez-le plutôt." }, { status: 409 });
        }
        await supabaseAdmin.from("planning").delete().eq("user_id", target.id);
        await supabaseAdmin.from("push_subscriptions").delete().eq("user_id", target.id);
        // Supprime auth.users → cascade sur public.users (users_id_fkey).
        const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(target.id);
        if (delErr) return jsonResponse({ error: delErr.message }, { status: 400 });
      }
      await supabaseAdmin.from("invitations").delete().eq("company_id", company_id).ilike("email", email);
      return jsonResponse({ success: true, deleted_account: !!target?.id }, { status: 200 });
    }

    // ── Invitation (rôle forcé à 'worker') ──
    const first_name = String(payload?.first_name ?? "").trim();
    const last_name = String(payload?.last_name ?? "").trim();
    const phone = payload?.phone ? String(payload.phone).trim() : null;
    const role = "worker";
    if (!first_name || !last_name) {
      return jsonResponse({ error: "Champs requis manquants (email, prénom, nom)" }, { status: 400 });
    }

    // 1) L'invitation d'abord — une seule en attente par e-mail et par entreprise
    //    (un renvoi remplace la précédente au lieu de s'empiler).
    await supabaseAdmin.from("invitations").delete()
      .eq("company_id", company_id).ilike("email", email).is("accepted_at", null);
    const invRow: Record<string, unknown> = { company_id, email, first_name, last_name, role, created_by: caller.id };
    if (phone) invRow.phone = phone;
    const { data: inv, error: insertError } = await supabaseAdmin
      .from("invitations").insert(invRow).select("id").single();
    if (insertError || !inv) return jsonResponse({ error: insertError?.message ?? "Invitation impossible" }, { status: 400 });

    // 2) Le compte + l'e-mail d'invitation. Pour un invité pas encore connecté,
    //    GoTrue renvoie simplement l'invitation.
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { first_name, last_name, company_id, role, phone },
    });
    if (inviteError) {
      await supabaseAdmin.from("invitations").delete().eq("id", inv.id);
      const msg = /already|registered|exists/i.test(inviteError.message)
        ? "Un compte existe déjà avec cette adresse."
        : inviteError.message;
      return jsonResponse({ error: msg }, { status: 400 });
    }

    return jsonResponse({ success: true }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[invite-worker] error:", e);
    return jsonResponse({ error: message }, { status: 500 });
  }
});
