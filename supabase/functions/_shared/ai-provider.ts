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
export interface ToolsRequest { prompt: string; functions: FunctionDecl[]; file?: AiFile }
export type ToolsResult =
  | { ok: true; call: { name: string; args: Record<string, unknown> } }
  | { ok: false; reason: 'not_configured' | 'provider_error' | 'bad_response' };

export async function callFunction(req: ToolsRequest, env: Env, fetchImpl: FetchLike = fetch): Promise<ToolsResult> {
  const provider = (env.get('AI_PROVIDER') || 'gemini').toLowerCase();
  const model = env.get('AI_MODEL') || DEFAULT_AI_MODEL;
  const key = env.get('GEMINI_API_KEY');
  if (provider !== 'gemini' || !key) return { ok: false, reason: 'not_configured' };
  let res: Response;
  try {
    res = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
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
    console.error('[ai] fournisseur injoignable');
    return { ok: false, reason: 'provider_error' };
  }
  if (!res.ok) {
    console.error(`[ai] fournisseur : HTTP ${res.status}`);
    return { ok: false, reason: 'provider_error' };
  }
  try {
    const body = await res.json() as { candidates?: { content?: { parts?: { functionCall?: { name?: string; args?: unknown } }[] } }[] };
    const fc = body.candidates?.[0]?.content?.parts?.find((p) => p.functionCall)?.functionCall;
    const allowed = new Set(req.functions.map((f) => f.name));
    if (!fc?.name || !allowed.has(fc.name)) return { ok: false, reason: 'bad_response' };
    const args = fc.args && typeof fc.args === 'object' ? fc.args as Record<string, unknown> : {};
    return { ok: true, call: { name: fc.name, args } };
  } catch {
    return { ok: false, reason: 'bad_response' };
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
