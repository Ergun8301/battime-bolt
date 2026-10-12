// Lot 6 — l'appel au modèle ne dépasse JAMAIS le plafond de temps, et il n'y a
// plus de course entre un modèle fort et un modèle léger : UN appel, le secours
// seulement après une erreur ou un délai dépassé.   npm run test:ai-provider
// (Le réglage AI_CONFIG, les clés et le routage : ai-config.test.ts.)
import { callFunction, DELAIS, MAX_APPELS, MODELES_PAR_DEFAUT, PROFIL_LONG, reposReinit, type FunctionCall } from './ai-provider.ts';

const FN = [{ name: 'repondre', description: 'x', parameters: { type: 'object', properties: {} } }];
const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'repondre', args: { reponse: 'ok' } } }] } }] }), { status: 200 });
type Plan = Record<string, { ms?: number; status?: number }>;
function fakeGemini(plan: Plan, reply: () => Response = ok) {
  reposReinit(); // chaque scénario repart à neuf : aucun modèle mis de côté par le précédent
  const calls: { model: string; at: number; raw: string }[] = [];
  let enCours = 0, maxEnMemeTemps = 0;
  const fetchImpl = (url: string, init: RequestInit) => {
    const model = decodeURIComponent(/models\/([^:]+):/.exec(url)![1]);
    calls.push({ model, at: Date.now(), raw: String(init.body) });
    enCours++; maxEnMemeTemps = Math.max(maxEnMemeTemps, enCours);
    const p = plan[model] ?? {};
    return new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => { enCours--; resolve(p.status ? new Response('{}', { status: p.status }) : reply()); }, p.ms ?? 5);
      init.signal?.addEventListener('abort', () => { clearTimeout(t); enCours--; reject(new DOMException('aborted', 'AbortError')); });
    });
  };
  return { calls, fetchImpl, maxEnMemeTemps: () => maxEnMemeTemps };
}
const env = { get: (k: string) => ({ AI_API_KEY: 'k' } as Record<string, string>)[k] };
const { rapide: R, documents: D, secours: S } = MODELES_PAR_DEFAUT;

Deno.test('Plus de course : un modèle lent mais qui répond est le SEUL appelé (jamais deux en même temps)', async () => {
  const f = fakeGemini({ [R]: { ms: 700 } });
  const r = await callFunction({ prompt: 'ajoute une intervention', functions: FN }, env, f.fetchImpl);
  if (!r.ok) throw new Error('réponse attendue');
  if (f.calls.length !== 1 || f.calls[0].model !== R || f.maxEnMemeTemps() !== 1) throw new Error(`appels : ${f.calls.map((c) => c.model).join(',')}`);
});

Deno.test('Erreur du modèle rapide (quota 429, surcharge 503) : le secours répond, après coup', async () => {
  for (const status of [429, 503]) {
    const f = fakeGemini({ [R]: { status } });
    const r = await callFunction({ prompt: 'x', functions: FN }, env, f.fetchImpl);
    if (!r.ok || f.calls.map((c) => c.model).join(',') !== `${R},${S}` || f.maxEnMemeTemps() !== 1) throw new Error(`${status} : ${f.calls.map((c) => c.model).join(',')}`);
  }
});

Deno.test('Tout en panne ou trop lent : échec propre, dans le plafond de temps total', async () => {
  const f = fakeGemini({ [R]: { ms: 60_000 }, [S]: { ms: 60_000 } });
  const t0 = Date.now();
  const r = await callFunction({ prompt: 'x', functions: FN }, env, f.fetchImpl);
  const ms = Date.now() - t0;
  if (r.ok || r.reason !== 'provider_error') throw new Error('échec attendu');
  if (ms > DELAIS.rapide.total + 500) throw new Error(`plafond dépassé : ${ms} ms`);
  if (f.calls.length !== 2) throw new Error(`${f.calls.length} appel(s)`);
});

Deno.test('Documents : 12 s au premier modèle, 25 s au plus secours compris (délais raccourcis ici pour ne pas attendre)', async () => {
  if (DELAIS.documents.premier !== 12_000 || DELAIS.documents.total !== 25_000) throw new Error(`réglage : ${JSON.stringify(DELAIS.documents)}`);
  const vrais = DELAIS.documents;
  DELAIS.documents = { premier: 300, total: 2500 };
  try {
    const PDF = { mime: 'application/pdf', base64: 'JVBERi0xLjQK' };
    // Le modèle « documents » dépasse son délai : abandon à 0,3 s, puis le secours répond.
    const f = fakeGemini({ [D]: { ms: 60_000 } });
    const t0 = Date.now();
    const r = await callFunction({ prompt: 'x', functions: FN, file: PDF }, env, f.fetchImpl);
    const ms = Date.now() - t0;
    if (!r.ok || f.calls.map((c) => c.model).join(',') !== `${D},${S}`) throw new Error(`appels : ${f.calls.map((c) => c.model).join(',')}`);
    if (ms < 250 || ms > 1500) throw new Error(`le secours devait partir après ~0,3 s, pas ${ms} ms`);
    // Tout est lent : échec propre dans le plafond total, deux appels.
    const g = fakeGemini({ [D]: { ms: 60_000 }, [S]: { ms: 60_000 } });
    const t1 = Date.now();
    const x = await callFunction({ prompt: 'x', functions: FN, file: PDF }, env, g.fetchImpl);
    const ms2 = Date.now() - t1;
    if (x.ok || x.reason !== 'provider_error' || g.calls.length !== 2 || ms2 > 2500 + 500) throw new Error(`plafond : ${g.calls.length} appel(s), ${ms2} ms`);
  } finally {
    DELAIS.documents = vrais;
  }
});

// ── Plusieurs appels de fonction (salarié, phrases à plusieurs actions) ──────
const NOMS = ['declarer_heures', 'panier_repas', 'signaler_reserve', 'demander_conge', 'envoyer_journee', 'repondre'];
const FNS = NOMS.map((name) => ({ name, description: 'x', parameters: { type: 'object', properties: {} } }));
const plusieurs = (...cs: FunctionCall[]) => () => new Response(JSON.stringify({ candidates: [{ content: { parts: cs.map((functionCall) => ({ functionCall })) } }] }), { status: 200 });
const A = (name: string, args: Record<string, unknown> = {}): FunctionCall => ({ name, args });
const noms = (cs?: FunctionCall[]) => (cs ?? []).map((c) => c.name).join(',');

Deno.test('maxCalls : 3 appels renvoyés → 3, dans l’ordre ; call est le premier', async () => {
  const f = fakeGemini({}, plusieurs(A('declarer_heures', { date: '2026-10-01' }), A('panier_repas', { valeur: true }), A('envoyer_journee')));
  const r = await callFunction({ prompt: 'x', functions: FNS, maxCalls: 4 }, env, f.fetchImpl);
  if (!r.ok || noms(r.calls) !== 'declarer_heures,panier_repas,envoyer_journee') throw new Error(JSON.stringify(r));
  if (r.call !== r.calls![0] || r.rognes !== undefined || f.calls.length !== 1) throw new Error('call = calls[0], pas de rognes, un seul appel au modèle');
});

Deno.test('maxCalls : plafond à 4 ; 5 appels distincts → 4 gardés et rognes = 1 (jamais une perte silencieuse)', async () => {
  if (MAX_APPELS !== 4) throw new Error('plafond de 4 appels');
  const cinq = [A('declarer_heures'), A('panier_repas'), A('signaler_reserve'), A('demander_conge'), A('envoyer_journee')];
  for (const maxCalls of [4, 9, 100]) {
    const f = fakeGemini({}, plusieurs(...cinq));
    const r = await callFunction({ prompt: 'x', functions: FNS, maxCalls }, env, f.fetchImpl);
    if (!r.ok || r.calls?.length !== 4 || r.rognes !== 1 || noms(r.calls) !== 'declarer_heures,panier_repas,signaler_reserve,demander_conge') throw new Error(`maxCalls ${maxCalls} : ${JSON.stringify(r)}`);
  }
  const g = fakeGemini({}, plusieurs(...cinq));
  const deux = await callFunction({ prompt: 'x', functions: FNS, maxCalls: 2 }, env, g.fetchImpl);
  if (!deux.ok || deux.calls?.length !== 2 || deux.rognes !== 3) throw new Error(`maxCalls 2 : ${JSON.stringify(deux)}`);
});

Deno.test('maxCalls : un doublon exact est retiré AVANT le plafond (il ne prend pas la place d’une vraie action)', async () => {
  const d = A('panier_repas', { valeur: true });
  const f = fakeGemini({}, plusieurs(A('declarer_heures'), d, { ...d, args: { valeur: true } }, A('signaler_reserve'), A('envoyer_journee')));
  const r = await callFunction({ prompt: 'x', functions: FNS, maxCalls: 4 }, env, f.fetchImpl);
  if (!r.ok || noms(r.calls) !== 'declarer_heures,panier_repas,signaler_reserve,envoyer_journee' || r.rognes !== undefined) throw new Error(JSON.stringify(r));
  // Même nom, arguments imbriqués différents : deux appels distincts (deux journées, deux congés…).
  const jour = (date: string, debut: string) => A('declarer_heures', { date, lignes: [{ debut, fin: '17:00' }] });
  const h = fakeGemini({}, plusieurs(jour('2026-10-01', '08:00'), jour('2026-10-01', '09:00'), jour('2026-10-01', '08:00')));
  const j = await callFunction({ prompt: 'x', functions: FNS, maxCalls: 4 }, env, h.fetchImpl);
  if (!j.ok || j.calls?.length !== 2) throw new Error(`lignes imbriquées différentes : ${JSON.stringify(j)}`);
  // Même nom, arguments différents : deux appels distincts (deux congés, par exemple).
  const g = fakeGemini({}, plusieurs(A('demander_conge', { du: '2026-10-05' }), A('demander_conge', { du: '2026-10-12' })));
  const c = await callFunction({ prompt: 'x', functions: FNS, maxCalls: 4 }, env, g.fetchImpl);
  if (!c.ok || c.calls?.length !== 2) throw new Error('deux congés distincts');
});

Deno.test('maxCalls : les noms hors liste sont écartés ; aucun appel valide → bad_response', async () => {
  const f = fakeGemini({}, plusieurs(A('effacer_heures'), A('panier_repas', { valeur: true }), A('rm_rf')));
  const r = await callFunction({ prompt: 'x', functions: FNS, maxCalls: 4 }, env, f.fetchImpl);
  if (!r.ok || noms(r.calls) !== 'panier_repas' || r.call.name !== 'panier_repas') throw new Error(JSON.stringify(r));
  for (const maxCalls of [undefined, 1, 4]) {
    const g = fakeGemini({}, plusieurs(A('effacer_heures')));
    const x = await callFunction({ prompt: 'x', functions: FNS, maxCalls }, env, g.fetchImpl);
    if (x.ok || x.reason !== 'bad_response') throw new Error(`maxCalls ${maxCalls} : réponse sans appel valide → bad_response`);
    const h = fakeGemini({}, () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'bonjour' }] } }] }), { status: 200 }));
    const y = await callFunction({ prompt: 'x', functions: FNS, maxCalls }, env, h.fetchImpl);
    if (y.ok || y.reason !== 'bad_response') throw new Error(`maxCalls ${maxCalls} : texte seul → bad_response`);
  }
});

Deno.test('maxCalls absent ou 1 : comportement ET forme de résultat d’avant (premier appel seulement, ni calls ni rognes)', async () => {
  for (const maxCalls of [undefined, 1, 0, -3]) {
    const f = fakeGemini({}, plusieurs(A('declarer_heures', { date: 'x' }), A('panier_repas')));
    const r = await callFunction({ prompt: 'x', functions: FNS, maxCalls }, env, f.fetchImpl);
    if (!r.ok || JSON.stringify(Object.keys(r)) !== '["ok","call"]' || r.call.name !== 'declarer_heures') throw new Error(`maxCalls ${maxCalls} : ${JSON.stringify(r)}`);
  }
  // Des arguments absents ou qui ne sont pas un objet donnent {}.
  const g = fakeGemini({}, () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'repondre', args: [1] } }] } }] }), { status: 200 }));
  const x = await callFunction({ prompt: 'x', functions: FNS }, env, g.fetchImpl);
  if (!x.ok || JSON.stringify(x.call.args) !== '{}') throw new Error('args illisibles → {}');
});

Deno.test('Les délais d’avant ne bougent pas ; le profil long a les siens (14 s / 22 s, secours en « low »)', () => {
  if (JSON.stringify(DELAIS) !== JSON.stringify({ rapide: { premier: 5000, total: 8000 }, documents: { premier: 12000, total: 25000 } })) throw new Error(JSON.stringify(DELAIS));
  if (JSON.stringify(PROFIL_LONG) !== JSON.stringify({ reflexion: 'medium', reflexionSecours: 'low', delais: { premier: 14000, total: 22000 } })) throw new Error(JSON.stringify(PROFIL_LONG));
});

Deno.test('Profil long : premier modèle en « medium » ; au-delà de la fenêtre, le secours en « low » avec le temps qui reste (fenêtres raccourcies ici)', async () => {
  const vraies = PROFIL_LONG.delais;
  PROFIL_LONG.delais = { premier: 300, total: 2500 };
  try {
    const f = fakeGemini({ [R]: { ms: 60_000 } }, plusieurs(A('declarer_heures'), A('panier_repas')));
    const t0 = Date.now();
    const r = await callFunction({ prompt: 'x', functions: FNS, maxCalls: 4, profil: 'long' }, env, f.fetchImpl);
    const ms = Date.now() - t0;
    if (!r.ok || r.secours !== true || r.calls?.length !== 2 || f.calls.map((c) => c.model).join(',') !== `${R},${S}`) throw new Error(JSON.stringify(r));
    if (ms < 250 || ms > 1500) throw new Error(`le secours devait partir après ~0,3 s, pas ${ms} ms`);
    const niveau = (raw: string) => (JSON.parse(raw).generationConfig.thinkingConfig as { thinkingLevel: string }).thinkingLevel;
    if (niveau(f.calls[0].raw) !== 'medium' || niveau(f.calls[1].raw) !== 'low') throw new Error('réflexion : medium puis low');
    // Tout est lent : échec propre dans la fenêtre totale du profil long (et non dans les 8 s du profil court).
    const g = fakeGemini({ [R]: { ms: 60_000 }, [S]: { ms: 60_000 } });
    const t1 = Date.now();
    const x = await callFunction({ prompt: 'x', functions: FNS, maxCalls: 4, profil: 'long' }, env, g.fetchImpl);
    const ms2 = Date.now() - t1;
    if (x.ok || x.reason !== 'provider_error' || g.calls.length !== 2 || ms2 > 2500 + 500) throw new Error(`plafond : ${g.calls.length} appel(s), ${ms2} ms`);
  } finally {
    PROFIL_LONG.delais = vraies;
  }
});

Deno.test('Sans profil long : réflexion « minimal » comme avant, même avec plusieurs appels autorisés', async () => {
  const f = fakeGemini({}, plusieurs(A('declarer_heures'), A('panier_repas')));
  await callFunction({ prompt: 'x', functions: FNS, maxCalls: 4 }, env, f.fetchImpl);
  const niveau = (JSON.parse(f.calls[0].raw).generationConfig.thinkingConfig as { thinkingLevel: string }).thinkingLevel;
  if (niveau !== 'minimal') throw new Error(`réflexion : ${niveau}`);
});
