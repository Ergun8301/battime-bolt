'use client';

// Aperçu du lot 3 (Assistant BEMEXO) SANS base ni compte : réponses fictives.
// N'existe que sur une preview avec `?demo=assistant` ; sur bemexo.com, rien.

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import AssistantPanel from '@/components/assistant-panel';
import AssistantActionCard from '@/components/assistant-action-card';
import { demoActionExecutor, type ActionExtra } from '@/lib/assistant-actions';
import { demoAssistantSource, isAssistantDemo } from '@/lib/assistant';

const LABELS: Record<string, string> = {
  couts: 'Coûts des chantiers', conges: 'Demandes de congés', 'salarie:demo-karim': 'Fiche de Karim', salaries: 'Salariés',
  nouveau_salarie: 'Nouveau salarié', nouveau_client: 'Nouveau client', export: 'Exporter', reglages: 'Réglages', reserves: 'Réserves',
};

export default function ApercuAssistant() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const source = useMemo(() => demoAssistantSource(), []);
  useEffect(() => { setAllowed(isAssistantDemo()); }, []);

  if (allowed === null) return null;
  if (!allowed) {
    return <main className="min-h-screen flex items-center justify-center p-6 text-sm text-muted-foreground">Aperçu disponible uniquement sur les préviews.</main>;
  }
  const days = ['Lun 28', 'Mar 29', 'Mer 30', 'Jeu 1', 'Ven 2'];
  const rows = [['Karim B.', 'Villa Dupont'], ['Sofia R.', 'Bureau Martin'], ['Lucas P.', 'Congé'], ['Inès M.', 'Villa Dupont']];
  return (
    <main className="min-h-screen bg-[#F4F1EA] p-4 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="text-xl font-black tracking-tight">BEME<span className="text-[#FFC21A]">X</span>O</span>
          <span className="rounded-full bg-[#FFC21A] px-3 py-1 text-xs font-black uppercase tracking-wider">Mode démo · faux chiffres</span>
        </div>
        {/* Fond d'écran : un planning factice, pour voir le panneau en situation. */}
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="grid grid-cols-6 border-b bg-neutral-50 text-xs font-bold text-neutral-500">
            <div className="p-3">Salarié</div>{days.map((d) => <div key={d} className="p-3">{d}</div>)}
          </div>
          {rows.map(([n, w]) => (
            <div key={n} className="grid grid-cols-6 border-b text-sm">
              <div className="p-3 font-semibold">{n}</div>
              {days.map((d) => <div key={d} className="p-2"><div className={`rounded-md px-2 py-1.5 text-xs font-semibold ${w === 'Congé' ? 'bg-sky-100 text-sky-900' : 'bg-amber-100 text-amber-900'}`}>{w}</div></div>)}
            </div>
          ))}
        </div>
      </div>
      <AssistantPanel
        source={source}
        onNavigate={(a) => toast.success(`Ouverture : ${LABELS[a] ?? a}`)}
        renderExtra={(extra) => <AssistantActionCard extra={extra as ActionExtra} execute={demoActionExecutor} />}
      />
    </main>
  );
}
