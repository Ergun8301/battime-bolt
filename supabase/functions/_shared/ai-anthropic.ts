// Adaptateur Claude (API Messages d'Anthropic) pour la couche IA : appel de fonctions
// (callFunction) et sortie structurée (extractJson). Le routage (niveaux, secours,
// repos du modèle, quotas) reste dans ai-provider.ts ; ici, SEULEMENT ce qui est propre à Claude :
// la construction de la requête, la lecture de la réponse, l'appel HTTP.
//
// FETCH BRUT, PAS LE SDK (@anthropic-ai/sdk) — décision prise pour 3 raisons réelles :
//   1. les tests Deno du dépôt tournent avec le package.json du site à la racine : un
//      `import 'npm:@anthropic-ai/sdk'` dans _shared/ fait échouer la résolution dans les ~15 scripts
//      de test qui touchent la couche IA (« Could not find a matching package … in the node_modules
//      directory »), sauf à ajouter un drapeau à chacun (le dépôt contourne déjà ce genre de
//      problème par DENO_NO_PACKAGE_JSON pour la fonction kiosk) ;
//   2. le SDK relance seul (2 fois par défaut) et gère ses propres délais : il faudrait les neutraliser
//      pour garder « UN appel par niveau, plafond de temps par AbortController » comme pour Gemini ;
//   3. démarrage à froid d'une fonction Edge : un SDK de plus à charger, pour un seul appel POST.
// Les en-têtes sont ceux de la doc : x-api-key et anthropic-version: 2023-06-01 (pas de bêta).
// Aucun mélange : ce module n'importe AUCUN SDK, tout passe par le fetch injecté (tests).
//
// SONNET 5.5 — ce que la requête respecte (sinon HTTP 400) :
//   · PAS de temperature / top_p / top_k ; PAS de budget_tokens ; PAS de thinking {type:'disabled'}.
//   · `thinking` est OMIS (réflexion adaptative). Choix : {type:'between_tools'} coupe la réflexion mais
//     n'existe que sur Sonnet 5.5 (400 sur Sonnet 5 et Haiku 5.5, qui sont dans la liste blanche) et la réflexion
//     servait justement au profil long (mesuré sur Gemini : 11/11 en « medium » contre 4/11 en « minimal »).
//     C'est donc `output_config.effort` qui règle la vitesse : 'low' pour le niveau « rapide » (le défaut 'high'
//     ajoute une réflexion avant presque chaque réponse : trop lent pour un assistant de chat), 'medium' pour le
//     profil 'long' (phrases longues, plusieurs actions, turc) et pour « documents ».
//   · tool_choice FORCÉ (any / tool) = 400 sur Sonnet 5.5. Gemini utilisait le mode ANY : ici tool_choice
//     {type:'auto'} (+ disable_parallel_tool_use quand un seul appel est accepté) et la consigne « réponds
//     UNIQUEMENT en appelant une des fonctions fournies » ; un texte sans appel de fonction = 'bad_response'.
//   · tools {name, description, input_schema} ; `strict: true` seulement tant que les LIMITES de l'API le
//     permettent (20 outils stricts, 24 paramètres facultatifs au total, 16 unions : voir outilsClaude).
//
// PAS de cache_control pour l'instant (étape ultérieure) : la requête est rangée dans l'ordre du cache
// (tools, puis system, puis messages), la consigne stable est dans `system` (un tableau de blocs, où un
// cache_control s'ajoutera en un champ) ; le prompt de l'appelant, qui mélange consigne et données, reste dans le message.
//
// PAS de « server-side fallback » de l'API (fallbacks: 'default') : le secours inter-fournisseurs
// (avecSecours, ai-provider.ts) joue ce rôle, et il couvre aussi les pannes, que le fallback serveur ne couvre pas.
//
// CONFIDENTIALITÉ : ce module ne journalise JAMAIS le contenu envoyé ni la réponse ; en cas d'erreur, seul le code HTTP sort.

export type Fournisseur = 'gemini' | 'anthropic';
export type Effort = 'low' | 'medium' | 'high';
interface Fichier { mime: string; base64: string }
interface Decl { name: string; description: string; parameters: Record<string, unknown> }
type Json = Record<string, unknown>;

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Liste blanche STRICTE des modèles Claude (identifiants sans date). Opus, Fable, Mythos : refusés (coût),
 * dans le même esprit que « jamais de Pro » pour Gemini.
 */
export const ANTHROPIC_AUTORISES: readonly string[] = ['claude-sonnet-5-5', 'claude-sonnet-5', 'claude-haiku-5-5'];
/** Pourquoi un identifiant Claude est refusé (la RAISON seulement, jamais le contenu), ou null s'il est autorisé. */
export function refusModeleAnthropic(model: string): string | null {
  if (ANTHROPIC_AUTORISES.includes(model)) return null;
  if (/opus|fable|mythos/.test(model)) return 'modèle trop coûteux';
  if (/\d{8}/.test(model)) return 'identifiant daté';
  return 'hors liste blanche';
}

/** Réflexion du niveau (vocabulaire de ai-provider) → effort Claude : « minimal » n'existe pas côté Claude. */
export const effortDe = (reflexion: 'minimal' | 'low' | 'medium' | 'high'): Effort => (reflexion === 'minimal' ? 'low' : reflexion);
/** Plafond de sortie : la réflexion compte dans max_tokens (pas de streaming, requête courte). */
export const MAX_TOKENS: Record<Effort, number> = { low: 4096, medium: 8192, high: 16_000 };

// ── Schémas : format de Gemini (OpenAPI) → JSON Schema accepté par Claude ───────────────────────
// Claude ne lit que ce sous-ensemble ; tout le reste est retiré (propertyOrdering, minimum, maxLength, default,
// example, format: 'enum'…). Les contraintes retirées sont de toute façon revérifiées par le code appelant.
const TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);
const FORMATS = new Set(['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid']);
const isObj = (x: unknown): x is Json => !!x && typeof x === 'object' && !Array.isArray(x);

export function versSchemaClaude(node: unknown): Json {
  if (!isObj(node)) return {};
  const t0 = Array.isArray(node.type) ? node.type.find((x) => x !== 'null') : node.type;
  let type = typeof t0 === 'string' && TYPES.has(t0.toLowerCase()) ? t0.toLowerCase() : undefined;
  const enumVals = Array.isArray(node.enum) && node.enum.length ? node.enum.filter((v) => ['string', 'number', 'boolean'].includes(typeof v)) : undefined;
  if (!type) type = isObj(node.properties) ? 'object' : node.items !== undefined ? 'array' : enumVals?.length ? 'string' : undefined;
  const nullable = node.nullable === true || (Array.isArray(node.type) && node.type.includes('null'));
  const out: Json = {};
  if (type) out.type = type;
  if (typeof node.description === 'string') out.description = node.description;
  if (enumVals?.length) out.enum = enumVals;
  if (type === 'string' && typeof node.format === 'string' && FORMATS.has(node.format)) out.format = node.format;
  if (type === 'array' && node.items !== undefined) out.items = versSchemaClaude(node.items);
  if (type === 'object') {
    const props: Json = {};
    if (isObj(node.properties)) for (const [k, v] of Object.entries(node.properties)) props[k] = versSchemaClaude(v);
    out.properties = props;
    out.required = (Array.isArray(node.required) ? node.required : []).filter((k): k is string => typeof k === 'string' && k in props);
    out.additionalProperties = false;
  }
  if (!nullable || !type) return out;
  // Nullable (« nullable: true » chez Gemini) : type en tableau pour un scalaire, anyOf pour un objet ou une liste.
  if (type === 'object' || type === 'array') {
    const { description, ...corps } = out;
    return { ...(description ? { description } : {}), anyOf: [corps, { type: 'null' }] };
  }
  return { ...out, type: [type, 'null'] };
}

/** Limites de l'API pour `strict: true` (par requête, tous les outils stricts ensemble). */
export const LIMITES_STRICT = { outils: 20, facultatifs: 24, unions: 16 } as const;
/** Mettre à false pour envoyer tous les outils sans `strict` (repli si l'API refusait un schéma). */
export const STRICT_ACTIF = true;

/** Paramètres facultatifs (hors `required`) et unions (anyOf, type en tableau) d'un schéma, imbriqués compris. */
export function coutStrict(schema: unknown): { facultatifs: number; unions: number } {
  let facultatifs = 0, unions = 0;
  const visiter = (n: unknown) => {
    if (!isObj(n)) return;
    if (Array.isArray(n.anyOf) || Array.isArray(n.type)) unions++;
    if (isObj(n.properties)) {
      const req = new Set(Array.isArray(n.required) ? n.required as string[] : []);
      for (const [k, v] of Object.entries(n.properties)) { if (!req.has(k)) facultatifs++; visiter(v); }
    }
    if (n.items) visiter(n.items);
    if (Array.isArray(n.anyOf)) n.anyOf.forEach(visiter);
  };
  visiter(schema);
  return { facultatifs, unions };
}

export interface OutilClaude { name: string; description: string; input_schema: Json; strict?: true }
/**
 * FunctionDecl (format Gemini) → outils Claude. `strict: true` est posé tant que les limites de l'API tiennent :
 * on garde d'abord les outils qui ont le MOINS de paramètres facultatifs (le plus d'outils stricts possible), puis
 * l'ordre d'origine est rendu. Les autres restent valides, simplement sans la garantie de schéma de l'API
 * (le code qui lit l'appel revérifie tout de toute façon). Même liste d'outils → mêmes outils stricts (le schéma
 * strict est compilé une fois par l'API puis gardé 24 h : la toute première demande d'un jeu d'outils peut être un peu plus lente).
 */
export function outilsClaude(functions: readonly Decl[]): OutilClaude[] {
  const outils = functions.map((f) => {
    const schema = versSchemaClaude({ ...(f.parameters ?? {}), type: 'object' });
    return { f, schema, cout: coutStrict(schema) };
  });
  const stricts = new Set<number>();
  if (STRICT_ACTIF) {
    let n = 0, fac = 0, uni = 0;
    [...outils.keys()].sort((a, b) => outils[a].cout.facultatifs - outils[b].cout.facultatifs || a - b).forEach((i) => {
      const c = outils[i].cout;
      if (n + 1 > LIMITES_STRICT.outils || fac + c.facultatifs > LIMITES_STRICT.facultatifs || uni + c.unions > LIMITES_STRICT.unions) return;
      n++; fac += c.facultatifs; uni += c.unions; stricts.add(i);
    });
  }
  return outils.map((o, i) => ({ name: o.f.name, description: o.f.description, input_schema: o.schema, ...(stricts.has(i) ? { strict: true as const } : {}) }));
}

// ── Pièces jointes ──────────────────────────────────────────────────────────
/** 10 Mo en base64 par image (API directe). Au-delà, ou pour un format non lu : le niveau échoue vers le secours. */
export const IMAGE_MAX_BASE64 = 10_000_000;
const IMAGES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
/**
 * Bloc Claude d'un fichier : image (jpeg, png, gif, webp) ou PDF (bloc document). null = Claude ne sait pas le lire
 * (HEIC / HEIF, que l'écran autorise ; image trop lourde) : l'appelant NE l'envoie PAS et passe au secours.
 */
export function blocFichier(file: Fichier): Json | null {
  const mime = file.mime.toLowerCase();
  if (IMAGES.has(mime)) return file.base64.length > IMAGE_MAX_BASE64 ? null : { type: 'image', source: { type: 'base64', media_type: mime, data: file.base64 } };
  if (mime === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.base64 } };
  return null;
}

// ── Requêtes ────────────────────────────────────────────────────────────────
const SYSTEME_OUTILS = 'Réponds UNIQUEMENT en appelant une des fonctions fournies, sans écrire de texte à côté.';
const SYSTEME_UN_SEUL = ' Appelle UNE seule fonction.';
const SYSTEME_JSON = 'Réponds UNIQUEMENT par l’objet JSON demandé, conforme au schéma, sans texte autour.';

/** Le message utilisateur : le fichier d'abord (recommandé par la doc), puis la consigne et les données. */
function messageUtilisateur(prompt: string, bloc: Json | null): Json {
  return { role: 'user', content: [...(bloc ? [bloc] : []), { type: 'text', text: prompt }] };
}

export interface EntreeOutils { model: string; effort: Effort; prompt: string; functions: readonly Decl[]; file?: Fichier; maxCalls: number }
/** Corps de l'appel de fonctions ; null si le fichier joint n'est pas lisible par Claude. */
export function corpsOutils(i: EntreeOutils): Json | null {
  const bloc = i.file ? blocFichier(i.file) : null;
  if (i.file && !bloc) return null;
  return {
    model: i.model,
    max_tokens: MAX_TOKENS[i.effort],
    output_config: { effort: i.effort },
    system: [{ type: 'text', text: SYSTEME_OUTILS + (i.maxCalls === 1 ? SYSTEME_UN_SEUL : '') }],
    messages: [messageUtilisateur(i.prompt, bloc)],
    tools: outilsClaude(i.functions),
    tool_choice: i.maxCalls === 1 ? { type: 'auto', disable_parallel_tool_use: true } : { type: 'auto' },
  };
}

export interface EntreeJson { model: string; effort: Effort; prompt: string; schema: Record<string, unknown>; file?: Fichier }
/**
 * Corps de la sortie structurée. CHOIX : `output_config.format` (json_schema) plutôt qu'un outil unique : l'API garantit
 * un JSON conforme au schéma, sans tool_choice (forcé = 400 sur Sonnet 5.5) ; la réponse est un bloc de texte à lire en JSON.
 */
export function corpsJson(i: EntreeJson): Json | null {
  const bloc = i.file ? blocFichier(i.file) : null;
  if (i.file && !bloc) return null;
  return {
    model: i.model,
    max_tokens: MAX_TOKENS[i.effort],
    output_config: { effort: i.effort, format: { type: 'json_schema', schema: versSchemaClaude(i.schema) } },
    system: [{ type: 'text', text: SYSTEME_JSON }],
    messages: [messageUtilisateur(i.prompt, bloc)],
  };
}

// ── Réponses ────────────────────────────────────────────────────────────────
export type LectureClaude =
  | { kind: 'ok'; appels: { name?: string; args?: unknown }[]; texte: string }
  | { kind: 'refus' }       // stop_reason « refusal » : la panne du niveau (le secours prend le relais)
  | { kind: 'tronque' }     // stop_reason « max_tokens » : arguments peut-être coupés, jamais exécutés
  | { kind: 'illisible' };
/** Blocs tool_use dans l'ordre (les blocs texte et thinking sont ignorés) et texte concaténé. */
export function lireReponseClaude(body: unknown): LectureClaude {
  if (!isObj(body) || !Array.isArray(body.content)) return { kind: 'illisible' };
  if (body.stop_reason === 'refusal') return { kind: 'refus' };
  if (body.stop_reason === 'max_tokens') return { kind: 'tronque' };
  const blocs = body.content.filter(isObj);
  return {
    kind: 'ok',
    appels: blocs.filter((b) => b.type === 'tool_use').map((b) => ({ name: typeof b.name === 'string' ? b.name : undefined, args: b.input })),
    texte: blocs.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text as string).join(''),
  };
}

// ── Appel HTTP ──────────────────────────────────────────────────────────────
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type BrutClaude = { ok: true; body: unknown } | { ok: false; reason: 'provider_error' | 'bad_response'; lent: boolean };
/**
 * UN appel à l'API Messages : plafond de temps par AbortController, jamais de contenu dans les logs (seulement le code
 * HTTP). « Lent » = délai dépassé, injoignable, 408, 429, 404, 5xx dont 529 (surchargé) ; un 400 ou une réponse illisible ne l'est pas.
 */
export async function appelClaude(model: string, key: string, corps: Json, timeoutMs: number, fetchImpl: FetchLike): Promise<BrutClaude> {
  const raison = refusModeleAnthropic(model);
  if (raison) { console.error('[ai] modèle Claude refusé'); return { ok: false, reason: 'provider_error', lent: false }; }
  if (timeoutMs < 100) return { ok: false, reason: 'provider_error', lent: false };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetchImpl(ANTHROPIC_URL, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
        body: JSON.stringify(corps),
      });
    } catch {
      console.error(ctl.signal.aborted ? `[ai] ${model} : plus de ${timeoutMs} ms, abandon` : '[ai] fournisseur injoignable');
      return { ok: false, reason: 'provider_error', lent: true };
    }
    if (!res.ok) {
      console.error(`[ai] fournisseur : HTTP ${res.status}`);
      try { await res.body?.cancel(); } catch { /* corps déjà lu ou fermé */ }
      return { ok: false, reason: 'provider_error', lent: res.status === 408 || res.status === 429 || res.status === 404 || res.status >= 500 };
    }
    try {
      return { ok: true, body: await res.json() };
    } catch {
      return ctl.signal.aborted ? { ok: false, reason: 'provider_error', lent: true } : { ok: false, reason: 'bad_response', lent: false };
    }
  } finally {
    clearTimeout(timer);
  }
}
