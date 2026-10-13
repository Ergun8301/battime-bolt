// Lot 19 — e-mails du bureau aux salariés : les règles PURES.
//
// Deux envois, à la demande du bureau (admin actif de l'entreprise) :
//   · « planning-hebdo » : le planning de la semaine d'un salarié, en PDF joint ;
//   · « message-bureau » : un court message (500 caractères au plus).
// Ce fichier ne sait RIEN du réseau ni de la base (ni Deno, ni Resend) : il sert à
// la fonction edge `send-staff-email` ET à la fenêtre du bureau (aperçu, compteurs,
// libellés) — les deux disent exactement la même chose. Testé par staff-email.test.ts.
//
// Il ne contient AUCUN secret et n'importe rien : c'est une feuille de l'arbre
// (email.ts l'importe pour connaître les nouvelles familles de désabonnement).

// ── Les limites : UN seul endroit chacune ───────────────────────────────────

/** Plafond d'envois par entreprise et par jour (jour de Paris) pour ces e-mails. */
export const DAILY_EMAIL_CAP = 50;
/** Longueur maximale d'un message du bureau, en caractères (un emoji compte pour un). */
export const MAX_MESSAGE_CHARS = 500;
/** Un PDF de planning de la semaine fait quelques dizaines de ko : 1 Mo est très large. */
export const MAX_PDF_BYTES = 1_000_000;
/** Toutes les pièces jointes d'une même demande, ensemble. */
export const MAX_TOTAL_PDF_BYTES = 8 * 1024 * 1024;
/** Destinataires par demande : jamais plus que le plafond du jour. */
export const MAX_RECIPIENTS_PER_CALL = DAILY_EMAIL_CAP;
/** Au-delà de cette durée, on cesse d'envoyer (la fonction edge a une limite de temps). */
export const SEND_BUDGET_MS = 110_000;

export const STAFF_EMAIL_KINDS = ['planning-hebdo', 'message-bureau'] as const;
export type StaffEmailKind = (typeof STAFF_EMAIL_KINDS)[number];
export const isStaffKind = (k: unknown): k is StaffEmailKind =>
  typeof k === 'string' && (STAFF_EMAIL_KINDS as readonly string[]).includes(k);

/** « Limite quotidienne atteinte (50). Réessayez demain. » */
export const limitMessage = (cap: number = DAILY_EMAIL_CAP) => `Limite quotidienne atteinte (${cap}). Réessayez demain.`;

// ── Résultats rendus au bureau ──────────────────────────────────────────────

export type Outcome = 'sent' | 'failed' | 'uncertain';
/** skipped = ignoré AVANT l'envoi (raison à l'appui) ; failed = refusé, rien n'est parti ; uncertain = peut-être parti. */
export type ResultOutcome = Outcome | 'skipped';
export type ReasonCode =
  | 'inconnu' | 'sans-adresse' | 'adresse-partagee' | 'desabonne' | 'doublon' | 'limite' | 'pdf-invalide' | 'pdf-absent'
  | 'refus-service' | 'incertain' | 'delai' | 'erreur';

export type ResultItem = { user_id: string; outcome: ResultOutcome; reason?: ReasonCode; message: string };

export function reasonText(reason: ReasonCode, kind: StaffEmailKind): string {
  switch (reason) {
    case 'inconnu': return 'Salarié introuvable ou archivé : rien n’est parti.';
    case 'sans-adresse': return 'Pas d’adresse e-mail enregistrée : rien n’est parti.';
    case 'adresse-partagee': return 'Même adresse qu’un autre salarié de la liste : un seul e-mail est envoyé à cette adresse.';
    case 'desabonne': return kind === 'message-bureau'
      ? 'Désabonné : cette personne a demandé à ne plus recevoir ces messages. Le message n’est pas envoyé (ce n’est pas un e-mail obligatoire) : contactez-la autrement.'
      : 'Désabonné : cette personne a demandé à ne plus recevoir le planning par e-mail. Rien n’est parti.';
    case 'doublon': return 'Même contenu envoyé à cette personne il y a moins d’une minute : non renvoyé.';
    case 'limite': return limitMessage();
    case 'pdf-absent': return 'Le planning de cette personne n’a pas été préparé : rien n’est parti.';
    case 'pdf-invalide': return 'Le PDF de cette personne est illisible ou trop gros : rien n’est parti.';
    case 'refus-service': return 'Refusé par le service d’e-mail : rien n’est parti.';
    case 'incertain': return 'Réponse du service d’e-mail perdue : l’e-mail est peut-être parti. Ne le renvoyez pas tout de suite.';
    case 'delai': return 'Temps écoulé avant l’envoi : rien n’est parti, recommencez.';
    default: return 'Envoi impossible pour le moment : rien n’est parti.';
  }
}

export const sentText = 'Envoyé.';

/** Résultat HTTP du service d'e-mail : 2xx envoyé ; 4xx = refusé (rien n'est parti) ; 408, 409, 5xx et le reste = incertain. */
export function classifyHttp(status: number): Outcome {
  if (status >= 200 && status < 300) return 'sent';
  if (status >= 400 && status < 500 && status !== 408 && status !== 409) return 'failed';
  return 'uncertain';
}

// ── Adresses ────────────────────────────────────────────────────────────────

export const normalizeEmail = (e: unknown): string => (typeof e === 'string' ? e.trim().toLowerCase() : '');

/** Une adresse plausible, SANS caractère qui permettrait d'injecter un en-tête ou un second destinataire. */
export function isPlausibleEmail(e: unknown): e is string {
  const s = normalizeEmail(e);
  if (!s || s.length > 254) return false;
  if (/[\s<>",;:()[\]\\]/.test(s) || s.includes('..')) return false;
  return /^[^@]+@[^@]+\.[^@.]{2,}$/.test(s);
}

/** « jean.dupont@example.com » → « j***@example.com » : pour le journal. */
export function maskEmail(e: string): string {
  const s = normalizeEmail(e);
  const at = s.lastIndexOf('@');
  if (at < 1) return '***';
  return `${s[0]}***${s.slice(at)}`.slice(0, 120);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Empreinte du destinataire, salée par l'entreprise : deux entreprises n'ont pas la même pour la même adresse. */
export const recipientHash = (companyId: string, email: string) => sha256Hex(`rcpt|${companyId}|${normalizeEmail(email)}`);
/** Empreinte du CONTENU (jamais le contenu lui-même) : sert à reconnaître « même contenu, même personne, même minute ». */
export const contentHash = (kind: StaffEmailKind, payload: string) => sha256Hex(`content|${kind}|${payload}`);

// ── Le message libre du bureau ──────────────────────────────────────────────

const INVISIBLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤﻿]/g;

/**
 * Nettoie et borne le texte. Le texte reste du TEXTE : rien n'est interprété
 * (pas de HTML — les chevrons sont échappés à l'affichage —, pas de lien
 * fabriqué), les retours à la ligne sont gardés (trois d'affilée = deux),
 * les caractères de contrôle et de sens d'écriture cachés sont retirés.
 */
export function cleanMessage(raw: unknown): { ok: true; text: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'Écrivez un message.' };
  const text = raw.normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLES, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) return { ok: false, error: 'Écrivez un message.' };
  if (Array.from(text).length > MAX_MESSAGE_CHARS) return { ok: false, error: `Message trop long (${MAX_MESSAGE_CHARS} caractères au plus).` };
  return { ok: true, text };
}

export const messageLength = (text: string) => Array.from(text).length;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Une ligne sans retour à la ligne ni caractère caché, bornée : pour un sujet ou un nom. */
export function cleanLine(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s.normalize('NFC').replace(INVISIBLES, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

// ── La semaine ──────────────────────────────────────────────────────────────

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Une date « AAAA-MM-JJ » réelle ET un lundi (les semaines du planning commencent le lundi) ; sinon null. */
export function weekFromMonday(iso: unknown): { start: string; end: string; label: string } | null {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const a = new Date(Date.UTC(y, m - 1, d));
  if (a.getUTCFullYear() !== y || a.getUTCMonth() !== m - 1 || a.getUTCDate() !== d || a.getUTCDay() !== 1) return null;
  const b = new Date(Date.UTC(y, m - 1, d + 6));
  const endIso = b.toISOString().slice(0, 10);
  const label = a.getUTCFullYear() !== b.getUTCFullYear()
    ? `du ${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()} au ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`
    : a.getUTCMonth() !== b.getUTCMonth()
      ? `du ${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} au ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`
      : `du ${a.getUTCDate()} au ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  return { start: iso, end: endIso, label };
}

/** Nom du fichier joint : construit ICI, jamais pris dans la requête. */
export const planningFileName = (mondayIso: string) => `planning-semaine-${mondayIso}.pdf`;

// ── Le PDF joint ────────────────────────────────────────────────────────────

export type PdfCheck = { ok: true; bytes: Uint8Array; base64: string } | { ok: false; reason: 'pdf-invalide' };

/** Base64 STRICT (pas d'espaces, pas de retours, remplissage correct) ; null sinon. */
export function decodeBase64(b64: string): Uint8Array | null {
  if (b64.length === 0 || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Taille décodée annoncée par la longueur de la chaîne (sans décoder). */
export const approxBase64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4);

/**
 * Un PDF recevable : type annoncé « application/pdf », base64 strict, taille
 * bornée, signature « %PDF- » en tête ET « %%EOF » dans les derniers octets.
 * Ce n'est pas une analyse complète du fichier : c'est ce qui écarte un
 * exécutable, une image ou un texte renommé en .pdf.
 */
export function checkPdf(mime: unknown, contentBase64: unknown, maxBytes = MAX_PDF_BYTES): PdfCheck {
  if (mime !== 'application/pdf' || typeof contentBase64 !== 'string') return { ok: false, reason: 'pdf-invalide' };
  if (approxBase64Bytes(contentBase64) > maxBytes) return { ok: false, reason: 'pdf-invalide' };
  const bytes = decodeBase64(contentBase64);
  if (!bytes || bytes.length < 16 || bytes.length > maxBytes) return { ok: false, reason: 'pdf-invalide' };
  const head = String.fromCharCode.apply(null, Array.from(bytes.subarray(0, 5)));
  if (head !== '%PDF-') return { ok: false, reason: 'pdf-invalide' };
  const tail = String.fromCharCode.apply(null, Array.from(bytes.subarray(Math.max(0, bytes.length - 1024))));
  if (!tail.includes('%%EOF')) return { ok: false, reason: 'pdf-invalide' };
  return { ok: true, bytes, base64: contentBase64 };
}

// ── Le choix des destinataires ──────────────────────────────────────────────

/** Une ligne de la table users, telle que la fonction la relit en base. */
export type WorkerRow = {
  id: string;
  company_id: string | null;
  role: string | null;
  is_active: boolean | null;
  first_name: string | null;
  email: string | null;
};
export type Candidate = { id: string; email: string; firstName: string };
export type Skipped = { user_id: string; reason: 'inconnu' | 'sans-adresse' | 'adresse-partagee' | 'desabonne' };

/** Un salarié que le bureau peut contacter : de CETTE entreprise, actif, salarié ou chef d'équipe. */
export function isContactable(w: WorkerRow | undefined, companyId: string): w is WorkerRow {
  return !!w && w.company_id === companyId && w.is_active !== false && (w.role === 'worker' || w.role === 'lead');
}

/**
 * Qui peut recevoir, qui est ignoré et pourquoi. L'adresse vient de `rows` (relue
 * en base), JAMAIS de la demande ; un identifiant inconnu, d'une autre entreprise
 * ou archivé donne « inconnu » sans rien révéler de plus. Ordre = celui de la demande.
 */
export function pickRecipients(
  companyId: string,
  requestedIds: string[],
  rows: WorkerRow[],
  unsubscribed: Set<string>,
): { candidates: Candidate[]; skipped: Skipped[] } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seenEmails = new Set<string>();
  const candidates: Candidate[] = [];
  const skipped: Skipped[] = [];
  for (const id of Array.from(new Set(requestedIds))) { // le même salarié deux fois = une seule ligne
    const w = byId.get(id);
    if (!isContactable(w, companyId)) { skipped.push({ user_id: id, reason: 'inconnu' }); continue; }
    const email = normalizeEmail(w.email);
    if (!isPlausibleEmail(email)) { skipped.push({ user_id: id, reason: 'sans-adresse' }); continue; }
    if (unsubscribed.has(email)) { skipped.push({ user_id: id, reason: 'desabonne' }); continue; }
    // Deux salariés avec la même adresse (compte partagé) : un seul e-mail, pas deux.
    if (seenEmails.has(email)) { skipped.push({ user_id: id, reason: 'adresse-partagee' }); continue; }
    seenEmails.add(email);
    candidates.push({ id, email, firstName: cleanLine(w.first_name, 40) });
  }
  return { candidates, skipped };
}

// ── Les gabarits (le texte est FIXE : seul le message du bureau est libre) ──

export type MailParts = {
  subject: string;
  /** Petite ligne sous le nom de l'entreprise, dans l'en-tête noir. */
  headline: string;
  greeting: string;
  paragraphs: string[];
  /** Le message libre du bureau, affiché dans un encadré (e-mail « message »). */
  quote?: string;
  attachmentLine?: string;
  footer: string;
};

export function planningParts(o: { company: string; firstName: string; weekLabel: string; fileName: string; canReply: boolean }): MailParts {
  const company = cleanLine(o.company, 60) || 'Votre entreprise';
  const first = cleanLine(o.firstName, 40);
  return {
    subject: `[${company}] Votre planning de la semaine ${o.weekLabel}`,
    headline: 'Planning de la semaine · via BEMEXO',
    greeting: first ? `Bonjour ${first},` : 'Bonjour,',
    paragraphs: [
      `Voici votre planning pour la semaine ${o.weekLabel}, en pièce jointe (PDF).`,
      'Il peut encore changer : en cas de doute, rapprochez-vous du bureau.',
    ],
    attachmentLine: `Fichier joint : ${o.fileName}`,
    footer: `Envoyé depuis BEMEXO à la demande de ${company}. ${o.canReply ? 'Répondez à cet e-mail pour joindre le bureau.' : 'Cet e-mail ne permet pas de répondre au bureau : contactez-le directement.'}`,
  };
}

export function messageParts(o: { company: string; firstName: string; message: string; canReply: boolean }): MailParts {
  const company = cleanLine(o.company, 60) || 'Votre entreprise';
  const first = cleanLine(o.firstName, 40);
  return {
    subject: `[${company}] Message du bureau`,
    headline: 'Message du bureau · via BEMEXO',
    greeting: first ? `Bonjour ${first},` : 'Bonjour,',
    paragraphs: [`Le bureau de ${company} vous écrit :`],
    quote: o.message,
    footer: `Envoyé depuis BEMEXO à la demande de ${company}. ${o.canReply ? 'Répondez à cet e-mail pour joindre le bureau.' : 'Cet e-mail ne permet pas de répondre au bureau : contactez-le directement.'}`,
  };
}

/** L'aperçu montré au bureau : le texte exact de l'e-mail, sans la mise en page. */
export function previewText(p: MailParts): string {
  return [
    p.greeting,
    ...p.paragraphs,
    ...(p.quote ? [p.quote] : []),
    ...(p.attachmentLine ? [p.attachmentLine] : []),
    p.footer,
  ].join('\n\n');
}

const paragraphHtml = (text: string, style: string) =>
  text.split('\n\n').map((para) => `<p style="${style}">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`).join('');

/** Le corps HTML (mise en page de l'export de paie : crème, noir, jaune). Tout texte est échappé. */
export function partsToHtml(p: MailParts, company: string): string {
  const name = escapeHtml(cleanLine(company, 60) || 'Votre entreprise');
  const body = 'margin:0 0 10px;font-size:14px;color:#3a352f;line-height:1.5;';
  return `
<div style="font-family:Arial,Helvetica,sans-serif;background:#F2EDE3;padding:24px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;max-width:100%;">
      <tr><td style="background:#15120F;padding:20px 26px;">
        <div style="color:#FFC21A;font-weight:900;font-size:17px;">${name}</div>
        <div style="color:#a59c86;font-size:11.5px;margin-top:3px;">${escapeHtml(p.headline)}</div>
      </td></tr>
      <tr><td style="padding:22px 26px 10px;">
        <p style="margin:0 0 10px;font-size:15px;color:#15120F;">${escapeHtml(p.greeting)}</p>
        ${p.paragraphs.map((t) => `<p style="${body}">${escapeHtml(t)}</p>`).join('\n        ')}
        ${p.quote ? `<div style="margin:12px 0 4px;padding:12px 14px;background:#FBF8F2;border-left:4px solid #FFC21A;border-radius:6px;">${paragraphHtml(p.quote, 'margin:0 0 8px;font-size:14px;color:#15120F;line-height:1.5;')}</div>` : ''}
      </td></tr>
      ${p.attachmentLine ? `<tr><td style="padding:6px 26px 24px;"><p style="margin:0;font-size:13px;color:#6E6A63;">${escapeHtml(p.attachmentLine)}</p></td></tr>` : '<tr><td style="padding:0 26px 18px;"></td></tr>'}
      <tr><td style="background:#FBF8F2;padding:13px 26px;">
        <p style="margin:0;font-size:11px;color:#9a948a;">${escapeHtml(p.footer)}</p>
      </td></tr>
    </table>
  </td></tr></table>
</div>`;
}
