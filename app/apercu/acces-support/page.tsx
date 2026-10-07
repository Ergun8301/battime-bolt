'use client';

// Aperçu du lot 5 (accès support) SANS base ni compte : tout est fictif.
// N'existe que sur une preview avec `?demo=support` ; sur bemexo.com, rien.
//
// Parcours complet : le patron autorise → le support passe la double
// vérification → « Entrer » → espace du patron avec le bandeau → « Quitter »
// → le journal du patron montre tout.

import { useEffect, useMemo, useState } from 'react';
import SupportAccess from '@/components/support-access';
import SupportConsoleView, { type ConsoleStep } from '@/components/support-console';
import { SupportBannerView } from '@/components/support-banner';
import { demoSupportSource, isSupportDemo, type SupportCompany } from '@/lib/support';

type View = 'patron' | 'support' | 'inside';
const NAME = 'Maçonnerie Martin';

export default function ApercuAccesSupport() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [view, setView] = useState<View>('patron');
  const [tick, setTick] = useState(0);
  const source = useMemo(() => demoSupportSource(() => setTick((t) => t + 1)), []);
  const [step, setStep] = useState<ConsoleStep>({ kind: 'challenge', factorId: 'demo' });
  const [companies, setCompanies] = useState<SupportCompany[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setAllowed(isSupportDemo()); }, []);

  useEffect(() => {
    if (view !== 'support') return;
    source.load().then((s) => setCompanies(s.grant ? [{ company_id: 'demo', name: NAME, expires_at: s.grant.expires_at }] : []));
  }, [view, source, tick]);

  if (allowed === null) return null;
  if (!allowed) {
    return <main className="min-h-screen flex items-center justify-center p-6 text-sm text-muted-foreground">Aperçu disponible uniquement sur les préviews.</main>;
  }

  const tabs: [View, string][] = [['patron', '1 · Patron'], ['support', '2 · Support'], ['inside', '3 · Mode support']];
  return (
    <div className="min-h-screen bg-[#F4F1EA]">
      {view === 'inside' && companies[0] && (
        <SupportBannerView name={NAME} expiresAt={companies[0].expires_at} onExit={() => { source.exitAsSupport(); setView('patron'); }} />
      )}
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-xl font-black tracking-tight">BEME<span className="text-[#FFC21A]">X</span>O</span>
          <span className="rounded-full bg-[#FFC21A] px-3 py-1 text-xs font-black uppercase tracking-wider">Mode démo · données fictives</span>
        </div>
        <div className="mb-4 flex gap-2" role="tablist">
          {tabs.map(([k, l]) => (
            <button
              key={k} type="button" role="tab" aria-selected={view === k}
              disabled={k === 'inside' && view !== 'inside'}
              onClick={() => setView(k)}
              className={`rounded-full px-3 py-1.5 text-sm font-bold ${view === k ? 'bg-[#15120F] text-white' : 'bg-white text-neutral-700 disabled:opacity-40'}`}
            >{l}</button>
          ))}
        </div>

        {view === 'patron' && (
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="mb-2 text-sm font-black">Réglages de l’entreprise — {NAME}</p>
            <SupportAccess source={source} />
          </div>
        )}

        {view === 'support' && (
          <div className="-mx-4 sm:mx-0">
            <SupportConsoleView
              step={step} companies={companies} error={err}
              onLogin={() => undefined}
              onVerify={async (_f, code) => { if (code === '000000') { setErr('Code incorrect. Réessayez avec le code affiché maintenant.'); return; } setErr(null); setStep({ kind: 'ready' }); }}
              onEnter={() => { source.enterAsSupport(); setView('inside'); }}
              onBack={() => setView('inside')}
              onExit={() => setView('patron')}
            />
          </div>
        )}

        {view === 'inside' && (
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="border-b bg-neutral-50 p-3 text-sm font-black">Planning — {NAME} (vu par le support)</div>
            {[['Karim B.', 'Villa Dupont', '7 h 30'], ['Sofia R.', 'Bureau Martin', '8 h 00'], ['Lucas P.', 'Congé', '—']].map(([n, w, h]) => (
              <div key={n} className="flex items-center gap-3 border-b p-3 text-sm">
                <span className="w-24 font-semibold">{n}</span>
                <span className={`rounded-md px-2 py-1 text-xs font-semibold ${w === 'Congé' ? 'bg-sky-100 text-sky-900' : 'bg-amber-100 text-amber-900'}`}>{w}</span>
                <span className="ml-auto text-neutral-500">{h}</span>
              </div>
            ))}
            <p className="p-3 text-xs text-neutral-500">Les boutons « Modifier » et « Enregistrer » sont refusés par la base en mode support.</p>
          </div>
        )}
      </div>
    </div>
  );
}
