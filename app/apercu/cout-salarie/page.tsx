'use client';

// Aperçu du lot 2 (coût réel) pour vérifier les écrans SANS base ni compte.
// N'existe que sur une preview avec `?demo=cout` : sur bemexo.com, la page ne
// montre rien. Faux bulletin, faux chiffres, tout reste en mémoire.

import { useEffect, useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import RealCostCard, { RealCostLine, REAL_COST_CSS } from '@/components/real-cost-card';
import LeaveFundSetting from '@/components/leave-fund-setting';
import { SET_CSS } from '@/components/company-settings';
import { demoCostSource, isCostDemo, ratesByUser, realLabourCost } from '@/lib/real-cost';

const COMPANY = 'demo-company';
// Heures pointées sur le chantier de démo, par salarié (minutes).
const MINUTES: [string, number][] = [['demo-karim', 38 * 60], ['demo-sofia', 31 * 60], ['demo-lucas', 12 * 60]];

export default function ApercuCoutSalarie() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const source = useMemo(() => demoCostSource(), []);
  const [rates, setRates] = useState<Map<string, number>>(new Map());
  const refresh = () => Promise.all([source.slips(COMPANY), source.fund(COMPANY)]).then(([s, f]) => setRates(ratesByUser(s, f)));
  useEffect(() => { setAllowed(isCostDemo()); refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Le réglage congés change le coût : on recalcule régulièrement (démo seulement).
  useEffect(() => { const id = setInterval(refresh, 1000); return () => clearInterval(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (allowed === null) return null;
  if (!allowed) {
    return <main className="min-h-screen flex items-center justify-center p-6 text-sm text-muted-foreground">Aperçu disponible uniquement sur les préviews.</main>;
  }
  const site = realLabourCost(MINUTES, rates);

  return (
    <main className="min-h-screen bg-[#F4F1EA] p-4 sm:p-8">
      <style dangerouslySetInnerHTML={{ __html: SET_CSS + REAL_COST_CSS }} />
      <div className="mx-auto max-w-2xl space-y-5">
        <p className="inline-block rounded-full bg-[#FFC21A] px-3 py-1 text-xs font-black uppercase tracking-wider">Mode démo · faux chiffres</p>

        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3" data-testid="demo-fiche">
          <h2 className="text-lg font-bold">Karim Demo <span className="text-sm font-medium text-muted-foreground">· fiche salarié</span></h2>
          <RealCostCard source={source} companyId={COMPANY} userId="demo-karim" firstName="Karim" onChanged={refresh} />
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm" data-testid="demo-reglage">
          <h2 className="text-lg font-bold mb-2">Réglages de l&apos;entreprise</h2>
          <div className="bt-set"><LeaveFundSetting source={source} companyId={COMPANY} /></div>
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm" data-testid="demo-chantier">
          <h2 className="text-lg font-bold mb-2">Chantiers</h2>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-neutral-400" /> Villa Dupont <span className="font-normal text-neutral-500">· Lyon</span>
              <span className="ml-auto tabular-nums">81 h</span>
            </div>
            <div className="mt-2 text-xs text-neutral-600">Budget main-d&apos;œuvre · tout le chantier · <b>81 h / 120 h</b></div>
            <div className="mt-1 h-1.5 rounded bg-neutral-200"><div className="h-1.5 rounded bg-neutral-800" style={{ width: '67%' }} /></div>
            <RealCostLine cost={site.cost} unpricedUsers={site.unpricedUsers} scope="tout le chantier" />
          </div>
        </section>
      </div>
    </main>
  );
}
