'use client';

// Assistant BEMEXO dans l'app SALARIÉ (lot 4) : le même bouton et le même
// panneau que le bureau (lot 3), avec un brouillon de pointage à confirmer.
// N'existe que si l'entreprise a `ai_enabled` (ou en démo sur une preview).

import { useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import AssistantPanel from '@/components/assistant-panel';
import WorkerDraftCard from '@/components/worker-draft-card';
import WorkerActionCard, { MealOffNote } from '@/components/worker-action-card';
import WorkerMultiCard from '@/components/worker-multi-card';
import { demoWorkerExecutor, makeWorkerErasePreview, makeWorkerExecutor } from '@/lib/worker-actions';
import { demoMultiDeps, makeMultiDeps } from '@/lib/worker-multi';
import { isNewRequest } from '@/supabase/functions/_shared/fr-langue';
import { nouvelleDemandeSalarie, profilSaisie, WORKER_TEXT_MAX } from '@/supabase/functions/_shared/saisie-profil';
import { useAiEnabled } from '@/lib/real-cost';
import { useMealEnabled } from '@/lib/meal-setting';
import {
  DEMO_PHRASE_LONGUE, demoSaver, demoWorkerSource, isWorkerAssistantDemo, makeWorkerSaver, supabaseWorkerSource,
  WORKER_ACTION_SUGGESTIONS, type DraftExtra, type MultiExtra, type WorkerActionExtra,
} from '@/lib/worker-assistant';

// Dictée : français par défaut, turc au choix (mémorisé). Les cartes et boutons restent en français.
const DICTATION_LANGS = [
  { code: 'fr-FR', label: 'Français', aria: 'Dicter en français' },
  { code: 'tr-TR', label: 'Türkçe', aria: 'Dicter en turc' },
];
/** Une phrase longue peut demander plusieurs secondes (réflexion plus poussée du modèle) : on le dit au bout de 4 s. */
const slowHint = (t: string) => (profilSaisie(t).long ? 'Je lis votre message… cela peut prendre quelques secondes.' : null);
/** Une phrase longue, à plusieurs actions ou en turc est une NOUVELLE demande, pas la réponse à la question en attente. */
const isNewWorkerRequest = (t: string) => isNewRequest(t) || nouvelleDemandeSalarie(t);

export default function WorkerAssistant({ onSaved, onNavigate, defaultOpen = false, open, onOpenChange }: {
  onSaved?: () => void; onNavigate?: (action: string) => void; defaultOpen?: boolean;
  /** Lot 6 : ouvert par le bouton ✨ de la barre du bas (plus de bouton flottant). */
  open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const demo = useMemo(() => isWorkerAssistantDemo(), []);
  const ai = useAiEnabled(demo ? null : user?.company_id);
  // Lot 3 bis : panier repas non utilisé par l'entreprise → refus poli dans la bulle.
  // Le serveur (non redéployé) peut encore proposer l'action : le navigateur la refuse.
  const meal = useMealEnabled(demo ? null : user?.company_id);
  const source = useMemo(() => (demo ? demoWorkerSource() : supabaseWorkerSource), [demo]);
  const isWorker = user?.role === 'worker' || user?.role === 'lead';
  if (!demo && !(ai && isWorker)) return null;

  return (
    <AssistantPanel
      source={source}
      memoryKey={`salarie:${user?.id ?? 'demo'}`}
      attachments
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      launcher={open === undefined}
      onNavigate={onNavigate ?? (() => {})}
      suggestions={demo ? [DEMO_PHRASE_LONGUE, ...WORKER_ACTION_SUGGESTIONS] : WORKER_ACTION_SUGGESTIONS}
      maxChars={WORKER_TEXT_MAX}
      dictationLangs={DICTATION_LANGS}
      slowHint={slowHint}
      restoreOnFailure
      isNewRequest={isNewWorkerRequest}
      footNote="Gestes simples faits tout de suite · « Annuler » en un clic"
      intro="Dites-moi vos heures, ce que vous voulez faire, ou comment faire"
      renderExtra={(extra, ctl) => {
        // Une fiche à plusieurs actions : TOUJOURS testée en premier (elle n'a pas de `draft`), et jamais rendue par une carte qui s'exécute au montage.
        if ((extra as MultiExtra).multi) {
          const exec = demo || !user ? demoWorkerExecutor : makeWorkerExecutor({ id: user.id, company_id: user.company_id });
          const deps = demo || !user ? demoMultiDeps() : makeMultiDeps({ id: user.id, company_id: user.company_id }, exec);
          return <WorkerMultiCard extra={extra as MultiExtra} deps={deps} meal={meal} onDone={onSaved} ctl={ctl} />;
        }
        if ((extra as WorkerActionExtra).workerAction) {
          if (meal === false && (extra as WorkerActionExtra).workerAction.draft.type === 'panier_repas') return <MealOffNote ctl={ctl} />;
          const exec = demo || !user ? demoWorkerExecutor : makeWorkerExecutor({ id: user.id, company_id: user.company_id });
          // Lot 1 : la carte « effacer mes heures » lit d'abord ce qui partirait (pas en démo).
          const preview = demo || !user ? undefined : makeWorkerErasePreview({ id: user.id });
          return <WorkerActionCard extra={extra as WorkerActionExtra} execute={exec} onDone={onSaved} ctl={ctl} preview={preview} />;
        }
        const x = extra as DraftExtra;
        const save = demo || !user ? demoSaver : makeWorkerSaver({ id: user.id, company_id: user.company_id }, x.chantiers);
        return <WorkerDraftCard extra={x} save={save} onSaved={onSaved} ctl={ctl} />;
      }}
    />
  );
}
