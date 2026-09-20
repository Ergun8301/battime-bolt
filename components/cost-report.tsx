'use client';

// Rapport « Coût par chantier » — étape 13.
//
// CE QUI ÉTAIT FAUX AVANT
//
//   1. Le temps de route payé n'était nulle part. Depuis l'étape 7 le salarié
//      dit si le trou entre deux interventions était de la route ou une pause,
//      depuis l'étape 8 ces minutes partent en paie. Ici, on ne lisait que
//      `total_minutes` : l'heure de camion vers un chantier à 40 km était payée
//      au salarié et INVISIBLE dans le coût du chantier. Un chantier lointain
//      paraissait aussi rentable qu'un chantier au coin de la rue.
//
//   2. « Coût par chantier » ne parlait que de main d'œuvre — l'écran l'écrivait
//      lui-même, « hors matériaux et sous-traitance ». Le patron lisait donc un
//      chiffre dont il savait qu'il était faux.
//
// CE QUI CHANGE
//
//   Les heures et leur coût viennent maintenant d'une fonction SQL,
//   `my_worksite_labour`, appelée AUSSI par les alertes de budget. Une seule
//   règle de route, une seule règle de statut, un seul résultat : deux écrans ne
//   peuvent plus annoncer deux chiffres. (Le miroir TypeScript de cette règle,
//   `routeMinutesByEntry` dans lib/overtime.ts, sert encore à l'export de paie ;
//   l'égalité des deux a été vérifiée sur huit cas limites.)
//
//   Les dépenses du chantier — matériaux, sous-traitance, location, divers —
//   sont saisies ici et entrent dans le total.
//
// Les montants d'achat et les taux horaires sont des données du bureau : la
// fonction SQL et la table des dépenses sont fermées aux salariés.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, CalendarRange, ChevronDown, Building2, Plus, Trash2, Truck } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { weekStart, weekEnd } from '@/lib/week';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import type { DateRange } from 'react-day-picker';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; companyId?: string }

interface WorkerAgg { name: string; minutes: number; routeMinutes: number; cost: number; unpriced: number }
interface SiteAgg {
  id: string; name: string; city: string | null;
  minutes: number; routeMinutes: number; cost: number; unpriced: number;
  workers: Map<string, WorkerAgg>;
}
// Avancement budgétaire : calculé sur TOUT l'historique du chantier, jamais sur
// la période affichée — un budget porte sur la durée totale du chantier, et ces
// chiffres doivent coïncider avec ceux des emails d'alerte (70/80/100 %).
interface BudgetAgg { hours: number | null; amount: number | null; usedMinutes: number; usedCost: number }

const CATEGORIES = [
  { key: 'materiaux', label: 'Matériaux' },
  { key: 'sous_traitance', label: 'Sous-traitance' },
  { key: 'location', label: 'Location' },
  { key: 'autre', label: 'Divers' },
] as const;
type CategoryKey = typeof CATEGORIES[number]['key'];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

interface Expense {
  id: string; worksite_id: string; spent_on: string; category: string;
  label: string | null; supplier: string | null; amount: number;
}

const CR_CSS = `
.bt-cr-sum{display:flex;gap:8px;margin:2px 0 4px}
.bt-cr-sumcard{flex:1;min-width:0;background:#15120F;color:#F2EDE3;border-radius:14px;padding:12px 13px}
.bt-cr-sumcard.gold{background:#FFC21A;color:#15120F}
.bt-cr-suml{font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;opacity:.75;font-weight:700}
.bt-cr-sumv{font-size:21px;font-weight:900;letter-spacing:-.02em;margin-top:3px;line-height:1}
.bt-cr-note{background:#FBF3DC;border:1px solid #EAD9A2;color:#7a5e00;border-radius:10px;padding:9px 12px;font-size:12px;font-weight:600;margin:2px 0}
.bt-cr-row{width:100%;text-align:left;background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:13px;padding:12px 14px;font-family:inherit;color:#15120F}
.bt-cr-rowtop{display:flex;align-items:center;gap:10px;cursor:pointer}
.bt-cr-name{font-weight:800;font-size:14.5px;letter-spacing:-.01em;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-cr-city{font-family:'JetBrains Mono',monospace;font-size:11px;color:#9a948a;font-weight:600}
.bt-cr-vals{text-align:right;flex:none}
.bt-cr-h{font-weight:900;font-size:14.5px}
.bt-cr-c{font-size:12.5px;color:#1F7A4D;font-weight:800;display:block}
.bt-cr-c.todo{color:#B5472E}
.bt-cr-route{font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#a87c1e;font-weight:700;display:inline-flex;align-items:center;gap:3px}
.bt-cr-chev{color:#9a948a;transition:transform .16s ease}
.bt-cr-chev.on{transform:rotate(180deg)}
.bt-cr-sub{margin-top:10px;padding-top:9px;border-top:1px solid rgba(21,18,15,.08);display:flex;flex-direction:column;gap:6px}
.bt-cr-subh{font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#9a948a;font-weight:700;margin-top:4px}
.bt-cr-subrow{display:flex;align-items:baseline;gap:8px;font-size:12.5px}
.bt-cr-subname{font-weight:700;color:#3a352f;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-cr-submeta{font-family:'JetBrains Mono',monospace;font-size:11px;color:#8a8378;font-weight:600;flex:none}
.bt-cr-exp{display:flex;align-items:center;gap:8px;font-size:12.5px}
.bt-cr-exptag{font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;background:#F1E8D6;color:#6b5a2e;border-radius:6px;padding:2px 6px;flex:none}
.bt-cr-expname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;color:#3a352f}
.bt-cr-expamt{font-family:'JetBrains Mono',monospace;font-weight:800;color:#15120F;flex:none}
.bt-cr-expdel{flex:none;border:none;background:transparent;color:#9a948a;cursor:pointer;padding:2px;border-radius:6px;display:inline-flex}
.bt-cr-expdel:hover{background:#F4D9D1;color:#C0461F}
.bt-cr-form{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.bt-cr-form select,.bt-cr-form input{font-family:inherit;font-size:13px;padding:7px 9px;border:1.5px solid rgba(21,18,15,.18);border-radius:9px;background:#fff;color:#15120F;min-width:0}
.bt-cr-form select{flex:0 0 118px}
.bt-cr-form .lbl{flex:1 1 120px}
.bt-cr-form .amt{flex:0 0 92px;text-align:right}
.bt-cr-empty{text-align:center;color:#9a948a;font-weight:600;padding:26px 0;font-size:13.5px}
.bt-cr-bud{margin-top:9px}
.bt-cr-budhead{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11.5px;color:#8a8378;font-weight:600;margin-bottom:4px}
.bt-cr-budhead b{color:#15120F;font-weight:800}
.bt-cr-budpct{font-family:'JetBrains Mono',monospace;font-weight:800;color:#1F7A4D;flex:none}
.bt-cr-budpct.soft{color:#8a6d05}
.bt-cr-budpct.warn{color:#C0461F}
.bt-cr-budpct.over{color:#B5472E}
.bt-cr-budbar{height:6px;border-radius:99px;background:rgba(21,18,15,.09);overflow:hidden}
.bt-cr-budfill{height:100%;background:#1F7A4D;border-radius:99px;transition:width .25s ease}
.bt-cr-budfill.soft{background:#E0A800}
.bt-cr-budfill.warn{background:#C0461F}
.bt-cr-budfill.over{background:#B5472E}
`;

const fmtH = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};
const fmtEur = (n: number) => Math.round(n).toLocaleString('fr-FR') + ' €';

type Preset = 'month' | 'week' | 'custom';

/** Une ligne de `my_worksite_labour` : un salarié sur un chantier. */
type LabourRow = {
  worksite_id: string; user_id: string;
  worked_minutes: number; route_minutes: number; paid_minutes: number;
  cost: number; unpriced_minutes: number;
};

export default function CostReport({ open, onOpenChange, companyId }: Props) {
  const [preset, setPreset] = useState<Preset>('month');
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [sites, setSites] = useState<SiteAgg[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [missingRates, setMissingRates] = useState(false);
  const [budgets, setBudgets] = useState<Map<string, BudgetAgg>>(new Map());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [failed, setFailed] = useState(false);

  // Saisie d'une dépense, pour le chantier déplié.
  const [newCat, setNewCat] = useState<CategoryKey>('materiaux');
  const [newLabel, setNewLabel] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const effectiveRange = useMemo((): { from: Date; to: Date } => {
    const today = new Date();
    if (preset === 'month') return { from: startOfMonth(today), to: endOfMonth(today) };
    if (preset === 'week') return { from: weekStart(today), to: weekEnd(today) };
    if (range?.from) return { from: range.from, to: range.to ?? range.from };
    return { from: startOfMonth(today), to: endOfMonth(today) };
  }, [preset, range]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setExpanded(null); setFailed(false);
    const fromStr = format(effectiveRange.from, 'yyyy-MM-dd');
    const toStr = format(effectiveRange.to, 'yyyy-MM-dd');

    // Heures et coût : une seule source, partagée avec les alertes de budget.
    const [labourRes, siteRes, workerRes, expRes] = await Promise.all([
      supabase.rpc('my_worksite_labour', { p_from: fromStr, p_to: toStr }),
      supabase.from('worksites').select('id, client_name, city').eq('company_id', companyId),
      supabase.from('users').select('id, first_name, last_name').eq('company_id', companyId),
      supabase.from('worksite_expenses').select('id, worksite_id, spent_on, category, label, supplier, amount')
        .eq('company_id', companyId).gte('spent_on', fromStr).lte('spent_on', toStr)
        .order('spent_on', { ascending: false }),
    ]);

    if (labourRes.error) {
      // Zéro heure et zéro euro seraient une réponse plausible et fausse : on
      // préfère ne rien afficher et le dire.
      setFailed(true); setSites([]); setExpenses([]); setLoading(false);
      return;
    }

    const siteName = new Map<string, { name: string; city: string | null }>(
      ((siteRes.data || []) as { id: string; client_name: string | null; city: string | null }[])
        .map((w) => [w.id, { name: w.client_name || 'Chantier', city: w.city }]),
    );
    const workerName = new Map<string, string>(
      ((workerRes.data || []) as { id: string; first_name: string | null; last_name: string | null }[])
        .map((u) => [u.id, `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Salarié']),
    );

    const map = new Map<string, SiteAgg>();
    let anyMissing = false;
    for (const r of ((labourRes.data || []) as LabourRow[])) {
      const meta = siteName.get(r.worksite_id);
      if (!map.has(r.worksite_id)) {
        map.set(r.worksite_id, {
          id: r.worksite_id, name: meta?.name || 'Chantier', city: meta?.city ?? null,
          minutes: 0, routeMinutes: 0, cost: 0, unpriced: 0, workers: new Map(),
        });
      }
      const site = map.get(r.worksite_id)!;
      site.minutes += Number(r.paid_minutes || 0);
      site.routeMinutes += Number(r.route_minutes || 0);
      site.cost += Number(r.cost || 0);
      site.unpriced += Number(r.unpriced_minutes || 0);
      if (Number(r.unpriced_minutes || 0) > 0) anyMissing = true;
      site.workers.set(r.user_id, {
        name: workerName.get(r.user_id) || 'Salarié',
        minutes: Number(r.paid_minutes || 0),
        routeMinutes: Number(r.route_minutes || 0),
        cost: Number(r.cost || 0),
        unpriced: Number(r.unpriced_minutes || 0),
      });
    }

    const exps = ((expRes.data || []) as unknown as Expense[]).map((e) => ({ ...e, amount: Number(e.amount) }));
    // Un chantier peut n'avoir que des dépenses sur la période : une livraison
    // de matériaux avant le premier jour de pose. L'omettre ferait disparaître
    // de l'argent réellement sorti.
    for (const e of exps) {
      if (map.has(e.worksite_id)) continue;
      const meta = siteName.get(e.worksite_id);
      map.set(e.worksite_id, {
        id: e.worksite_id, name: meta?.name || 'Chantier', city: meta?.city ?? null,
        minutes: 0, routeMinutes: 0, cost: 0, unpriced: 0, workers: new Map(),
      });
    }

    setSites(Array.from(map.values()).sort((a, b) => b.minutes - a.minutes));
    setMissingRates(anyMissing);
    setExpenses(exps);

    // Avancement budgétaire — SANS filtre de période : un budget couvre toute la
    // vie du chantier. Même fonction que les e-mails d'alerte, pour que les
    // pourcentages affichés ici et ceux reçus par e-mail soient les mêmes.
    const { data: budgeted } = await supabase.from('worksites')
      .select('id, budget_hours, budget_amount')
      .eq('company_id', companyId).eq('is_active', true)
      .or('budget_hours.gt.0,budget_amount.gt.0');
    const bmap = new Map<string, BudgetAgg>();
    if ((budgeted || []).length) {
      for (const b of (budgeted || []) as { id: string; budget_hours: number | null; budget_amount: number | null }[]) {
        bmap.set(b.id, { hours: b.budget_hours, amount: b.budget_amount, usedMinutes: 0, usedCost: 0 });
      }
      const { data: all, error: allErr } = await supabase.rpc('my_worksite_labour', { p_from: null, p_to: null });
      if (!allErr) {
        for (const r of ((all || []) as LabourRow[])) {
          const agg = bmap.get(r.worksite_id);
          if (!agg) continue;
          agg.usedMinutes += Number(r.paid_minutes || 0);
          agg.usedCost += Number(r.cost || 0);
        }
      } else {
        // Pas de barre plutôt qu'une barre fausse.
        bmap.clear();
      }
    }
    setBudgets(bmap);
    setLoading(false);
  }, [companyId, effectiveRange]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const expensesBySite = useMemo(() => {
    const m = new Map<string, Expense[]>();
    for (const e of expenses) {
      if (!m.has(e.worksite_id)) m.set(e.worksite_id, []);
      m.get(e.worksite_id)!.push(e);
    }
    return m;
  }, [expenses]);

  const siteExpenseTotal = (id: string) =>
    (expensesBySite.get(id) || []).reduce((s, e) => s + e.amount, 0);

  const totals = useMemo(() => {
    let min = 0, cost = 0;
    for (const s of sites) { min += s.minutes; cost += s.cost; }
    const exp = expenses.reduce((s, e) => s + e.amount, 0);
    return { min, cost, exp, all: cost + exp };
  }, [sites, expenses]);

  const addExpense = async (worksiteId: string) => {
    const amount = Number(newAmount.replace(',', '.'));
    if (!companyId || !Number.isFinite(amount) || amount === 0) {
      toast.error('Indiquez un montant.'); return;
    }
    setSaving(true);
    const { data: me } = await supabase.auth.getUser();
    const { error } = await supabase.from('worksite_expenses').insert({
      company_id: companyId, worksite_id: worksiteId,
      spent_on: format(new Date(), 'yyyy-MM-dd'),
      category: newCat, label: newLabel.trim() || null, amount,
      created_by: me?.user?.id ?? null,
    });
    setSaving(false);
    if (error) { toast.error(error.message || "La dépense n'a pas pu être enregistrée."); return; }
    setNewLabel(''); setNewAmount('');
    toast.success('Dépense enregistrée');
    await load();
    setExpanded(worksiteId);
  };

  const delExpense = async (e: Expense) => {
    if (typeof window !== 'undefined'
      && !window.confirm(`Supprimer « ${e.label || CATEGORY_LABEL[e.category]} » (${fmtEur(e.amount)}) ?`)) return;
    // `.select('id')` : une suppression refusée par la RLS renvoie 0 ligne SANS
    // erreur, et la dépense réapparaîtrait au rechargement sans explication.
    const { data, error } = await supabase.from('worksite_expenses').delete().eq('id', e.id).select('id');
    if (error || !data || data.length === 0) { toast.error('Suppression impossible.'); return; }
    setExpenses((p) => p.filter((x) => x.id !== e.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bt-skin max-w-lg max-h-[86vh] overflow-y-auto">
        <style dangerouslySetInnerHTML={{ __html: CR_CSS }} />
        <DialogHeader><DialogTitle>Coût par chantier</DialogTitle></DialogHeader>

        {/* période */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant={preset === 'month' ? 'default' : 'outline'} size="sm" onClick={() => setPreset('month')}>Ce mois</Button>
          <Button variant={preset === 'week' ? 'default' : 'outline'} size="sm" onClick={() => setPreset('week')}>Cette semaine</Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={preset === 'custom' ? 'default' : 'outline'} size="sm"><CalendarRange className="h-4 w-4 mr-1" /> Créneau</Button>
            </PopoverTrigger>
            <PopoverContent className="bt-skin w-auto p-0" align="start">
              <Calendar mode="range" numberOfMonths={1} locale={fr} selected={range}
                onSelect={(r) => { setRange(r); setPreset('custom'); }} />
            </PopoverContent>
          </Popover>
          <span className="text-xs text-muted-foreground ml-auto capitalize">
            {format(effectiveRange.from, 'd MMM', { locale: fr })} → {format(effectiveRange.to, 'd MMM yyyy', { locale: fr })}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Calcul…</div>
        ) : failed ? (
          <div className="bt-cr-empty">Chiffres illisibles pour le moment. Réessayez — mieux vaut rien qu&apos;un coût faux.</div>
        ) : (
          <>
            <div className="bt-cr-sum">
              <div className="bt-cr-sumcard">
                <div className="bt-cr-suml">Main d&apos;œuvre</div>
                <div className="bt-cr-sumv">{totals.cost > 0 ? fmtEur(totals.cost) : '—'}</div>
              </div>
              <div className="bt-cr-sumcard">
                <div className="bt-cr-suml">Dépenses</div>
                <div className="bt-cr-sumv">{totals.exp !== 0 ? fmtEur(totals.exp) : '—'}</div>
              </div>
              <div className="bt-cr-sumcard gold">
                <div className="bt-cr-suml">Total</div>
                <div className="bt-cr-sumv">{totals.all !== 0 ? fmtEur(totals.all) : '—'}</div>
              </div>
            </div>

            {missingRates && (
              <div className="bt-cr-note">Certains salariés n&apos;ont pas de <strong>taux horaire</strong> : leurs heures sont comptées, mais pas leur coût. Renseignez-le dans la fiche du salarié.</div>
            )}

            {sites.length === 0 && expenses.length === 0 ? (
              <div className="bt-cr-empty">Aucune heure déclarée ni dépense sur cette période.</div>
            ) : (
              <div className="space-y-2 pt-1">
                {sites.map((s) => {
                  const on = expanded === s.id;
                  const exp = siteExpenseTotal(s.id);
                  // Le total est TOUJOURS affiché : cacher la somme parce qu'un
                  // taux horaire manque effacerait aussi les dépenses, qui, elles,
                  // sont connues. On signale le manque à côté, sans rien masquer.
                  const partial = s.unpriced > 0;
                  return (
                    <div key={s.id} className="bt-cr-row">
                      <div className="bt-cr-rowtop" onClick={() => setExpanded(on ? null : s.id)}>
                        <Building2 className="h-4 w-4 shrink-0" style={{ color: '#9a948a' }} />
                        <span className="bt-cr-name">{s.name}{s.city ? <span className="bt-cr-city"> · {s.city}</span> : null}</span>
                        <span className="bt-cr-vals">
                          <span className="bt-cr-h">{fmtH(s.minutes)}</span>
                          <span className={`bt-cr-c${partial ? ' todo' : ''}`}>
                            {fmtEur(s.cost + exp)}{partial ? ' · incomplet' : ''}
                          </span>
                          {/* Le temps de route payé, dit à voix haute : c'est
                              précisément ce qui manquait au chiffre avant. */}
                          {s.routeMinutes > 0 && (
                            <span className="bt-cr-route"><Truck className="h-3 w-3" /> dont {fmtH(s.routeMinutes)} de route</span>
                          )}
                        </span>
                        <ChevronDown className={`h-4 w-4 bt-cr-chev${on ? ' on' : ''}`} />
                      </div>

                      {/* Avancement du budget MAIN-D'ŒUVRE — sur TOUT le chantier,
                          pas seulement la période affichée, et hors dépenses : le
                          réglage existant s'appelle « budget main-d'œuvre », on ne
                          change pas son sens sous les pieds du bureau. */}
                      {(() => {
                        const b = budgets.get(s.id);
                        if (!b) return null;
                        const pcts: number[] = [];
                        if (b.hours && b.hours > 0) pcts.push((b.usedMinutes / 60) / b.hours * 100);
                        if (b.amount && b.amount > 0) pcts.push(b.usedCost / b.amount * 100);
                        if (!pcts.length) return null;
                        const pct = Math.max(...pcts);
                        const tone = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : pct >= 70 ? 'soft' : '';
                        const label = b.hours && b.hours > 0
                          ? `${fmtH(b.usedMinutes)} / ${b.hours} h`
                          : `${fmtEur(b.usedCost)} / ${fmtEur(b.amount || 0)}`;
                        return (
                          <div className="bt-cr-bud">
                            <div className="bt-cr-budhead">
                              <span>Budget main-d&apos;œuvre · tout le chantier · <b>{label}</b></span>
                              <span className={`bt-cr-budpct ${tone}`}>{Math.round(pct)} %</span>
                            </div>
                            <div className="bt-cr-budbar">
                              <div className={`bt-cr-budfill ${tone}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                          </div>
                        );
                      })()}

                      {on && (
                        <div className="bt-cr-sub">
                          <div className="bt-cr-subh">Main d&apos;œuvre</div>
                          {Array.from(s.workers.values()).sort((a, b) => b.minutes - a.minutes).map((w, i) => (
                            <div key={i} className="bt-cr-subrow">
                              <span className="bt-cr-subname">{w.name}</span>
                              <span className="bt-cr-submeta">
                                {fmtH(w.minutes)}
                                {w.routeMinutes > 0 ? ` (dont ${fmtH(w.routeMinutes)} route)` : ''}
                                {w.unpriced > 0 ? ' · taux ?' : ` · ${fmtEur(w.cost)}`}
                              </span>
                            </div>
                          ))}

                          <div className="bt-cr-subh">Dépenses{exp !== 0 ? ` · ${fmtEur(exp)}` : ''}</div>
                          {(expensesBySite.get(s.id) || []).map((e) => (
                            <div key={e.id} className="bt-cr-exp">
                              <span className="bt-cr-exptag">{CATEGORY_LABEL[e.category] || e.category}</span>
                              <span className="bt-cr-expname">{e.label || '—'}</span>
                              <span className="bt-cr-expamt">{fmtEur(e.amount)}</span>
                              <button type="button" className="bt-cr-expdel" onClick={() => delExpense(e)} title="Supprimer">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          {(expensesBySite.get(s.id) || []).length === 0 && (
                            <div className="bt-cr-subrow"><span className="bt-cr-submeta">Aucune dépense sur cette période.</span></div>
                          )}

                          <div className="bt-cr-form">
                            <select value={newCat} onChange={(ev) => setNewCat(ev.target.value as CategoryKey)}>
                              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select>
                            <Input className="lbl" placeholder="Ex : plaques de plâtre" value={newLabel} onChange={(ev) => setNewLabel(ev.target.value)} />
                            <input className="amt" inputMode="decimal" placeholder="0 €" value={newAmount} onChange={(ev) => setNewAmount(ev.target.value)} />
                            <Button size="sm" disabled={saving} onClick={() => addExpense(s.id)}>
                              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
