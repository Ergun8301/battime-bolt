'use client';

// Rapport « Coût & heures par chantier » (Chantier 2). Lecture seule.
// - Heures : uniquement les pointages VALIDÉS (status = 'validated') sur la période.
// - Coût main d'œuvre : Σ (heures × taux horaire du salarié). Un salarié sans
//   taux renseigné → ses heures comptent, mais son coût est « à compléter ».
// Aucune donnée modifiée, aucune logique produit touchée.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, CalendarRange, ChevronDown, Building2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; companyId?: string }

interface WorkerAgg { name: string; minutes: number; rate: number | null }
interface SiteAgg { id: string; name: string; city: string | null; minutes: number; workers: Map<string, WorkerAgg> }
// Avancement budgétaire : calculé sur TOUT l'historique du chantier, jamais sur
// la période affichée — un budget porte sur la durée totale du chantier, et ces
// chiffres doivent coïncider avec ceux des emails d'alerte (70/80/100 %).
interface BudgetAgg { hours: number | null; amount: number | null; usedMinutes: number; usedCost: number }

const CR_CSS = `
.bt-cr-sum{display:flex;gap:10px;margin:2px 0 4px}
.bt-cr-sumcard{flex:1;background:#15120F;color:#F2EDE3;border-radius:14px;padding:13px 15px}
.bt-cr-sumcard.gold{background:#FFC21A;color:#15120F}
.bt-cr-suml{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;opacity:.75;font-weight:700}
.bt-cr-sumv{font-size:24px;font-weight:900;letter-spacing:-.02em;margin-top:3px;line-height:1}
.bt-cr-note{background:#FBF3DC;border:1px solid #EAD9A2;color:#7a5e00;border-radius:10px;padding:9px 12px;font-size:12px;font-weight:600;margin:2px 0}
.bt-cr-row{width:100%;text-align:left;background:#fff;border:1px solid rgba(21,18,15,.1);border-radius:13px;padding:12px 14px;cursor:pointer;font-family:inherit;color:#15120F}
.bt-cr-rowtop{display:flex;align-items:center;gap:10px}
.bt-cr-name{font-weight:800;font-size:14.5px;letter-spacing:-.01em;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-cr-city{font-family:'JetBrains Mono',monospace;font-size:11px;color:#9a948a;font-weight:600}
.bt-cr-vals{text-align:right;flex:none}
.bt-cr-h{font-weight:900;font-size:14.5px}
.bt-cr-c{font-size:12.5px;color:#1F7A4D;font-weight:800}
.bt-cr-c.todo{color:#B5472E}
.bt-cr-chev{color:#9a948a;transition:transform .16s ease}
.bt-cr-chev.on{transform:rotate(180deg)}
.bt-cr-sub{margin-top:10px;padding-top:9px;border-top:1px solid rgba(21,18,15,.08);display:flex;flex-direction:column;gap:6px}
.bt-cr-subrow{display:flex;align-items:baseline;gap:8px;font-size:12.5px}
.bt-cr-subname{font-weight:700;color:#3a352f;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-cr-submeta{font-family:'JetBrains Mono',monospace;font-size:11px;color:#8a8378;font-weight:600;flex:none}
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

export default function CostReport({ open, onOpenChange, companyId }: Props) {
  const [preset, setPreset] = useState<Preset>('month');
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [sites, setSites] = useState<SiteAgg[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [missingRates, setMissingRates] = useState(false);
  const [budgets, setBudgets] = useState<Map<string, BudgetAgg>>(new Map());

  const effectiveRange = useMemo((): { from: Date; to: Date } => {
    const today = new Date();
    if (preset === 'month') return { from: startOfMonth(today), to: endOfMonth(today) };
    if (preset === 'week') { const m = startOfWeek(today, { weekStartsOn: 1 }); return { from: m, to: addDays(m, 6) }; }
    if (range?.from) return { from: range.from, to: range.to ?? range.from };
    return { from: startOfMonth(today), to: endOfMonth(today) };
  }, [preset, range]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setExpanded(null);
    const fromStr = format(effectiveRange.from, 'yyyy-MM-dd');
    const toStr = format(effectiveRange.to, 'yyyy-MM-dd');
    const { data } = await supabase
      .from('time_entries')
      .select('total_minutes, user_id, worksite_id, worksites(client_name, city), owner:users!time_entries_user_id_fkey(first_name, last_name, hourly_rate)')
      .eq('company_id', companyId)
      .eq('status', 'validated')
      .gte('work_date', fromStr)
      .lte('work_date', toStr);

    const map = new Map<string, SiteAgg>();
    let anyMissing = false;
    for (const e of (data || []) as Record<string, unknown>[]) {
      const wid = String(e.worksite_id || '');
      if (!wid) continue;
      const ws = Array.isArray(e.worksites) ? e.worksites[0] : e.worksites as { client_name?: string; city?: string } | null;
      const ow = (Array.isArray(e.owner) ? e.owner[0] : e.owner) as { first_name?: string; last_name?: string; hourly_rate?: number | null } | null;
      const mins = Number(e.total_minutes || 0);
      if (!map.has(wid)) map.set(wid, { id: wid, name: ws?.client_name || 'Chantier', city: ws?.city || null, minutes: 0, workers: new Map() });
      const site = map.get(wid)!;
      site.minutes += mins;
      const uid = String(e.user_id || '');
      if (!site.workers.has(uid)) {
        const rate = ow?.hourly_rate ?? null;
        if (rate == null) anyMissing = true;
        site.workers.set(uid, { name: `${ow?.first_name || ''} ${ow?.last_name || ''}`.trim() || 'Salarié', minutes: 0, rate });
      }
      site.workers.get(uid)!.minutes += mins;
    }
    const arr = Array.from(map.values()).sort((a, b) => b.minutes - a.minutes);
    setSites(arr); setMissingRates(anyMissing);

    // Avancement budgétaire — requête séparée, SANS filtre de période : un budget
    // couvre toute la vie du chantier. Même calcul que la fonction d'alerte pour
    // que les pourcentages affichés ici et ceux des emails soient identiques.
    const { data: budgeted } = await supabase.from('worksites')
      .select('id, budget_hours, budget_amount')
      .eq('company_id', companyId).eq('is_active', true)
      .or('budget_hours.gt.0,budget_amount.gt.0');
    const bmap = new Map<string, BudgetAgg>();
    const ids = (budgeted || []).map((b: { id: string }) => b.id);
    if (ids.length) {
      for (const b of (budgeted || []) as { id: string; budget_hours: number | null; budget_amount: number | null }[]) {
        bmap.set(b.id, { hours: b.budget_hours, amount: b.budget_amount, usedMinutes: 0, usedCost: 0 });
      }
      const { data: all } = await supabase.from('time_entries')
        .select('worksite_id, total_minutes, owner:users!time_entries_user_id_fkey(hourly_rate)')
        .eq('company_id', companyId).eq('status', 'validated').in('worksite_id', ids);
      for (const e of (all || []) as Record<string, unknown>[]) {
        const agg = bmap.get(String(e.worksite_id || ''));
        if (!agg) continue;
        const ow = (Array.isArray(e.owner) ? e.owner[0] : e.owner) as { hourly_rate?: number | null } | null;
        const mins = Number(e.total_minutes || 0);
        agg.usedMinutes += mins;
        if (ow?.hourly_rate != null) agg.usedCost += (mins / 60) * ow.hourly_rate;
      }
    }
    setBudgets(bmap);
    setLoading(false);
  }, [companyId, effectiveRange]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const siteCost = (s: SiteAgg) => {
    let cost = 0; let hasRate = false;
    Array.from(s.workers.values()).forEach((w) => { if (w.rate != null) { cost += (w.minutes / 60) * w.rate; hasRate = true; } });
    return { cost, hasRate };
  };
  const totals = useMemo(() => {
    let min = 0, cost = 0;
    for (const s of sites) { min += s.minutes; cost += siteCost(s).cost; }
    return { min, cost };
  }, [sites]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bt-skin max-w-lg max-h-[86vh] overflow-y-auto">
        <style dangerouslySetInnerHTML={{ __html: CR_CSS }} />
        <DialogHeader><DialogTitle>Coût &amp; heures par chantier</DialogTitle></DialogHeader>

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
        ) : (
          <>
            <div className="bt-cr-sum">
              <div className="bt-cr-sumcard">
                <div className="bt-cr-suml">Heures validées</div>
                <div className="bt-cr-sumv">{fmtH(totals.min)}</div>
              </div>
              <div className="bt-cr-sumcard gold">
                <div className="bt-cr-suml">Coût main d&apos;œuvre</div>
                <div className="bt-cr-sumv">{totals.cost > 0 ? fmtEur(totals.cost) : '—'}</div>
              </div>
            </div>

            {missingRates && (
              <div className="bt-cr-note">Certains salariés n&apos;ont pas de <strong>taux horaire</strong> : leurs heures sont comptées, mais pas leur coût. Renseignez-le dans la fiche du salarié.</div>
            )}

            {sites.length === 0 ? (
              <div className="bt-cr-empty">Aucune heure validée sur cette période.</div>
            ) : (
              <div className="space-y-2 pt-1">
                {sites.map((s) => {
                  const { cost, hasRate } = siteCost(s);
                  const on = expanded === s.id;
                  return (
                    <button key={s.id} className="bt-cr-row" onClick={() => setExpanded(on ? null : s.id)}>
                      <div className="bt-cr-rowtop">
                        <Building2 className="h-4 w-4 shrink-0" style={{ color: '#9a948a' }} />
                        <span className="bt-cr-name">{s.name}{s.city ? <span className="bt-cr-city"> · {s.city}</span> : null}</span>
                        <span className="bt-cr-vals">
                          <span className="bt-cr-h">{fmtH(s.minutes)}</span>
                          <span className={`bt-cr-c${hasRate ? '' : ' todo'}`} style={{ display: 'block' }}>{hasRate ? fmtEur(cost) : 'coût à compléter'}</span>
                        </span>
                        <ChevronDown className={`h-4 w-4 bt-cr-chev${on ? ' on' : ''}`} />
                      </div>

                      {/* Avancement du budget main-d'œuvre — sur TOUT le chantier,
                          pas seulement la période affichée (cf. calcul plus haut). */}
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
                              <span>Budget main-d&apos;œuvre · <b>{label}</b></span>
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
                          {Array.from(s.workers.values()).sort((a, b) => b.minutes - a.minutes).map((w, i) => (
                            <div key={i} className="bt-cr-subrow">
                              <span className="bt-cr-subname">{w.name}</span>
                              <span className="bt-cr-submeta">{fmtH(w.minutes)}{w.rate != null ? ` · ${fmtEur((w.minutes / 60) * w.rate)}` : ' · taux ?'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </button>
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
