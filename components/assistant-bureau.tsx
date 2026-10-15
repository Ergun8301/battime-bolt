'use client';

// Lot 5 « site rapide 1 » : l'assistant du bureau, sorti du premier chargement de /admin.
// Le bloc est celui qui vivait dans admin-planning.tsx, déplacé tel quel : le câblage
// (navigation, ouverture des versions, rechargement) reste dans la page, qui connaît ses fenêtres.
import AssistantPanel from '@/components/assistant-panel';
import AssistantActionCard from '@/components/assistant-action-card';
import { supabaseAssistantSource } from '@/lib/assistant';
import { supabaseChatStoreBureau } from '@/lib/assistant-chats';
import { makeActionExecutor, makeRemovalPreview, type ActionExtra } from '@/lib/assistant-actions';

export default function AssistantBureau({ user, open, onOpenChange, onNavigate, onDone, onOpenVersions }: {
  user: { id: string; company_id: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (action: string) => void;
  /** Une action de l'assistant a écrit : la page recharge ce qu'elle affiche. */
  onDone: () => void;
  onOpenVersions: (monday: string) => void;
}) {
  return (
    <AssistantPanel
      source={supabaseAssistantSource}
      // Ici la source est toujours la vraie fonction : l'historique est donc le vrai aussi (la démo du bureau, /apercu/assistant, monte le panneau elle-même).
      chats={supabaseChatStoreBureau}
      memoryKey={`bureau:${user.id}`}
      attachments
      open={open}
      onOpenChange={onOpenChange}
      launcher={false}
      onNavigate={onNavigate}
      renderExtra={(extra, ctl) => (
        <AssistantActionCard
          extra={extra as ActionExtra}
          ctl={ctl}
          execute={makeActionExecutor({ id: user.id, company_id: user.company_id })}
          preview={makeRemovalPreview({ company_id: user.company_id })}
          onDone={onDone}
          onOpenVersions={onOpenVersions}
        />
      )}
    />
  );
}
