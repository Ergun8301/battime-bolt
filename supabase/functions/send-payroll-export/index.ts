// Edge Function : send-payroll-export
// Envoie l'export de paie au comptable de l'entreprise, en pièce jointe.
//
// SÉCURITÉ — ce que cette fonction refuse :
//   - verify_jwt = true : il faut être connecté.
//   - l'appelant doit être ADMIN et ACTIF de son entreprise (un compte archivé
//     garde un jeton valide quelques minutes, et le client service_role ne
//     passe pas par la RLS).
//   - le destinataire n'est JAMAIS pris dans la requête : il est relu dans
//     companies.accountant_email. Un appel trafiqué ne peut donc pas expédier
//     la paie d'une entreprise à une adresse choisie par l'appelant.
//   - taille de pièce jointe plafonnée : au-delà, Resend rejette l'envoi et le
//     bureau croirait la paie partie.
//
// Le contenu du fichier vient du navigateur : c'est le même tableur que celui
// que le bureau vient de télécharger, donc exactement ce qu'il a vu.
import { createClient } from "npm:@supabase/supabase-js@2";

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

/** Au-delà, l'envoi échoue chez le prestataire : autant le dire tout de suite. */
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const FROM = "BEMEXO <contact@bemexo.com>";

function buildHtml(companyName: string, periodLabel: string, fileName: string) {
  return `
<div style="font-family:Arial,Helvetica,sans-serif;background:#F2EDE3;padding:24px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;">
      <tr><td style="background:#15120F;padding:20px 26px;">
        <div style="color:#FFC21A;font-weight:900;font-size:17px;">${companyName}</div>
        <div style="color:#a59c86;font-size:11.5px;margin-top:3px;">Export des heures · via BEMEXO</div>
      </td></tr>
      <tr><td style="padding:22px 26px 10px;">
        <p style="margin:0 0 10px;font-size:15px;color:#15120F;">Bonjour,</p>
        <p style="margin:0;font-size:14px;color:#3a352f;line-height:1.5;">
          Voici les heures de <b>${companyName}</b> pour la période du <b>${periodLabel}</b>, en pièce jointe.
        </p>
        <p style="margin:10px 0 0;font-size:14px;color:#3a352f;line-height:1.5;">
          La première feuille, <b>Récapitulatif</b>, donne par salarié et par semaine les heures normales
          et les heures supplémentaires. La feuille <b>Détail</b> liste chaque intervention, pour justifier
          une ligne au besoin.
        </p>
      </td></tr>
      <tr><td style="padding:6px 26px 24px;">
        <p style="margin:0;font-size:13px;color:#6E6A63;">Fichier joint : ${fileName}</p>
      </td></tr>
      <tr><td style="background:#FBF8F2;padding:13px 26px;">
        <p style="margin:0;font-size:11px;color:#9a948a;">
          Envoyé depuis BEMEXO à la demande de ${companyName}. Répondez à cet e-mail pour les joindre.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Configuration Supabase incomplète");
    if (!RESEND_API_KEY) return json({ error: "Envoi d'e-mail non configuré" }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // ── Qui appelle ? ──
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Non authentifié" }, 401);
    const { data: { user: caller }, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !caller) return json({ error: "Session invalide" }, 401);

    const { data: profile, error: profErr } = await admin
      .from("users").select("role, company_id, is_active, first_name, last_name")
      .eq("id", caller.id).single();
    if (profErr || !profile || profile.role !== "admin") {
      return json({ error: "Réservé à l'administrateur de l'entreprise" }, 403);
    }
    if (profile.is_active === false) return json({ error: "Ce compte a été archivé" }, 403);

    const { fileName, contentBase64, periodLabel } = await req.json().catch(() => ({}));
    if (!fileName || !contentBase64) return json({ error: "Fichier manquant" }, 400);
    if (typeof contentBase64 !== "string") return json({ error: "Fichier illisible" }, 400);

    // Taille réelle après décodage base64, pas la taille de la chaîne.
    const approxBytes = Math.floor((contentBase64.length * 3) / 4);
    if (approxBytes > MAX_ATTACHMENT_BYTES) {
      return json({ error: "Export trop volumineux pour un e-mail. Réduisez la période." }, 413);
    }

    // ── Le destinataire vient de la base, jamais de la requête ──
    const { data: company, error: compErr } = await admin
      .from("companies").select("name, accountant_email")
      .eq("id", profile.company_id).single();
    if (compErr || !company) return json({ error: "Entreprise introuvable" }, 400);

    const to = (company.accountant_email || "").trim();
    if (!to) {
      return json({ error: "Aucune adresse de comptable enregistrée dans les réglages." }, 400);
    }

    const companyName = company.name || "Votre entreprise";
    const period = String(periodLabel || "").slice(0, 120) || "la période demandée";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        // Le bureau reçoit une copie : il doit pouvoir prouver l'envoi.
        cc: caller.email ? [caller.email] : undefined,
        reply_to: caller.email || undefined,
        subject: `[${companyName}] — Heures du ${period}`,
        html: buildHtml(companyName, period, String(fileName)),
        attachments: [{ filename: String(fileName), content: contentBase64 }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[send-payroll-export] Resend", res.status, detail);
      return json({ error: "L'envoi a été refusé par le service d'e-mail." }, 502);
    }

    return json({ success: true, to });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[send-payroll-export] error:", e);
    return json({ error: message }, 500);
  }
});
