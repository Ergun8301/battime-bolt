// Lot 6 (couche IA v2) — QUI APPELLE, en UN aller-retour, avec le JETON DE LA
// PERSONNE : la fonction SQL public.assistant_context (migration
// 20261012090000_lot6_couche_ia_v2.sql) rend son identité, son entreprise,
// ai_enabled, consomme son quota de façon atomique et, si un plafond est réglé
// (AI_CONFIG), avance le compteur global du projet.
//
// Plus AUCUNE clé de service dans assistant, worker-assistant et payslip-read :
// tout ce qu'elles lisent ensuite passe par le client de la personne (sa RLS).
//
// Sans réseau ni base : le client est injecté, testable (assistant-context.test.ts).
import type { Tier } from './ai-provider.ts';

export type Side = 'bureau' | 'salarie' | 'bulletin';
export type ContextFail = 'non_connecte' | 'non_autorise' | 'ia_coupee' | 'quota' | 'pause' | 'indisponible';
export type AssistantContext =
  | { ok: true; userId: string; companyId: string; role: string; used: number | null; remaining: number | null }
  | { ok: false; raison: ContextFail; limite?: number };

/** Le strict nécessaire d'un client supabase-js : un appel de fonction SQL. */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

// Jeton absent, expiré ou refusé par PostgREST → « non connecté » (401).
const AUTH_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303', '42501']);

export async function loadAssistantContext(
  db: RpcClient, side: Side, opts: { limit: number; tier: Tier; globalLimit: number | null },
): Promise<AssistantContext> {
  let res: Awaited<ReturnType<RpcClient['rpc']>>;
  try {
    res = await db.rpc('assistant_context', { p_side: side, p_limit: opts.limit, p_tier: opts.tier, p_global_limit: opts.globalLimit });
  } catch {
    return { ok: false, raison: 'indisponible' };
  }
  if (res.error) {
    // Fonction absente (migration du lot 6 pas encore appliquée) ou autre panne :
    // l'assistant se dit indisponible, il ne retombe JAMAIS sur une clé de service.
    if (!AUTH_CODES.has(String(res.error.code ?? ''))) console.error(`[assistant] contexte : ${res.error.code ?? 'erreur'}`);
    return { ok: false, raison: AUTH_CODES.has(String(res.error.code ?? '')) ? 'non_connecte' : 'indisponible' };
  }
  const r = (res.data ?? {}) as { ok?: boolean; raison?: string; user_id?: string; company_id?: string; role?: string; used?: number | null; remaining?: number | null; limite?: number };
  if (r.ok === true && r.user_id && r.company_id) {
    return { ok: true, userId: r.user_id, companyId: r.company_id, role: String(r.role ?? ''), used: r.used ?? null, remaining: r.remaining ?? null };
  }
  switch (r.raison) {
    case 'non_connecte': return { ok: false, raison: 'non_connecte' };
    case 'ia_coupee': return { ok: false, raison: 'ia_coupee' };
    case 'quota': return { ok: false, raison: 'quota', limite: Number(r.limite ?? opts.limit) };
    case 'pause': return { ok: false, raison: 'pause' };
    case 'non_autorise': case 'cote_inconnu': return { ok: false, raison: 'non_autorise' };
    default: return { ok: false, raison: 'indisponible' };
  }
}
