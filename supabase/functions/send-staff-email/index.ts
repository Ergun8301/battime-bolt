// Edge Function : send-staff-email
// E-mails du BUREAU à ses salariés : le planning de la semaine en PDF, ou un court
// message. Trois actions, une seule fonction (même contrôle d'accès, même plafond,
// même journal, un seul déploiement) :
//   { action: 'etat' }                                  → qui a une adresse, qui est
//                                                         désabonné, combien d'envois aujourd'hui ;
//   { action: 'planning', week_start, items: [{ user_id, mime, content_base64 }] }
//   { action: 'message',  user_ids: [...], message }
//
// TOUTES les décisions sont dans ../_shared/staff-email-run.ts (testé avec un faux
// transport : aucun vrai e-mail ne part des tests). Ce fichier branche seulement les
// vraies pièces : la base (clé service) et Resend.
//
// SÉCURITÉ — résumé (le détail est en tête de staff-email-run.ts) :
//   - verify_jwt = true (déploiement SANS --no-verify-jwt) ;
//   - appelant = admin ACTIF de son entreprise, relu en base ; le support BEMEXO n'envoie rien ;
//   - destinataire jamais pris dans la requête : relu en base, salarié actif de la même entreprise ;
//   - plafond par entreprise et par jour, appliqué AVANT l'envoi par la base (verrou) ;
//   - désabonnés jamais écrits ; PDF vérifié ; texte nettoyé ; aucun contenu dans les journaux.
//
// Tant que la migration 20261013190000_lot19_emails.sql n'est pas appliquée, l'action
// « etat » répond { available: false } et les envois sont refusés (503) : le bureau ne
// voit aucune erreur, juste que la fonction n'est pas encore là.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendResendOutcome } from "../_shared/email.ts";
import { handleStaffEmail, Unavailable, type Deps } from "../_shared/staff-email-run.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

/** Une demande : 50 PDF de quelques dizaines de ko au plus, en base64. Au-delà, on ne lit même pas. */
const MAX_BODY_BYTES = 12 * 1024 * 1024;

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Table ou fonction de base absente (migration pas encore appliquée). */
const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (["42P01", "42883", "PGRST202", "PGRST205"].includes(e.code ?? "") ||
    /does not exist|schema cache/i.test(e.message ?? ""));

const chunk = <T,>(a: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};

const USER_COLS = "id, company_id, role, is_active, first_name, email";

function makeDeps(admin: Admin): Deps {
  return {
    now: () => Date.now(),

    async loadProfile(userId) {
      const { data, error } = await admin.from("users").select("role, company_id, is_active").eq("id", userId).maybeSingle();
      if (error) throw error;
      return data ?? null;
    },

    async isSupportStaff(userId) {
      const { data, error } = await admin.from("support_staff").select("user_id").eq("user_id", userId).maybeSingle();
      if (error) {
        if (isMissing(error)) return false; // lot 5 pas appliqué : personne n'est support
        throw error;
      }
      return !!data;
    },

    async loadCompany(companyId) {
      const { data, error } = await admin.from("companies").select("name, email").eq("id", companyId).maybeSingle();
      if (error) throw error;
      return data ?? null;
    },

    async listWorkers(companyId) {
      const { data, error } = await admin.from("users").select(USER_COLS)
        .eq("company_id", companyId).in("role", ["worker", "lead"]).eq("is_active", true)
        .order("first_name").range(0, 999);
      if (error) throw error;
      return data ?? [];
    },

    async loadWorkers(companyId, ids) {
      const rows = [];
      for (const part of chunk(ids, 100)) {
        // Le filtre d'entreprise est DANS la requête : un identifiant d'une autre entreprise ne revient pas.
        const { data, error } = await admin.from("users").select(USER_COLS).eq("company_id", companyId).in("id", part);
        if (error) throw error;
        rows.push(...(data ?? []));
      }
      return rows;
    },

    async loadUnsubscribed(emails) {
      const out = new Map<string, Set<string>>();
      for (const part of chunk(emails, 100)) {
        const { data, error } = await admin.from("email_unsubscribes_v2").select("email, kind").in("email", part);
        if (error) {
          if (isMissing(error)) throw new Unavailable();
          throw error; // illisible : on n'envoie pas
        }
        for (const r of (data ?? []) as { email: string; kind: string }[]) {
          const e = r.email.trim().toLowerCase();
          if (!out.has(e)) out.set(e, new Set());
          out.get(e)!.add(r.kind);
        }
      }
      return out;
    },

    async usedToday(companyId) {
      const { data, error } = await admin.rpc("staff_email_used_today", { p_company: companyId });
      if (error) {
        if (isMissing(error)) throw new Unavailable();
        throw error;
      }
      return Number(data ?? 0);
    },

    async reserve({ companyId, sentBy, kind, cap, items }) {
      const { data, error } = await admin.rpc("staff_email_reserve", {
        p_company: companyId, p_sent_by: sentBy, p_kind: kind, p_cap: cap, p_items: items,
      });
      if (error) {
        if (isMissing(error)) throw new Unavailable();
        throw error;
      }
      return data;
    },

    async finish({ id, companyId, status, reason }) {
      const { error } = await admin.rpc("staff_email_finish", {
        p_id: id, p_company: companyId, p_status: status, p_reason: reason,
      });
      if (error) throw error;
    },

    send: (m) => sendResendOutcome({
      to: m.to, subject: m.subject, html: m.html, kind: m.kind, from: m.from, replyTo: m.replyTo,
      attachments: m.attachments, idempotencyKey: m.idempotencyKey,
    }),

    // Compteurs et codes seulement : jamais d'adresse, jamais de contenu.
    log: (event, data) => console.log(`[send-staff-email] ${event}`, JSON.stringify(data ?? {})),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Configuration Supabase incomplète");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // ── Qui appelle ? ──
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Non authentifié" }, 401);
    const { data: { user: caller }, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !caller) return json({ error: "Session invalide" }, 401);

    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) return json({ error: "Demande trop volumineuse." }, 413);
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "Demande trop volumineuse." }, 413);
    let body: unknown = null;
    try { body = JSON.parse(raw); } catch { return json({ error: "Requête illisible." }, 400); }

    // Pas de clé d'envoi : on le dit AVANT de prendre une place du plafond.
    const action = (body as { action?: unknown } | null)?.action;
    if ((action === "planning" || action === "message") && !Deno.env.get("RESEND_API_KEY")) {
      return json({ error: "Envoi d'e-mail non configuré" }, 500);
    }

    const out = await handleStaffEmail(makeDeps(admin), caller.id, body);
    return json(out.body, out.status);
  } catch (e) {
    // Le message de l'erreur peut citer une adresse ou un contenu : on ne l'écrit pas.
    console.error("[send-staff-email] erreur inattendue", e instanceof Error ? e.name : typeof e);
    return json({ error: "Envoi impossible pour le moment. Rien n'est parti." }, 500);
  }
});
