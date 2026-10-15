// Claude (Sonnet 5.5) dans la couche IA : requête EXACTE de l'API Messages, lecture des réponses, erreurs, secours entre
// fournisseurs, pièces jointes, schémas de TOUTES les déclarations réelles, AI_CONFIG, aucun contenu dans les logs.
// Tout est simulé (fetch injecté) : aucun appel réseau, aucune vraie clé.   npm run test:ai-anthropic
import {
  aiDisponible, callFunction, cleDe, DELAIS, DELAIS_ANTHROPIC, extractJson, libelleModele, modeleServi, MODELES_PAR_DEFAUT, PLAFONDS_ESSAI,
  PROFIL_LONG, PROFIL_LONG_ANTHROPIC, readConfig, REPOS_MS, reposReinit, type ToolsResult,
} from './ai-provider.ts';
import { ASSISTANT_FUNCTIONS, functionsFor } from './assistant-outils.ts';
import {
  ANTHROPIC_AUTORISES, ANTHROPIC_URL, ANTHROPIC_VERSION, appelClaude, blocFichier, corpsOutils, coutStrict, IMAGE_MAX_BASE64, LIMITES_STRICT, MAX_TOKENS, outilsClaude, refusModeleAnthropic,
  STRICT_ACTIF, versSchemaClaude,
} from './ai-anthropic.ts';
import { PAYSLIP_SCHEMA } from './payslip-core.ts';
import { WORKER_SCHEMA } from './worker-assistant-core.ts';
import { WORKER_FUNCTIONS, workerFunctionsFor } from './worker-outils.ts';
import { DECLARER_HEURES_LONG, NOUVEAU_CHANTIER_LONG, WORKER_FUNCTIONS_LONG, workerFunctionsForLong } from './worker-multi-prompt.ts';

type Json = Record<string, any>; // deno-lint-ignore no-explicit-any

// ── Faux fournisseurs : une seule fonction fetch qui route vers « Claude » ou « Gemini » d'après l'adresse ──────────
type Plan = { ms?: number; status?: number; reject?: boolean; bad?: boolean; reply?: () => Response };
interface Vu { provider: 'anthropic' | 'gemini'; url: string; headers: Record<string, string>; body: Json; raw: string; method: string }
const tool = (name: string, input: Json = {}, id = `toolu_${name}`) => ({ type: 'tool_use', id, name, input });
const message = (content: unknown[], stop_reason = 'tool_use') => new Response(JSON.stringify({
  id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content, stop_reason, usage: { input_tokens: 10, output_tokens: 5 },
}), { status: 200, headers: { 'content-type': 'application/json' } });
const claudeOk = () => message([tool('repondre', { reponse: 'ok' })]);
const geminiOk = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'repondre', args: { reponse: 'ok' } } }] } }] }), { status: 200 });
const geminiJson = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"month":"2026-09"}' }] } }] }), { status: 200 });
function faux(plan: { anthropic?: Plan; gemini?: Plan } = {}, repl: { anthropic?: () => Response; gemini?: () => Response } = {}) {
  reposReinit(); // chaque scénario repart à neuf
  const vus: Vu[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const provider = url.startsWith('https://api.anthropic.com/') ? 'anthropic' : 'gemini';
    const headers = Object.fromEntries(Object.entries(init.headers as Record<string, string>));
    vus.push({ provider, url, headers, body: JSON.parse(String(init.body)), raw: String(init.body), method: String(init.method) });
    const p: Plan = plan[provider] ?? {};
    const reply = p.reply ?? (provider === 'anthropic' ? repl.anthropic ?? claudeOk : repl.gemini ?? geminiOk);
    return new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => {
        if (p.reject) return reject(new Error('réseau'));
        resolve(p.status ? new Response('{}', { status: p.status }) : p.bad ? new Response('pas du json', { status: 200 }) : reply());
      }, p.ms ?? 3);
      init.signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); });
    });
  };
  const de = (p: 'anthropic' | 'gemini') => vus.filter((v) => v.provider === p);
  return { vus, fetchImpl, claude: () => de('anthropic'), gemini: () => de('gemini'), ordre: () => vus.map((v) => v.provider).join(',') };
}
const env = (x: Record<string, string | undefined>) => ({ get: (k: string) => x[k] });
const CLAUDE_PARTOUT = '{"formule":"payant","rapide":"anthropic:claude-sonnet-5-5","documents":"anthropic:claude-sonnet-5-5","secours":"gemini:gemini-3.1-flash-lite"}';
const E = { AI_CONFIG: CLAUDE_PARTOUT, ANTHROPIC_API_KEY: 'sk-ant-test-cle', AI_API_KEY: 'cle-gemini-test' };
const PDF = { mime: 'application/pdf', base64: 'JVBERi0xLjQK' };
const HEIC = { mime: 'image/heic', base64: 'AAAAGGZ0eXBoZWlj' };
const FN = [{ name: 'repondre', description: 'Répondre.', parameters: { type: 'object', properties: { reponse: { type: 'string', description: 'x' } }, required: ['reponse'] } }];
/** Capture ce que le module journalise (pour prouver qu'il ne fuit rien). */
async function logged<T>(f: () => T | Promise<T>): Promise<{ out: T; logs: string[] }> {
  const logs: string[] = [];
  const orig = { error: console.error, log: console.log, warn: console.warn, info: console.info, debug: console.debug };
  const grab = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
  console.error = grab; console.log = grab; console.warn = grab; console.info = grab; console.debug = grab;
  try { return { out: await f(), logs }; } finally { Object.assign(console, orig); }
}
const ko = (r: ToolsResult | { ok: boolean }, reason: string) => { if (r.ok || (r as { reason?: string }).reason !== reason) throw new Error(`échec « ${reason} » attendu : ${JSON.stringify(r)}`); };

// ── 1. La requête exacte ─────────────────────────────────────────────────────
Deno.test('Requête Claude : adresse, en-têtes, modèle, system / user séparés, outils convertis, tool_choice auto, effort bas', async () => {
  const f = faux();
  const r = await callFunction({ prompt: 'Combien d’heures cette semaine ?', functions: FN }, env(E), f.fetchImpl);
  if (!r.ok || r.call.name !== 'repondre' || f.ordre() !== 'anthropic') throw new Error(JSON.stringify(r));
  const q = f.claude()[0];
  if (q.url !== ANTHROPIC_URL || ANTHROPIC_URL !== 'https://api.anthropic.com/v1/messages' || q.method !== 'POST') throw new Error(q.url);
  if (q.headers['x-api-key'] !== 'sk-ant-test-cle' || q.headers['anthropic-version'] !== '2023-06-01' || ANTHROPIC_VERSION !== '2023-06-01' || q.headers['content-type'] !== 'application/json') throw new Error(JSON.stringify(q.headers));
  if (Object.keys(q.headers).some((h) => /authorization|goog|beta/i.test(h))) throw new Error('aucun en-tête étranger (ni Authorization, ni clé Gemini, ni bêta)');
  const b = q.body;
  if (b.model !== 'claude-sonnet-5-5' || /\d{8}/.test(b.model)) throw new Error(`modèle : ${b.model}`);
  if (b.max_tokens !== MAX_TOKENS.low || !(b.max_tokens > 0)) throw new Error('max_tokens du niveau rapide');
  if (JSON.stringify(b.output_config) !== '{"effort":"low"}') throw new Error(`effort du niveau rapide : ${JSON.stringify(b.output_config)}`);
  if (!Array.isArray(b.system) || b.system.length !== 1 || b.system[0].type !== 'text' || !/UNIQUEMENT en appelant une des fonctions/.test(b.system[0].text) || !/UNE seule fonction/.test(b.system[0].text)) throw new Error(`system : ${JSON.stringify(b.system)}`);
  if (JSON.stringify(b.messages) !== JSON.stringify([{ role: 'user', content: [{ type: 'text', text: 'Combien d’heures cette semaine ?' }] }])) throw new Error(`messages : ${JSON.stringify(b.messages)}`);
  if (JSON.stringify(b.tool_choice) !== '{"type":"auto","disable_parallel_tool_use":true}') throw new Error(`tool_choice : ${JSON.stringify(b.tool_choice)}`);
  if (b.tools.length !== 1 || b.tools[0].name !== 'repondre' || b.tools[0].description !== 'Répondre.' || 'strict' in b.tools[0]) throw new Error(JSON.stringify(b.tools));
  if (JSON.stringify(b.tools[0].input_schema) !== '{"type":"object","properties":{"reponse":{"type":"string","description":"x"}},"required":["reponse"],"additionalProperties":false}') throw new Error(JSON.stringify(b.tools[0].input_schema));
});

Deno.test('Requête Claude : jamais temperature / top_p / top_k / budget_tokens / thinking, ni tool_choice forcé, ni cache_control, ni stream — dans AUCUN cas', async () => {
  const cas: { nom: string; run: (fetchImpl: (u: string, i: RequestInit) => Promise<Response>) => Promise<unknown>; reply?: () => Response }[] = [
    { nom: 'rapide', run: (fi) => callFunction({ prompt: 'x', functions: FN }, env(E), fi) },
    { nom: 'plusieurs appels', run: (fi) => callFunction({ prompt: 'x', functions: FN, maxCalls: 4 }, env(E), fi) },
    { nom: 'profil long', run: (fi) => callFunction({ prompt: 'x', functions: FN, maxCalls: 4, profil: 'long' }, env(E), fi) },
    { nom: 'documents', run: (fi) => callFunction({ prompt: 'x', functions: FN, file: PDF }, env(E), fi) },
    { nom: 'extractJson', run: (fi) => extractJson({ prompt: 'x', schema: { type: 'object' }, file: PDF }, env(E), fi), reply: () => message([{ type: 'text', text: '{}' }], 'end_turn') },
  ];
  for (const c of cas) {
    const f = faux({}, { anthropic: c.reply });
    await c.run(f.fetchImpl);
    const q = f.claude()[0];
    if (!q) throw new Error(`${c.nom} : aucun appel`);
    if (/temperature|top_?p|top_?k|budget_tokens|"thinking"|cache_control|"stream"|"any"|"type":"tool"|fallbacks|betas/i.test(q.raw.replace(/"top_p_doc"/, ''))) throw new Error(`${c.nom} : ${q.raw.slice(0, 400)}`);
    if (q.body.tool_choice && q.body.tool_choice.type !== 'auto') throw new Error(`${c.nom} : tool_choice forcé`);
    if (q.body.thinking !== undefined) throw new Error(`${c.nom} : thinking omis (réflexion adaptative)`);
    if (!['low', 'medium', 'high'].includes(q.body.output_config.effort)) throw new Error(`${c.nom} : effort`);
  }
});

Deno.test('Effort par niveau et par profil : rapide « low », documents et profil long « medium », secours « low » ; délais et max_tokens suivent', async () => {
  const effort = (v: Vu) => v.body.output_config.effort;
  const a = faux(); await callFunction({ prompt: 'x', functions: FN }, env(E), a.fetchImpl);
  const b = faux(); await callFunction({ prompt: 'x', functions: FN, maxCalls: 4, profil: 'long' }, env(E), b.fetchImpl);
  const c = faux(); await callFunction({ prompt: 'x', functions: FN, file: PDF }, env(E), c.fetchImpl);
  const d = faux(); await extractJson({ prompt: 'x', schema: { type: 'object' }, file: PDF }, env(E), d.fetchImpl);
  if (effort(a.claude()[0]) !== 'low' || effort(b.claude()[0]) !== 'medium' || effort(c.claude()[0]) !== 'medium' || effort(d.claude()[0]) !== 'medium') throw new Error('rapide low ; long, documents et bulletin medium');
  if (a.claude()[0].body.max_tokens !== 4096 || b.claude()[0].body.max_tokens !== 8192) throw new Error('max_tokens : la réflexion compte dedans');
  // « Plusieurs appels » : le parallèle reste permis (pas de disable_parallel_tool_use).
  if (JSON.stringify(b.claude()[0].body.tool_choice) !== '{"type":"auto"}' || /UNE seule fonction/.test(b.claude()[0].body.system[0].text)) throw new Error('plusieurs appels : tool_choice auto simple');
  // Secours chez Claude (rapide en panne chez Gemini) : « low ».
  const cfg = '{"formule":"payant","rapide":"gemini:gemini-3.5-flash-lite","secours":"anthropic:claude-haiku-5-5"}';
  const e = faux({ gemini: { status: 503 } });
  const r = await callFunction({ prompt: 'x', functions: FN }, env({ ...E, AI_CONFIG: cfg }), e.fetchImpl);
  if (!r.ok || r.secours !== true || e.ordre() !== 'gemini,anthropic' || effort(e.claude()[0]) !== 'low' || e.claude()[0].body.model !== 'claude-haiku-5-5') throw new Error(JSON.stringify(r));
  const g = faux({ gemini: { status: 503 } });
  await callFunction({ prompt: 'x', functions: FN, maxCalls: 4, profil: 'long' }, env({ ...E, AI_CONFIG: cfg }), g.fetchImpl);
  if (effort(g.claude()[0]) !== 'low') throw new Error('profil long, secours Claude : low (comme le secours Gemini en « low »)');
});

Deno.test('Pièces jointes : image jpeg / png / webp / gif et PDF acceptés, le fichier AVANT le texte ; HEIC / HEIF / trop lourd = pas envoyés', () => {
  for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
    const b = blocFichier({ mime, base64: 'AAAA' });
    if (JSON.stringify(b) !== JSON.stringify({ type: 'image', source: { type: 'base64', media_type: mime, data: 'AAAA' } })) throw new Error(mime);
  }
  if (JSON.stringify(blocFichier(PDF)) !== JSON.stringify({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: PDF.base64 } })) throw new Error('pdf');
  for (const mime of ['image/heic', 'image/heif', 'image/tiff', 'text/plain', '']) if (blocFichier({ mime, base64: 'AAAA' }) !== null) throw new Error(`${mime} ne doit pas partir`);
  if (blocFichier({ mime: 'image/jpeg', base64: 'A'.repeat(IMAGE_MAX_BASE64 + 1) }) !== null) throw new Error('image au-delà de 10 Mo en base64');
  if (blocFichier({ mime: 'image/jpeg', base64: 'A'.repeat(IMAGE_MAX_BASE64) }) === null) throw new Error('10 Mo pile : accepté');
});

Deno.test('Pièces jointes dans la requête : bloc document ou image placé avant le texte', async () => {
  const f = faux();
  await callFunction({ prompt: 'lis ce devis', functions: FN, file: PDF }, env(E), f.fetchImpl);
  const g = faux();
  await callFunction({ prompt: 'range cette photo', functions: FN, file: { mime: 'image/png', base64: 'iVBORw0KGgo=' } }, env(E), g.fetchImpl);
  const c1 = f.claude()[0].body.messages[0].content, c2 = g.claude()[0].body.messages[0].content;
  if (c1.length !== 2 || c1[0].type !== 'document' || c1[0].source.media_type !== 'application/pdf' || c1[1].type !== 'text' || c1[1].text !== 'lis ce devis') throw new Error(JSON.stringify(c1).slice(0, 200));
  if (c2.length !== 2 || c2[0].type !== 'image' || c2[0].source.media_type !== 'image/png' || c2[1].text !== 'range cette photo') throw new Error(JSON.stringify(c2).slice(0, 200));
});

// ── 2. HEIC : le niveau échoue proprement vers le secours ───────────────────────
Deno.test('HEIC / HEIF vers un niveau Claude : RIEN n’est envoyé à Claude, le secours Gemini lit le fichier, le niveau n’est PAS mis au repos', async () => {
  for (const file of [HEIC, { mime: 'image/heif', base64: 'AAAAGGZ0eXBoZWlm' }]) {
    const f = faux();
    const r = await callFunction({ prompt: 'x', functions: FN, file }, env(E), f.fetchImpl);
    if (!r.ok || r.secours !== true || f.ordre() !== 'gemini') throw new Error(`${file.mime} : ${f.ordre()} ${JSON.stringify(r)}`);
    const parts = f.gemini()[0].body.contents[0].parts;
    if (parts[1].inline_data.mime_type !== file.mime) throw new Error('Gemini reçoit le HEIC tel quel');
    if (f.gemini()[0].headers['x-goog-api-key'] !== 'cle-gemini-test') throw new Error('bonne clé pour Gemini');
    if (modeleServi(r) !== 'gemini:gemini-3.1-flash-lite') throw new Error(`servi : ${modeleServi(r)}`);
  }
  // Pas de repos : un PDF juste après repart chez Claude (le HEIC n’est pas une panne du modèle).
  const g = faux();
  await callFunction({ prompt: 'x', functions: FN, file: HEIC }, env(E), g.fetchImpl);
  const apres = await callFunction({ prompt: 'x', functions: FN, file: PDF }, env(E), g.fetchImpl);
  if (!apres.ok || apres.secours || g.ordre() !== 'gemini,anthropic') throw new Error(`après HEIC : ${g.ordre()}`);
  // Bulletin (extractJson) en HEIC : même chose.
  const h = faux({}, { gemini: geminiJson });
  const j = await extractJson({ prompt: 'x', schema: PAYSLIP_SCHEMA, file: HEIC, tier: 'documents' }, env(E), h.fetchImpl);
  if (!j.ok || j.secours !== true || h.ordre() !== 'gemini') throw new Error(`extractJson HEIC : ${h.ordre()}`);
  // Secours Claude aussi (Gemini → Claude) : un HEIC ne part jamais chez Claude, l’échec est propre.
  const i = faux({ gemini: { status: 500 } });
  const x = await callFunction({ prompt: 'x', functions: FN, file: HEIC }, env({ ...E, AI_CONFIG: '{"documents":"gemini:gemini-3.8-flash","secours":"anthropic:claude-sonnet-5-5"}' }), i.fetchImpl);
  ko(x, 'provider_error'); if (i.claude().length) throw new Error('rien à Claude');
});

// ── 3. Lecture des réponses ──────────────────────────────────────────────────
const A = (name: string, args: Json = {}) => tool(name, args);
const NOMS = ['declarer_heures', 'panier_repas', 'signaler_reserve', 'demander_conge', 'envoyer_journee', 'repondre'];
const FNS = NOMS.map((name) => ({ name, description: 'x', parameters: { type: 'object', properties: {} } }));
const noms = (cs?: { name: string }[]) => (cs ?? []).map((c) => c.name).join(',');

Deno.test('Réponse : un appel (texte et réflexion autour ignorés) ; plusieurs appels dans l’ordre ; call = calls[0]', async () => {
  const f = faux({}, { anthropic: () => message([{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: 'Je regarde.' }, A('repondre', { reponse: 'Bonjour' })]) });
  const r = await callFunction({ prompt: 'x', functions: FNS }, env(E), f.fetchImpl);
  if (!r.ok || JSON.stringify(Object.keys(r)) !== '["ok","call"]' || r.call.name !== 'repondre' || r.call.args.reponse !== 'Bonjour') throw new Error(JSON.stringify(r));
  if (modeleServi(r) !== 'anthropic:claude-sonnet-5-5' || (r as { secours?: true }).secours) throw new Error('servi par Claude, pas le secours');
  const g = faux({}, { anthropic: () => message([A('declarer_heures', { date: '2026-10-01' }), A('panier_repas', { valeur: true }), A('envoyer_journee')]) });
  const m = await callFunction({ prompt: 'x', functions: FNS, maxCalls: 4 }, env(E), g.fetchImpl);
  if (!m.ok || noms(m.calls) !== 'declarer_heures,panier_repas,envoyer_journee' || m.call !== m.calls![0] || m.rognes !== undefined || g.claude().length !== 1) throw new Error(JSON.stringify(m));
  // maxCalls absent ou 1 : seulement le premier, même forme qu’avant.
  const h = faux({}, { anthropic: () => message([A('declarer_heures'), A('panier_repas')]) });
  const u = await callFunction({ prompt: 'x', functions: FNS, maxCalls: 1 }, env(E), h.fetchImpl);
  if (!u.ok || JSON.stringify(Object.keys(u)) !== '["ok","call"]' || u.call.name !== 'declarer_heures') throw new Error(JSON.stringify(u));
});

Deno.test('Réponse : doublons exacts retirés AVANT le plafond (4), rognes comptés, noms hors liste écartés', async () => {
  const cinq = [A('declarer_heures'), A('panier_repas'), A('signaler_reserve'), A('demander_conge'), A('envoyer_journee')];
  for (const maxCalls of [4, 9, 100]) {
    const f = faux({}, { anthropic: () => message(cinq) });
    const r = await callFunction({ prompt: 'x', functions: FNS, maxCalls }, env(E), f.fetchImpl);
    if (!r.ok || r.calls?.length !== 4 || r.rognes !== 1 || noms(r.calls) !== 'declarer_heures,panier_repas,signaler_reserve,demander_conge') throw new Error(`maxCalls ${maxCalls} : ${JSON.stringify(r)}`);
  }
  const d = { valeur: true };
  const g = faux({}, { anthropic: () => message([A('declarer_heures'), A('panier_repas', d), A('panier_repas', { ...d }), A('signaler_reserve'), A('envoyer_journee')]) });
  const r = await callFunction({ prompt: 'x', functions: FNS, maxCalls: 4 }, env(E), g.fetchImpl);
  if (!r.ok || noms(r.calls) !== 'declarer_heures,panier_repas,signaler_reserve,envoyer_journee' || r.rognes !== undefined) throw new Error(JSON.stringify(r));
  const jour = (debut: string) => A('declarer_heures', { date: '2026-10-01', lignes: [{ debut, fin: '17:00' }] });
  const h = faux({}, { anthropic: () => message([jour('08:00'), jour('09:00'), jour('08:00')]) });
  const j = await callFunction({ prompt: 'x', functions: FNS, maxCalls: 4 }, env(E), h.fetchImpl);
  if (!j.ok || j.calls?.length !== 2) throw new Error('arguments imbriqués différents = deux appels distincts');
  const i = faux({}, { anthropic: () => message([A('effacer_heures'), A('panier_repas', d), A('rm_rf')]) });
  const k = await callFunction({ prompt: 'x', functions: FNS, maxCalls: 4 }, env(E), i.fetchImpl);
  if (!k.ok || noms(k.calls) !== 'panier_repas') throw new Error(JSON.stringify(k));
});

Deno.test('Réponse sans appel valide (texte seul, bloc outil inconnu, contenu vide) → bad_response, sans second appel ni secours', async () => {
  const reponses: [string, () => Response][] = [
    ['texte seul', () => message([{ type: 'text', text: 'Bonjour !' }], 'end_turn')],
    ['outil inconnu', () => message([A('effacer_tout')])],
    ['contenu vide', () => message([], 'end_turn')],
    ['corps sans content', () => new Response('{"id":"x"}', { status: 200 })],
  ];
  for (const [nom, rep] of reponses) for (const maxCalls of [undefined, 1, 4]) {
    const f = faux({}, { anthropic: rep });
    const r = await callFunction({ prompt: 'x', functions: FNS, maxCalls }, env(E), f.fetchImpl);
    if (r.ok || r.reason !== 'bad_response' || f.vus.length !== 1) throw new Error(`${nom} / ${maxCalls} : ${JSON.stringify(r)} ${f.ordre()}`);
  }
  // Réponse qui n’est pas du JSON : illisible, pas lente.
  const g = faux({ anthropic: { bad: true } });
  ko(await callFunction({ prompt: 'x', functions: FNS }, env(E), g.fetchImpl), 'bad_response');
});

Deno.test('stop_reason « refusal » : traité comme une panne du niveau (le secours Gemini répond), jamais mis au repos, sans contenu dans les logs', async () => {
  const SECRET = 'CONTENU-SECRET-DU-REFUS';
  const f = faux({}, { anthropic: () => new Response(JSON.stringify({ content: [{ type: 'text', text: SECRET }], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'general_harms', explanation: SECRET } }), { status: 200 }) });
  const { out: r, logs } = await logged(() => callFunction({ prompt: 'x', functions: FN, file: PDF }, env(E), f.fetchImpl));
  if (!r.ok || r.secours !== true || f.ordre() !== 'anthropic,gemini') throw new Error(`${f.ordre()} ${JSON.stringify(r)}`);
  if (logs.some((l) => l.includes(SECRET))) throw new Error('le contenu du refus ne doit jamais sortir');
  // Un refus sur UN document ne met pas « documents » au repos 10 minutes : la demande suivante repart chez Claude.
  const g = await callFunction({ prompt: 'x', functions: FN, file: PDF }, env(E), f.fetchImpl);
  if (!g.ok || f.ordre() !== 'anthropic,gemini,anthropic,gemini') throw new Error(`pas de repos après un refus : ${f.ordre()}`);
  // Refus aussi chez le secours : échec propre.
  const h = faux({ gemini: { status: 500 } }, { anthropic: () => message([], 'refusal') });
  ko(await callFunction({ prompt: 'x', functions: FN }, env(E), h.fetchImpl), 'provider_error');
});

Deno.test('stop_reason « max_tokens » : arguments peut-être coupés → jamais exécutés (bad_response, pas de second appel)', async () => {
  const f = faux({}, { anthropic: () => message([A('repondre', { reponse: 'coupé au mil' })], 'max_tokens') });
  const r = await callFunction({ prompt: 'x', functions: FN }, env(E), f.fetchImpl);
  ko(r, 'bad_response'); if (f.vus.length !== 1) throw new Error('un seul appel');
  const g = faux({}, { anthropic: () => message([{ type: 'text', text: '{"month":"2026-0' }], 'max_tokens') });
  ko(await extractJson({ prompt: 'x', schema: PAYSLIP_SCHEMA, file: PDF }, env(E), g.fetchImpl), 'bad_response');
});

// ── 4. Erreurs : lentes ou non, repos du niveau « documents » ────────────────────
Deno.test('Erreurs de Claude : 400 non lent ; 429 / 500 / 529 / 408 / 404 / injoignable lents ; le secours Gemini répond après chacune', async () => {
  for (const status of [400, 401, 403, 413, 429, 500, 503, 529, 408, 404]) {
    const f = faux({ anthropic: { status } });
    const r = await callFunction({ prompt: 'x', functions: FN }, env(E), f.fetchImpl);
    if (!r.ok || r.secours !== true || f.ordre() !== 'anthropic,gemini') throw new Error(`${status} : ${f.ordre()}`);
  }
  const f = faux({ anthropic: { reject: true } });
  const r = await callFunction({ prompt: 'x', functions: FN }, env(E), f.fetchImpl);
  if (!r.ok || f.ordre() !== 'anthropic,gemini') throw new Error('injoignable → secours');
  // Appel direct : le drapeau « lent » de l’adaptateur.
  const lent = async (status: number) => {
    const g = faux({ anthropic: { status } });
    return (await appelClaude('claude-sonnet-5-5', 'k', {}, 1000, g.fetchImpl)) as { ok: false; lent: boolean; reason: string };
  };
  for (const [status, attendu] of [[400, false], [401, false], [413, false], [429, true], [500, true], [529, true], [503, true], [408, true], [404, true]] as const) {
    const x = await lent(status);
    if (x.ok || x.lent !== attendu || x.reason !== 'provider_error') throw new Error(`${status} : ${JSON.stringify(x)}`);
  }
});

Deno.test('Repos du niveau « documents » chez Claude : 429 / 5xx / 529 / délai le mettent de côté 10 min (le secours répond tout de suite) ; 400 et réponse illisible non', async () => {
  if (REPOS_MS.documents !== 10 * 60_000 || REPOS_MS.rapide !== 0) throw new Error('repos inchangé');
  for (const plan of [{ status: 429 }, { status: 500 }, { status: 529 }, { reject: true }] as Plan[]) {
    const f = faux({ anthropic: plan });
    await callFunction({ prompt: 'x', functions: FN, file: PDF }, env(E), f.fetchImpl);
    const r2 = await callFunction({ prompt: 'x', functions: FN, file: PDF }, env(E), f.fetchImpl);
    if (!r2.ok || r2.secours !== true || f.ordre() !== 'anthropic,gemini,gemini') throw new Error(`${JSON.stringify(plan)} : ${f.ordre()}`);
  }
  for (const plan of [{ status: 400 }, { bad: true }] as Plan[]) {
    const g = faux({ anthropic: plan });
    await callFunction({ prompt: 'x', functions: FN, file: PDF }, env(E), g.fetchImpl);
    await callFunction({ prompt: 'x', functions: FN, file: PDF }, env(E), g.fetchImpl);
    const attendu = plan.status ? 'anthropic,gemini,anthropic,gemini' : 'anthropic,anthropic';
    if (g.ordre() !== attendu) throw new Error(`${JSON.stringify(plan)} sans repos : ${g.ordre()}`);
  }
  // Le niveau « rapide » n’est jamais mis de côté.
  const h = faux({ anthropic: { status: 429 } });
  await callFunction({ prompt: 'x', functions: FN }, env(E), h.fetchImpl);
  await callFunction({ prompt: 'x', functions: FN }, env(E), h.fetchImpl);
  if (h.ordre() !== 'anthropic,gemini,anthropic,gemini') throw new Error(`rapide : ${h.ordre()}`);
  // Repos échu (horloge simulée) : Claude est réessayé.
  let t = 1_000_000;
  const i = faux({ anthropic: { status: 529 } }); reposReinit(() => t);
  await callFunction({ prompt: 'x', functions: FN, file: PDF }, env(E), i.fetchImpl);
  t += REPOS_MS.documents + 1;
  await callFunction({ prompt: 'x', functions: FN, file: PDF }, env(E), i.fetchImpl);
  if (i.ordre() !== 'anthropic,gemini,anthropic,gemini') throw new Error(`après le repos : ${i.ordre()}`);
});

Deno.test('Délais Claude : tableaux propres au fournisseur, ceux de Gemini inchangés ; plafond de temps respecté (AbortController)', async () => {
  if (JSON.stringify(DELAIS_ANTHROPIC) !== JSON.stringify({ rapide: { premier: 9000, total: 14000 }, documents: { premier: 20000, total: 35000 } })) throw new Error(JSON.stringify(DELAIS_ANTHROPIC));
  if (JSON.stringify(PROFIL_LONG_ANTHROPIC) !== JSON.stringify({ delais: { premier: 18000, total: 28000 } })) throw new Error(JSON.stringify(PROFIL_LONG_ANTHROPIC));
  if (JSON.stringify(DELAIS) !== JSON.stringify({ rapide: { premier: 5000, total: 8000 }, documents: { premier: 12000, total: 25000 } })) throw new Error('Gemini bouge');
  if (JSON.stringify(PROFIL_LONG.delais) !== JSON.stringify({ premier: 14000, total: 22000 })) throw new Error('profil long Gemini bouge');
  const vrais = { r: DELAIS_ANTHROPIC.rapide, d: DELAIS_ANTHROPIC.documents, l: PROFIL_LONG_ANTHROPIC.delais };
  const vraisG = DELAIS.rapide;
  DELAIS_ANTHROPIC.rapide = { premier: 300, total: 2500 };
  DELAIS_ANTHROPIC.documents = { premier: 400, total: 2600 };
  PROFIL_LONG_ANTHROPIC.delais = { premier: 500, total: 2700 };
  DELAIS.rapide = { premier: 9_000, total: 9_000 }; // si le tableau de Gemini servait par erreur, le test durerait 9 s
  try {
    const f = faux({ anthropic: { ms: 60_000 } });
    const t0 = Date.now();
    const r = await callFunction({ prompt: 'x', functions: FN }, env(E), f.fetchImpl);
    const ms = Date.now() - t0;
    if (!r.ok || r.secours !== true || f.ordre() !== 'anthropic,gemini' || ms < 250 || ms > 1500) throw new Error(`rapide : abandon à ~0,3 s puis secours, pas ${ms} ms (${f.ordre()})`);
    const g = faux({ anthropic: { ms: 60_000 }, gemini: { ms: 60_000 } });
    const t1 = Date.now();
    const x = await callFunction({ prompt: 'x', functions: FN }, env(E), g.fetchImpl);
    const ms2 = Date.now() - t1;
    ko(x, 'provider_error'); if (ms2 > 2500 + 500 || g.vus.length !== 2) throw new Error(`plafond total : ${ms2} ms, ${g.vus.length} appels`);
    const h = faux({ anthropic: { ms: 60_000 } });
    const t2 = Date.now();
    const y = await callFunction({ prompt: 'x', functions: FN, file: PDF }, env(E), h.fetchImpl);
    const ms3 = Date.now() - t2;
    if (!y.ok || ms3 < 350 || ms3 > 1500) throw new Error(`documents : ${ms3} ms`);
    const i = faux({ anthropic: { ms: 60_000 } });
    const t3 = Date.now();
    const z = await callFunction({ prompt: 'x', functions: FN, maxCalls: 4, profil: 'long' }, env(E), i.fetchImpl);
    const ms4 = Date.now() - t3;
    if (!z.ok || ms4 < 450 || ms4 > 1500) throw new Error(`profil long : ${ms4} ms`);
  } finally {
    DELAIS_ANTHROPIC.rapide = vrais.r; DELAIS_ANTHROPIC.documents = vrais.d; PROFIL_LONG_ANTHROPIC.delais = vrais.l; DELAIS.rapide = vraisG;
  }
});

// ── 5. Secours entre fournisseurs et clés ─────────────────────────────────────
Deno.test('Secours entre fournisseurs : Claude → Gemini et Gemini → Claude, chacun avec SA clé et SON en-tête', async () => {
  const a = faux({ anthropic: { status: 529 } });
  const r = await callFunction({ prompt: 'x', functions: FN }, env(E), a.fetchImpl);
  if (!r.ok || r.secours !== true || a.ordre() !== 'anthropic,gemini') throw new Error(a.ordre());
  if (a.claude()[0].headers['x-api-key'] !== 'sk-ant-test-cle' || a.claude()[0].headers['x-goog-api-key']) throw new Error('Claude : sa clé seulement');
  if (a.gemini()[0].headers['x-goog-api-key'] !== 'cle-gemini-test' || a.gemini()[0].headers['x-api-key']) throw new Error('Gemini : sa clé seulement');
  if (!a.gemini()[0].url.includes('gemini-3.1-flash-lite:generateContent') || modeleServi(r) !== 'gemini:gemini-3.1-flash-lite') throw new Error('secours Gemini');
  // Gemini d’abord, Claude en secours.
  const cfg = '{"formule":"payant","rapide":"gemini:gemini-3.5-flash-lite","documents":"gemini:gemini-3.8-flash","secours":"anthropic:claude-sonnet-5-5"}';
  const b = faux({ gemini: { status: 503 } });
  const s = await callFunction({ prompt: 'x', functions: FN }, env({ ...E, AI_CONFIG: cfg }), b.fetchImpl);
  if (!s.ok || s.secours !== true || b.ordre() !== 'gemini,anthropic' || b.claude()[0].headers['x-api-key'] !== 'sk-ant-test-cle' || modeleServi(s) !== 'anthropic:claude-sonnet-5-5') throw new Error(b.ordre());
  // Les deux en panne : échec propre.
  const c = faux({ anthropic: { status: 500 }, gemini: { status: 500 } });
  ko(await callFunction({ prompt: 'x', functions: FN }, env(E), c.fetchImpl), 'provider_error');
  // Documents : Claude lent → repos → le secours Gemini lit le PDF avec son bloc inline_data.
  const d = faux({ anthropic: { status: 429 } });
  const e = await callFunction({ prompt: 'x', functions: FN, file: PDF }, env(E), d.fetchImpl);
  if (!e.ok || d.gemini()[0].body.contents[0].parts[1].inline_data.mime_type !== 'application/pdf') throw new Error('PDF lu par Gemini');
});

Deno.test('Clés : « anthropic » lit ANTHROPIC_API_KEY, « gemini » lit AI_API_KEY puis GEMINI_API_KEY ; clé absente = niveau non configuré, le secours prend le relais', async () => {
  if (cleDe(env({ ANTHROPIC_API_KEY: 'a', AI_API_KEY: 'g' }), 'anthropic') !== 'a' || cleDe(env({ AI_API_KEY: 'g' }), 'anthropic') !== undefined) throw new Error('clé Claude');
  if (cleDe(env({ AI_API_KEY: 'g', GEMINI_API_KEY: 'h' }), 'gemini') !== 'g' || cleDe(env({ GEMINI_API_KEY: 'h' }), 'gemini') !== 'h' || cleDe(env({ ANTHROPIC_API_KEY: 'a' }), 'gemini') !== undefined || cleDe(env({ ANTHROPIC_API_KEY: '' }), 'anthropic') !== undefined) throw new Error('clé Gemini');
  // Claude sur rapide et documents, SANS clé Claude : tout va au secours Gemini (comme après une panne), secours: true.
  const sansClaude = env({ AI_CONFIG: CLAUDE_PARTOUT, GEMINI_API_KEY: 'ancienne' });
  const f = faux();
  const { out: r, logs } = await logged(() => callFunction({ prompt: 'x', functions: FN }, sansClaude, f.fetchImpl));
  if (!r.ok || r.secours !== true || f.ordre() !== 'gemini' || f.gemini()[0].headers['x-goog-api-key'] !== 'ancienne') throw new Error(f.ordre());
  if (logs.length !== 1 || logs[0].length > 120) throw new Error(`une ligne courte : ${JSON.stringify(logs)}`);
  const g = faux({}, { gemini: geminiJson });
  const j = await extractJson({ prompt: 'x', schema: PAYSLIP_SCHEMA, file: PDF, tier: 'documents' }, sansClaude, g.fetchImpl);
  if (!j.ok || g.ordre() !== 'gemini') throw new Error('extractJson sans clé Claude → Gemini');
  // Gemini d’abord et clé Gemini absente : le secours Claude répond.
  const cfg = '{"formule":"payant","secours":"anthropic:claude-haiku-5-5"}';
  const h = faux();
  const s = await callFunction({ prompt: 'x', functions: FN }, env({ AI_CONFIG: cfg, ANTHROPIC_API_KEY: 'sk-ant-x' }), h.fetchImpl);
  if (!s.ok || s.secours !== true || h.ordre() !== 'anthropic') throw new Error(h.ordre());
  // Aucune clé utile : not_configured, aucun appel (la clé de l’autre fournisseur ne sert à rien si aucun niveau ne l’utilise).
  const i = faux();
  ko(await callFunction({ prompt: 'x', functions: FN }, env({ AI_CONFIG: CLAUDE_PARTOUT }), i.fetchImpl), 'not_configured');
  ko(await extractJson({ prompt: 'x', schema: {}, file: PDF }, env({ AI_CONFIG: CLAUDE_PARTOUT }), i.fetchImpl), 'not_configured');
  const sansUtile = env({ ANTHROPIC_API_KEY: 'sk-ant-x' }); // réglage par défaut (tout Gemini) + seulement la clé Claude
  ko(await callFunction({ prompt: 'x', functions: FN }, sansUtile, i.fetchImpl), 'not_configured');
  if (i.vus.length) throw new Error('aucun appel sans clé utile');
  // Claude seul des deux côtés (secours aussi Claude) : sa clé suffit.
  const k = faux();
  const solo = env({ AI_CONFIG: '{"rapide":"anthropic:claude-haiku-5-5","secours":"anthropic:claude-sonnet-5-5"}', ANTHROPIC_API_KEY: 'sk-ant-x' });
  const q = await callFunction({ prompt: 'x', functions: FN }, solo, k.fetchImpl);
  if (!q.ok || k.ordre() !== 'anthropic') throw new Error('solo');
});

Deno.test('aiDisponible(env, niveau) : le fournisseur du niveau OU celui du secours a sa clé ; les clés seules de la prod d’aujourd’hui suffisent', () => {
  const d = (x: Record<string, string>, t: 'rapide' | 'documents') => aiDisponible(env(x), t);
  if (!d({ GEMINI_API_KEY: 'g' }, 'rapide') || !d({ AI_API_KEY: 'g' }, 'documents') || d({}, 'rapide') || d({ ANTHROPIC_API_KEY: 'a' }, 'rapide')) throw new Error('défaut : Gemini');
  if (!d({ ...E }, 'rapide') || !d({ AI_CONFIG: CLAUDE_PARTOUT, ANTHROPIC_API_KEY: 'a' }, 'documents') || !d({ AI_CONFIG: CLAUDE_PARTOUT, AI_API_KEY: 'g' }, 'rapide')) throw new Error('Claude + secours Gemini');
  if (d({ AI_CONFIG: CLAUDE_PARTOUT }, 'rapide')) throw new Error('aucune clé');
  const mixte = '{"rapide":"anthropic:claude-sonnet-5-5","documents":"gemini:gemini-3.8-flash","secours":"gemini:gemini-3.1-flash-lite"}';
  if (!d({ AI_CONFIG: mixte, AI_API_KEY: 'g' }, 'documents') || !d({ AI_CONFIG: mixte, AI_API_KEY: 'g' }, 'rapide')) throw new Error('mixte');
});

Deno.test('Résultat : modeleServi dit « fournisseur:modèle » du modèle qui a RÉPONDU (Claude ou son secours) ; rien en cas d’échec ; la forme du résultat ne change pas', async () => {
  const f = faux();
  const r = await callFunction({ prompt: 'x', functions: FN }, env(E), f.fetchImpl);
  if (!r.ok || modeleServi(r) !== 'anthropic:claude-sonnet-5-5' || JSON.stringify(Object.keys(r)) !== '["ok","call"]') throw new Error(JSON.stringify(r));
  const g = faux({ anthropic: { status: 500 } });
  const s = await callFunction({ prompt: 'x', functions: FN }, env(E), g.fetchImpl);
  if (!s.ok || modeleServi(s) !== 'gemini:gemini-3.1-flash-lite' || JSON.stringify(Object.keys(s)) !== '["ok","call","secours"]') throw new Error(JSON.stringify(s));
  const h = faux({ anthropic: { status: 500 }, gemini: { status: 500 } });
  const x = await callFunction({ prompt: 'x', functions: FN }, env(E), h.fetchImpl);
  if (x.ok || modeleServi(x) !== undefined) throw new Error('rien en cas d’échec');
  if (libelleModele(readConfig(env(E)).rapide) !== 'anthropic:claude-sonnet-5-5') throw new Error('libellé');
});

// ── 6. extractJson (bulletin) : sortie structurée ──────────────────────────────
Deno.test('extractJson chez Claude : sortie structurée output_config.format (json_schema), schéma converti, texte lu en JSON, bloc document', async () => {
  const f = faux({}, { anthropic: () => message([{ type: 'text', text: '{"month":"2026-09","gross":2450,"employer_total":null,"paid_hours":151.67}' }], 'end_turn') });
  const r = await extractJson({ prompt: 'Lis ce bulletin', schema: PAYSLIP_SCHEMA, file: PDF, tier: 'documents' }, env(E), f.fetchImpl);
  if (!r.ok || (r.data as Json).gross !== 2450 || (r.data as Json).employer_total !== null || modeleServi(r) !== 'anthropic:claude-sonnet-5-5') throw new Error(JSON.stringify(r));
  const b = f.claude()[0].body;
  if (b.output_config.effort !== 'medium' || b.output_config.format.type !== 'json_schema') throw new Error(JSON.stringify(b.output_config).slice(0, 200));
  const sch = b.output_config.format.schema;
  if (sch.type !== 'object' || sch.additionalProperties !== false || JSON.stringify(sch.required) !== JSON.stringify(PAYSLIP_SCHEMA.required)) throw new Error(JSON.stringify(sch));
  if (JSON.stringify(sch.properties.gross.type) !== '["number","null"]' || JSON.stringify(sch.properties.month.type) !== '["string","null"]' || JSON.stringify(sch).includes('nullable')) throw new Error(`nullable converti : ${JSON.stringify(sch.properties)}`);
  if (b.tools !== undefined || b.tool_choice !== undefined) throw new Error('sortie structurée : aucun outil');
  if (b.messages[0].content[0].type !== 'document' || b.messages[0].content[1].text !== 'Lis ce bulletin') throw new Error('document puis consigne');
  if (!/JSON/.test(b.system[0].text)) throw new Error('system');
  // Texte qui n’est pas du JSON, et texte vide → bad_response (sans secours).
  for (const texte of ['voici : {', '']) {
    const g = faux({}, { anthropic: () => message([{ type: 'text', text: texte }], 'end_turn') });
    ko(await extractJson({ prompt: 'x', schema: PAYSLIP_SCHEMA, file: PDF }, env(E), g.fetchImpl), 'bad_response');
    if (g.vus.length !== 1) throw new Error('pas de second appel');
  }
  // Panne du modèle « documents » : le secours Gemini lit le bulletin (secours: true).
  const h = faux({ anthropic: { status: 529 } }, { gemini: geminiJson });
  const s = await extractJson({ prompt: 'x', schema: PAYSLIP_SCHEMA, file: PDF, tier: 'documents' }, env(E), h.fetchImpl);
  if (!s.ok || s.secours !== true || h.ordre() !== 'anthropic,gemini') throw new Error(h.ordre());
  // La requête Gemini du bulletin garde SON schéma d’origine (nullable), rien n’a été converti pour elle.
  if (JSON.stringify(h.gemini()[0].body.generationConfig.responseSchema) !== JSON.stringify(PAYSLIP_SCHEMA)) throw new Error('schéma Gemini inchangé');
});

// ── 7. Schémas : TOUTES les déclarations réelles contre un validateur JSON Schema simple ───────
const TYPES_OK = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);
const CLES_OK = new Set(['type', 'description', 'enum', 'items', 'properties', 'required', 'additionalProperties', 'anyOf', 'format']);
const FORMATS_OK = new Set(['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid']);
/** Ce que Claude (sorties structurées / strict) accepte : mots-clés connus seulement, types en minuscules, objets fermés. */
function erreursSchema(n: unknown, chemin = '#'): string[] {
  const e: string[] = [];
  if (!n || typeof n !== 'object' || Array.isArray(n)) return [`${chemin} : objet attendu`];
  const o = n as Json;
  for (const k of Object.keys(o)) if (!CLES_OK.has(k)) e.push(`${chemin} : mot-clé « ${k} » refusé`);
  const types = Array.isArray(o.type) ? o.type : o.type === undefined ? [] : [o.type];
  for (const t of types) if (typeof t !== 'string' || !TYPES_OK.has(t)) e.push(`${chemin} : type « ${String(t)} » invalide (minuscules attendues)`);
  if (Array.isArray(o.anyOf)) o.anyOf.forEach((s: unknown, i: number) => e.push(...erreursSchema(s, `${chemin}/anyOf/${i}`)));
  else if (!types.length) e.push(`${chemin} : ni type ni anyOf`);
  if (o.description !== undefined && (typeof o.description !== 'string' || !o.description.trim())) e.push(`${chemin} : description vide`);
  if (o.enum !== undefined && (!Array.isArray(o.enum) || !o.enum.length || o.enum.some((v: unknown) => !['string', 'number', 'boolean'].includes(typeof v)) || new Set(o.enum).size !== o.enum.length)) e.push(`${chemin} : enum invalide`);
  if (o.format !== undefined && !FORMATS_OK.has(String(o.format))) e.push(`${chemin} : format « ${o.format} » refusé`);
  if (types.includes('object')) {
    if (!o.properties || typeof o.properties !== 'object' || Array.isArray(o.properties)) e.push(`${chemin} : properties attendu`);
    if (o.additionalProperties !== false) e.push(`${chemin} : additionalProperties:false requis`);
    if (!Array.isArray(o.required)) e.push(`${chemin} : required (liste) requis`);
    else for (const k of o.required) if (!(o.properties && k in o.properties)) e.push(`${chemin} : required « ${k} » absent de properties`);
    for (const [k, v] of Object.entries((o.properties ?? {}) as Json)) e.push(...erreursSchema(v, `${chemin}/${k}`));
  } else if (o.properties !== undefined || o.required !== undefined) e.push(`${chemin} : properties/required sur un non-objet`);
  if (types.includes('array')) { if (o.items === undefined) e.push(`${chemin} : items requis`); else e.push(...erreursSchema(o.items, `${chemin}[]`)); }
  else if (o.items !== undefined) e.push(`${chemin} : items sur un non-tableau`);
  return e;
}
const NOM_OUTIL = /^[a-zA-Z0-9_-]{1,64}$/;
/** Le jeu complet des déclarations réelles : bureau, salarié (court et long), toutes les sélections par domaine. */
const REELLES: [string, readonly { name: string; description: string; parameters: Record<string, unknown> }[]][] = [
  ['bureau : toutes', ASSISTANT_FUNCTIONS],
  ['bureau : fichier joint', functionsFor(true)],
  ['salarié : toutes', WORKER_FUNCTIONS],
  ['salarié : fichier joint', workerFunctionsFor(true)],
  ['salarié long : toutes', WORKER_FUNCTIONS_LONG],
  ['salarié long : sélection', workerFunctionsForLong('hier j’ai fait 8h à Lyon et demande un congé jeudi')],
  ['declarer_heures long + nouveau chantier long', [DECLARER_HEURES_LONG, NOUVEAU_CHANTIER_LONG]],
  ...['planning de la semaine prochaine', 'inviter Karim', 'clôturer septembre', 'supprime la dépense', 'quel est le coût réel de Marc ?', 'ajoute une habilitation']
    .map((q): [string, typeof ASSISTANT_FUNCTIONS] => [`bureau : « ${q} »`, functionsFor(false, q)]),
  ...['mes heures', 'congé jeudi', 'où est Paul', 'efface ma journée', 'nouveau chantier']
    .map((q): [string, typeof WORKER_FUNCTIONS] => [`salarié : « ${q} »`, workerFunctionsFor(false, q)]),
];

Deno.test('Schémas : CHAQUE déclaration réelle (bureau et salarié, courtes et longues) devient un outil Claude valide', () => {
  let n = 0;
  for (const [nom, fns] of REELLES) {
    if (!fns.length) throw new Error(`${nom} : liste vide`);
    const outils = outilsClaude(fns);
    if (outils.length !== fns.length) throw new Error(`${nom} : ${outils.length} outils pour ${fns.length}`);
    outils.forEach((o, i) => {
      const f = fns[i];
      const errs = erreursSchema(o.input_schema);
      if (errs.length) throw new Error(`${nom} / ${o.name} : ${errs.join(' ; ')}`);
      if (!NOM_OUTIL.test(o.name) || o.name !== f.name || o.description !== f.description || !o.description.trim()) throw new Error(`${nom} / ${f.name} : nom ou description`);
      if (o.input_schema.type !== 'object') throw new Error(`${f.name} : le schéma d’un outil est un objet`);
      // Rien de perdu : mêmes propriétés, mêmes énumérations, mêmes champs obligatoires qu’à l’origine.
      const src = f.parameters as Json, dst = o.input_schema as Json;
      if (JSON.stringify(Object.keys(dst.properties)) !== JSON.stringify(Object.keys(src.properties ?? {}))) throw new Error(`${f.name} : propriétés`);
      if (JSON.stringify(dst.required) !== JSON.stringify(src.required ?? [])) throw new Error(`${f.name} : required`);
      for (const [k, v] of Object.entries((src.properties ?? {}) as Json)) {
        if (JSON.stringify(dst.properties[k].enum) !== JSON.stringify(v.enum) || dst.properties[k].description !== v.description) throw new Error(`${f.name}.${k} : enum ou description`);
        if (v.type === 'array' && JSON.stringify(dst.properties[k].items.enum) !== JSON.stringify(v.items?.enum)) throw new Error(`${f.name}.${k}[] : enum`);
      }
      n++;
    });
  }
  if (n < 150) throw new Error(`jeu trop petit : ${n} outils vérifiés`);
});

Deno.test('Schémas : par défaut AUCUN outil strict (mesuré : 33,5 s au premier appel avec 12 outils stricts, 2,8 s sans) ; la requête complète n’en porte aucun', () => {
  if (STRICT_ACTIF !== false) throw new Error('STRICT_ACTIF doit rester faux tant que la compilation stricte dépasse les plafonds de temps');
  for (const [nom, fns] of REELLES) {
    const outils = outilsClaude(fns);
    if (outils.some((o) => 'strict' in o)) throw new Error(`${nom} : un outil strict par défaut`);
  }
  const corps = corpsOutils({ model: 'claude-sonnet-5-5', effort: 'low', prompt: 'x', functions: ASSISTANT_FUNCTIONS, maxCalls: 1 }) as { tools: Record<string, unknown>[] };
  if (corps.tools.some((o) => 'strict' in o)) throw new Error('la requête de production ne doit porter aucun strict');
});

Deno.test('Schémas (mode strict, facultatif et désactivé par défaut) : seulement dans les limites de l’API (20 outils, 24 facultatifs, 16 unions), jamais sur un schéma qui les dépasse', () => {
  let stricts = 0, total = 0;
  for (const [nom, fns] of REELLES) {
    const outils = outilsClaude(fns, true);
    const s = outils.filter((o) => o.strict);
    const fac = s.reduce((a, o) => a + coutStrict(o.input_schema).facultatifs, 0), uni = s.reduce((a, o) => a + coutStrict(o.input_schema).unions, 0);
    if (s.length > LIMITES_STRICT.outils || fac > LIMITES_STRICT.facultatifs || uni > LIMITES_STRICT.unions) throw new Error(`${nom} : ${s.length} stricts, ${fac} facultatifs, ${uni} unions`);
    for (const o of s) if (o.input_schema.additionalProperties !== false || !Array.isArray(o.input_schema.required)) throw new Error(`${nom}/${o.name} : strict sans schéma fermé`);
    if (JSON.stringify(outils) !== JSON.stringify(outilsClaude(fns, true))) throw new Error('déterministe');
    stricts += s.length; total += outils.length;
  }
  if (!stricts || stricts === total) throw new Error(`les 37 outils du bureau ne peuvent pas tous être stricts (${stricts}/${total})`);
  // Le bureau complet dépasse les limites : certains outils restent non stricts (sans quoi l’API répondrait 400).
  const tous = outilsClaude(ASSISTANT_FUNCTIONS, true);
  if (tous.every((o) => o.strict) || !tous.some((o) => o.strict)) throw new Error('mélange attendu pour les 37 outils');
});

Deno.test('Conversion : les variantes OpenAPI de Gemini (types en majuscules, nullable, propertyOrdering, minimum, format enum…) sont corrigées ou retirées', () => {
  const gemini = {
    type: 'OBJECT', propertyOrdering: ['a', 'b'],
    properties: {
      a: { type: 'STRING', nullable: true, description: 'a', minLength: 1, maxLength: 9, example: 'x' },
      b: { type: 'INTEGER', minimum: 0, maximum: 5, format: 'int32', default: 1 },
      c: { type: 'string', format: 'enum', enum: ['x', 'y'] },
      d: { type: 'ARRAY', items: { type: 'NUMBER' }, minItems: 1, maxItems: 3 },
      e: { type: 'object', nullable: true, properties: { z: { type: 'boolean' } }, required: ['z', 'absent'] },
      f: { type: 'string', format: 'date-time' },
      g: { type: ['string', 'null'] },
      h: { enum: ['u', 'v'] },
    },
    required: ['a', 'inconnu'],
  };
  const s = versSchemaClaude(gemini) as Json;
  const errs = erreursSchema(s);
  if (errs.length) throw new Error(errs.join(' ; '));
  if (s.type !== 'object' || JSON.stringify(s.required) !== '["a"]' || s.additionalProperties !== false || 'propertyOrdering' in s) throw new Error(JSON.stringify(s));
  const p = s.properties;
  if (JSON.stringify(p.a.type) !== '["string","null"]' || p.a.description !== 'a' || 'minLength' in p.a || 'example' in p.a) throw new Error(JSON.stringify(p.a));
  if (p.b.type !== 'integer' || 'minimum' in p.b || 'format' in p.b || 'default' in p.b) throw new Error(JSON.stringify(p.b));
  if ('format' in p.c || JSON.stringify(p.c.enum) !== '["x","y"]') throw new Error('format enum retiré');
  if (p.d.type !== 'array' || p.d.items.type !== 'number' || 'minItems' in p.d) throw new Error(JSON.stringify(p.d));
  if (!p.e.anyOf || p.e.anyOf[0].type !== 'object' || JSON.stringify(p.e.anyOf[0].required) !== '["z"]' || JSON.stringify(p.e.anyOf[1]) !== '{"type":"null"}') throw new Error(JSON.stringify(p.e));
  if (p.f.format !== 'date-time' || JSON.stringify(p.g.type) !== '["string","null"]' || p.h.type !== 'string') throw new Error('format valide gardé, type déduit d’un enum');
  // Entrées bizarres : jamais d’exception.
  for (const x of [null, undefined, 42, 'x', [], {}, { type: 'bizarre' }]) versSchemaClaude(x);
});

Deno.test('Schémas de sortie structurée réels (bulletin, salarié) : convertis en JSON Schema valide', () => {
  for (const [nom, sch] of [['PAYSLIP_SCHEMA', PAYSLIP_SCHEMA], ['WORKER_SCHEMA', WORKER_SCHEMA]] as const) {
    const errs = erreursSchema(versSchemaClaude(sch));
    if (errs.length) throw new Error(`${nom} : ${errs.join(' ; ')}`);
    if (JSON.stringify(versSchemaClaude(sch)).includes('nullable')) throw new Error(`${nom} : nullable restant`);
  }
  const c = coutStrict(versSchemaClaude(PAYSLIP_SCHEMA));
  if (c.facultatifs !== 0 || c.unions !== 4) throw new Error(JSON.stringify(c));
});

// ── 8. AI_CONFIG ──────────────────────────────────────────────────────────────
Deno.test('AI_CONFIG : « anthropic:claude-sonnet-5-5 » accepté dans chaque niveau, mélange de fournisseurs permis', () => {
  const c = readConfig(env({ AI_CONFIG: CLAUDE_PARTOUT }));
  if (c.formule !== 'payant' || c.plafonds !== null) throw new Error('payant sans plafond');
  if (libelleModele(c.rapide) !== 'anthropic:claude-sonnet-5-5' || libelleModele(c.documents) !== 'anthropic:claude-sonnet-5-5' || libelleModele(c.secours) !== 'gemini:gemini-3.1-flash-lite') throw new Error(JSON.stringify(c));
  if (c.rapide.reflexion !== 'low' || c.documents.reflexion !== 'medium' || c.secours.reflexion !== 'minimal') throw new Error('réflexion par emplacement et par fournisseur');
  for (const id of ANTHROPIC_AUTORISES) for (const slot of ['rapide', 'documents', 'secours']) {
    const x = readConfig(env({ AI_CONFIG: JSON.stringify({ formule: 'payant', [slot]: `anthropic:${id}` }) }));
    if (libelleModele(x[slot as 'rapide']) !== `anthropic:${id}`) throw new Error(`${slot} ${id}`);
  }
  // Casse et espaces tolérés comme pour Gemini ; mélange : rapide Claude, documents Gemini (prudent : HEIC).
  const m = readConfig(env({ AI_CONFIG: '{"formule":"payant","rapide":" Anthropic:Claude-Sonnet-5-5 ","documents":"gemini:gemini-3.8-flash"}' }));
  if (libelleModele(m.rapide) !== 'anthropic:claude-sonnet-5-5' || libelleModele(m.documents) !== 'gemini:gemini-3.8-flash' || m.documents.reflexion !== 'low') throw new Error(JSON.stringify(m));
  if (JSON.stringify([...ANTHROPIC_AUTORISES]) !== '["claude-sonnet-5-5","claude-sonnet-5","claude-haiku-5-5"]') throw new Error('liste blanche stricte');
});

Deno.test('AI_CONFIG refusé : opus, fable, mythos, identifiant daté, hors liste, fournisseur inconnu, champ inconnu → réglage par défaut (Gemini), une ligne sans contenu', async () => {
  const refuses: [string, string][] = [
    ['anthropic:claude-opus-5-5', 'trop coûteux'], ['anthropic:claude-opus-5', 'trop coûteux'], ['anthropic:claude-opus-4-8', 'trop coûteux'],
    ['anthropic:claude-fable-5-1', 'trop coûteux'], ['anthropic:claude-fable-5', 'trop coûteux'], ['anthropic:claude-mythos-5-1', 'trop coûteux'],
    ['anthropic:claude-sonnet-5-5-20260401', 'daté'], ['anthropic:claude-haiku-5-5-20261001', 'daté'],
    ['anthropic:claude-sonnet-4-6', 'liste blanche'], ['anthropic:claude-haiku-4-5', 'liste blanche'], ['anthropic:claude-sonnet-5-6', 'liste blanche'],
    ['anthropic:sonnet', 'liste blanche'], ['anthropic:claude-sonnet-5-5-latest', 'liste blanche'],
    ['openai:gpt-5', 'fournisseur inconnu'], ['mistral:mistral-large', 'fournisseur inconnu'], ['claude:claude-sonnet-5-5', 'fournisseur inconnu'],
    ['claude-sonnet-5-5', 'fournisseur:modèle'], ['anthropic:', 'fournisseur:modèle'],
  ];
  for (const slot of ['rapide', 'documents', 'secours']) for (const [v, raison] of refuses) {
    const raw = JSON.stringify({ formule: 'payant', [slot]: v });
    const { out, logs } = await logged(() => readConfig(env({ AI_CONFIG: raw })));
    if (out.formule !== 'essai' || libelleModele(out.rapide) !== 'gemini:gemini-3.5-flash-lite' || libelleModele(out.documents) !== 'gemini:gemini-3.8-flash' || libelleModele(out.secours) !== 'gemini:gemini-3.1-flash-lite') throw new Error(`${raw} → ${JSON.stringify(out)}`);
    if (JSON.stringify(out.plafonds) !== JSON.stringify(PLAFONDS_ESSAI)) throw new Error(`${raw} : plafonds par défaut`);
    if (logs.length !== 1 || !/AI_CONFIG invalide/.test(logs[0]) || !logs[0].includes(raison) || logs[0].length > 140) throw new Error(`${raw} : journal ${JSON.stringify(logs)}`);
    if (logs[0].includes(v.split(':')[1] ?? '###') && v.split(':')[1].length > 3) throw new Error(`${raw} : le nom du modèle fourni ne doit pas être répété`);
  }
  for (const raw of ['{"rapide":"anthropic:claude-sonnet-5-5","modele":"x"}', '{"claude":"anthropic:claude-sonnet-5-5"}', '{"formule":"payant","anthropic":"claude-sonnet-5-5"}']) {
    const { out, logs } = await logged(() => readConfig(env({ AI_CONFIG: raw })));
    if (out.formule !== 'essai' || out.rapide.fournisseur !== 'gemini' || logs.length !== 1 || !/champ inconnu/.test(logs[0])) throw new Error(raw);
  }
  // Defense en profondeur : même avec un identifiant interdit, l’adaptateur n’envoie rien.
  const f = faux();
  const { out: x, logs } = await logged(() => appelClaude('claude-opus-5-5', 'k', {}, 1000, f.fetchImpl));
  if (x.ok || f.vus.length || logs.some((l) => l.includes('opus'))) throw new Error('aucun appel avec un modèle interdit');
  if (refusModeleAnthropic('claude-sonnet-5-5') !== null || refusModeleAnthropic('claude-mythos-5-1') === null) throw new Error('refusModeleAnthropic');
});

Deno.test('Défaut inchangé : AI_CONFIG absent, vide ou invalide → exactement les mêmes modèles Gemini, réflexion, plafonds, délais et clés qu’avant', async () => {
  for (const raw of [undefined, '', '   ', '{pas du json']) {
    const { out: c } = await logged(() => readConfig(env({ AI_CONFIG: raw })));
    const att = { rapide: MODELES_PAR_DEFAUT.rapide, documents: MODELES_PAR_DEFAUT.documents, secours: MODELES_PAR_DEFAUT.secours };
    if (JSON.stringify(c) !== JSON.stringify({
      formule: 'essai',
      rapide: { fournisseur: 'gemini', model: att.rapide, reflexion: 'minimal' }, documents: { fournisseur: 'gemini', model: att.documents, reflexion: 'low' },
      secours: { fournisseur: 'gemini', model: att.secours, reflexion: 'minimal' }, plafonds: { rapide: 400, documents: 15 },
    })) throw new Error(JSON.stringify(c));
  }
  if (JSON.stringify(MODELES_PAR_DEFAUT) !== '{"rapide":"gemini-3.5-flash-lite","documents":"gemini-3.8-flash","secours":"gemini-3.1-flash-lite"}') throw new Error('modèles par défaut');
  // Sans AI_CONFIG, l’appel part chez Gemini avec la même requête qu’avant, jamais chez Claude (même si ANTHROPIC_API_KEY est posée).
  const f = faux();
  const r = await callFunction({ prompt: 'x', functions: FN }, env({ AI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' }), f.fetchImpl);
  if (!r.ok || f.ordre() !== 'gemini' || f.gemini()[0].body.toolConfig.functionCallingConfig.mode !== 'ANY' || f.gemini()[0].body.generationConfig.thinkingConfig.thinkingLevel !== 'minimal') throw new Error(f.ordre());
  if (modeleServi(r) !== 'gemini:gemini-3.5-flash-lite') throw new Error('servi par le rapide Gemini');
});

// ── 9. Aucun contenu dans les logs ────────────────────────────────────────────
Deno.test('Aucun contenu dans les logs : ni question, ni réponse, ni fichier — seulement des codes HTTP et des lignes techniques', async () => {
  const SECRET_Q = 'Q-PRIVEE-Dupont-Marie-12-rue-des-Lilas', SECRET_R = 'R-PRIVEE-salaire-3200', SECRET_F = 'RklMRS1QUklWRUUtQkFTRTY0';
  const pdf = { mime: 'application/pdf', base64: SECRET_F };
  const scenarios: { nom: string; plan: Parameters<typeof faux>[0]; repl?: Parameters<typeof faux>[1]; file?: typeof pdf | typeof HEIC; json?: boolean }[] = [
    { nom: '200', plan: {}, repl: { anthropic: () => message([tool('repondre', { reponse: SECRET_R })]) } },
    { nom: '429 puis secours', plan: { anthropic: { status: 429 } }, repl: { gemini: () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'repondre', args: { reponse: SECRET_R } } }] } }] }), { status: 200 }) } },
    { nom: '400', plan: { anthropic: { status: 400 }, gemini: { status: 400 } } },
    { nom: '529', plan: { anthropic: { status: 529 }, gemini: { status: 529 } } },
    { nom: 'injoignable', plan: { anthropic: { reject: true }, gemini: { reject: true } } },
    { nom: 'texte seul', plan: {}, repl: { anthropic: () => message([{ type: 'text', text: SECRET_R }], 'end_turn') } },
    { nom: 'refus', plan: { gemini: { status: 500 } }, repl: { anthropic: () => message([{ type: 'text', text: SECRET_R }], 'refusal') } },
    { nom: 'max_tokens', plan: {}, repl: { anthropic: () => message([tool('repondre', { reponse: SECRET_R })], 'max_tokens') } },
    { nom: 'HEIC', plan: {}, file: HEIC },
    { nom: 'fichier', plan: { anthropic: { status: 500 } }, file: pdf },
    { nom: 'extractJson', plan: {}, repl: { anthropic: () => message([{ type: 'text', text: `{"month":"${SECRET_R}"` }], 'end_turn') }, file: pdf, json: true },
  ];
  for (const s of scenarios) {
    const f = faux(s.plan, s.repl);
    const { logs } = await logged(async () => {
      if (s.json) await extractJson({ prompt: SECRET_Q, schema: PAYSLIP_SCHEMA, file: s.file, tier: 'documents' }, env(E), f.fetchImpl);
      else await callFunction({ prompt: SECRET_Q, functions: FN, file: s.file }, env(E), f.fetchImpl);
    });
    const tout = logs.join('\n');
    for (const secret of [SECRET_Q, SECRET_R, SECRET_F, 'sk-ant-test-cle', 'cle-gemini-test', 'Dupont']) if (tout.includes(secret)) throw new Error(`${s.nom} : « ${secret} » dans les logs : ${tout}`);
    if (logs.some((l) => l.length > 120)) throw new Error(`${s.nom} : ligne trop longue : ${tout}`);
  }
});

Deno.test('Documentation : les réglages Claude de docs/ia-v2.md (recommandé et variante prudente) sont valides et font ce que la doc dit', async () => {
  const md = await Deno.readTextFile(new URL('../../../docs/ia-v2.md', import.meta.url));
  if (!md.includes('## 0.') || !md.includes('### Claude Sonnet 5.5')) throw new Error('section « Claude Sonnet 5.5 » manquante');
  const blocs = [...md.matchAll(/```json\n(\{[^`]*"formule"[^`]*\})\n```/g)].map((m) => m[1]);
  const claude = blocs.find((b) => b.includes('anthropic:'));
  if (!claude) throw new Error('réglage Claude recommandé (bloc json) introuvable');
  const { out: c, logs } = await logged(() => readConfig(env({ AI_CONFIG: claude })));
  if (logs.length || c.formule !== 'payant' || c.plafonds !== null) throw new Error(`réglage de la doc refusé ou différent : ${logs.join('|')} ${JSON.stringify(c)}`);
  if (JSON.stringify([c.rapide, c.documents, c.secours].map(libelleModele)) !== '["anthropic:claude-sonnet-5-5","anthropic:claude-sonnet-5-5","gemini:gemini-3.1-flash-lite"]') throw new Error('modèles recommandés');
  if (JSON.stringify(JSON.parse(claude)) !== CLAUDE_PARTOUT) throw new Error('la doc donne le réglage recommandé du cahier des charges');
  const prudent = /`(\{"formule":"payant","rapide":"anthropic:claude-sonnet-5-5","documents":"gemini:gemini-3\.8-flash"[^`]*\})`/.exec(md);
  if (!prudent) throw new Error('variante prudente introuvable');
  const { out: p, logs: l2 } = await logged(() => readConfig(env({ AI_CONFIG: prudent[1] })));
  if (l2.length || libelleModele(p.rapide) !== 'anthropic:claude-sonnet-5-5' || libelleModele(p.documents) !== 'gemini:gemini-3.8-flash') throw new Error('variante prudente valide');
});
