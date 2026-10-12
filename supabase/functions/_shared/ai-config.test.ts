// Lot 6 — couche IA v2 : UN seul réglage (AI_CONFIG) et UNE clé (AI_API_KEY),
// jamais de Pro, un seul appel par demande, le secours seulement après une
// erreur, les anciens secrets ignorés, plus de clé de service dans les 3 fonctions.
//   npm run test:ia-config
import {
  aiKey, callFunction, DELAIS, extractJson, formuleNom, isProModel, MODELES_PAR_DEFAUT, PAUSE_MESSAGE, PLAFONDS_ESSAI,
  plafondProjet, readConfig, tierFor,
} from './ai-provider.ts';
import { loadAssistantContext, type RpcClient } from './assistant-context.ts';

const FN = [{ name: 'repondre', description: 'x', parameters: { type: 'object', properties: {} } }];
const okCall = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'repondre', args: { reponse: 'ok' } } }] } }] }), { status: 200 });
const okJson = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"mois":"2026-09"}' }] } }] }), { status: 200 });
type Plan = Record<string, { ms?: number; status?: number; reject?: boolean; bad?: boolean }>;
interface Seen { model: string; body: Record<string, unknown>; raw: string; start: number; end: number }
function fakeGemini(plan: Plan = {}, reply = okCall) {
  const calls: Seen[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const model = decodeURIComponent(/models\/([^:]+):/.exec(url)![1]);
    const seen: Seen = { model, body: JSON.parse(String(init.body)), raw: String(init.body), start: Date.now(), end: 0 };
    calls.push(seen);
    const p = plan[model] ?? {};
    return new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => {
        seen.end = Date.now();
        if (p.reject) return reject(new Error('réseau'));
        resolve(p.status ? new Response('{}', { status: p.status }) : p.bad ? new Response('{"candidates":[]}', { status: 200 }) : reply());
      }, p.ms ?? 5);
      init.signal?.addEventListener('abort', () => { clearTimeout(t); seen.end = Date.now(); reject(new DOMException('aborted', 'AbortError')); });
    });
  };
  return { calls, fetchImpl };
}
const env = (x: Record<string, string | undefined>) => ({ get: (k: string) => x[k] });
const KEY = { AI_API_KEY: 'cle-test' };
const R = MODELES_PAR_DEFAUT.rapide, D = MODELES_PAR_DEFAUT.documents, S = MODELES_PAR_DEFAUT.secours;
const PDF = { mime: 'application/pdf', base64: 'JVBERi0xLjQK' };
const names = (c: Seen[]) => c.map((x) => x.model).join(',');
/** Capture ce que le module journalise (pour prouver qu'il ne fuit rien). */
async function logged<T>(f: () => T | Promise<T>): Promise<{ out: T; logs: string[] }> {
  const logs: string[] = [];
  const orig = { error: console.error, log: console.log, warn: console.warn, info: console.info };
  const grab = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
  console.error = grab; console.log = grab; console.warn = grab; console.info = grab;
  try { return { out: await f(), logs }; } finally { Object.assign(console, orig); }
}

Deno.test('Modèles par défaut : exactement ceux vérifiés dans la documentation de Google', () => {
  if (R !== 'gemini-3.5-flash-lite' || D !== 'gemini-3.8-flash' || S !== 'gemini-3.1-flash-lite') throw new Error(`${R} ${D} ${S}`);
  const c = readConfig(env({}));
  if (c.rapide.reflexion !== 'minimal' || c.documents.reflexion !== 'low' || c.secours.reflexion !== 'minimal') throw new Error('niveaux de réflexion');
});

Deno.test('AI_CONFIG absent ou vide → réglage par défaut (essai, plafonds), sans journal', async () => {
  const { out, logs } = await logged(() => [readConfig(env({})), readConfig(env({ AI_CONFIG: '' })), readConfig(env({ AI_CONFIG: '   ' }))]);
  for (const c of out) {
    if (c.formule !== 'essai' || c.rapide.model !== R || c.documents.model !== D || c.secours.model !== S) throw new Error(JSON.stringify(c));
    if (JSON.stringify(c.plafonds) !== JSON.stringify(PLAFONDS_ESSAI)) throw new Error('plafonds d’essai par défaut');
  }
  if (logs.length) throw new Error(`rien à journaliser quand le secret est absent : ${logs.join('|')}`);
  if (formuleNom(env({})) !== 'essai') throw new Error('formule par défaut : essai');
});

Deno.test('AI_CONFIG valide : JSON complet, JSON partiel, raccourci « payant »', () => {
  const full = JSON.stringify({
    formule: 'payant', rapide: `gemini:${S}`, documents: `gemini:${R}`, secours: `gemini:${D}`, plafonds: { rapide: 1000, documents: 50 },
  });
  const c = readConfig(env({ AI_CONFIG: full }));
  if (c.formule !== 'payant' || c.rapide.model !== S || c.documents.model !== R || c.secours.model !== D) throw new Error(JSON.stringify(c));
  if (c.plafonds?.rapide !== 1000 || c.plafonds?.documents !== 50) throw new Error('plafonds lus');
  // Le niveau de réflexion suit l'EMPLACEMENT (documents = low), pas le nom du modèle.
  if (c.rapide.reflexion !== 'minimal' || c.documents.reflexion !== 'low' || c.secours.reflexion !== 'minimal') throw new Error('réflexion par emplacement');
  // Partiel : le reste vient des défauts ; payant sans « plafonds » = pas de plafond global.
  const p = readConfig(env({ AI_CONFIG: '{"formule":"payant"}' }));
  if (p.formule !== 'payant' || p.plafonds !== null || p.rapide.model !== R || p.documents.model !== D) throw new Error('payant partiel');
  const e = readConfig(env({ AI_CONFIG: `{"documents":"gemini:${S}"}` }));
  if (e.formule !== 'essai' || e.documents.model !== S || e.rapide.model !== R || !e.plafonds) throw new Error('essai partiel');
  // Raccourci : le seul nom de la formule.
  if (formuleNom(env({ AI_CONFIG: ' Payant ' })) !== 'payant' || plafondProjet(env({ AI_CONFIG: 'payant' }), 'rapide') !== null) throw new Error('raccourci payant');
  if (plafondProjet(env({ AI_CONFIG: 'essai' }), 'documents') !== PLAFONDS_ESSAI.documents) throw new Error('raccourci essai');
  // Plafonds explicites aussi en payant.
  if (plafondProjet(env({ AI_CONFIG: '{"formule":"payant","plafonds":{"rapide":9,"documents":3}}' }), 'documents') !== 3) throw new Error('plafond payant');
});

Deno.test('AI_CONFIG invalide : ne plante jamais, réglage par défaut, UNE ligne courte sans le contenu', async () => {
  const SECRET = 'AQ.cle-secrete-ne-doit-jamais-sortir';
  const bad: string[] = [
    '{pas du json', '[]', '"texte"', '42', 'null', '{"formule":"gratuit"}', '{"formule":42}', '{"rapide":"gemini-3.5-flash-lite"}',
    `{"rapide":"autre:${R}"}`, '{"rapide":"gemini:gemini-test-pro"}', '{"documents":"gemini:gemini-test-pro-preview"}', '{"secours":"gemini:"}',
    '{"rapide":42}', '{"plafond":{"rapide":1,"documents":1}}', '{"plafonds":{"rapide":0,"documents":5}}', '{"plafonds":{"rapide":5}}',
    '{"plafonds":{"rapide":5.5,"documents":5}}', '{"plafonds":{"rapide":"5","documents":5}}', '{"plafonds":null}', '{"plafonds":{"rapide":5,"documents":5,"x":1}}',
    `{"formule":"payant","cle":"${SECRET}"}`,
  ];
  for (const raw of bad) {
    const { out, logs } = await logged(() => readConfig(env({ AI_CONFIG: raw })));
    if (out.formule !== 'essai' || out.rapide.model !== R || out.documents.model !== D || out.secours.model !== S) throw new Error(`« ${raw} » → ${JSON.stringify(out)}`);
    if (JSON.stringify(out.plafonds) !== JSON.stringify(PLAFONDS_ESSAI)) throw new Error(`« ${raw} » : plafonds par défaut attendus`);
    if (logs.length !== 1 || !/AI_CONFIG invalide/.test(logs[0]) || logs[0].length > 120) throw new Error(`« ${raw} » : journal ${JSON.stringify(logs)}`);
    if (raw.length > 6 && logs[0].includes(raw.slice(1, 10))) throw new Error('le contenu du secret ne doit pas sortir');
    if (logs[0].includes(SECRET)) throw new Error('secret dans les logs');
  }
  // Les appels continuent avec les modèles par défaut, sans erreur.
  const f = fakeGemini();
  const r = await callFunction({ prompt: 'x', functions: FN }, env({ ...KEY, AI_CONFIG: '{pas du json' }), f.fetchImpl);
  if (!r.ok || names(f.calls) !== R) throw new Error(`appel avec réglage invalide : ${names(f.calls)}`);
  // Un réglage invalide n'est signalé qu'une fois par valeur (pas une ligne par demande).
  const { logs } = await logged(() => { for (let i = 0; i < 5; i++) readConfig(env({ AI_CONFIG: '{encore pas du json' })); });
  if (logs.length !== 1) throw new Error(`${logs.length} lignes pour 5 lectures`);
});

Deno.test('Les anciens secrets de modèle ne sont PLUS lus : ils ne ramènent aucun ancien modèle', async () => {
  const OLD = { AI_MODEL: 'ancien-leger', AI_ACTION_MODEL: 'ancien-fort', AI_FALLBACK_MODEL: 'ancien-secours', AI_PROVIDER: 'autre', AI_TIMEOUT_MS: '1', AI_ACTION_WAIT_MS: '1' };
  const f = fakeGemini();
  const r = await callFunction({ prompt: 'x', functions: FN }, env({ ...KEY, ...OLD }), f.fetchImpl);
  if (!r.ok || names(f.calls) !== R) throw new Error(`anciens secrets lus : ${names(f.calls)}`);
  const g = fakeGemini({ [R]: { status: 503 } });
  await callFunction({ prompt: 'x', functions: FN }, env({ ...KEY, ...OLD }), g.fetchImpl);
  if (names(g.calls) !== `${R},${S}`) throw new Error(`secours ancien : ${names(g.calls)}`);
  const h = fakeGemini({}, okJson);
  await extractJson({ prompt: 'p', schema: {}, file: PDF }, env({ ...KEY, ...OLD }), h.fetchImpl);
  if (names(h.calls) !== D) throw new Error(`extractJson ancien : ${names(h.calls)}`);
  // Et dans le code : aucun module ne lit ces secrets (hors commentaires).
  for (const dir of ['_shared', 'assistant', 'worker-assistant', 'payslip-read', 'assistant-eval']) {
    for await (const e of Deno.readDir(new URL(`../${dir}`, import.meta.url))) {
      if (!e.name.endsWith('.ts') || e.name.endsWith('.test.ts')) continue;
      const code = (await Deno.readTextFile(new URL(`../${dir}/${e.name}`, import.meta.url))).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      if (/['"`](AI_MODEL|AI_ACTION_MODEL|AI_FALLBACK_MODEL|AI_PROVIDER|AI_TIMEOUT_MS|AI_ACTION_WAIT_MS)['"`]/.test(code)) throw new Error(`${dir}/${e.name} lit un ancien secret`);
    }
  }
});

Deno.test('Clé : AI_API_KEY d’abord, repli sur GEMINI_API_KEY, sinon rien', async () => {
  if (aiKey(env({ AI_API_KEY: 'a', GEMINI_API_KEY: 'g' })) !== 'a') throw new Error('AI_API_KEY d’abord');
  if (aiKey(env({ GEMINI_API_KEY: 'g' })) !== 'g') throw new Error('repli GEMINI_API_KEY');
  if (aiKey(env({ AI_API_KEY: '', GEMINI_API_KEY: 'g' })) !== 'g') throw new Error('AI_API_KEY vide → repli');
  if (aiKey(env({})) !== undefined) throw new Error('aucune clé');
  // Avec la seule GEMINI_API_KEY de la prod d'aujourd'hui, tout marche (rien ne casse avant les nouveaux secrets).
  const f = fakeGemini();
  const hdr: string[] = [];
  const spy = (u: string, i: RequestInit) => { hdr.push((i.headers as Record<string, string>)['x-goog-api-key']); return f.fetchImpl(u, i); };
  const r = await callFunction({ prompt: 'x', functions: FN }, env({ GEMINI_API_KEY: 'ancienne' }), spy);
  if (!r.ok || hdr[0] !== 'ancienne') throw new Error('GEMINI_API_KEY seule doit suffire');
  const none = await callFunction({ prompt: 'x', functions: FN }, env({}), f.fetchImpl);
  const none2 = await extractJson({ prompt: 'p', schema: {} }, env({}), f.fetchImpl);
  if (none.ok || none.reason !== 'not_configured' || none2.ok || none2.reason !== 'not_configured' || f.calls.length !== 1) throw new Error('sans clé : not_configured, aucun appel');
});

Deno.test('Jamais de Pro : ni par AI_CONFIG, ni par un ancien secret', async () => {
  for (const m of ['gemini-test-pro', 'gemini-test-pro-preview', 'gemini_test_pro', 'pro']) if (!isProModel(m)) throw new Error(`${m} doit être reconnu Pro`);
  for (const m of [R, D, S]) if (isProModel(m)) throw new Error(`${m} n’est pas Pro`);
  for (const m of [R, D, S]) if (/pro/i.test(m)) throw new Error('aucun Pro dans les défauts');
  const { out } = await logged(() => readConfig(env({ AI_CONFIG: '{"rapide":"gemini:gemini-test-pro"}' })));
  if (isProModel(out.rapide.model)) throw new Error('Pro accepté dans AI_CONFIG');
  const f = fakeGemini();
  await logged(() => callFunction({ prompt: 'x', functions: FN }, env({ ...KEY, AI_MODEL: 'gemini-test-pro', AI_CONFIG: '{"documents":"gemini:gemini-autre-pro"}' }), f.fetchImpl));
  if (f.calls.some((c) => isProModel(c.model))) throw new Error(`Pro appelé : ${names(f.calls)}`);
});

Deno.test('Gemini 3.x : ni temperature, ni top_p, ni top_k ; thinkingLevel seul, jamais thinkingBudget', async () => {
  const vus: Seen[] = [];
  for (const [req, file] of [['q', undefined], ['f', PDF]] as const) {
    const f = fakeGemini();
    await callFunction({ prompt: req, functions: FN, file }, env(KEY), f.fetchImpl);
    const g = fakeGemini({}, okJson);
    await extractJson({ prompt: req, schema: { type: 'object' }, file }, env(KEY), g.fetchImpl);
    // Et le secours, après une erreur.
    const h = fakeGemini({ [file ? D : R]: { status: 500 } });
    await callFunction({ prompt: req, functions: FN, file }, env(KEY), h.fetchImpl);
    vus.push(...f.calls, ...g.calls, ...h.calls);
  }
  if (vus.length !== 8) throw new Error(`${vus.length} corps attendus`);
  for (const c of vus) {
    if (/temperature|top_?p|top_?k/i.test(c.raw)) throw new Error(`paramètre retiré de Gemini 3 : ${c.raw.slice(0, 300)}`);
    if (/thinkingBudget|thinking_budget/i.test(c.raw)) throw new Error('thinkingBudget interdit (400 avec thinkingLevel)');
    const gc = c.body.generationConfig as { thinkingConfig?: Record<string, unknown> };
    const want = c.model === D ? 'low' : 'minimal'; // « minimal » n'existe pas sur 3.8 Flash
    if (JSON.stringify(gc.thinkingConfig) !== JSON.stringify({ thinkingLevel: want })) throw new Error(`${c.model} : ${JSON.stringify(gc.thinkingConfig)}`);
  }
});

Deno.test('Routage : questions ET ordres → UN appel au modèle rapide ; fichier → UN appel au modèle documents', async () => {
  for (const phrase of ['combien d’heures cette semaine ?', 'ajoute une intervention à Lyon pour Kevin jeudi']) {
    const f = fakeGemini();
    const r = await callFunction({ prompt: phrase, functions: FN }, env(KEY), f.fetchImpl);
    if (!r.ok || f.calls.length !== 1 || f.calls[0].model !== R) throw new Error(`${phrase} : ${names(f.calls)}`);
  }
  const g = fakeGemini();
  const r = await callFunction({ prompt: 'x', functions: FN, file: PDF }, env(KEY), g.fetchImpl);
  if (!r.ok || names(g.calls) !== D) throw new Error(`fichier : ${names(g.calls)}`);
  // Question sur un document, sans fichier : tier demandé explicitement.
  const h = fakeGemini();
  await callFunction({ prompt: 'x', functions: FN, tier: tierFor(false, true) }, env(KEY), h.fetchImpl);
  if (names(h.calls) !== D || tierFor(true) !== 'documents' || tierFor(false) !== 'rapide') throw new Error('tierFor');
  // Bulletin : extractJson, tier « documents » demandé.
  const i = fakeGemini({}, okJson);
  const x = await extractJson({ prompt: 'p', schema: { type: 'object' }, file: PDF, tier: 'documents' }, env(KEY), i.fetchImpl);
  const gc = i.calls[0].body.generationConfig as Record<string, unknown>;
  if (!x.ok || (x.data as { mois?: string }).mois !== '2026-09' || names(i.calls) !== D || gc.responseMimeType !== 'application/json' || !gc.responseSchema) throw new Error('bulletin');
  // Les modèles viennent d'AI_CONFIG quand il est posé.
  const j = fakeGemini();
  await callFunction({ prompt: 'x', functions: FN }, env({ ...KEY, AI_CONFIG: `{"rapide":"gemini:${S}"}` }), j.fetchImpl);
  if (names(j.calls) !== S) throw new Error(`AI_CONFIG ignoré : ${names(j.calls)}`);
});

Deno.test('Secours SEULEMENT après une erreur du premier appel, jamais en parallèle', async () => {
  for (const fail of [{ status: 503 }, { status: 500 }, { status: 429 }, { status: 404 }, { reject: true }]) {
    const f = fakeGemini({ [R]: { ...fail, ms: 30 } });
    const { out: r } = await logged(() => callFunction({ prompt: 'x', functions: FN }, env(KEY), f.fetchImpl));
    if (!r.ok) throw new Error('le secours doit répondre');
    if (names(f.calls) !== `${R},${S}`) throw new Error(`ordre : ${names(f.calls)}`);
    if (f.calls[1].start < f.calls[0].end) throw new Error('le secours est parti AVANT la fin du premier appel');
  }
  // Délai dépassé : le premier appel est abandonné, PUIS le secours répond.
  const t = fakeGemini({ [R]: { ms: 60_000 } });
  const t0 = Date.now();
  const { out: rt } = await logged(() => callFunction({ prompt: 'x', functions: FN }, env(KEY), t.fetchImpl));
  const ms = Date.now() - t0;
  if (!rt.ok || names(t.calls) !== `${R},${S}`) throw new Error(`délai : ${names(t.calls)}`);
  if (ms < DELAIS.rapide.premier - 200 || ms > DELAIS.rapide.total + 500) throw new Error(`délai total ${ms} ms`);
  if (t.calls[1].start < t.calls[0].end) throw new Error('secours parti avant l’abandon du premier');
  // Réponse illisible (pas une panne) : pas de second appel.
  const g = fakeGemini({ [R]: { bad: true } });
  const b = await callFunction({ prompt: 'x', functions: FN }, env(KEY), g.fetchImpl);
  if (b.ok || b.reason !== 'bad_response' || g.calls.length !== 1) throw new Error(`bad_response : ${g.calls.length} appel(s)`);
  // Tout en panne : échec propre, deux appels au plus.
  const h = fakeGemini({ [R]: { status: 503 }, [S]: { status: 503 } });
  const { out: x } = await logged(() => callFunction({ prompt: 'x', functions: FN }, env(KEY), h.fetchImpl));
  if (x.ok || x.reason !== 'provider_error' || h.calls.length !== 2) throw new Error(`tout en panne : ${h.calls.length}`);
  // Documents en panne : secours aussi (bulletin compris).
  const d = fakeGemini({ [D]: { status: 503 } });
  const { out: y } = await logged(() => callFunction({ prompt: 'x', functions: FN, file: PDF }, env(KEY), d.fetchImpl));
  if (!y.ok || names(d.calls) !== `${D},${S}`) throw new Error(`documents : ${names(d.calls)}`);
  const e = fakeGemini({ [D]: { status: 503 } }, okJson);
  const { out: z } = await logged(() => extractJson({ prompt: 'p', schema: {}, file: PDF }, env(KEY), e.fetchImpl));
  if (!z.ok || names(e.calls) !== `${D},${S}`) throw new Error(`bulletin : ${names(e.calls)}`);
  // Même modèle en rapide et en secours : pas de second appel inutile.
  const s = fakeGemini({ [S]: { status: 503 } });
  const { out: w } = await logged(() => callFunction({ prompt: 'x', functions: FN }, env({ ...KEY, AI_CONFIG: `{"rapide":"gemini:${S}"}` }), s.fetchImpl));
  if (w.ok || s.calls.length !== 1) throw new Error(`même modèle : ${s.calls.length} appel(s)`);
  // Nom de fonction inconnu renvoyé par le modèle : refusé, pas de secours.
  const u = fakeGemini({}, () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'inconnue', args: {} } }] } }] })));
  const bad = await callFunction({ prompt: 'x', functions: FN }, env(KEY), u.fetchImpl);
  if (bad.ok || bad.reason !== 'bad_response' || u.calls.length !== 1) throw new Error('fonction hors liste');
});

Deno.test('Journal : seul le code HTTP sort, jamais la clé ni le contenu', async () => {
  const CLE = 'AQ.Ab8RN6-fausse-cle.0123456789', SECRET_TEXT = 'phrase-confidentielle-du-patron';
  const { logs } = await logged(async () => {
    await callFunction({ prompt: SECRET_TEXT, functions: FN, file: PDF }, env({ AI_API_KEY: CLE }), () => Promise.resolve(new Response(`bad ${CLE} ${SECRET_TEXT}`, { status: 401 })));
    await extractJson({ prompt: SECRET_TEXT, schema: {} }, env({ AI_API_KEY: CLE }), () => Promise.reject(new Error(`réseau ${CLE} ${SECRET_TEXT}`)));
  });
  if (!logs.length) throw new Error('les erreurs doivent être journalisées');
  if (logs.some((l) => l.includes(CLE) || l.includes('AQ.') || l.includes(SECRET_TEXT))) throw new Error(`fuite dans les logs : ${logs.join(' | ')}`);
});

Deno.test('Plafond global : réglé dans AI_CONFIG, sous le gratuit de Gemini par défaut ; message de pause en français', () => {
  if (plafondProjet(env({}), 'documents') !== PLAFONDS_ESSAI.documents || plafondProjet(env({}), 'rapide') !== PLAFONDS_ESSAI.rapide) throw new Error('essai par défaut');
  if (PLAFONDS_ESSAI.documents >= 20 || PLAFONDS_ESSAI.rapide >= 500 || PLAFONDS_ESSAI.documents < 1) throw new Error('plafonds prudents');
  if (plafondProjet(env({ AI_CONFIG: 'payant' }), 'documents') !== null) throw new Error('payant : pas de plafond global');
  if (!PAUSE_MESSAGE.startsWith('L’assistant est en pause jusqu’à demain')) throw new Error('message de pause');
  if (DELAIS.rapide.total > 10_000) throw new Error('rapide : réponse en moins de 10 s, secours compris');
});

// ── Qui appelle : assistant_context, avec le jeton de la personne ──────────
function fakeDb(data: unknown, error: { code?: string } | null = null) {
  const seen: { fn: string; args: Record<string, unknown> }[] = [];
  const db: RpcClient = { rpc: (fn, args) => { seen.push({ fn, args }); return Promise.resolve({ data, error }); } };
  return { db, seen };
}

Deno.test('Contexte : un aller-retour, les bons paramètres, les refus traduits', async () => {
  const ok = fakeDb({ ok: true, user_id: 'u1', company_id: 'c1', role: 'admin', ai_enabled: true, used: 3, remaining: 47 });
  const r = await loadAssistantContext(ok.db, 'bureau', { limit: 50, tier: 'documents', globalLimit: 15 });
  if (!r.ok || r.userId !== 'u1' || r.companyId !== 'c1' || r.remaining !== 47) throw new Error(JSON.stringify(r));
  if (ok.seen.length !== 1 || ok.seen[0].fn !== 'assistant_context'
    || JSON.stringify(ok.seen[0].args) !== JSON.stringify({ p_side: 'bureau', p_limit: 50, p_tier: 'documents', p_global_limit: 15 })) throw new Error(JSON.stringify(ok.seen));
  const cases: [unknown, { code?: string } | null, string][] = [
    [{ ok: false, raison: 'non_autorise' }, null, 'non_autorise'], [{ ok: false, raison: 'cote_inconnu' }, null, 'non_autorise'],
    [{ ok: false, raison: 'ia_coupee', ai_enabled: false }, null, 'ia_coupee'], [{ ok: false, raison: 'quota', limite: 50 }, null, 'quota'],
    [{ ok: false, raison: 'pause' }, null, 'pause'], [{ ok: false, raison: 'non_connecte' }, null, 'non_connecte'],
    [null, { code: 'PGRST301' }, 'non_connecte'], [null, { code: '42501' }, 'non_connecte'],
    // Migration pas encore appliquée : indisponible, JAMAIS de repli sur une clé de service.
    [null, { code: 'PGRST202' }, 'indisponible'], [null, { code: '42883' }, 'indisponible'], [{ weird: 1 }, null, 'indisponible'],
    [{ ok: false, raison: 'niveau_inconnu' }, null, 'indisponible'],
  ];
  for (const [data, error, want] of cases) {
    const x = await loadAssistantContext(fakeDb(data, error).db, 'salarie', { limit: 20, tier: 'rapide', globalLimit: null });
    if (x.ok || x.raison !== want) throw new Error(`${JSON.stringify(data ?? error)} → ${JSON.stringify(x)} (attendu ${want})`);
  }
  const q = await loadAssistantContext(fakeDb({ ok: false, raison: 'quota', limite: 20 }).db, 'salarie', { limit: 20, tier: 'rapide', globalLimit: null });
  if (q.ok || q.limite !== 20) throw new Error('limite rendue');
  const boom: RpcClient = { rpc: () => Promise.reject(new Error('réseau')) };
  const b = await loadAssistantContext(boom, 'bulletin', { limit: 100, tier: 'documents', globalLimit: null });
  if (b.ok || b.raison !== 'indisponible') throw new Error('panne réseau → indisponible');
});

Deno.test('Plus AUCUNE clé de service dans assistant, worker-assistant et payslip-read', async () => {
  for (const fn of ['assistant', 'worker-assistant', 'payslip-read']) {
    const src = await Deno.readTextFile(new URL(`../${fn}/index.ts`, import.meta.url));
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    if (/SUPABASE_SERVICE_ROLE_KEY|service_role|SERVICE_ROLE/i.test(src)) throw new Error(`${fn} : clé de service mentionnée`);
    if (/auth\.admin|\badmin\.(from|rpc|auth)\b/.test(code)) throw new Error(`${fn} : client « admin » encore utilisé`);
    if (!/loadAssistantContext\(db, '(bureau|salarie|bulletin)'/.test(code)) throw new Error(`${fn} : n’appelle pas assistant_context`);
    if (!/SUPABASE_ANON_KEY/.test(code) || !/Authorization: `Bearer \$\{jwt\}`/.test(code)) throw new Error(`${fn} : client de la personne (anon + son jeton) attendu`);
    if ((code.match(/createClient\(/g) || []).length !== 1) throw new Error(`${fn} : un seul client, celui de la personne`);
    if (/assistant_consume|worker_assistant_consume/.test(code)) throw new Error(`${fn} : ancienne fonction de quota (clé de service) encore appelée`);
    if (/GEMINI_API_KEY/.test(code)) throw new Error(`${fn} : la clé passe par aiKey() (AI_API_KEY, repli GEMINI_API_KEY)`);
    if (!/body\.statut === true\) return json\(\{ formule: FORMULE \}\)/.test(code)) throw new Error(`${fn} : demande de statut attendue (sans quota ni modèle)`);
    // Le statut est traité AVANT le contexte (donc sans quota) et avant tout appel au modèle.
    const st = code.indexOf('body.statut');
    for (const marqueur of ['loadAssistantContext(', 'callFunction(', 'extractJson(']) {
      const k = code.indexOf(marqueur);
      if (k >= 0 && st > k) throw new Error(`${fn} : le statut doit être traité avant ${marqueur}`);
    }
  }
});

Deno.test('assistant-eval : appels au modèle par l’adaptateur partagé, rien en direct vers Gemini', async () => {
  const dir = new URL('../assistant-eval/', import.meta.url);
  for await (const e of Deno.readDir(dir)) {
    if (!e.isFile || !e.name.endsWith('.ts') || e.name.endsWith('.test.ts')) continue;
    const code = (await Deno.readTextFile(new URL(e.name, dir))).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    if (/generativelanguage\.googleapis\.com|x-goog-api-key|GEMINI_API_KEY/.test(code)) throw new Error(`${e.name} : appel direct à Gemini`);
    if (/temperature|thinkingBudget/.test(code)) throw new Error(`${e.name} : réglage retiré de Gemini 3`);
  }
  const idx = await Deno.readTextFile(new URL('index.ts', dir));
  if (!/from '\.\.\/_shared\/ai-provider\.ts'/.test(idx) || !/callFunction\(/.test(idx)) throw new Error('index.ts : callFunction attendu');
});

Deno.test('Aucun modèle retiré (ni son nom) dans le code, les tests et les documents', async () => {
  // Les noms sont assemblés ici pour que ce fichier ne les contienne pas lui-même.
  const retire = [new RegExp('gemini-3\\.' + '5-flash(?!-lite)'), new RegExp('gemini-3\\.' + '7-flash')];
  const racine = new URL('../../../', import.meta.url);
  const trouves: string[] = [];
  async function parcourir(rel: string) {
    for await (const e of Deno.readDir(new URL(rel, racine))) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === 'out' || e.name.startsWith('captures') || e.name.startsWith('.git')) continue;
      const p = `${rel}${e.name}`;
      if (e.isDirectory) { await parcourir(`${p}/`); continue; }
      if (!/\.(ts|tsx|mjs|js|md|sql|json)$/.test(e.name) || e.name === 'package-lock.json') continue;
      const txt = await Deno.readTextFile(new URL(p, racine));
      if (retire.some((re) => re.test(txt))) trouves.push(p);
    }
  }
  for (const d of ['supabase/', 'lib/', 'components/', 'app/', 'scripts/', 'docs/']) await parcourir(d);
  if (trouves.length) throw new Error(`modèle retiré encore écrit dans : ${trouves.join(', ')}`);
});

Deno.test('Documentation : l’exemple d’AI_CONFIG à copier-coller est valide et donne les trois modèles vérifiés', async () => {
  const md = await Deno.readTextFile(new URL('../../../docs/ia-v2.md', import.meta.url));
  const bloc = /```json\n(\{[^`]*"formule"[^`]*\})\n```/.exec(md);
  if (!bloc) throw new Error('docs/ia-v2.md : exemple AI_CONFIG (bloc json) introuvable');
  const { out: c, logs } = await logged(() => readConfig(env({ AI_CONFIG: bloc[1] })));
  if (logs.length) throw new Error(`l’exemple de la doc est refusé : ${logs.join('|')}`);
  if (c.rapide.model !== R || c.documents.model !== D || c.secours.model !== S || c.formule !== 'essai') throw new Error(JSON.stringify(c));
  for (const m of [R, D, S]) if (!md.includes(m)) throw new Error(`${m} absent de la doc`);
  if (!md.includes('Gemini gratuit = données fictives uniquement ; le payant est obligatoire avant tout vrai client (UE/Suisse)')) throw new Error('avertissement manquant dans la doc');
});
