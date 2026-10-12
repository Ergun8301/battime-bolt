// Fournisseur d'IA — UN SEUL endroit à changer pour passer de Gemini à un
// autre (Mistral, etc.).
//
// LOT 6 (couche IA v2) — UN SEUL RÉGLAGE, UNE SEULE CLÉ (secrets de la fonction Edge) :
//   AI_CONFIG    JSON : la formule (essai | payant), le modèle de chaque niveau
//                (« fournisseur:modèle »), les plafonds du jour pour tout le
//                projet. Exemple (copier-coller, les 4 champs sont facultatifs) :
//                {"formule":"essai","rapide":"gemini:gemini-3.5-flash-lite",
//                 "documents":"gemini:gemini-3.8-flash","secours":"gemini:gemini-3.1-flash-lite",
//                 "plafonds":{"rapide":400,"documents":15}}
//                Absent ou invalide → les réglages par défaut ci-dessous (et une
//                ligne dans les logs, sans le contenu). Jamais d'erreur.
//   AI_API_KEY   clé du fournisseur. Absente → l'ancienne GEMINI_API_KEY.
//
// Les anciens secrets AI_MODEL, AI_ACTION_MODEL, AI_FALLBACK_MODEL, AI_PROVIDER,
// AI_TIMEOUT_MS et AI_ACTION_WAIT_MS ne sont PLUS LUS : un vieux réglage ne peut
// pas ramener un modèle retiré par Google.
//
// ROUTAGE — UN appel par demande :
//   · « rapide »    les questions ET les ordres ;
//   · « documents » seulement quand un fichier est joint, et la lecture d'un bulletin ;
//   · « secours »   seulement APRÈS une erreur ou un délai dépassé du premier
//                   appel, jamais en même temps.
// Un modèle « documents » lent ou indisponible (délai dépassé, 429, 5xx, 404,
// injoignable) est mis de côté 10 min (par isolat) : les demandes suivantes
// vont tout de suite au secours, sans réattendre. Un 400 ou une réponse
// illisible ne le met pas de côté. Un résultat du secours porte `secours: true`.
// Jamais de modèle Pro (refusé ici même, et par un test).
//
// GEMINI 3.x : pas de temperature / top_p / top_k (retirés de l'API). La
// réflexion se règle par thinkingConfig.thinkingLevel, JAMAIS avec thinkingBudget
// (erreur 400). « minimal » n'existe pas sur gemini-3.8-flash : « low ».
//
// CONFIDENTIALITÉ : ce module ne journalise JAMAIS le contenu envoyé ni la
// réponse. En cas d'erreur, seul le code HTTP sort dans les logs.

type Env = { get(key: string): string | undefined };

export type Tier = 'rapide' | 'documents';
type Slot = Tier | 'secours';
export type FormuleNom = 'essai' | 'payant';
export interface Modele { fournisseur: 'gemini'; model: string; reflexion: 'minimal' | 'low' | 'medium' | 'high' }
export interface AiConfig {
  formule: FormuleNom;
  rapide: Modele; documents: Modele; secours: Modele;
  /**
   * Plafond de demandes par jour pour TOUT le projet (le gratuit de Gemini est
   * compté par projet, pas par entreprise). null = pas de plafond global.
   */
  plafonds: Record<Tier, number> | null;
  /** Diagnostic : délais de remplacement par niveau. */
  delais?: Partial<Record<Tier, { premier: number; total: number }>>;
}

// Noms vérifiés le 12/10/2026 dans la documentation de Google : à revoir chaque mois.
export const MODELES_PAR_DEFAUT: Record<Slot, string> = {
  rapide: 'gemini-3.5-flash-lite',
  documents: 'gemini-3.8-flash',
  secours: 'gemini-3.1-flash-lite',
};
// Niveau de réflexion de chaque modèle : « minimal » n'existe pas sur 3.8 Flash.
const REFLEXION: Record<Slot, Modele['reflexion']> = { rapide: 'minimal', documents: 'low', secours: 'minimal' };
const SLOTS: Slot[] = ['rapide', 'documents', 'secours'];
/**
 * Gratuit de Gemini (par projet et par jour, remise à zéro vers 9 h à Paris) :
 * on s'arrête prudemment avant. Au-delà : « L'assistant est en pause jusqu'à demain ».
 * À ajuster dans AI_CONFIG (plafonds) d'après les limites affichées dans Google AI Studio.
 */
export const PLAFONDS_ESSAI: Record<Tier, number> = { rapide: 400, documents: 15 };
const PLAFOND_MAX = 100_000;
export const PAUSE_MESSAGE = 'L’assistant est en pause jusqu’à demain : la limite d’utilisation du jour est atteinte.';

/**
 * Temps laissé au premier appel, et temps total d'une demande, secours compris (ms).
 * Documents : 12 s puis le secours, 25 s au plus (gemini-3.8-flash dépassait presque toujours 25 s : voir docs/ia-v2.md).
 */
export const DELAIS: Record<Tier, { premier: number; total: number }> = {
  rapide: { premier: 5000, total: 8000 },
  documents: { premier: 12000, total: 25000 },
};
/** Combien de temps un modèle lent ou indisponible est mis de côté (ms) ; 0 = jamais. Seulement « documents » : le modèle rapide ne l'est pas. */
export const REPOS_MS: Record<Tier, number> = { rapide: 0, documents: 10 * 60_000 };

/** Jamais de Pro, quel que soit le réglage (règle d'Ergun). */
export const isProModel = (model: string) => /(^|[-_.])pro($|[-_.])/i.test(model);

const modeleDefaut = (s: Slot): Modele => ({ fournisseur: 'gemini', model: MODELES_PAR_DEFAUT[s], reflexion: REFLEXION[s] });
function defauts(formule: FormuleNom): AiConfig {
  return {
    formule, rapide: modeleDefaut('rapide'), documents: modeleDefaut('documents'), secours: modeleDefaut('secours'),
    plafonds: formule === 'essai' ? { ...PLAFONDS_ESSAI } : null,
  };
}

/** Lit AI_CONFIG ; une chaîne = la raison du refus (jamais le contenu). */
function lire(raw: string): AiConfig | string {
  // Raccourci : le seul nom de la formule, avec les modèles par défaut.
  if (/^(essai|payant)$/i.test(raw)) return defauts(raw.toLowerCase() as FormuleNom);
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return 'JSON illisible'; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return 'objet JSON attendu';
  const o = j as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== 'formule' && k !== 'plafonds' && k !== 'reflexion' && k !== 'delais' && !(SLOTS as string[]).includes(k))) return 'champ inconnu';
  const f = o.formule === undefined ? 'essai' : typeof o.formule === 'string' ? o.formule.trim().toLowerCase() : '';
  if (f !== 'essai' && f !== 'payant') return 'formule inconnue';
  const cfg = defauts(f);
  for (const s of SLOTS) {
    const v = o[s];
    if (v === undefined) continue;
    const m = typeof v === 'string' ? /^([a-z]+):([a-z0-9][a-z0-9.-]{2,59})$/.exec(v.trim().toLowerCase()) : null;
    if (!m || m[1] !== 'gemini') return `modèle « ${s} » refusé (fournisseur:modèle attendu)`;
    if (isProModel(m[2])) return `modèle « ${s} » refusé (Pro)`;
    cfg[s] = { fournisseur: 'gemini', model: m[2], reflexion: REFLEXION[s] };
  }
  if (o.delais && typeof o.delais === 'object') cfg.delais = o.delais as AiConfig['delais'];
  if (o.reflexion && typeof o.reflexion === 'object') {
    for (const s2 of SLOTS) { const v = (o.reflexion as Record<string, unknown>)[s2]; if (v === 'minimal' || v === 'low' || v === 'medium' || v === 'high') cfg[s2].reflexion = v; }
  }
  if (o.plafonds !== undefined) {
    const p = o.plafonds as Record<string, unknown> | null;
    const bon = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= PLAFOND_MAX;
    if (!p || typeof p !== 'object' || Object.keys(p).some((k) => k !== 'rapide' && k !== 'documents') || !bon(p.rapide) || !bon(p.documents)) return 'plafonds invalides';
    cfg.plafonds = { rapide: p.rapide as number, documents: p.documents as number };
  }
  return cfg;
}

const memo = new Map<string, AiConfig>();
/** Le réglage actif. Ne lève JAMAIS : absent ou invalide → les réglages par défaut. */
export function readConfig(env: Env): AiConfig {
  const raw = (env.get('AI_CONFIG') ?? '').trim();
  if (!raw) return defauts('essai');
  const seen = memo.get(raw);
  if (seen) return seen;
  const r = lire(raw);
  if (typeof r === 'string') console.error(`[ai] AI_CONFIG invalide (${r}) : réglage par défaut`);
  const cfg = typeof r === 'string' ? defauts('essai') : r;
  if (memo.size > 20) memo.clear();
  memo.set(raw, cfg);
  return cfg;
}
/** La formule renvoyée à l'écran (bandeau « Mode essai ») : l'écran ne la devine jamais. */
export const formuleNom = (env: Env): FormuleNom => readConfig(env).formule;
/** Plafond du jour pour tout le projet ; null = pas de plafond. */
export const plafondProjet = (env: Env, tier: Tier): number | null => readConfig(env).plafonds?.[tier] ?? null;
/** La clé du fournisseur : AI_API_KEY, sinon l'ancienne GEMINI_API_KEY. */
export const aiKey = (env: Env): string | undefined => env.get('AI_API_KEY') || env.get('GEMINI_API_KEY') || undefined;
/** Le modèle « documents » pour un fichier (ou une question sur un document), « rapide » sinon. */
export const tierFor = (hasFile: boolean, docQuestion = false): Tier => (hasFile || docQuestion ? 'documents' : 'rapide');

export interface AiFile { mime: string; base64: string }
export interface ExtractRequest {
  prompt: string; schema: Record<string, unknown>; file?: AiFile;
  /** Modèle à utiliser ; par défaut « documents » s'il y a un fichier, « rapide » sinon. */
  tier?: Tier;
}
export type AiResult =
  | { ok: true; data: unknown; /** Lu par le modèle de secours (plus léger) : à vérifier. */ secours?: true }
  | { ok: false; reason: 'not_configured' | 'provider_error' | 'bad_response' };

// ── Appel de fonctions (lot 3 bis) ─────────────────────────────────────────
// Le modèle ne répond QUE par l'appel d'une fonction de la liste fournie
// (mode ANY) : répondre, guider, ou PRÉPARER une action. Il n'exécute jamais
// rien : c'est l'écran qui exécute, après confirmation de l'utilisateur.
export interface FunctionDecl { name: string; description: string; parameters: Record<string, unknown> }
export interface ToolsRequest {
  prompt: string; functions: FunctionDecl[]; file?: AiFile;
  /** Modèle à utiliser ; par défaut « documents » s'il y a un fichier, « rapide » sinon. */
  tier?: Tier;
}
export type ToolsResult =
  | { ok: true; call: { name: string; args: Record<string, unknown> }; /** Choisi par le modèle de secours (plus léger). */ secours?: true }
  | { ok: false; reason: 'not_configured' | 'provider_error' | 'bad_response' };

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
type Echec = { ok: false; reason: 'not_configured' | 'provider_error' | 'bad_response' };
type Brut = { ok: true; body: unknown } | Echec;
// Échecs « lent ou indisponible » (délai dépassé, 429, 5xx, 404, injoignable ; pas un 400 ni une réponse illisible) :
// repérés à part pour le repos du modèle, sans rien ajouter au résultat rendu.
const lents = new WeakSet<object>();
const lent = <T extends object>(x: T): T => { lents.add(x); return x; };

/** UN appel à Gemini : réflexion par thinkingLevel, ni temperature ni top_p ni top_k, plafond de temps. */
async function geminiCall(m: Modele, key: string, payload: Record<string, unknown>, timeoutMs: number, fetchImpl: FetchLike): Promise<Brut> {
  if (isProModel(m.model)) { console.error('[ai] modèle Pro refusé'); return { ok: false, reason: 'not_configured' }; }
  if (timeoutMs < 100) return { ok: false, reason: 'provider_error' };
  const generationConfig = { ...(payload.generationConfig as Record<string, unknown> | undefined), thinkingConfig: { thinkingLevel: m.reflexion } };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m.model)}:generateContent`, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ ...payload, generationConfig }),
      });
    } catch {
      console.error(ctl.signal.aborted ? `[ai] ${m.model} : plus de ${timeoutMs} ms, abandon` : '[ai] fournisseur injoignable');
      return lent({ ok: false, reason: 'provider_error' });
    }
    if (!res.ok) {
      console.error(`[ai] fournisseur : HTTP ${res.status}`);
      const echec: Echec = { ok: false, reason: 'provider_error' };
      return res.status === 429 || res.status === 404 || res.status >= 500 ? lent(echec) : echec;
    }
    try {
      return { ok: true, body: await res.json() };
    } catch {
      return ctl.signal.aborted ? lent({ ok: false, reason: 'provider_error' }) : { ok: false, reason: 'bad_response' };
    }
  } finally {
    clearTimeout(timer);
  }
}

// Modèles mis de côté (lents ou indisponibles) : nom → jusqu'à quand (ms). Propre à l'isolat, sans base ni secret.
const auRepos = new Map<string, number>();
let maintenant: () => number = Date.now;
/** Pour les tests : vide les modèles mis de côté et (re)donne l'horloge utilisée pour ce repos. */
export function reposReinit(horloge: () => number = Date.now): void { auRepos.clear(); maintenant = horloge; }

/**
 * Le modèle du niveau demandé, puis — seulement s'il a échoué (erreur du
 * fournisseur, injoignable, délai dépassé) — le modèle de secours. Une réponse
 * illisible n'est pas une panne : pas de second appel.
 * Un modèle lent ou indisponible est mis de côté REPOS_MS[niveau] : tant que ça dure,
 * la demande va tout de suite au secours (et au modèle de côté en dernier recours,
 * si le secours échoue aussi). Une réponse du secours porte `secours: true`.
 */
async function avecSecours<T extends { ok: boolean; reason?: string }>(
  cfg: AiConfig, tier: Tier, run: (m: Modele, timeoutMs: number) => Promise<T>,
): Promise<T> {
  const d = cfg.delais?.[tier] ?? DELAIS[tier];
  const fin = Date.now() + d.total;
  const left = () => fin - Date.now();
  const m = cfg[tier];
  const distinct = cfg.secours.model !== m.model;
  const deCote = distinct && REPOS_MS[tier] > 0 && (auRepos.get(m.model) ?? 0) > maintenant();
  if (deCote) {
    console.error(`[ai] modèle ${tier} au repos : modèle de secours`);
  } else {
    const r = await run(m, Math.min(d.premier, left()));
    if (r.ok) { auRepos.delete(m.model); return r; }
    if (r.reason !== 'provider_error' || !distinct || left() < 1500) return r;
    if (lents.has(r) && REPOS_MS[tier] > 0) auRepos.set(m.model, maintenant() + REPOS_MS[tier]);
    console.error(`[ai] modèle ${tier} indisponible : modèle de secours`);
  }
  const s = await run(cfg.secours, left());
  if (s.ok) return { ...s, secours: true };
  // Mis de côté, et le secours échoue aussi : on retente le modèle de côté avec le temps qui reste.
  if (deCote && s.reason === 'provider_error' && left() >= 1500) {
    const r = await run(m, left());
    if (r.ok) auRepos.delete(m.model);
    return r;
  }
  return s;
}

const parts = (prompt: string, file?: AiFile) => [{ text: prompt }, ...(file ? [{ inline_data: { mime_type: file.mime, data: file.base64 } }] : [])];

export async function callFunction(req: ToolsRequest, env: Env, fetchImpl: FetchLike = fetch): Promise<ToolsResult> {
  const key = aiKey(env);
  if (!key) return { ok: false, reason: 'not_configured' };
  const allowed = new Set(req.functions.map((x) => x.name));
  const payload = {
    contents: [{ role: 'user', parts: parts(req.prompt, req.file) }],
    tools: [{ functionDeclarations: req.functions }],
    toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [...allowed] } },
  };
  return avecSecours(readConfig(env), req.tier ?? tierFor(!!req.file), async (m, ms): Promise<ToolsResult> => {
    const r = await geminiCall(m, key, payload, ms, fetchImpl);
    if (!r.ok) return r;
    const body = r.body as { candidates?: { content?: { parts?: { functionCall?: { name?: string; args?: unknown } }[] } }[] };
    const fc = body?.candidates?.[0]?.content?.parts?.find((p) => p.functionCall)?.functionCall;
    if (!fc?.name || !allowed.has(fc.name)) return { ok: false, reason: 'bad_response' };
    const args = fc.args && typeof fc.args === 'object' ? fc.args as Record<string, unknown> : {};
    return { ok: true, call: { name: fc.name, args } };
  });
}

/** Produit un objet JSON selon une consigne et un schéma, à partir d'un document s'il y en a un. */
export async function extractJson(req: ExtractRequest, env: Env, fetchImpl: FetchLike = fetch): Promise<AiResult> {
  const key = aiKey(env);
  if (!key) return { ok: false, reason: 'not_configured' };
  const payload = {
    contents: [{ role: 'user', parts: parts(req.prompt, req.file) }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: req.schema },
  };
  return avecSecours(readConfig(env), req.tier ?? tierFor(!!req.file), async (m, ms): Promise<AiResult> => {
    const r = await geminiCall(m, key, payload, ms, fetchImpl);
    if (!r.ok) return r;
    try {
      const body = r.body as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      return { ok: true, data: JSON.parse(text) };
    } catch {
      return { ok: false, reason: 'bad_response' };
    }
  });
}

// ── Pièce jointe reçue de l'écran (lot 3 bis) ──────────────────────────────
// Photo ou PDF, 8 Mo au plus. JAMAIS journalisée, JAMAIS stockée ici : elle
// part au modèle pour être lue, puis est oubliée.
export const ATTACH_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);
export const ATTACH_MAX_BYTES = 8 * 1024 * 1024;
export function readAttachment(raw: unknown): { ok: true; file: AiFile | undefined } | { ok: false; error: string } {
  if (raw == null) return { ok: true, file: undefined };
  const f = raw as { mime?: unknown; base64?: unknown };
  const mime = String(f.mime ?? '').toLowerCase();
  const base64 = String(f.base64 ?? '');
  if (!ATTACH_MIMES.has(mime)) return { ok: false, error: 'Format non accepté : photo (JPG, PNG, HEIC) ou PDF.' };
  if (!base64 || base64.length * 0.75 > ATTACH_MAX_BYTES) return { ok: false, error: 'Fichier trop lourd (8 Mo maximum).' };
  if (!/^[A-Za-z0-9+/=]+$/.test(base64.slice(0, 200))) return { ok: false, error: 'Fichier illisible.' };
  return { ok: true, file: { mime, base64 } };
}
