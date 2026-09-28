// Envoi d'e-mails par l'API Resend — commun aux fonctions qui écrivent
// directement (récap hebdo, relances, alertes, export paie).
//
// Ce que ce module garantit à chaque envoi, pour la délivrabilité :
//   - expéditeur sur bemexo.com et Reply-To vers une adresse lue ;
//   - version texte en plus du HTML (un e-mail HTML seul est mal noté) ;
//   - pour les e-mails récurrents : List-Unsubscribe + List-Unsubscribe-Post
//     (désabonnement en un clic, RFC 8058), UN destinataire par envoi pour que
//     le lien de désabonnement soit personnel.
//
// Le lien de désabonnement est signé (HMAC) : impossible de désabonner
// quelqu'un d'autre en devinant l'URL. La clé est dérivée du secret déjà
// présent dans toutes les fonctions (SUPABASE_SERVICE_ROLE_KEY), ou de
// EMAIL_UNSUBSCRIBE_SECRET s'il est défini.
//
// Importé via « ../_shared/email.ts » : le déploiement par la CLI Supabase
// (`supabase functions deploy <nom>`) embarque ce fichier automatiquement.

export const FROM_NOTIFICATIONS = 'BEMEXO <notifications@bemexo.com>';
export const FROM_CONTACT = 'BEMEXO <contact@bemexo.com>';
export const REPLY_TO = 'contact@bemexo.com';
const SITE_URL = 'https://bemexo.com';

/** Familles d'e-mails récurrents, chacune désabonnable séparément. */
export type EmailKind = 'weekly-digest' | 'missing-days' | 'cert-expiry' | 'budget-alerts';
export const EMAIL_KINDS: EmailKind[] = ['weekly-digest', 'missing-days', 'cert-expiry', 'budget-alerts'];

// ── Version texte ────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
  '&rsquo;': '’', '&laquo;': '«', '&raquo;': '»', '&eacute;': 'é', '&egrave;': 'è', '&agrave;': 'à',
};

/**
 * Version texte d'un e-mail HTML : titres et paragraphes sur leurs lignes,
 * listes en tirets, liens « libellé : URL ». Suffisant pour nos gabarits
 * (tableaux simples, aucun contenu imbriqué complexe).
 */
export function htmlToText(html: string): string {
  let s = html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!text || text === href) return href;
      return `${text} : ${href}`;
    })
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|ul|ol|table)>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  s = s.replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Désabonnement signé ─────────────────────────────────────────────────

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function encodeEmail(email: string): string {
  return b64url(new TextEncoder().encode(email.trim().toLowerCase()));
}

export function decodeEmail(encoded: string): string | null {
  try {
    const bin = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const email = new TextDecoder().decode(bytes).trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  } catch {
    return null;
  }
}

function unsubscribeSecret(): string {
  const s = Deno.env.get('EMAIL_UNSUBSCRIBE_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!s) throw new Error('Aucune clé pour signer les liens de désabonnement');
  return s;
}

export async function unsubscribeToken(email: string, kind: EmailKind, secret = unsubscribeSecret()): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`unsub|${kind}|${email.trim().toLowerCase()}`));
  return b64url(new Uint8Array(sig));
}

export async function verifyUnsubscribeToken(email: string, kind: EmailKind, token: string, secret = unsubscribeSecret()): Promise<boolean> {
  const expected = await unsubscribeToken(email, kind, secret);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

async function unsubscribeQuery(email: string, kind: EmailKind): Promise<string> {
  return new URLSearchParams({ e: encodeEmail(email), k: kind, t: await unsubscribeToken(email, kind) }).toString();
}

/** URL de la fonction `email-unsubscribe` : cible de l'en-tête (POST en un clic). */
export async function unsubscribeUrl(email: string, kind: EmailKind): Promise<string> {
  const base = Deno.env.get('SUPABASE_URL');
  if (!base) throw new Error('SUPABASE_URL manquant');
  return `${base}/functions/v1/email-unsubscribe?${await unsubscribeQuery(email, kind)}`;
}

/** Page de désabonnement sur bemexo.com : le lien visible dans le corps. */
export async function unsubscribePageUrl(email: string, kind: EmailKind): Promise<string> {
  return `${SITE_URL}/desabonnement?${await unsubscribeQuery(email, kind)}`;
}

// Le client Supabase de la fonction appelante. Typage volontairement lâche :
// chaque fonction crée son client sans schéma, un type exact ferait exploser
// l'inférence de supabase-js (« Type instantiation is excessively deep »).
// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any };

/**
 * Adresses désabonnées de cette famille d'e-mails. Si la table n'existe pas
 * encore (migration pas appliquée), on n'empêche aucun envoi.
 */
export async function loadUnsubscribed(db: Db, kind: EmailKind): Promise<Set<string>> {
  const { data, error } = await db.from('email_unsubscribes').select('email').eq('kind', kind);
  if (error) {
    console.warn('[email] email_unsubscribes illisible, aucun filtre appliqué :', error);
    return new Set();
  }
  return new Set(((data || []) as { email: string }[]).map((r) => r.email.trim().toLowerCase()));
}

// ── Envoi ───────────────────────────────────────────────────────────────

export type SendOptions = {
  to: string;
  subject: string;
  html: string;
  /** Famille récurrente : ajoute les en-têtes de désabonnement. */
  kind?: EmailKind;
  from?: string;
  replyTo?: string;
  cc?: string[];
  attachments?: { filename: string; content: string }[];
  idempotencyKey?: string;
};

const KIND_LABEL: Record<EmailKind, string> = {
  'weekly-digest': 'le récap hebdomadaire',
  'missing-days': 'les rappels de saisie des heures',
  'cert-expiry': 'les alertes d’habilitations',
  'budget-alerts': 'les alertes de budget chantier',
};

/** Ligne de désabonnement ajoutée sous les e-mails récurrents (lien sur bemexo.com). */
async function unsubscribeFooter(email: string, kind: EmailKind): Promise<string> {
  const url = await unsubscribePageUrl(email, kind);
  return `
<p style="font-family:Arial,Helvetica,sans-serif;margin:0 auto;padding:0 16px 24px;max-width:560px;text-align:center;font-size:11px;line-height:1.5;color:#9a948a;">
  Vous recevez ${KIND_LABEL[kind]} de BEMEXO. <a href="${url}" style="color:#6E6A63;">Se désabonner</a>
</p>`;
}

export async function sendResend(opts: SendOptions): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY manquant (secret Supabase)');

  const headers: Record<string, string> = {};
  let html = opts.html;
  if (opts.kind) {
    html += await unsubscribeFooter(opts.to, opts.kind);
    const url = await unsubscribeUrl(opts.to, opts.kind);
    headers['List-Unsubscribe'] = `<${url}>, <mailto:${REPLY_TO}?subject=D%C3%A9sabonnement%20${opts.kind}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: opts.from || FROM_NOTIFICATIONS,
      to: [opts.to],
      cc: opts.cc?.length ? opts.cc : undefined,
      reply_to: opts.replyTo || REPLY_TO,
      subject: opts.subject,
      html,
      text: htmlToText(html),
      headers: Object.keys(headers).length ? headers : undefined,
      attachments: opts.attachments,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => '')}`);
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export type SendReport = { sent: string[]; failed: { to: string; error: string }[] };

/**
 * Un envoi par destinataire, SANS s'arrêter au premier échec.
 *
 * Pourquoi : les alertes (budget, habilitations) ne sont marquées « envoyées »
 * qu'APRÈS l'envoi. Si le 2e envoi lançait une erreur, le 1er admin aurait
 * déjà l'e-mail, rien ne serait marqué, et il le recevrait de nouveau au
 * passage suivant. Ici chaque résultat est rendu : l'appelant marque l'alerte
 * dès qu'au moins un destinataire l'a reçue.
 *
 * `dedupe` (facultatif) décrit le CONTENU envoyé (entreprise + alertes) : on
 * en tire une clé d'idempotence Resend par destinataire. Une relance de la
 * fonction dans les 24 h ne renvoie pas un e-mail déjà parti.
 */
export async function sendToEach(
  recipients: string[],
  opts: Omit<SendOptions, 'to' | 'idempotencyKey'>,
  dedupe?: string,
): Promise<SendReport> {
  const report: SendReport = { sent: [], failed: [] };
  for (const to of recipients) {
    try {
      const idempotencyKey = dedupe
        ? `${opts.kind || 'email'}-${await sha256Hex(`${dedupe}|${to.trim().toLowerCase()}`)}`
        : undefined;
      await sendResend({ ...opts, to, idempotencyKey });
      report.sent.push(to);
    } catch (e) {
      console.error('[email] envoi échoué pour un destinataire :', e);
      report.failed.push({ to, error: (e as Error).message });
    }
  }
  return report;
}
