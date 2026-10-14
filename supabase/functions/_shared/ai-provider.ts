// Fournisseur d'IA — UN SEUL endroit à changer pour passer de Gemini à Claude (ou l'inverse).
//
// LOT 6 (couche IA v2) — UN SEUL RÉGLAGE, DES CLÉS PAR FOURNISSEUR (secrets de la fonction Edge) :
//   AI_CONFIG          JSON : la formule (essai | payant), le modèle de chaque niveau
//                      (« fournisseur:modèle »), les plafonds du jour pour tout le
//                      projet. Fournisseurs : « gemini » et « anthropic » (Claude), mélange permis
//                      d'un niveau à l'autre. Exemple (copier-coller, les 4 champs sont facultatifs) :
//                      {"formule":"essai","rapide":"gemini:gemini-3.5-flash-lite",
//                       "documents":"gemini:gemini-3.8-flash","secours":"gemini:gemini-3.1-flash-lite",
//                       "plafonds":{"rapide":400,"documents":15}}
//                      Claude Sonnet 5.5 partout, Gemini en secours (docs/ia-v2.md) :
//                      {"formule":"payant","rapide":"anthropic:claude-sonnet-5-5",
//                       "documents":"anthropic:claude-sonnet-5-5","secours":"gemini:gemini-3.1-flash-lite"}
//                      Absent ou invalide → les réglages par défaut ci-dessous, TOUS sur Gemini (et une
//                      ligne dans les logs, sans le contenu). Jamais d'erreur.
//   AI_API_KEY         clé de Gemini. Absente → l'ancienne GEMINI_API_KEY.
//   ANTHROPIC_API_KEY  clé de Claude (fournisseur « anthropic »).
//   Une clé absente pour le fournisseur d'un niveau = ce niveau n'est pas configuré : le secours prend le relais
//   si SON fournisseur a une clé (comme après une panne) ; sans aucune clé utile : « l'IA n'est pas configurée ».
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
// Jamais de modèle Pro chez Gemini (refusé ici même, et par un test) ; chez Claude, liste blanche stricte
// (claude-sonnet-5-5, claude-sonnet-5, claude-haiku-5-5) : ni Opus, ni Fable, ni Mythos, ni identifiant daté.
//
// GEMINI 3.x : pas de temperature / top_p / top_k (retirés de l'API). La
// réflexion se règle par thinkingConfig.thinkingLevel, JAMAIS avec thinkingBudget
// (erreur 400). « minimal » n'existe pas sur gemini-3.8-flash : « low ».
// CLAUDE (ai-anthropic.ts) : pas de temperature / top_p / top_k ni de budget de réflexion ; la réflexion se
// règle par output_config.effort (« low » rapide, « medium » documents et profil long) ; pas de tool_choice forcé.
//
// CONFIDENTIALITÉ : ce module ne journalise JAMAIS le contenu envoyé ni la
// réponse. En cas d'erreur, seul le code HTTP sort dans les logs.
import { appelClaude, corpsJson, corpsOutils, effortDe, lireReponseClaude, refusModeleAnthropic, type Fournisseur } from './ai-anthropic.ts';
export type { Fournisseur } from './ai-anthropic.ts';

type Env = { get(key: string): string | undefined };

export type Tier = 'rapide' | 'documents';
type Slot = Tier | 'secours';
export type FormuleNom = 'essai' | 'payant';
export interface Modele {
  fournisseur: Fournisseur; model: string;
  /** Niveau de réflexion du niveau : thinkingLevel chez Gemini ; chez Claude, converti en output_config.effort (effortDe). */
  reflexion: 'minimal' | 'low' | 'medium' | 'high';
}
export interface AiConfig {
  formule: FormuleNom;
  rapide: Modele; documents: Modele; secours: Modele;
  /**
   * Plafond de demandes par jour pour TOUT le projet (le gratuit de Gemini est
   * compté par projet, pas par entreprise). null = pas de plafond global.
   */
  plafonds: Record<Tier, number> | null;
}

// Noms vérifiés le 12/10/2026 dans la documentation de Google : à revoir chaque mois.
export const MODELES_PAR_DEFAUT: Record<Slot, string> = {
  rapide: 'gemini-3.5-flash-lite',
  documents: 'gemini-3.8-flash',
  secours: 'gemini-3.1-flash-lite',
};
// Niveau de réflexion de chaque modèle : « minimal » n'existe pas sur 3.8 Flash.
const REFLEXION: Record<Slot, Modele['reflexion']> = { rapide: 'minimal', documents: 'low', secours: 'minimal' };
// Claude : « low » pour les questions et les ordres (le défaut « high » est trop lent pour un chat), « medium » pour lire un document.
const REFLEXION_CLAUDE: Record<Slot, Modele['reflexion']> = { rapide: 'low', documents: 'medium', secours: 'low' };
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
 * Temps laissé au premier appel, et temps total d'une demande, secours compris (ms) — réglés pour GEMINI.
 * Documents : 12 s puis le secours, 25 s au plus (gemini-3.8-flash dépassait presque toujours 25 s : voir docs/ia-v2.md).
 * Le fournisseur du niveau choisit sa table (delaisDe) : celles de Claude sont plus bas.
 */
export const DELAIS: Record<Tier, { premier: number; total: number }> = {
  rapide: { premier: 5000, total: 8000 },
  documents: { premier: 12000, total: 25000 },
};
/**
 * Claude (Sonnet 5.5 en « effort » bas/moyen) : POINTS DE DÉPART à régler avec l'évaluation réelle (assistant-eval, aiConfig).
 * Le total reste borné : la fonction Edge a une limite d'exécution et la base est lue avant l'appel.
 */
export const DELAIS_ANTHROPIC: Record<Tier, { premier: number; total: number }> = {
  rapide: { premier: 9000, total: 14000 },
  documents: { premier: 20000, total: 35000 },
};
/** Plafond d'appels de fonction acceptés pour UNE demande (salarié, phrases à plusieurs actions). */
export const MAX_APPELS = 4;
/**
 * Phrases longues, plusieurs actions, turc (salarié) : réflexion « medium » (mesurée 11/11 contre 4/11 en
 * « minimal ») et fenêtres plus larges (médiane 3,5 s, maximum 13 s mesuré). Constantes, PAS de la configuration :
 * ni AI_CONFIG ni le palier de quota ne changent (une demande = une unité de « rapide »). Secours en « low ».
 */
export const PROFIL_LONG = { reflexion: 'medium' as const, reflexionSecours: 'low' as const, delais: { premier: 14_000, total: 22_000 } };
/** Profil long chez Claude (effort « medium », secours « low ») : fenêtres de départ, à régler avec l'évaluation réelle. */
export const PROFIL_LONG_ANTHROPIC = { delais: { premier: 18_000, total: 28_000 } };
const delaisDe = (f: Fournisseur, tier: Tier, long: boolean) =>
  long ? (f === 'anthropic' ? PROFIL_LONG_ANTHROPIC.delais : PROFIL_LONG.delais) : (f === 'anthropic' ? DELAIS_ANTHROPIC[tier] : DELAIS[tier]);

/** Combien de temps un modèle lent ou indisponible est mis de côté (ms) ; 0 = jamais. Seulement « documents » : le modèle rapide ne l'est pas. */
export const REPOS_MS: Record<Tier, number> = { rapide: 0, documents: 10 * 60_000 };

/** Jamais de Pro, quel que soit le réglage (règle d'Ergun). */
export const isProModel = (model: string) => /(^|[-_.])pro($|[-_.])/i.test(model);

const FOURNISSEURS: readonly Fournisseur[] = ['gemini', 'anthropic'];
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
  if (Object.keys(o).some((k) => k !== 'formule' && k !== 'plafonds' && !(SLOTS as string[]).includes(k))) return 'champ inconnu';
  const f = o.formule === undefined ? 'essai' : typeof o.formule === 'string' ? o.formule.trim().toLowerCase() : '';
  if (f !== 'essai' && f !== 'payant') return 'formule inconnue';
  const cfg = defauts(f);
  for (const s of SLOTS) {
    const v = o[s];
    if (v === undefined) continue;
    const m = typeof v === 'string' ? /^([a-z]+):([a-z0-9][a-z0-9.-]{2,59})$/.exec(v.trim().toLowerCase()) : null;
    if (!m) return `modèle « ${s} » refusé (fournisseur:modèle attendu)`;
    if (!(FOURNISSEURS as readonly string[]).includes(m[1])) return `modèle « ${s} » refusé (fournisseur inconnu)`;
    const f = m[1] as Fournisseur;
    if (f === 'gemini' && isProModel(m[2])) return `modèle « ${s} » refusé (Pro)`;
    const refus = f === 'anthropic' ? refusModeleAnthropic(m[2]) : null;
    if (refus) return `modèle « ${s} » refusé (Claude : ${refus})`;
    cfg[s] = { fournisseur: f, model: m[2], reflexion: (f === 'anthropic' ? REFLEXION_CLAUDE : REFLEXION)[s] };
  }
  if (o.plafonds !== undefined) {
    const p = o.plafonds as Record<string, unknown> | null;
    const bon = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= PLAFOND_MAX;
    if (!p || typeof p !== 'object' || Object.keys(p).some((k) => k !== 'rapide' && k !== 'documents') || !bon(p.rapide) || !bon(p.documents)) return 'plafonds invalides';
    cfg.plafonds = { rapide: p.rapide as number, documents: p.documents as number };
  }
  return cfg;
}

/**
 * Lit un AI_CONFIG avec LA MÊME fonction que la production. Sert à l'évaluation (assistant-eval, champ aiConfig), qui doit
 * refuser un réglage invalide au lieu de retomber sur le défaut sans le dire. La raison n'est jamais le contenu.
 */
export function lireAiConfig(raw: string): { ok: true; config: AiConfig } | { ok: false; raison: string } {
  const r = lire(raw.trim());
  return typeof r === 'string' ? { ok: false, raison: r } : { ok: true, config: r };
}
/** « fournisseur:modèle » d'un niveau, tel qu'on l'écrit dans AI_CONFIG. */
export const libelleModele = (m: Modele): string => `${m.fournisseur}:${m.model}`;
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
/** La formule renvoyée avec chaque réponse (lue par le support BEMEXO, jamais affichée aux patrons ni aux salariés) : l'écran ne la devine jamais. */
export const formuleNom = (env: Env): FormuleNom => readConfig(env).formule;
/** Plafond du jour pour tout le projet ; null = pas de plafond. */
export const plafondProjet = (env: Env, tier: Tier): number | null => readConfig(env).plafonds?.[tier] ?? null;
/** La clé de GEMINI : AI_API_KEY, sinon l'ancienne GEMINI_API_KEY. */
export const aiKey = (env: Env): string | undefined => env.get('AI_API_KEY') || env.get('GEMINI_API_KEY') || undefined;
/** La clé d'un fournisseur : « gemini » → aiKey ; « anthropic » → ANTHROPIC_API_KEY. */
export const cleDe = (env: Env, f: Fournisseur): string | undefined => (f === 'anthropic' ? env.get('ANTHROPIC_API_KEY') || undefined : aiKey(env));
/**
 * « L'IA est-elle configurée pour ce niveau ? » : le fournisseur du niveau OU celui du secours a sa clé (le secours prend
 * le relais d'un niveau sans clé). Remplace `!!aiKey(env)` dans les fonctions Edge ; les messages affichés ne changent pas.
 */
export function aiDisponible(env: Env, tier: Tier): boolean {
  const cfg = readConfig(env);
  return !!cleDe(env, cfg[tier].fournisseur) || !!cleDe(env, cfg.secours.fournisseur);
}
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
// (Gemini : mode ANY ; Claude : tool_choice « auto » + consigne, le mode forcé est refusé par Sonnet 5.5) :
// répondre, guider, ou PRÉPARER une action. Il n'exécute jamais
// rien : c'est l'écran qui exécute, après confirmation de l'utilisateur.
export interface FunctionDecl { name: string; description: string; parameters: Record<string, unknown> }
export interface ToolsRequest {
  prompt: string; functions: FunctionDecl[]; file?: AiFile;
  /** Modèle à utiliser ; par défaut « documents » s'il y a un fichier, « rapide » sinon. */
  tier?: Tier;
  /** Appels de fonction acceptés pour cette demande (défaut 1 ; plafond MAX_APPELS). */
  maxCalls?: number;
  /** 'long' : réflexion « medium » et fenêtres 14 s / 22 s (PROFIL_LONG). Sans effet sur le quota. */
  profil?: 'long';
}
export interface FunctionCall { name: string; args: Record<string, unknown> }
export type ToolsResult =
  | { ok: true; call: FunctionCall;
      /** Tous les appels, dans l'ordre (≤ maxCalls) ; calls[0] === call. Absent si maxCalls ≤ 1. */ calls?: FunctionCall[];
      /** Appels valides au-delà du plafond, écartés : l'appelant le dit (jamais de perte silencieuse). Absent si 0. */ rognes?: number;
      /** Choisi par le modèle de secours (plus léger). */ secours?: true }
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

/** UN appel à Claude (adaptateur : ai-anthropic.ts), avec les mêmes garanties que geminiCall : un appel, plafond de temps, jamais de contenu dans les logs. */
async function claudeCall(m: Modele, key: string, corps: Record<string, unknown>, timeoutMs: number, fetchImpl: FetchLike): Promise<Brut> {
  const r = await appelClaude(m.model, key, corps, timeoutMs, fetchImpl);
  if (r.ok) return r;
  const echec: Echec = { ok: false, reason: r.reason };
  return r.lent ? lent(echec) : echec;
}

// Modèles mis de côté (lents ou indisponibles) : « fournisseur:modèle » → jusqu'à quand (ms). Propre à l'isolat, sans base ni secret.
const auRepos = new Map<string, number>();
let maintenant: () => number = Date.now;
/** Pour les tests : vide les modèles mis de côté et (re)donne l'horloge utilisée pour ce repos. */
export function reposReinit(horloge: () => number = Date.now): void { auRepos.clear(); maintenant = horloge; }

// Qui a réellement répondu (secours compris), noté à part du résultat pour ne rien ajouter à sa forme. Lu par l'évaluation.
const servis = new WeakMap<object, string>();
/** « fournisseur:modèle » du modèle qui a produit ce résultat (undefined si échec) : on ne confond jamais Claude et son secours. */
export const modeleServi = (r: object): string | undefined => servis.get(r);
const marquer = <T extends object>(r: T, m: Modele): T => { servis.set(r, libelleModele(m)); return r; };

/**
 * Le modèle du niveau demandé, puis — seulement s'il a échoué (erreur du
 * fournisseur, injoignable, délai dépassé) — le modèle de secours. Une réponse
 * illisible n'est pas une panne : pas de second appel.
 * Un modèle lent ou indisponible est mis de côté REPOS_MS[niveau] : tant que ça dure,
 * la demande va tout de suite au secours (et au modèle de côté en dernier recours,
 * si le secours échoue aussi). Une réponse du secours porte `secours: true`.
 * Le niveau dont le fournisseur n'a PAS de clé est sauté comme s'il était en panne, si le secours a SA clé
 * (`cle` dit quel fournisseur a une clé) ; les délais sont ceux du fournisseur qui répond en premier.
 */
interface OptsSecours { long?: boolean; reflexion?: Modele['reflexion']; reflexionSecours?: Modele['reflexion'] }
async function avecSecours<T extends { ok: boolean; reason?: string }>(
  cfg: AiConfig, tier: Tier, run: (m: Modele, timeoutMs: number) => Promise<T>, cle: (f: Fournisseur) => boolean, opts?: OptsSecours,
): Promise<T> {
  const m = opts?.reflexion ? { ...cfg[tier], reflexion: opts.reflexion } : cfg[tier];
  const id = libelleModele(m);
  const distinct = libelleModele(cfg.secours) !== id;
  const cleSecours = cle(cfg.secours.fournisseur);
  const sansCle = !cle(m.fournisseur);
  if (sansCle && (!distinct || !cleSecours)) return { ok: false, reason: 'not_configured' } as unknown as T;
  const d = delaisDe(sansCle ? cfg.secours.fournisseur : m.fournisseur, tier, !!opts?.long);
  const fin = Date.now() + d.total;
  const left = () => fin - Date.now();
  const deCote = !sansCle && distinct && cleSecours && REPOS_MS[tier] > 0 && (auRepos.get(id) ?? 0) > maintenant();
  if (sansCle) {
    console.error(`[ai] pas de clé pour le modèle ${tier} : modèle de secours`);
  } else if (deCote) {
    console.error(`[ai] modèle ${tier} au repos : modèle de secours`);
  } else {
    const r = await run(m, Math.min(d.premier, left()));
    if (r.ok) { auRepos.delete(id); return marquer(r, m); }
    if (r.reason !== 'provider_error' || !distinct || !cleSecours || left() < 1500) return r;
    if (lents.has(r) && REPOS_MS[tier] > 0) auRepos.set(id, maintenant() + REPOS_MS[tier]);
    console.error(`[ai] modèle ${tier} indisponible : modèle de secours`);
  }
  const s = await run(opts?.reflexionSecours ? { ...cfg.secours, reflexion: opts.reflexionSecours } : cfg.secours, left());
  if (s.ok) return marquer({ ...s, secours: true }, cfg.secours);
  // Mis de côté, et le secours échoue aussi : on retente le modèle de côté avec le temps qui reste.
  if (deCote && s.reason === 'provider_error' && left() >= 1500) {
    const r = await run(m, left());
    if (r.ok) { auRepos.delete(id); return marquer(r, m); }
    return r;
  }
  return s;
}

const parts = (prompt: string, file?: AiFile) => [{ text: prompt }, ...(file ? [{ inline_data: { mime_type: file.mime, data: file.base64 } }] : [])];

const asArgs = (a: unknown): Record<string, unknown> => (a && typeof a === 'object' && !Array.isArray(a) ? a as Record<string, unknown> : {});
/** Sérialisation à clés triées, objets imbriqués compris : deux appels identiques donnent la même chaîne (et deux journées différentes, jamais la même). */
const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v) ?? 'null');

/** Les appels de fonction rendus par le modèle (Gemini ou Claude, dans l'ordre) → le résultat, avec les MÊMES règles pour les deux. */
function choisirAppels(brutes: { name?: string; args?: unknown }[], allowed: Set<string>, max: number): ToolsResult {
  if (max === 1) {
    const fc = brutes[0];
    if (!fc?.name || !allowed.has(fc.name)) return { ok: false, reason: 'bad_response' };
    return { ok: true, call: { name: fc.name, args: asArgs(fc.args) } };
  }
  // Plusieurs appels : noms autorisés seulement ; les DOUBLONS EXACTS sont retirés AVANT le plafond
  // (un doublon ne doit pas prendre la place d'une vraie action). Les règles métier sont dans le tour.
  const vus = new Set<string>();
  const tous: FunctionCall[] = [];
  for (const fc of brutes) {
    if (!fc?.name || !allowed.has(fc.name)) continue;
    const args = asArgs(fc.args);
    const k = `${fc.name}|${stable(args)}`;
    if (!vus.has(k)) { vus.add(k); tous.push({ name: fc.name, args }); }
  }
  if (!tous.length) return { ok: false, reason: 'bad_response' };
  const calls = tous.slice(0, max);
  const rognes = tous.length - calls.length;
  return { ok: true, call: calls[0], calls, ...(rognes ? { rognes } : {}) };
}

const sansConfig: Echec = { ok: false, reason: 'not_configured' };
const cleOk = (env: Env) => (f: Fournisseur) => !!cleDe(env, f);

export async function callFunction(req: ToolsRequest, env: Env, fetchImpl: FetchLike = fetch): Promise<ToolsResult> {
  const tier = req.tier ?? tierFor(!!req.file);
  if (!aiDisponible(env, tier)) return sansConfig;
  const allowed = new Set(req.functions.map((x) => x.name));
  const max = Math.min(Math.max(1, Math.floor(req.maxCalls ?? 1)), MAX_APPELS);
  const payload = {
    contents: [{ role: 'user', parts: parts(req.prompt, req.file) }],
    tools: [{ functionDeclarations: req.functions }],
    toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [...allowed] } },
  };
  const opts: OptsSecours | undefined = req.profil === 'long'
    ? { long: true, reflexion: PROFIL_LONG.reflexion, reflexionSecours: PROFIL_LONG.reflexionSecours } : undefined;
  return avecSecours(readConfig(env), tier, async (m, ms): Promise<ToolsResult> => {
    const key = cleDe(env, m.fournisseur);
    if (!key) return sansConfig;
    if (m.fournisseur === 'anthropic') {
      const corps = corpsOutils({ model: m.model, effort: effortDe(m.reflexion), prompt: req.prompt, functions: req.functions, file: req.file, maxCalls: max });
      // Format que Claude ne lit pas (HEIC, HEIF, image trop lourde) : rien n'est envoyé, le niveau échoue vers le secours.
      if (!corps) { console.error('[ai] fichier non lisible par ce modèle : secours'); return { ok: false, reason: 'provider_error' }; }
      const r = await claudeCall(m, key, corps, ms, fetchImpl);
      if (!r.ok) return r;
      const l = lireReponseClaude(r.body);
      if (l.kind === 'refus') { console.error('[ai] réponse refusée par le modèle'); return { ok: false, reason: 'provider_error' }; }
      if (l.kind !== 'ok') return { ok: false, reason: 'bad_response' };
      return choisirAppels(l.appels, allowed, max);
    }
    const r = await geminiCall(m, key, payload, ms, fetchImpl);
    if (!r.ok) return r;
    const body = r.body as { candidates?: { content?: { parts?: { functionCall?: { name?: string; args?: unknown } }[] } }[] };
    const ps = body?.candidates?.[0]?.content?.parts ?? [];
    return choisirAppels(ps.flatMap((p) => (p.functionCall ? [p.functionCall] : [])), allowed, max);
  }, cleOk(env), opts);
}

/** Produit un objet JSON selon une consigne et un schéma, à partir d'un document s'il y en a un. */
export async function extractJson(req: ExtractRequest, env: Env, fetchImpl: FetchLike = fetch): Promise<AiResult> {
  const tier = req.tier ?? tierFor(!!req.file);
  if (!aiDisponible(env, tier)) return sansConfig;
  const payload = {
    contents: [{ role: 'user', parts: parts(req.prompt, req.file) }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: req.schema },
  };
  return avecSecours(readConfig(env), tier, async (m, ms): Promise<AiResult> => {
    const key = cleDe(env, m.fournisseur);
    if (!key) return sansConfig;
    if (m.fournisseur === 'anthropic') {
      // Sortie structurée de l'API (output_config.format) : le texte rendu est un JSON conforme au schéma.
      const corps = corpsJson({ model: m.model, effort: effortDe(m.reflexion), prompt: req.prompt, schema: req.schema, file: req.file });
      if (!corps) { console.error('[ai] fichier non lisible par ce modèle : secours'); return { ok: false, reason: 'provider_error' }; }
      const r = await claudeCall(m, key, corps, ms, fetchImpl);
      if (!r.ok) return r;
      const l = lireReponseClaude(r.body);
      if (l.kind === 'refus') { console.error('[ai] réponse refusée par le modèle'); return { ok: false, reason: 'provider_error' }; }
      if (l.kind !== 'ok') return { ok: false, reason: 'bad_response' };
      try { return { ok: true, data: JSON.parse(l.texte) }; } catch { return { ok: false, reason: 'bad_response' }; }
    }
    const r = await geminiCall(m, key, payload, ms, fetchImpl);
    if (!r.ok) return r;
    try {
      const body = r.body as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      return { ok: true, data: JSON.parse(text) };
    } catch {
      return { ok: false, reason: 'bad_response' };
    }
  }, cleOk(env));
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
