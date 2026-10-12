// Coût réel d'un salarié — côté navigateur.
//
// Deux sources interchangeables derrière la même interface :
//   - `supabaseCostSource` : la vraie base (tables protégées par la RLS : seul
//     l'admin de l'entreprise lit et écrit) ;
//   - `demoCostSource()` : des chiffres fictifs en mémoire, pour le mode démo
//     des préviews. Aucune requête ne part.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isPreviewHost } from '@/lib/hosting';
import {
  BTP_LEAVE_DEFAULT_RATE, DEMO_FIGURES, realHourlyCost, type LeaveFund, type PayslipFigures,
} from '@/supabase/functions/_shared/payslip-core';

export * from '@/supabase/functions/_shared/payslip-core';

export interface Slip { id: string; user_id: string; month: string; gross: number; employer_total: number; paid_hours: number; source: 'ai' | 'manual' }
export type ReadResult =
  | { ok: true; figures: PayslipFigures; doubts: (keyof PayslipFigures)[] }
  | { ok: false; message: string };

export interface CostSource {
  demo: boolean;
  slips(companyId: string, userId?: string): Promise<Slip[]>;
  fund(companyId: string): Promise<LeaveFund>;
  saveFund(companyId: string, fund: LeaveFund): Promise<string | null>;
  save(companyId: string, userId: string, f: PayslipFigures, source: 'ai' | 'manual'): Promise<string | null>;
  remove(id: string): Promise<string | null>;
  read(file: File): Promise<ReadResult>;
}

const UNAVAILABLE = 'Lecture automatique indisponible, saisissez les chiffres.';
const monthToDate = (m: string) => `${m}-01`;
const dateToMonth = (d: string) => d.slice(0, 7);

/** Le mode démo n'existe QUE sur une preview (`?demo=cout`), jamais sur bemexo.com. */
export function isCostDemo(): boolean {
  if (typeof window === 'undefined' || !isPreviewHost()) return false;
  return new URLSearchParams(window.location.search).get('demo') === 'cout';
}

/**
 * `companies.ai_enabled`, lu À PART : tant que la colonne n'existe pas
 * (migration pas encore appliquée), la requête échoue seule et la réponse est
 * « non » — les écrans existants ne voient rien.
 */
export function useAiEnabled(companyId: string | null | undefined): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (isCostDemo()) { setOn(true); return; }
    if (!companyId) { setOn(false); return; }
    let stale = false;
    supabase.from('companies').select('ai_enabled').eq('id', companyId).maybeSingle()
      .then(({ data, error }) => { if (!stale) setOn(!error && !!(data as { ai_enabled?: boolean } | null)?.ai_enabled); });
    return () => { stale = true; };
  }, [companyId]);
  return on;
}

/** Coût horaire réel par salarié (moyenne des 3 derniers bulletins, congés BTP compris). */
export function ratesByUser(slips: Slip[], fund: LeaveFund): Map<string, number> {
  const byUser = new Map<string, Slip[]>();
  for (const s of slips) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);
  const out = new Map<string, number>();
  byUser.forEach((list, uid) => {
    const r = realHourlyCost(list, fund);
    if (r) out.set(uid, r.hourly);
  });
  return out;
}

/** Réduit une photo (≤ 2000 px, JPEG) : lecture plus rapide, envoi plus léger. Les PDF passent tels quels. */
async function toPayload(file: File): Promise<{ mime: string; base64: string }> {
  if (file.type.startsWith('image/') && !/heic|heif/i.test(file.type)) {
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.85);
      return { mime: 'image/jpeg', base64: url.slice(url.indexOf(',') + 1) };
    } catch { /* on envoie l'original */ }
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...Array.from(buf.subarray(i, i + 0x8000)));
  return { mime: file.type || 'application/pdf', base64: btoa(bin) };
}

export const supabaseCostSource: CostSource = {
  demo: false,
  async slips(companyId, userId) {
    let q = supabase.from('payslip_figures')
      .select('id, user_id, month, gross, employer_total, paid_hours, source')
      .eq('company_id', companyId).order('month', { ascending: false });
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q;
    if (error) return [];
    return ((data || []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), user_id: String(r.user_id), month: dateToMonth(String(r.month)),
      gross: Number(r.gross), employer_total: Number(r.employer_total), paid_hours: Number(r.paid_hours),
      source: r.source === 'ai' ? 'ai' : 'manual',
    }));
  },
  async fund(companyId) {
    const { data } = await supabase.from('company_cost_settings')
      .select('btp_leave_enabled, btp_leave_rate').eq('company_id', companyId).maybeSingle();
    const d = data as { btp_leave_enabled?: boolean; btp_leave_rate?: number } | null;
    return { enabled: !!d?.btp_leave_enabled, rate: d?.btp_leave_rate != null ? Number(d.btp_leave_rate) : BTP_LEAVE_DEFAULT_RATE };
  },
  async saveFund(companyId, fund) {
    const { error } = await supabase.from('company_cost_settings').upsert({
      company_id: companyId, btp_leave_enabled: fund.enabled, btp_leave_rate: fund.rate, updated_at: new Date().toISOString(),
    });
    return error ? (error.message || 'Enregistrement impossible.') : null;
  },
  async save(companyId, userId, f, source) {
    const { data: me } = await supabase.auth.getUser();
    const { error } = await supabase.from('payslip_figures').upsert({
      company_id: companyId, user_id: userId, month: monthToDate(f.month!), gross: f.gross,
      employer_total: f.employer_total, paid_hours: f.paid_hours, source,
      created_by: me?.user?.id ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,month' });
    return error ? (error.message || 'Enregistrement impossible.') : null;
  },
  async remove(id) {
    const { error } = await supabase.from('payslip_figures').delete().eq('id', id);
    return error ? (error.message || 'Suppression impossible.') : null;
  },
  async read(file) {
    try {
      const payload = await toPayload(file);
      const { data, error } = await supabase.functions.invoke('payslip-read', { body: { file_base64: payload.base64, mime: payload.mime } });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => ({})) : {};
        return { ok: false, message: (body as { error?: string }).error || UNAVAILABLE };
      }
      const d = data as { available?: boolean; message?: string; figures?: PayslipFigures; doubts?: (keyof PayslipFigures)[] };
      if (!d?.available || !d.figures) return { ok: false, message: d?.message || UNAVAILABLE };
      return { ok: true, figures: d.figures, doubts: d.doubts || [] };
    } catch {
      return { ok: false, message: UNAVAILABLE };
    }
  },
};

/** Faux bulletins pour les préviews (mémoire seulement). */
export function demoCostSource(): CostSource {
  let slips: Slip[] = [
    { id: 'd1', user_id: 'demo-karim', month: '2026-07', gross: 2450, employer_total: 3510.2, paid_hours: 151.67, source: 'ai' },
    { id: 'd2', user_id: 'demo-karim', month: '2026-06', gross: 2450, employer_total: 3502.8, paid_hours: 151.67, source: 'manual' },
    { id: 'd3', user_id: 'demo-sofia', month: '2026-07', gross: 2150, employer_total: 3080, paid_hours: 151.67, source: 'ai' },
  ];
  let fund: LeaveFund = { enabled: true, rate: BTP_LEAVE_DEFAULT_RATE };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return {
    demo: true,
    async slips(_c, userId) { return slips.filter((s) => !userId || s.user_id === userId).sort((a, b) => b.month.localeCompare(a.month)); },
    async fund() { return fund; },
    async saveFund(_c, f) { fund = f; return null; },
    async save(_c, userId, f, source) {
      slips = slips.filter((s) => !(s.user_id === userId && s.month === f.month));
      slips.push({ id: `d${Date.now()}`, user_id: userId, month: f.month!, gross: f.gross!, employer_total: f.employer_total!, paid_hours: f.paid_hours!, source });
      return null;
    },
    async remove(id) { slips = slips.filter((s) => s.id !== id); return null; },
    async read() { await wait(900); return { ok: true, figures: { ...DEMO_FIGURES }, doubts: [] }; },
  };
}
