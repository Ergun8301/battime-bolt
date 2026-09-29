'use client';

// Assistant BEMEXO dans l'app SALARIÉ (lot 4) : le même bouton et le même
// panneau que le bureau (lot 3), avec un brouillon de pointage à confirmer.
// N'existe que si l'entreprise a `ai_enabled` (ou en démo sur une preview).

import { useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import AssistantPanel from '@/components/assistant-panel';
import WorkerDraftCard from '@/components/worker-draft-card';
import WorkerActionCard from '@/components/worker-action-card';
import { demoWorkerExecutor, makeWorkerExecutor } from '@/lib/worker-actions';
import { useAiEnabled } from '@/lib/real-cost';
import {
  demoSaver, demoWorkerSource, isWorkerAssistantDemo, makeWorkerSaver, supabaseWorkerSource,
  WORKER_ACTION_SUGGESTIONS, type DraftExtra, type WorkerActionExtra,
} from '@/lib/worker-assistant';

export default function WorkerAssistant({ onSaved, onNavigate, defaultOpen = false }: { onSaved?: () => void; onNavigate?: (action: string) => void; defaultOpen?: boolean }) {
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
      onNavigate={onNavigate ?? (() => {})}
      suggestions={WORKER_ACTION_SUGGESTIONS}
      footNote="Rien n’est enregistré sans votre confirmation"
      intro="Dites-moi vos heures, ce que vous voulez faire, ou comment faire"
      renderExtra={(extra) => {
        if ((extra as WorkerActionExtra).workerAction) {
          const exec = demo || !user ? demoWorkerExecutor : makeWorkerExecutor({ id: user.id, company_id: user.company_id });
          return <WorkerActionCard extra={extra as WorkerActionExtra} execute={exec} onDone={onSaved} />;
        }
        const x = extra as DraftExtra;
        const save = demo || !user ? demoSaver : makeWorkerSaver({ id: user.id, company_id: user.company_id }, x.chantiers);
        return <WorkerDraftCard extra={x} save={save} onSaved={onSaved} />;
      }}
    />
  );
}
