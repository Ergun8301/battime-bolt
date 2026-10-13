// Lot 19 — un MONDE FICTIF pour tester le moteur d'e-mails du bureau
// (staff-email-run.ts) : salariés, désabonnés, entreprise, journal et TRANSPORT
// d'envoi factices, tout en mémoire. Rien ne touche au réseau, aucune clé n'est
// lue : aucun e-mail ne peut partir. Les adresses sont toutes en @example.com.
//
// Utilisé par staff-email.test.ts (Deno) et par supabase/tests/lot19_emails_moteur.mjs
// (Node, avec la VRAIE base SQL jetable à la place du journal en mémoire).
// Du TypeScript simple, sans API propre à Deno : lisible par les deux.
import { Unavailable, type Deps, type OutMail, type Profile, type Company, type ReserveItem, type ReserveResult, type SendResult } from './staff-email-run.ts';
import type { Outcome, WorkerRow } from './staff-email-core.ts';

export const CO = 'c0000000-0000-4000-8000-000000000001';
export const CO2 = 'c0000000-0000-4000-8000-000000000002';
export const ADMIN = 'a0000000-0000-4000-8000-00000000000a';
export const ADMIN2 = 'a0000000-0000-4000-8000-00000000000b';
export const ARCHIVE = 'a0000000-0000-4000-8000-00000000000c';
export const SUPPORT = 'a0000000-0000-4000-8000-00000000000d';
export const LUCAS = '10000000-0000-4000-8000-000000000001';
export const NINA = '10000000-0000-4000-8000-000000000002';
export const KEVIN = '10000000-0000-4000-8000-000000000003';   // sans adresse
export const SARA = '10000000-0000-4000-8000-000000000004';    // désabonnée
export const OLD = '10000000-0000-4000-8000-000000000005';     // archivé
export const OTHER = '10000000-0000-4000-8000-000000000006';   // salarié d'une AUTRE entreprise

export type JournalRow = {
  id: string; company_id: string; kind: string; user_id: string | null; mask: string; rhash: string; chash: string;
  day: string; status: 'reserved' | 'sent' | 'failed' | 'uncertain'; reason: string | null; created_ms: number;
};

export type World = {
  profiles: Record<string, Profile>;
  support: Set<string>;
  companies: Record<string, Company>;
  users: WorkerRow[];
  /** Désabonnés : « adresse|famille ». */
  unsub: Set<string>;
  journal: JournalRow[];
  mailbox: OutMail[];
  logs: { event: string; data: Record<string, unknown> }[];
  clockMs: number;
  /** Réponse du transport factice ; par défaut : envoyé. */
  transport: (m: OutMail, n: number) => SendResult | Promise<SendResult>;
  /** Appels reçus par le transport (jamais plus d'un par destinataire). */
  sendCalls: number;
  unavailable: boolean;
  unsubFails: boolean;
  /** Le « jour de Paris » de la base : change pour simuler minuit. */
  day: string;
  /** Appels faits à `loadWorkers` : les identifiants demandés, pour vérifier ce qui part vers la base. */
  askedIds: string[][];
  seq: number;
};

export function makeWorld(): World {
  const u = (id: string, first: string, email: string | null, extra: Partial<WorkerRow> = {}): WorkerRow =>
    ({ id, company_id: CO, role: 'worker', is_active: true, first_name: first, email, ...extra });
  return {
    profiles: {
      [ADMIN]: { role: 'admin', company_id: CO, is_active: true },
      [ADMIN2]: { role: 'admin', company_id: CO2, is_active: true },
      [ARCHIVE]: { role: 'admin', company_id: CO, is_active: false },
      [SUPPORT]: { role: 'admin', company_id: CO2, is_active: true },
      [LUCAS]: { role: 'worker', company_id: CO, is_active: true },
      [NINA]: { role: 'lead', company_id: CO, is_active: true },
    },
    support: new Set([SUPPORT]),
    companies: {
      [CO]: { name: 'Martin Menuiserie', email: 'bureau@martin-menuiserie.example.com' },
      [CO2]: { name: 'Autre Société', email: null },
    },
    users: [
      u(LUCAS, 'Lucas', 'lucas@example.com'),
      u(NINA, 'Nina', 'nina@example.com', { role: 'lead' }),
      u(KEVIN, 'Kevin', null),
      u(SARA, 'Sara', 'sara@example.com'),
      u(OLD, 'Ancien', 'ancien@example.com', { is_active: false }),
      u(OTHER, 'Autre', 'autre@example.org', { company_id: CO2 }),
      { id: ADMIN, company_id: CO, role: 'admin', is_active: true, first_name: 'Paul', email: 'paul@example.com' },
    ],
    unsub: new Set(['sara@example.com|planning-hebdo', 'sara@example.com|message-bureau']),
    journal: [], mailbox: [], logs: [], clockMs: Date.parse('2026-10-14T10:00:00Z'),
    transport: () => ({ outcome: 'sent', code: 'ok' }),
    sendCalls: 0, unavailable: false, unsubFails: false, day: '2026-10-14', askedIds: [], seq: 0,
  };
}

/** Un PDF minimal mais recevable (signature, corps, %%EOF). */
export function fakePdfBase64(label = 'planning'): string {
  const text = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% ${label}\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`;
  return btoa(text);
}

/** Le même calcul que la fonction SQL staff_email_reserve (vérifié contre la vraie base dans lot19_emails_moteur.mjs). */
export function reserveInMemory(w: World, a: { companyId: string; sentBy: string; kind: string; cap: number; items: ReserveItem[] }): ReserveResult {
  const count = () => w.journal.filter((j) => j.company_id === a.companyId && j.day === w.day && j.status !== 'failed').length;
  let used = count();
  const before = used;
  const out: ReserveResult['items'] = [];
  a.items.forEach((it, idx) => {
    const dup = w.journal.some((j) => j.company_id === a.companyId && j.rhash === it.rhash && j.chash === it.chash
      && j.status !== 'failed' && w.clockMs - j.created_ms < 60_000);
    if (dup) { out.push({ i: idx + 1, result: 'duplicate', id: null }); return; }
    if (used >= a.cap) { out.push({ i: idx + 1, result: 'cap', id: null }); return; }
    const id = `00000000-0000-4000-8000-${String(++w.seq).padStart(12, '0')}`;
    w.journal.push({ id, company_id: a.companyId, kind: a.kind, user_id: it.user_id, mask: it.mask, rhash: it.rhash, chash: it.chash, day: w.day, status: 'reserved', reason: null, created_ms: w.clockMs });
    used++;
    out.push({ i: idx + 1, result: 'reserved', id });
  });
  return { cap: a.cap, used_before: before, used_after: used, items: out };
}

export function makeDeps(w: World, over: Partial<Deps> = {}): Deps {
  const down = () => { if (w.unavailable) throw new Unavailable(); };
  const base: Deps = {
    now: () => w.clockMs,
    loadProfile: async (id) => w.profiles[id] ?? null,
    isSupportStaff: async (id) => w.support.has(id),
    loadCompany: async (id) => w.companies[id] ?? null,
    listWorkers: async (companyId) => w.users.filter((x) => x.company_id === companyId && x.is_active !== false && (x.role === 'worker' || x.role === 'lead')),
    loadWorkers: async (companyId, ids) => { w.askedIds.push([...ids]); return w.users.filter((x) => x.company_id === companyId && ids.includes(x.id)); },
    loadUnsubscribed: async (emails) => {
      down();
      if (w.unsubFails) throw new Error('liste illisible');
      const out = new Map<string, Set<string>>();
      for (const e of emails) for (const k of ['planning-hebdo', 'message-bureau']) {
        if (w.unsub.has(`${e}|${k}`)) { if (!out.has(e)) out.set(e, new Set()); out.get(e)!.add(k); }
      }
      return out;
    },
    usedToday: async (companyId) => { down(); return w.journal.filter((j) => j.company_id === companyId && j.day === w.day && j.status !== 'failed').length; },
    reserve: async (a) => { down(); await Promise.resolve(); return reserveInMemory(w, a); },
    finish: async ({ id, companyId, status, reason }) => {
      const j = w.journal.find((x) => x.id === id && x.company_id === companyId && x.status === 'reserved');
      if (j) { j.status = status; j.reason = reason; }
    },
    send: async (m) => {
      w.sendCalls++;
      w.mailbox.push(m);
      return await w.transport(m, w.sendCalls);
    },
    log: (event, data) => { w.logs.push({ event, data: data ?? {} }); },
  };
  return { ...base, ...over };
}

export const outcomeOf = (o: Outcome, code = 'ok'): SendResult => ({ outcome: o, code });
