'use client';

// Fiche salarié → bloc « Coût réel » (admin uniquement, si `ai_enabled`).
//
// Déposer un bulletin → l'IA lit 4 chiffres → l'admin les vérifie → « Valider ».
// RIEN n'est enregistré avant ce clic, et le fichier n'est jamais conservé.

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileUp, Keyboard, Loader2, Trash2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import {
  demoCostSource, isCostDemo, supabaseCostSource, useAiEnabled,
  parseAmount, realHourlyCost, slipHourlyCost, validateFigures,
  type CostSource, type LeaveFund, type PayslipFigures, type Slip,
} from '@/lib/real-cost';

const eur = (n: number, d = 2) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: d, maximumFractionDigits: d });
const num = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
};

type Draft = { month: string; gross: string; employer_total: string; paid_hours: string };
const EMPTY: Draft = { month: '', gross: '', employer_total: '', paid_hours: '' };
const toDraft = (f: PayslipFigures): Draft => ({
  month: f.month ?? '', gross: f.gross != null ? String(f.gross).replace('.', ',') : '',
  employer_total: f.employer_total != null ? String(f.employer_total).replace('.', ',') : '',
  paid_hours: f.paid_hours != null ? String(f.paid_hours).replace('.', ',') : '',
});
const fromDraft = (d: Draft): PayslipFigures => ({
  month: /^\d{4}-\d{2}$/.test(d.month) ? d.month : null,
  gross: parseAmount(d.gross), employer_total: parseAmount(d.employer_total), paid_hours: parseAmount(d.paid_hours),
});

interface Props { source: CostSource; companyId: string; userId: string; firstName?: string; onChanged?: () => void }

export default function RealCostCard({ source, companyId, userId, firstName, onChanged }: Props) {
  const [slips, setSlips] = useState<Slip[] | null>(null);
  const [fund, setFund] = useState<LeaveFund>({ enabled: false, rate: 20.7 });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftSource, setDraftSource] = useState<'ai' | 'manual'>('manual');
  const [doubts, setDoubts] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [s, f] = await Promise.all([source.slips(companyId, userId), source.fund(companyId)]);
    setSlips(s); setFund(f);
  }, [source, companyId, userId]);
  useEffect(() => { load(); }, [load]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Fichier trop lourd (10 Mo maximum).'); return; }
    setReading(true); setNotice(null); setDoubts([]);
    const r = await source.read(file);
    setReading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (r.ok) {
      setDraft(toDraft(r.figures)); setDraftSource('ai'); setDoubts(r.doubts);
      const missing = (Object.keys(r.figures) as (keyof PayslipFigures)[]).filter((k) => r.figures[k] == null);
      if (missing.length) setNotice('Certains chiffres n’ont pas pu être lus avec certitude : complétez les champs vides.');
    } else {
      setDraft(EMPTY); setDraftSource('manual'); setNotice(r.message);
    }
  };

  const validate = async () => {
    if (!draft) return;
    const f = fromDraft(draft);
    const problem = validateFigures(f);
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    const err = await source.save(companyId, userId, f, draftSource);
    setSaving(false);
    if (err) { toast.error(err); return; }
    toast.success('Bulletin validé');
    setDraft(null); setNotice(null); setDoubts([]);
    load(); onChanged?.();
  };

  const remove = async (id: string) => {
    const err = await source.remove(id);
    if (err) toast.error(err); else { load(); onChanged?.(); }
  };

  const result = slips ? realHourlyCost(slips, fund) : null;
  const field = (k: keyof Draft, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        {label}{doubts.includes(k) && <span className="text-amber-700 font-semibold">· à vérifier</span>}
      </span>
      <input
        {...props}
        value={draft?.[k] ?? ''}
        onChange={(e) => setDraft((d) => (d ? { ...d, [k]: e.target.value } : d))}
        className={`w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20 ${
          doubts.includes(k) || (draft && !draft[k]) ? 'border-amber-400 bg-amber-50' : ''}`}
      />
    </label>
  );

  return (
    <div className="rounded-lg border p-3 space-y-3" data-testid="real-cost">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Coût réel</p>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Visible par le bureau uniquement</span>
      </div>

      {slips === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : result ? (
        <div>
          <p className="text-3xl font-extrabold tracking-tight">{eur(result.hourly)}<span className="text-base font-semibold text-muted-foreground"> / heure</span></p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Moyenne de {result.count} bulletin{result.count > 1 ? 's' : ''}
            {fund.enabled ? ` · caisse congés BTP ${num(fund.rate)} % incluse` : ''}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Déposez un bulletin{firstName ? ` de ${firstName}` : ''} pour connaître son vrai coût horaire.</p>
      )}

      {slips && slips.length > 0 && !draft && (
        <ul className="divide-y rounded-md border text-sm">
          {slips.slice(0, 6).map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-3 py-2">
              <span className="font-medium capitalize w-32 shrink-0">{monthLabel(s.month)}</span>
              <span className="flex-1 text-muted-foreground text-xs">
                {eur(s.employer_total)} employeur · {num(s.paid_hours)} h
              </span>
              <span className="font-semibold tabular-nums">{eur(slipHourlyCost(s, fund))}/h</span>
              <button type="button" onClick={() => remove(s.id)} className="p-1 text-muted-foreground hover:text-red-600" aria-label="Supprimer ce bulletin">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {reading ? (
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-3 text-sm font-medium">
          <Loader2 className="h-4 w-4 animate-spin" /> Lecture du bulletin…
        </div>
      ) : draft ? (
        <div className="rounded-md border bg-muted/20 p-3 space-y-3">
          <p className="text-sm font-semibold">{draftSource === 'ai' ? 'Vérifiez les chiffres lus' : 'Saisie des chiffres du bulletin'}</p>
          {notice && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {notice}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('month', 'Mois du bulletin', { type: 'month' })}
            {field('paid_hours', 'Heures payées', { inputMode: 'decimal', placeholder: 'ex. 151,67' })}
            {field('gross', 'Salaire brut (€)', { inputMode: 'decimal', placeholder: 'ex. 2 450,00' })}
            {field('employer_total', 'Total versé par l’employeur (€)', { inputMode: 'decimal', placeholder: 'ex. 3 528,40' })}
          </div>
          <p className="text-[11px] text-muted-foreground">Le bulletin n’est pas conservé : seuls ces 4 chiffres le seront, après validation.</p>
          <div className="flex gap-2">
            <button type="button" onClick={validate} disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Valider
            </button>
            <button type="button" onClick={() => { setDraft(null); setNotice(null); setDoubts([]); }}
              className="rounded-md border px-4 py-2 text-sm font-medium">Annuler</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background">
            <FileUp className="h-4 w-4" /> Déposer un bulletin
          </button>
          <button type="button" onClick={() => { setDraft(EMPTY); setDraftSource('manual'); setNotice(null); setDoubts([]); }}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium">
            <Keyboard className="h-4 w-4" /> Saisir à la main
          </button>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])} data-testid="payslip-file" />
        </div>
      )}
    </div>
  );
}

/**
 * Le bloc tel qu'il s'insère dans la fiche salarié : rien du tout tant que
 * l'entreprise n'a pas `ai_enabled`, ou si la personne connectée n'est pas admin.
 */
export function RealCostSection({ companyId, userId, firstName }: { companyId: string; userId: string; firstName?: string }) {
  const { user } = useAuth();
  const ai = useAiEnabled(companyId);
  const [source] = useState<CostSource>(() => (isCostDemo() ? demoCostSource() : supabaseCostSource));
  if (!ai || (!source.demo && user?.role !== 'admin')) return null;
  return <RealCostCard source={source} companyId={companyId} userId={userId} firstName={firstName} />;
}

/** Ligne « Coût réel des heures » d'un chantier (heures pointées × coût réel de chaque salarié). */
export function RealCostLine({ cost, unpricedUsers, scope }: { cost: number; unpricedUsers: number; scope?: string }) {
  return (
    <div className="bt-cr-real" data-testid="real-cost-line">
      <span>Coût réel des heures{scope ? ` · ${scope}` : ''}</span>
      <b>{eur(cost, 0)}</b>
      {unpricedUsers > 0 && <span className="bt-cr-real-miss">{unpricedUsers} salarié{unpricedUsers > 1 ? 's' : ''} sans bulletin</span>}
    </div>
  );
}

/** Styles de la ligne, à placer une fois dans l'écran qui l'affiche. */
export const REAL_COST_CSS = `
.bt-cr-real{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0 0;padding:7px 10px;border-radius:9px;background:#EEF6F0;border:1px solid #CFE6D6;font-size:12.5px;font-weight:600;color:#1f5130}
.bt-cr-real b{font-weight:900;color:#0F3D20}
.bt-cr-real-miss{font-size:11.5px;font-weight:700;color:#8a5a00;background:#FFF3D6;border-radius:99px;padding:2px 8px}
`;
