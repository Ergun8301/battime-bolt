// Tests du coût réel (lot 2) : `npm run test:cout` (Deno).
import {
  parseAmount, parseMonth, realHourlyCost, realLabourCost, sanitizeExtraction, slipHourlyCost,
  validateFigures, PAYSLIP_PROMPT, PAYSLIP_SCHEMA,
} from './payslip-core.ts';
import { extractJson, DEFAULT_AI_MODEL } from './ai-provider.ts';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}
const near = (a: number, b: number, msg: string) => { if (Math.abs(a - b) > 0.005) throw new Error(`${msg} — attendu ${b}, obtenu ${a}`); };

Deno.test('Coût horaire d’un bulletin : total employeur ÷ heures payées', () => {
  near(slipHourlyCost({ gross: 2450, employer_total: 3528.4, paid_hours: 151.67 }), 23.26, 'sans caisse congés');
});

Deno.test('Majoration caisse de congés BTP : brut × taux, ajouté au total employeur', () => {
  const s = { gross: 2450, employer_total: 3528.4, paid_hours: 151.67 };
  // (3528,40 + 2450 × 20,70 %) / 151,67 = (3528,40 + 507,15) / 151,67
  near(slipHourlyCost(s, { enabled: true, rate: 20.7 }), 26.61, 'taux par défaut');
  near(slipHourlyCost(s, { enabled: true, rate: 0 }), 23.26, 'taux 0');
  near(slipHourlyCost(s, { enabled: false, rate: 20.7 }), 23.26, 'caisse éteinte (restaurant)');
});

Deno.test('Moyenne des 3 derniers bulletins validés (par mois, pas par saisie)', () => {
  const slips = [
    { month: '2026-05', gross: 2000, employer_total: 3000, paid_hours: 100 }, // 30 €/h — le plus ancien, ignoré
    { month: '2026-08', gross: 2000, employer_total: 2400, paid_hours: 100 }, // 24
    { month: '2026-06', gross: 2000, employer_total: 2000.01, paid_hours: 100 }, // 20
    { month: '2026-07', gross: 2000, employer_total: 2200, paid_hours: 100 }, // 22
  ];
  eq(realHourlyCost(slips), { hourly: 22, count: 3 }, '3 derniers : (24 + 22 + 20) / 3');
  eq(realHourlyCost(slips.slice(1, 2)), { hourly: 24, count: 1 }, 'un seul bulletin');
  eq(realHourlyCost([]), null, 'aucun bulletin');
});

Deno.test('Coût réel des heures d’un chantier', () => {
  const rates = new Map([['a', 24], ['b', 30]]);
  eq(realLabourCost([['a', 90], ['b', 60], ['c', 120]], rates), { cost: 66, unpricedUsers: 1 }, '1,5 h × 24 + 1 h × 30 ; c sans bulletin');
});

Deno.test('Contrôle de cohérence : dans le doute, le champ reste vide', () => {
  const ok = sanitizeExtraction({ month: '2026-08', gross: 2450, employer_total: 3528.4, paid_hours: 151.67 });
  eq(ok, { figures: { month: '2026-08', gross: 2450, employer_total: 3528.4, paid_hours: 151.67 }, doubts: [] }, 'lecture propre');
  const bad = sanitizeExtraction({ month: '2026-08', gross: 3000, employer_total: 2900, paid_hours: 400 });
  eq(bad.figures.employer_total, null, 'total employeur ≤ brut → vidé');
  eq(bad.figures.paid_hours, null, 'heures > 250 → vidées');
  eq(bad.doubts, ['employer_total', 'paid_hours'], 'doutes signalés');
  eq(sanitizeExtraction({ paid_hours: 0.5 }).figures.paid_hours, null, 'heures < 1 → vidées');
  eq(sanitizeExtraction({ gross: '2 345,67 €', employer_total: '3.345,67', month: '08/2026' }).figures,
    { month: '2026-08', gross: 2345.67, employer_total: 3345.67, paid_hours: null }, 'formats français');
  eq(sanitizeExtraction('pas un objet').figures, { month: null, gross: null, employer_total: null, paid_hours: null }, 'réponse absurde');
  eq(sanitizeExtraction({ gross: 2000, nir: '1 85 05 78 006 084 36' }).figures.gross, 2000, 'champ inattendu ignoré');
  if ('nir' in sanitizeExtraction({ nir: 'x' }).figures) throw new Error('un champ non demandé traverse le nettoyage');
});

Deno.test('Validation avant enregistrement', () => {
  eq(validateFigures({ month: '2026-08', gross: 2450, employer_total: 3528.4, paid_hours: 151.67 }), null, 'complet');
  eq(typeof validateFigures({ month: '2026-08', gross: 2450, employer_total: null, paid_hours: 151.67 }), 'string', 'champ vide refusé');
  eq(typeof validateFigures({ month: '2026-08', gross: 2450, employer_total: 2000, paid_hours: 151.67 }), 'string', 'total ≤ brut refusé');
  eq(typeof validateFigures({ month: '2026-08', gross: 2450, employer_total: 3000, paid_hours: 300 }), 'string', 'heures hors bornes refusées');
});

Deno.test('Montants et mois', () => {
  eq([parseAmount('1 234'), parseAmount('2,345.60'), parseAmount(-3), parseAmount('abc')], [1234, 2345.6, null, null], 'montants');
  eq([parseMonth('2026-8'), parseMonth('2026-08-01'), parseMonth('13/2026'), parseMonth('août')], ['2026-08', '2026-08', null, null], 'mois');
});

// ── IA simulée : aucun appel réseau réel ────────────────────────────────────
const env = (o: Record<string, string>) => ({ get: (k: string) => o[k] });
const file = { mime: 'application/pdf', base64: 'JVBERi0=' };

Deno.test('IA simulée : sans clé → indisponible, aucun appel', async () => {
  let called = false;
  const r = await extractJson({ prompt: PAYSLIP_PROMPT, schema: PAYSLIP_SCHEMA, file }, env({}), () => { called = true; return Promise.reject(); });
  eq(r, { ok: false, reason: 'not_configured' }, 'not_configured');
  eq(called, false, 'aucun appel sans clé');
});

Deno.test('IA simulée : modèle par défaut, clé en en-tête, JSON structuré, puis contrôle', async () => {
  let url = '', init: RequestInit = {};
  const fake = (u: string, i: RequestInit) => {
    url = u; init = i;
    const text = JSON.stringify({ month: '2026-08', gross: 2450, employer_total: 2000, paid_hours: 151.67 });
    return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })));
  };
  const r = await extractJson({ prompt: PAYSLIP_PROMPT, schema: PAYSLIP_SCHEMA, file }, env({ GEMINI_API_KEY: 'k' }), fake);
  if (!url.includes(`/models/${DEFAULT_AI_MODEL}:generateContent`)) throw new Error(`modèle par défaut non utilisé : ${url}`);
  if (url.includes('key=')) throw new Error('clé dans l’URL');
  eq((init.headers as Record<string, string>)['x-goog-api-key'], 'k', 'clé en en-tête');
  const sent = JSON.parse(String(init.body));
  eq(sent.generationConfig.responseMimeType, 'application/json', 'réponse JSON imposée');
  if (!r.ok) throw new Error('réponse attendue');
  const { figures, doubts } = sanitizeExtraction(r.data);
  eq(figures.employer_total, null, 'incohérence de l’IA rattrapée : total ≤ brut vidé');
  eq(doubts, ['employer_total'], 'doute signalé à l’admin');
});

Deno.test('IA simulée : AI_MODEL change le modèle, erreur fournisseur propre', async () => {
  let url = '';
  const r = await extractJson({ prompt: '', schema: {}, file }, env({ GEMINI_API_KEY: 'k', AI_MODEL: 'autre-modele' }),
    (u: string) => { url = u; return Promise.resolve(new Response('quota', { status: 429 })); });
  if (!url.includes('/models/autre-modele:')) throw new Error('AI_MODEL ignoré');
  eq(r, { ok: false, reason: 'provider_error' }, 'erreur 429');
  const r2 = await extractJson({ prompt: '', schema: {}, file }, env({ GEMINI_API_KEY: 'k' }),
    () => Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'pas du json' }] } }] }))));
  eq(r2, { ok: false, reason: 'bad_response' }, 'réponse non JSON');
});

Deno.test('Clé « AQ. » (auth key AI Studio) : en-tête x-goog-api-key, telle quelle, jamais dans l’URL ni les logs', async () => {
  // Depuis le 28/05/2026, AI Studio délivre des clés « AQ.… » et plus « AIza… ».
  // Aucun préfixe n'est supposé : la clé part telle quelle, en en-tête.
  const KEY = 'AQ.Ab8RN6-test_fausse-cle.0123456789';
  const logs: string[] = [];
  const orig = { error: console.error, log: console.log, warn: console.warn, info: console.info };
  const grab = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
  console.error = grab; console.log = grab; console.warn = grab; console.info = grab;
  try {
    let url = '', init: RequestInit = {};
    const ok = await extractJson({ prompt: 'p', schema: {} }, env({ GEMINI_API_KEY: KEY }), (u: string, i: RequestInit) => {
      url = u; init = i;
      return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }] })));
    });
    eq(ok.ok, true, 'clé AQ. acceptée');
    eq((init.headers as Record<string, string>)['x-goog-api-key'], KEY, 'clé AQ. transmise intacte en en-tête');
    if (url.includes('key=') || url.includes(KEY)) throw new Error('clé dans l’URL');
    // Chemins d'erreur : seul le code HTTP sort, jamais la clé.
    await extractJson({ prompt: 'p', schema: {} }, env({ GEMINI_API_KEY: KEY }), () => Promise.resolve(new Response(`bad key ${KEY}`, { status: 401 })));
    await extractJson({ prompt: 'p', schema: {} }, env({ GEMINI_API_KEY: KEY }), () => Promise.reject(new Error(`réseau ${KEY}`)));
  } finally {
    Object.assign(console, orig);
  }
  eq(logs.length, 2, 'deux erreurs journalisées');
  if (logs.some((l) => l.includes(KEY) || l.includes('AQ.'))) throw new Error(`clé dans les logs : ${logs.join(' | ')}`);
});
