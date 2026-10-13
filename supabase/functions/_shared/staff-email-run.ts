// Lot 19 — le MOTEUR de la fonction edge `send-staff-email`.
//
// Tout ce que la fonction décide est ici ; supabase/functions/send-staff-email/index.ts
// ne fait que brancher les vraies pièces (base, Resend). Rien ici ne touche au réseau :
// la base et le transport d'envoi sont des pièces INJECTÉES (`Deps`). Les tests donnent
// de fausses pièces — AUCUN vrai e-mail ne peut partir d'un test.
//
// SÉCURITÉ — ce que le moteur refuse (même modèle que send-payroll-export) :
//   · l'appelant doit être ADMIN et ACTIF de son entreprise ; un compte du support
//     BEMEXO (lecture seule) n'envoie rien ;
//   · l'entreprise est celle de l'appelant, relue en base : jamais celle de la demande ;
//   · le destinataire n'est JAMAIS pris dans la demande : la demande ne porte que des
//     identifiants de salariés, l'adresse est relue en base, et le salarié doit être
//     ACTIF et de CETTE entreprise ;
//   · un salarié désabonné ne reçoit rien (la liste est relue avant chaque envoi ; si
//     elle est illisible, on n'envoie pas) ;
//   · le plafond du jour est appliqué AVANT l'envoi, par la base, sous un verrou propre à
//     l'entreprise (staff_email_reserve) : même en rafale il ne peut pas être dépassé ;
//   · un PDF doit être un vrai PDF, de taille bornée ; le nom du fichier est fabriqué ici ;
//   · le texte du message est nettoyé et échappé ; le modèle d'e-mail est fixe ;
//   · un destinataire = un e-mail (le lien de désabonnement est personnel) ;
//   · même contenu, même personne, même minute = un seul envoi (décidé par la base) ;
//   · une erreur de transport est RAPPORTÉE (envoyé / non envoyé / incertain), jamais
//     renvoyée automatiquement ;
//   · aucun journal n'écrit une adresse ni un contenu : seulement des compteurs et des codes.
import {
  DAILY_EMAIL_CAP, MAX_RECIPIENTS_PER_CALL, MAX_TOTAL_PDF_BYTES, SEND_BUDGET_MS,
  approxBase64Bytes, checkPdf, cleanLine, cleanMessage, contentHash, isContactable, isPlausibleEmail, isUuid, limitMessage,
  maskEmail, messageParts, normalizeEmail, partsToHtml, pickRecipients, planningFileName, planningParts, reasonText,
  recipientHash, sentText, weekFromMonday,
  type Candidate, type MailParts, type Outcome, type ReasonCode, type ResultItem, type StaffEmailKind, type WorkerRow,
} from './staff-email-core.ts';
import { FROM_NOTIFICATIONS, REPLY_TO } from './email.ts';

// ── Les pièces injectées ────────────────────────────────────────────────────

export type Profile = { role: string | null; company_id: string | null; is_active: boolean | null };
export type Company = { name: string | null; email: string | null };
export type ReserveItem = { user_id: string | null; mask: string; rhash: string; chash: string };
export type ReserveResult = {
  cap: number; used_before: number; used_after: number;
  items: { i: number; result: 'reserved' | 'duplicate' | 'cap'; id: string | null }[];
};
export type OutMail = {
  to: string; subject: string; html: string; kind: StaffEmailKind; from: string; replyTo: string;
  attachments?: { filename: string; content: string }[]; idempotencyKey: string;
};
export type SendResult = { outcome: Outcome; code: string };

export type Deps = {
  /** Horloge (millisecondes) : injectée pour tester le délai. */
  now(): number;
  loadProfile(userId: string): Promise<Profile | null>;
  /** Le compte est-il un compte du support BEMEXO ? (table absente = non). */
  isSupportStaff(userId: string): Promise<boolean>;
  loadCompany(companyId: string): Promise<Company | null>;
  /** Tous les salariés actifs de l'entreprise (pour l'écran du bureau). */
  listWorkers(companyId: string): Promise<WorkerRow[]>;
  /** Ces identifiants SEULEMENT, dans CETTE entreprise (le filtre d'entreprise est dans la requête). */
  loadWorkers(companyId: string, ids: string[]): Promise<WorkerRow[]>;
  /** Pour ces adresses : les familles dont chacune s'est désabonnée. LÈVE si la liste est illisible. */
  loadUnsubscribed(emails: string[]): Promise<Map<string, Set<string>>>;
  usedToday(companyId: string): Promise<number>;
  reserve(a: { companyId: string; sentBy: string; kind: StaffEmailKind; cap: number; items: ReserveItem[] }): Promise<ReserveResult>;
  finish(a: { id: string; companyId: string; status: Outcome; reason: string }): Promise<void>;
  /** LE transport : en production Resend, dans les tests un faux. */
  send(mail: OutMail): Promise<SendResult>;
  /** Compteurs et codes seulement. Jamais d'adresse, jamais de contenu. */
  log(event: string, data?: Record<string, string | number | boolean>): void;
};

/** La migration ou la fonction de base n'est pas là : l'envoi n'est « pas encore disponible ». */
export class Unavailable extends Error {}

export type EngineResponse = { status: number; body: Record<string, unknown> };
const reply = (status: number, body: Record<string, unknown>): EngineResponse => ({ status, body });
const bad = (error: string, status = 400) => reply(status, { error });

const asObject = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;

/** Réponse de l'écran « état » : qui a une adresse, qui est désabonné, combien d'envois aujourd'hui. */
export type EtatWorker = { id: string; has_email: boolean; unsubscribed: Record<StaffEmailKind, boolean> };

// ── Point d'entrée ──────────────────────────────────────────────────────────

export async function handleStaffEmail(deps: Deps, callerId: string, body: unknown): Promise<EngineResponse> {
  try {
    return await run(deps, callerId, body);
  } catch (e) {
    if (e instanceof Unavailable) {
      // Lire l'état n'est pas une erreur : « pas encore disponible » est une réponse normale (200),
      // pour que le bureau n'ait ni message ni erreur dans la console. Envoyer, lui, est refusé (503).
      return asObject(body)?.action === 'etat'
        ? reply(200, { available: false })
        : reply(503, { available: false, error: 'L’envoi par e-mail n’est pas encore disponible.' });
    }
    deps.log('erreur', { code: 'inattendue' });
    return bad('Envoi impossible pour le moment. Rien n’est parti.', 500);
  }
}

async function run(deps: Deps, callerId: string, body: unknown): Promise<EngineResponse> {
  const b = asObject(body);
  if (!b) return bad('Requête illisible.');
  const action = b.action;
  if (action !== 'etat' && action !== 'planning' && action !== 'message') return bad('Action inconnue.');

  // ── Qui appelle ? (vérifié en base : le jeton seul ne suffit pas) ──
  if (await deps.isSupportStaff(callerId)) {
    return bad('Le mode support est en lecture seule : aucun e-mail ne peut partir.', 403);
  }
  const profile = await deps.loadProfile(callerId);
  if (!profile || profile.role !== 'admin' || !profile.company_id) return bad('Réservé à l’administrateur de l’entreprise', 403);
  if (profile.is_active === false) return bad('Ce compte a été archivé', 403);
  const companyId = profile.company_id;

  if (action === 'etat') return etat(deps, companyId);

  const company = await deps.loadCompany(companyId);
  if (!company) return bad('Entreprise introuvable', 400);
  const companyName = cleanLine(company.name, 60) || 'Votre entreprise';
  const canReply = isPlausibleEmail(company.email);
  const replyTo = canReply ? normalizeEmail(company.email) : REPLY_TO;

  return action === 'planning'
    ? planning(deps, callerId, companyId, companyName, canReply, replyTo, b)
    : message(deps, callerId, companyId, companyName, canReply, replyTo, b);
}

// ── Action « état » ─────────────────────────────────────────────────────────

async function etat(deps: Deps, companyId: string): Promise<EngineResponse> {
  const used = await deps.usedToday(companyId);
  const workers = (await deps.listWorkers(companyId)).filter((w) => isContactable(w, companyId));
  const emails = [...new Set(workers.map((w) => normalizeEmail(w.email)).filter((e) => isPlausibleEmail(e)))];
  const unsub = emails.length ? await deps.loadUnsubscribed(emails) : new Map<string, Set<string>>();
  const out: EtatWorker[] = workers.map((w) => {
    const email = normalizeEmail(w.email);
    const kinds = unsub.get(email) ?? new Set<string>();
    return {
      id: w.id,
      has_email: isPlausibleEmail(email),
      unsubscribed: { 'planning-hebdo': kinds.has('planning-hebdo'), 'message-bureau': kinds.has('message-bureau') },
    };
  });
  return reply(200, { available: true, cap: DAILY_EMAIL_CAP, used, remaining: Math.max(0, DAILY_EMAIL_CAP - used), workers: out });
}

// ── Action « planning » : un PDF par salarié ────────────────────────────────

async function planning(
  deps: Deps, callerId: string, companyId: string, companyName: string, canReply: boolean, replyTo: string, b: Record<string, unknown>,
): Promise<EngineResponse> {
  const kind: StaffEmailKind = 'planning-hebdo';
  const week = weekFromMonday(b.week_start);
  if (!week) return bad('Semaine invalide.');
  if (!Array.isArray(b.items) || b.items.length < 1) return bad('Aucun salarié choisi.');
  if (b.items.length > MAX_RECIPIENTS_PER_CALL) return bad(`Trop de destinataires (${MAX_RECIPIENTS_PER_CALL} au plus par envoi).`);

  // Forme de chaque ligne + taille TOTALE avant de décoder quoi que ce soit.
  const lines: { id: string; mime: unknown; content: unknown }[] = [];
  let total = 0;
  for (const it of b.items) {
    const o = asObject(it);
    if (!o || !isUuid(o.user_id)) return bad('Demande illisible (identifiant de salarié).');
    if (typeof o.content_base64 === 'string') total += approxBase64Bytes(o.content_base64);
    lines.push({ id: o.user_id.toLowerCase(), mime: o.mime, content: o.content_base64 });
  }
  if (total > MAX_TOTAL_PDF_BYTES) return bad('Pièces jointes trop volumineuses pour un seul envoi. Envoyez par petits groupes.', 413);

  const results = new Map<string, ResultItem>();
  const order: string[] = [];
  const pdfs = new Map<string, string>(); // id → base64 validé
  for (const l of lines) {
    if (results.has(l.id) || pdfs.has(l.id)) { continue; } // même salarié deux fois dans la demande : une seule ligne
    order.push(l.id);
    const chk = checkPdf(l.mime, l.content);
    if (!chk.ok) results.set(l.id, skipped(l.id, 'pdf-invalide', kind));
    else pdfs.set(l.id, chk.base64);
  }

  const prepared = await prepare(deps, companyId, kind, [...pdfs.keys()], results);
  const fileName = planningFileName(week.start);
  return deliver(deps, {
    kind, callerId, companyId, order, results, candidates: prepared,
    prepare: async (c) => {
      const pdf = pdfs.get(c.id)!;
      return {
        chashPayload: `${week.start}|${pdf}`,
        parts: planningParts({ company: companyName, firstName: c.firstName, weekLabel: week.label, fileName, canReply }),
        attachments: [{ filename: fileName, content: pdf }],
      };
    },
    companyName, replyTo,
  });
}

// ── Action « message » : un texte libre, borné ──────────────────────────────

async function message(
  deps: Deps, callerId: string, companyId: string, companyName: string, canReply: boolean, replyTo: string, b: Record<string, unknown>,
): Promise<EngineResponse> {
  const kind: StaffEmailKind = 'message-bureau';
  const msg = cleanMessage(b.message);
  if (!msg.ok) return bad(msg.error);
  if (!Array.isArray(b.user_ids) || b.user_ids.length < 1) return bad('Aucun salarié choisi.');
  if (b.user_ids.length > MAX_RECIPIENTS_PER_CALL) return bad(`Trop de destinataires (${MAX_RECIPIENTS_PER_CALL} au plus par envoi).`);
  const ids: string[] = [];
  for (const v of b.user_ids) {
    if (!isUuid(v)) return bad('Demande illisible (identifiant de salarié).');
    const id = v.toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }

  const results = new Map<string, ResultItem>();
  const prepared = await prepare(deps, companyId, kind, ids, results);
  return deliver(deps, {
    kind, callerId, companyId, order: ids, results, candidates: prepared,
    prepare: async (c) => ({
      chashPayload: msg.text,
      parts: messageParts({ company: companyName, firstName: c.firstName, message: msg.text, canReply }),
    }),
    companyName, replyTo,
  });
}

// ── Communs ─────────────────────────────────────────────────────────────────

const skipped = (user_id: string, reason: ReasonCode, kind: StaffEmailKind): ResultItem =>
  ({ user_id, outcome: 'skipped', reason, message: reasonText(reason, kind) });

/**
 * Relit les salariés demandés EN BASE (dans l'entreprise de l'appelant), puis la liste
 * des désabonnés, et range chacun : à envoyer, ou ignoré (avec la raison, déposée dans
 * `results`). L'adresse ne vient que de la base.
 */
async function prepare(
  deps: Deps, companyId: string, kind: StaffEmailKind, ids: string[], results: Map<string, ResultItem>,
): Promise<Candidate[]> {
  if (!ids.length) return [];
  const rows = await deps.loadWorkers(companyId, ids);
  const emails = [...new Set(rows.filter((r) => isContactable(r, companyId)).map((r) => normalizeEmail(r.email)).filter((e) => isPlausibleEmail(e)))];
  // Illisible = on n'envoie pas (jamais d'e-mail à quelqu'un qui s'est désabonné faute de pouvoir le vérifier).
  const unsub = emails.length ? await deps.loadUnsubscribed(emails) : new Map<string, Set<string>>();
  const gone = new Set([...unsub].filter(([, kinds]) => kinds.has(kind)).map(([e]) => e));
  const { candidates, skipped: ignored } = pickRecipients(companyId, ids, rows, gone);
  for (const s of ignored) results.set(s.user_id, skipped(s.user_id, s.reason, kind));
  return candidates;
}

type Deliver = {
  kind: StaffEmailKind; callerId: string; companyId: string; companyName: string; replyTo: string;
  order: string[]; results: Map<string, ResultItem>; candidates: Candidate[];
  prepare(c: Candidate): Promise<{ chashPayload: string; parts: MailParts; attachments?: { filename: string; content: string }[] }>;
};

async function deliver(deps: Deps, d: Deliver): Promise<EngineResponse> {
  const t0 = deps.now();
  let used: number | null = null;
  let reserved = 0;
  const failedIds = new Set<string>();

  if (d.candidates.length) {
    // 1) Les places se prennent AVANT l'envoi, d'un seul coup, sous le verrou de la base.
    const prepared = await Promise.all(d.candidates.map(async (c) => ({ c, p: await d.prepare(c) })));
    const items: ReserveItem[] = [];
    for (const { c, p } of prepared) {
      items.push({
        user_id: c.id, mask: maskEmail(c.email),
        rhash: await recipientHash(d.companyId, c.email), chash: await contentHash(d.kind, p.chashPayload),
      });
    }
    const res = await deps.reserve({ companyId: d.companyId, sentBy: d.callerId, kind: d.kind, cap: DAILY_EMAIL_CAP, items });
    used = res.used_after;

    // 2) Envoi, un par un, SEULEMENT pour les places prises. Aucun renvoi automatique.
    for (let k = 0; k < prepared.length; k++) {
      const { c, p } = prepared[k];
      const slot = res.items.find((x) => x.i === k + 1);
      if (!slot || slot.result === 'cap') { d.results.set(c.id, skipped(c.id, 'limite', d.kind)); continue; }
      if (slot.result === 'duplicate') { d.results.set(c.id, skipped(c.id, 'doublon', d.kind)); continue; }
      const placeId = slot.id;
      if (!placeId) { d.results.set(c.id, skipped(c.id, 'erreur', d.kind)); continue; }
      reserved++;

      let outcome: Outcome; let code: string;
      if (deps.now() - t0 > SEND_BUDGET_MS) {
        outcome = 'failed'; code = 'delai';
      } else {
        try {
          const sent = await deps.send({
            to: c.email, subject: p.parts.subject, html: partsToHtml(p.parts, d.companyName), kind: d.kind,
            from: FROM_NOTIFICATIONS, replyTo: d.replyTo, attachments: p.attachments, idempotencyKey: `staff-email-${placeId}`,
          });
          outcome = sent.outcome; code = sent.code;
        } catch {
          // Le transport a levé une erreur : on ne sait pas si le message est parti.
          outcome = 'uncertain'; code = 'transport';
        }
      }
      const safeCode = /^[a-z0-9_.-]{1,60}$/.test(code) ? code : 'inconnu';
      try {
        await deps.finish({ id: placeId, companyId: d.companyId, status: outcome, reason: safeCode });
      } catch {
        deps.log('journal-non-ecrit', { statut: outcome });
      }
      if (outcome === 'sent') d.results.set(c.id, { user_id: c.id, outcome: 'sent', message: sentText });
      else if (outcome === 'failed') {
        failedIds.add(c.id);
        const r: ReasonCode = code === 'delai' ? 'delai' : 'refus-service';
        d.results.set(c.id, { user_id: c.id, outcome: 'failed', reason: r, message: reasonText(r, d.kind) });
      } else {
        d.results.set(c.id, { user_id: c.id, outcome: 'uncertain', reason: 'incertain', message: reasonText('incertain', d.kind) });
      }
    }
  }

  const out = d.order.map((id) => d.results.get(id) ?? skipped(id, 'erreur', d.kind));
  const sent = out.filter((r) => r.outcome === 'sent').length;
  // Rien à réserver : le compteur vient de la base. Sinon : celui de la réservation, moins les refus (un refus ne compte plus).
  const nowUsed = used === null ? await deps.usedToday(d.companyId) : Math.max(0, used - failedIds.size);
  deps.log('envoi', {
    famille: d.kind, demandes: d.order.length, places: reserved, envoyes: sent,
    refuses: out.filter((r) => r.outcome === 'failed').length, incertains: out.filter((r) => r.outcome === 'uncertain').length,
    ignores: out.filter((r) => r.outcome === 'skipped').length,
  });

  // Le plafond a arrêté tout le monde (aucune place prise) : on le dit en clair, avec le bon code HTTP.
  const capped = reserved === 0 && out.some((r) => r.reason === 'limite');
  const base = { kind: d.kind, cap: DAILY_EMAIL_CAP, used: nowUsed, remaining: Math.max(0, DAILY_EMAIL_CAP - nowUsed), sent, results: out };
  return capped
    ? reply(429, { ...base, success: false, error: limitMessage() })
    : reply(200, { ...base, success: true });
}

