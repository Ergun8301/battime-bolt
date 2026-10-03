// Fournisseur d'IA — UN SEUL endroit à changer pour passer de Gemini à un
// autre (Mistral, etc.).
//
// Réglages (secrets de la fonction Edge) :
//   GEMINI_API_KEY  clé du fournisseur. Absente → { ok: false, reason: 'not_configured' }
//   AI_MODEL        modèle, jamais codé en dur ailleurs (défaut ci-dessous)
//   AI_PROVIDER     'gemini' (seul branché pour l'instant)
//
// CONFIDENTIALITÉ : ce module ne journalise JAMAIS le contenu envoyé ni la
// réponse. En cas d'erreur, seul le code HTTP sort dans les logs.

export const DEFAULT_AI_MODEL = 'gemini-3.1-flash-lite';
/**
 * Lot 7 : un modèle PLUS FORT pour les ACTIONS (titres, dates relatives,
 * choix de la bonne fonction) ; Flash-Lite reste pour les simples questions.
 * Réglable par le secret AI_ACTION_MODEL. S'il est indisponible (nom inconnu,
 * quota…), on retombe tout seul sur le modèle léger : l'assistant répond quand même.
 */
export const DEFAULT_ACTION_MODEL = 'gemini-3.5-flash';

export interface AiFile { mime: string; base64: string }
export interface ExtractRequest { prompt: string; schema: Record<string, unknown>; file?: AiFile }
export type AiResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: 'not_configured' | 'provider_error' | 'bad_response' };

type Env = { get(key: string): string | undefined };
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Produit un objet JSON selon une consigne et un schéma, à partir d'un document s'il y en a un. */
export async function extractJson(req: ExtractRequest, env: Env, fetchImpl: FetchLike = fetch): Promise<AiResult> {
  const provider = (env.get('AI_PROVIDER') || 'gemini').toLowerCase();
  const model = env.get('AI_MODEL') || DEFAULT_AI_MODEL;
  if (provider === 'gemini') return gemini(req, env.get('GEMINI_API_KEY'), model, fetchImpl);
  return { ok: false, reason: 'not_configured' };
}

// ── Appel de fonctions (lot 3 bis) ─────────────────────────────────────────
// Le modèle ne répond QUE par l'appel d'une fonction de la liste fournie
// (mode ANY) : répondre, guider, ou PRÉPARER une action. Il n'exécute jamais
// rien : c'est l'écran qui exécute, après confirmation de l'utilisateur.
export interface FunctionDecl { name: string; description: string; parameters: Record<string, unknown> }
export interface ToolsRequest {
  prompt: string; functions: FunctionDecl[]; file?: AiFile;
  /** 'action' → modèle fort (AI_ACTION_MODEL), repli automatique sur le léger. */
  kind?: 'action' | 'question';
}
export type ToolsResult =
  | { ok: true; call: { name: string; args: Record<string, unknown> } }
  | { ok: false; reason: 'not_configured' | 'provider_error' | 'bad_response' };

// Lot 7 (lenteur) : un plafond de temps GLOBAL. Le modèle fort n'a que
// AI_ACTION_WAIT_MS pour répondre ; le léger part EN MÊME TEMPS et prend le
// relais sans attendre. Un modèle qui refuse (quota) est mis de côté quelques
// minutes au lieu d'être rappelé à chaque demande. Si le léger est surchargé,
// un second modèle léger (AI_FALLBACK_MODEL) est essayé tant qu'il reste du temps.
export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_ACTION_WAIT_MS = 3500;
export const DEFAULT_FALLBACK_MODEL = 'gemini-3.5-flash-lite';
const COOLDOWN_MS = 10 * 60_000;
const resting = new Map<string, number>(); // modèle → au repos jusqu'à (ms)
const isResting = (m: string) => (resting.get(m) ?? 0) > Date.now();
const num = (v: string | undefined, d: number) => (Number(v) > 0 ? Number(v) : d);

export async function callFunction(req: ToolsRequest, env: Env, fetchImpl: FetchLike = fetch): Promise<ToolsResult> {
  const deadline = Date.now() + num(env.get('AI_TIMEOUT_MS'), DEFAULT_TIMEOUT_MS);
  const light = env.get('AI_MODEL') || DEFAULT_AI_MODEL;
  const backup = env.get('AI_FALLBACK_MODEL') ?? DEFAULT_FALLBACK_MODEL;
  const strong = req.kind === 'action' ? env.get('AI_ACTION_MODEL') || DEFAULT_ACTION_MODEL : light;
  const left = () => deadline - Date.now();

  // Le léger part tout de suite ; le fort, s'il n'est pas au repos, en même temps.
  const lightP = callFunctionWith(light, req, env, fetchImpl, left());
  if (strong !== light && !isResting(strong)) {
    const s = await callFunctionWith(strong, req, env, fetchImpl, Math.min(num(env.get('AI_ACTION_WAIT_MS'), DEFAULT_ACTION_WAIT_MS), left()));
    if (s.ok || s.reason === 'not_configured') return s;
    if (s.reason === 'provider_error' && s.rest) resting.set(strong, Date.now() + COOLDOWN_MS);
    console.error('[ai] modèle actions trop lent ou indisponible : le modèle léger répond');
  }
  const l = await lightP;
  if (l.ok || l.reason !== 'provider_error' || !backup || backup === light || left() < 1500) return strip(l);
  console.error('[ai] modèle léger indisponible : modèle de secours');
  return strip(await callFunctionWith(backup, req, env, fetchImpl, left()));
}
const strip = (r: ToolsResult & { rest?: boolean }): ToolsResult => {
  if (!r.ok && 'rest' in r) { const { rest: _r, ...x } = r; return x as ToolsResult; }
  return r;
};

type Attempt = ToolsResult & { rest?: boolean };
async function callFunctionWith(model: string, req: ToolsRequest, env: Env, fetchImpl: FetchLike, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Attempt> {
  const provider = (env.get('AI_PROVIDER') || 'gemini').toLowerCase();
  const key = env.get('GEMINI_API_KEY');
  if (provider !== 'gemini' || !key) return { ok: false, reason: 'not_configured' };
  if (timeoutMs < 100) return { ok: false, reason: 'provider_error' };
  // Plafond de temps : au-delà, on abandonne cet appel (le suivant prend le relais).
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: req.prompt }, ...(req.file ? [{ inline_data: { mime_type: req.file.mime, data: req.file.base64 } }] : [])] }],
          tools: [{ functionDeclarations: req.functions }],
          toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: req.functions.map((f) => f.name) } },
          generationConfig: { temperature: 0 },
        }),
      },
    );
  } catch {
    clearTimeout(timer);
    console.error(ctl.signal.aborted ? `[ai] ${model} : plus de ${timeoutMs} ms, abandon` : '[ai] fournisseur injoignable');
    return { ok: false, reason: 'provider_error', rest: ctl.signal.aborted };
  }
  if (!res.ok) {
    clearTimeout(timer);
    console.error(`[ai] fournisseur : HTTP ${res.status}`);
    return { ok: false, reason: 'provider_error', rest: res.status === 429 || res.status === 404 };
  }
  try {
    const body = await res.json() as { candidates?: { content?: { parts?: { functionCall?: { name?: string; args?: unknown } }[] } }[] };
    const fc = body.candidates?.[0]?.content?.parts?.find((p) => p.functionCall)?.functionCall;
    const allowed = new Set(req.functions.map((f) => f.name));
    if (!fc?.name || !allowed.has(fc.name)) return { ok: false, reason: 'bad_response' };
    const args = fc.args && typeof fc.args === 'object' ? fc.args as Record<string, unknown> : {};
    return { ok: true, call: { name: fc.name, args } };
  } catch {
    return { ok: false, reason: ctl.signal.aborted ? 'provider_error' : 'bad_response' };
  } finally {
    clearTimeout(timer);
  }
}

async function gemini(req: ExtractRequest, key: string | undefined, model: string, fetchImpl: FetchLike): Promise<AiResult> {
  if (!key) return { ok: false, reason: 'not_configured' };
  let res: Response;
  try {
    res = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: req.prompt },
              ...(req.file ? [{ inline_data: { mime_type: req.file.mime, data: req.file.base64 } }] : []),
            ],
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: req.schema,
          },
        }),
      },
    );
  } catch {
    console.error('[ai] fournisseur injoignable');
    return { ok: false, reason: 'provider_error' };
  }
  if (!res.ok) {
    console.error(`[ai] fournisseur : HTTP ${res.status}`);
    return { ok: false, reason: 'provider_error' };
  }
  try {
    const body = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, reason: 'bad_response' };
  }
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
