'use client';

// Aperçu du lot 4 (Assistant salarié) SANS base ni compte : chantiers fictifs,
// mais le VRAI lecteur de phrases. Préviews uniquement (`?demo=salarie`).

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import WorkerAssistant from '@/components/worker-assistant';
import { isWorkerAssistantDemo } from '@/lib/worker-assistant';

export default function ApercuAssistantSalarie() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => { setAllowed(isWorkerAssistantDemo()); }, []);
  if (allowed === null) return null;
  if (!allowed) {
    return <main className="min-h-screen flex items-center justify-center p-6 text-sm text-muted-foreground">Aperçu disponible uniquement sur les préviews.</main>;
  }
  return (
    <main className="min-h-screen bg-[#15120F] text-[#FBF8F2] p-5">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between">
          <span className="text-lg font-black tracking-tight">BEME<span className="text-[#FFC21A]">X</span>O</span>
          <span className="rounded-full bg-[#FFC21A] px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#15120F]">Démo · faux chantiers</span>
        </div>
        <p className="mt-8 text-sm text-neutral-400">Mardi</p>
        <h1 className="text-3xl font-black">Ma journée</h1>
        <div className="mt-6 space-y-3">
          {['Villa Dupont · 07:30 – 12:00', 'Bureau Martin · 13:00 – 16:30'].map((t) => (
            <div key={t} className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">{t}<span className="block text-xs font-normal text-neutral-400">prévu</span></div>
          ))}
        </div>
      </div>
      <WorkerAssistant onNavigate={(a) => toast.success(`Ouverture : ${a}`)} />
    </main>
  );
}
