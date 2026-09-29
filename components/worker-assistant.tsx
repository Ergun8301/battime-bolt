'use client';

// Assistant BEMEXO dans l'app SALARIÉ (lot 4) : le même bouton et le même
// panneau que le bureau (lot 3), avec un brouillon de pointage à confirmer.
// N'existe que si l'entreprise a `ai_enabled` (ou en démo sur une preview).

import { useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import AssistantPanel from '@/components/assistant-panel';
import WorkerDraftCard from '@/components/worker-draft-card';
import { useAiEnabled } from '@/lib/real-cost';
import {
  demoSaver, demoWorkerSource, isWorkerAssistantDemo, makeWorkerSaver, supabaseWorkerSource,
  WORKER_SUGGESTIONS, type DraftExtra,
} from '@/lib/worker-assistant';

export default function WorkerAssistant({ onSaved, defaultOpen = false }: { onSaved?: () => void; defaultOpen?: boolean }) {
  const { user } = useAuth();
  const demo = useMemo(() => isWorkerAssistantDemo(), []);
  const ai = useAiEnabled(demo ? null : user?.company_id);
  const source = useMemo(() => (demo ? demoWorkerSource() : supabaseWorkerSource), [demo]);
  const isWorker = user?.role === 'worker' || user?.role === 'lead';
  if (!demo && !(ai && isWorker)) return null;

  return (
    <AssistantPanel
      source={source}
      defaultOpen={defaultOpen}
      onNavigate={() => {}}
      suggestions={WORKER_SUGGESTIONS}
      footNote="Rien n’est enregistré sans votre confirmation"
      intro="Dites ou écrivez vos heures, je prépare le pointage. Vous pouvez aussi me demander vos heures ou votre planning"
      renderExtra={(extra) => {
        const x = extra as DraftExtra;
        const save = demo || !user ? demoSaver : makeWorkerSaver({ id: user.id, company_id: user.company_id }, x.chantiers);
        return <WorkerDraftCard extra={x} save={save} onSaved={onSaved} />;
      }}
    />
  );
}
