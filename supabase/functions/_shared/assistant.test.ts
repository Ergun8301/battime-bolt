// Tests de l'Assistant BEMEXO (lot 3) : `npm run test:assistant` (Deno).
import * as core from './assistant-core.ts';
import {
  ASSISTANT_SCHEMA, ASSISTANT_SUGGESTIONS, buildSnapshot, previousDay, type RawData,
} from './assistant-core.ts';
import { extractJson } from './ai-provider.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
const C = 'c1', X = 'c2';
function raw(): RawData {
  return {
    companyId: C, today: '2026-09-29',
    workers: [
      { id: 'boss', company_id: C, first_name: 'Ergun', last_name: 'K', role: 'admin', is_active: true },
      { id: 'karim', company_id: C, first_name: 'Karim', last_name: 'Benali', role: 'worker', is_active: true },
      { id: 'sofia', company_id: C, first_name: 'Sofia', last_name: 'Roux', role: 'worker', is_active: true },
      { id: 'lucas', company_id: C, first_name: 'Lucas', last_name: 'Petit', role: 'lead', is_active: true },
      { id: 'old', company_id: C, first_name: 'Ancien', last_name: 'Z', role: 'worker', is_active: false },
      { id: 'etranger', company_id: X, first_name: 'Espion', last_name: 'X', role: 'worker', is_active: true },
    ],
    worksites: [
      { id: 'w1', company_id: C, client_name: 'Villa Dupont', city: 'Lyon', budget_hours: 100, budget_amount: null },
      { id: 'w2', company_id: C, client_name: 'Bureau Martin', city: null, budget_hours: null, budget_amount: 2000 },
      { id: 'wx', company_id: X, client_name: 'Chantier secret', city: null, budget_hours: 1, budget_amount: null },
    ],
    labourAll: [
      { worksite_id: 'w1', user_id: 'karim', paid_minutes: 90 * 60, cost: 2400 },
      { worksite_id: 'w1', user_id: 'sofia', paid_minutes: 20 * 60, cost: 500 },
      { worksite_id: 'w2', user_id: 'lucas', paid_minutes: 30 * 60, cost: 900 },
      { worksite_id: 'wx', user_id: 'etranger', paid_minutes: 999 * 60, cost: 99999 },
    ],
    labourMonth: [
      { worksite_id: 'w1', user_id: 'karim', paid_minutes: 600 },
      { worksite_id: 'w2', user_id: 'karim', paid_minutes: 90 },
      { worksite_id: 'w1', user_id: 'sofia', paid_minutes: 300 },
    ],
    entriesYesterday: [{ user_id: 'sofia', company_id: C }],
    planningYesterday: [
      { user_id: 'karim', company_id: C, worksite_id: 'w1', absence_type: null },
      { user_id: 'sofia', company_id: C, worksite_id: 'w1', absence_type: null },
      { user_id: 'lucas', company_id: C, worksite_id: null, absence_type: 'maladie' },
      { user_id: 'etranger', company_id: X, worksite_id: 'wx', absence_type: null },
    ],
    planningToday: [{ user_id: 'lucas', company_id: C, worksite_id: null, absence_type: 'conge' }],
    activeSessions: [{ user_id: 'karim', company_id: C, worksite_id: 'w1', started_at: '2026-09-29T06:02:00Z' }],
    pendingLeaves: [{ user_id: 'sofia', company_id: C, type: 'conge', start_date: '2026-10-12', end_date: '2026-10-16' }],
  };
}

Deno.test('Qui n’a pas pointé hier : prévu, pas absent, rien déclaré', () => {
  const s = buildSnapshot(raw());
  eq(s.hier, '2026-09-28', 'hier');
  eq(s.pas_pointe_hier, [{ id: 'karim', nom: 'Karim B.', chantier_prevu: 'Villa Dupont' }], 'seul Karim (Sofia a pointé, Lucas malade)');
});

Deno.test('Chantiers au-dessus du budget (heures ou euros)', () => {
  const c = buildSnapshot(raw()).chantiers;
  eq(c.map((x) => [x.nom, x.avancement_pct, x.depasse]), [['Villa Dupont', 110, true], ['Bureau Martin', 45, false]], 'avancement');
  eq(c[0].heures_total, 110, 'heures du chantier');
});

Deno.test('Heures du mois, en cours, absents, congés', () => {
  const s = buildSnapshot(raw());
  eq(s.salaries.map((x) => [x.nom, x.heures_mois]), [['Karim B.', 11.5], ['Sofia R.', 5], ['Lucas P.', 0]], 'heures du mois, admin et archivés exclus');
  eq(s.en_cours, [{ id: 'karim', nom: 'Karim B.', chantier: 'Villa Dupont', depuis: '08:02' }], 'en cours, heure de Paris');
  eq(s.absents_aujourdhui, [{ id: 'lucas', nom: 'Lucas P.', motif: 'conge' }], 'absents');
  eq(s.conges_en_attente.length, 1, 'congés en attente');
});

Deno.test('Une autre entreprise n’apparaît jamais, même si des lignes passaient', () => {
  const txt = JSON.stringify(buildSnapshot(raw()));
  for (const secret of ['Espion', 'Chantier secret', 'etranger', '99999']) {
    if (txt.includes(secret)) throw new Error(`fuite : ${secret}`);
  }
});

Deno.test('Aucune donnée de paie brute dans l’instantané', () => {
  const r = raw() as RawData & { workers: (RawData['workers'][number] & { hourly_rate?: number; social_security_number?: string })[] };
  r.workers[1].hourly_rate = 31.5; r.workers[1].social_security_number = '185057800608436';
  const txt = JSON.stringify(buildSnapshot(r));
  for (const k of ['hourly_rate', '31.5', 'social_security', '1850578', 'gross', 'employer_total']) {
    if (txt.includes(k)) throw new Error(`donnée de paie dans l’instantané : ${k}`);
  }
});

// 3b-0 (2026-10-15) : l'ancien chemin « lecture seule » (assistantPrompt, sanitizeAnswer, STATIC_ACTIONS) n'était appelé par aucune fonction
// depuis le lot 3 bis ; il est retiré. Le filtrage des liens (3 au plus, actions connues, jamais « guide:… ») se teste là où il vit :
// admin-tours.test.ts (guideLinks / fromFunctionCall) et assistant-actions.test.ts.
Deno.test('Code mort retiré : assistantPrompt, sanitizeAnswer et STATIC_ACTIONS n’existent plus ; le reste du module sert encore', () => {
  for (const k of ['assistantPrompt', 'sanitizeAnswer', 'STATIC_ACTIONS']) if (k in core) throw new Error(`${k} devrait avoir disparu d’assistant-core.ts`);
  for (const k of ['buildSnapshot', 'previousDay', 'MAX_QUESTION_CHARS', 'DEFAULT_DAILY_LIMIT', 'ASSISTANT_SUGGESTIONS']) if (!(k in core)) throw new Error(`${k} doit rester dans assistant-core.ts`);
});

Deno.test('Suggestions et veille : 4 suggestions, la veille en fin de mois', () => {
  eq(ASSISTANT_SUGGESTIONS.length, 4, '4 suggestions');
  eq(previousDay('2026-03-01'), '2026-02-28', 'veille en fin de mois');
});

Deno.test('IA simulée : sans document, JSON structuré (le schéma et la consigne partent tels quels)', async () => {
  let sent: { contents: { parts: unknown[] }[]; generationConfig: { responseSchema: unknown } } | null = null;
  const fake = (_u: string, i: RequestInit) => {
    sent = JSON.parse(String(i.body));
    const text = JSON.stringify({ answer: 'Karim B. n’a pas pointé hier (Villa Dupont).', links: [{ label: 'Fiche', action: 'salarie:karim' }, { label: 'x', action: 'supprimer' }] });
    return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })));
  };
  const snap = buildSnapshot(raw());
  const r = await extractJson({ prompt: `DONNÉES : ${JSON.stringify(snap)}\nQUESTION : Qui n’a pas pointé hier ?`, schema: ASSISTANT_SCHEMA }, { get: (k) => (k === 'GEMINI_API_KEY' ? 'k' : undefined) }, fake);
  if (!r.ok) throw new Error('réponse attendue');
  eq(sent!.contents[0].parts.length, 1, 'aucun document joint');
  eq((r.data as { links: unknown[] }).links.length, 2, 'la réponse du modèle arrive entière (le tri des liens est celui de fromFunctionCall)');
  eq(JSON.stringify((sent!.generationConfig as { responseSchema: unknown }).responseSchema).includes('"answer"'), true, 'le schéma est envoyé');
});
