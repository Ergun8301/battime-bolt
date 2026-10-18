'use client';

// Lot 5 « site rapide 1 » : l'assistant du bureau, sorti du premier chargement de /admin.
// Le bloc est celui qui vivait dans admin-planning.tsx, déplacé tel quel : le câblage
// (navigation, ouverture des versions, rechargement) reste dans la page, qui connaît ses fenêtres.
//
// Bureau v2 (`?ui=2`, drapeau `data-dz-bureau` posé sur <html> par le planning v2), à partir de 641 px : quand l'assistant OUVRE un écran
// (bouton d'action comme « Salariés → », lien « ouvrir: », ouverture sans toucher), son panneau se réduit en une pastille ✦ en bas à droite
// (point rouge si une réponse arrive entre-temps) ; l'écran prend toute la place. Un clic sur la pastille rouvre le panneau, conversation intacte
// (le panneau reste monté, il est seulement masqué par `data-dz-as-reduit` sur <html>). Fermer l'écran ne rouvre rien. Sans le drapeau : rien ne change.
// Aucun appel au serveur, aucun registre, aucun guide touché : seuls l'affichage et l'appel à `onNavigate` sont enveloppés.
//
// Bureau v2 encore : « Versions du planning » n'est plus offert dans l'interface (demande d'Ergun). Le serveur, son registre et son empreinte ne changent
// pas ; ici, sous le drapeau seulement, un bouton qui ouvrirait cet écran (lien `ouvrir:planning.versions`, guide `guide:versions`, lien « Versions de la
// semaine » sous une action faite) n'est pas affiché, dans une réponse comme dans une conversation relue.
import { useEffect, useRef, useState } from 'react';
import AssistantPanel from '@/components/assistant-panel';
import AssistantActionCard from '@/components/assistant-action-card';
import { supabaseAssistantSource, type AssistantSource } from '@/lib/assistant';
import { supabaseChatStore, type ChatStore } from '@/lib/assistant-chats';
import { makeActionExecutor, makeRemovalPreview, type ActionExtra } from '@/lib/assistant-actions';

const bureauV2 = () => typeof document !== 'undefined' && document.documentElement.hasAttribute('data-dz-bureau');
const VERSIONS = /^(ouvrir:planning\.versions(\?|$)|guide:versions$)/;
const sansVersions = <T extends { action: string }>(liens: T[]): T[] => (bureauV2() ? liens.filter((l) => !VERSIONS.test(l.action)) : liens);
const source: AssistantSource = {
  demo: supabaseAssistantSource.demo,
  ask: async (question, file, history) => { const r = await supabaseAssistantSource.ask(question, file, history); return r.links ? { ...r, links: sansVersions(r.links) } : r; },
};
const chats: ChatStore = {
  list: () => supabaseChatStore.list(), remove: (id) => supabaseChatStore.remove(id), clear: () => supabaseChatStore.clear(),
  append: (chatId, q, a, links) => supabaseChatStore.append(chatId, q, a, links),
  load: async (id) => (await supabaseChatStore.load(id)).map((m) => (m.links ? { ...m, links: sansVersions(m.links) } : m)),
};

/** La réduction en pastille : bureau v2 seulement, hors téléphone (au téléphone, le panneau se ferme déjà en ouvrant un écran). */
const reductionActive = () => typeof document !== 'undefined' && document.documentElement.hasAttribute('data-dz-bureau') && !window.matchMedia('(max-width: 640px)').matches;
/** Fenêtres et panneaux de l'app (Radix) ouverts, hors assistant. */
const nbEcrans = () => document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length;
/** Délai pendant lequel un écran qui s'ouvre est attribué à l'assistant (clic sur un de ses liens, ou réponse qui ouvre « sans toucher »). */
const FENETRE_MS = 1200;

export default function AssistantBureau({ user, open, onOpenChange, onNavigate, onDone, onOpenVersions }: {
  user: { id: string; company_id: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (action: string) => void;
  /** Une action de l'assistant a écrit : la page recharge ce qu'elle affiche. */
  onDone: () => void;
  onOpenVersions: (monday: string) => void;
}) {
  const [reduit, setReduit] = useState(false);
  const [nonLu, setNonLu] = useState(false);
  const pastille = useRef<HTMLButtonElement>(null);
  const signal = useRef({ t: 0, base: 0 });
  const reduitRef = useRef(false);
  reduitRef.current = reduit;
  useEffect(() => { if (!open) { setReduit(false); setNonLu(false); } }, [open]);
  // L'état « réduit » est posé sur <html> (aucun élément de plus autour du panneau : sans le drapeau, le HTML du bureau d'avant ne change pas d'un octet).
  useEffect(() => {
    const h = document.documentElement;
    if (open && reduit) h.setAttribute('data-dz-as-reduit', ''); else h.removeAttribute('data-dz-as-reduit');
    return () => h.removeAttribute('data-dz-as-reduit');
  }, [open, reduit]);

  // Un lien de la réponse est cliqué, ou une réponse arrive (elle peut ouvrir un écran toute seule) : un écran qui s'ouvre dans la foulée vient de l'assistant.
  useEffect(() => {
    // Bureau d'avant (sans drapeau) : rien n'est écouté.
    if (!open || !document.documentElement.hasAttribute('data-dz-bureau')) return;
    // Le panneau est monté par AssistantPanel juste après l'ouverture : on écoute le document, en ne retenant que ce qui se passe dans le panneau.
    const el = document.body;
    const panneau = () => document.querySelector('[data-testid=assistant-panel]');
    const armer = () => { signal.current = { t: Date.now(), base: nbEcrans() }; };
    const clic = (e: Event) => { const b = (e.target as HTMLElement | null)?.closest?.('.as-links button'); if (b && b.closest('[data-testid=assistant-panel]')) armer(); };
    el.addEventListener('click', clic, true);
    const nbReponses = () => panneau()?.querySelectorAll('.as-bot').length ?? 0;
    let nbBot = nbReponses();
    const reponses = new MutationObserver(() => {
      const n = nbReponses();
      if (n > nbBot) { armer(); if (reduitRef.current) setNonLu(true); }
      nbBot = n;
    });
    reponses.observe(el, { childList: true, subtree: true });
    // Les fenêtres Radix s'ajoutent directement dans <body> (portails).
    const ecrans = new MutationObserver(() => {
      const s = signal.current;
      if (reduitRef.current || Date.now() - s.t > FENETRE_MS || !reductionActive()) return;
      if (nbEcrans() > s.base) { signal.current = { t: 0, base: 0 }; setReduit(true); }
    });
    ecrans.observe(document.body, { childList: true });
    return () => { el.removeEventListener('click', clic, true); reponses.disconnect(); ecrans.disconnect(); };
  }, [open]);

  // Comme la pastille du téléphone (assistant-panel v2) : elle vit HORS des fenêtres Radix ; un clic ou un focus sur elle ne les ferme pas.
  useEffect(() => {
    const el = pastille.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('pointerdown', stop); el.addEventListener('focusin', stop);
    return () => { el.removeEventListener('pointerdown', stop); el.removeEventListener('focusin', stop); };
  }, [reduit, open]);

  // Bureau v2 : un clic ou un toucher EN DEHORS du panneau le réduit en pastille ✦ (conversation gardée), au lieu de le laisser par-dessus le planning.
  // Ne compte pas : la pastille, le bouton ✦ de la barre, une fenêtre / un menu / un message ouverts par-dessus (une question de l'assistant y est souvent).
  useEffect(() => {
    if (!open || reduit || !reductionActive()) return;
    const f = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.isConnected || t.closest('[data-testid=assistant-panel], [data-testid=assistant-pastille], [data-testid=bar-assistant], [role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper], [data-sonner-toaster]')) return;
      setReduit(true);
    };
    document.addEventListener('pointerdown', f, true);
    return () => document.removeEventListener('pointerdown', f, true);
  }, [open, reduit]);
  // Réduit : le bouton ✦ de la barre rouvre le panneau (comme la pastille).
  useEffect(() => {
    if (!open || !reduit) return;
    const f = (e: MouseEvent) => { if ((e.target as HTMLElement | null)?.closest?.('[data-testid=bar-assistant]')) { setReduit(false); setNonLu(false); } };
    document.addEventListener('click', f, true);
    return () => document.removeEventListener('click', f, true);
  }, [open, reduit]);

  const rouvrir = () => {
    setReduit(false); setNonLu(false);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid=assistant-panel] textarea, [data-testid=assistant-panel] button')?.focus({ preventScroll: true }));
  };

  return (
    <>
      <AssistantPanel
        source={source}
        // Ici la source est toujours la vraie fonction : l'historique est donc le vrai aussi (la démo du bureau, /apercu/assistant, monte le panneau elle-même).
        chats={chats}
        memoryKey={`bureau:${user.id}`}
        attachments
        open={open}
        onOpenChange={onOpenChange}
        launcher={false}
        onNavigate={(action) => {
          // « planning » referme l'assistant (page) ; un guide le replie (page) : rien à réduire. Tout autre bouton d'action ouvre un écran.
          if (action !== 'planning' && !action.startsWith('guide') && reductionActive()) setReduit(true);
          onNavigate(action);
        }}
        renderExtra={(extra, ctl) => (
          <AssistantActionCard
            extra={extra as ActionExtra}
            ctl={ctl}
            execute={makeActionExecutor({ id: user.id, company_id: user.company_id })}
            preview={makeRemovalPreview({ company_id: user.company_id })}
            onDone={onDone}
            onOpenVersions={bureauV2() ? undefined : onOpenVersions}
          />
        )}
      />
      {open && reduit && (
        <button type="button" ref={pastille} className="dz-as-pastille-v2" onClick={rouvrir} data-testid="assistant-pastille" data-non-lu={nonLu ? '' : undefined}
          aria-label={nonLu ? 'Rouvrir l’Assistant BEMEXO (nouvelle réponse)' : 'Rouvrir l’Assistant BEMEXO'} title="Rouvrir l’Assistant BEMEXO">
          <span aria-hidden="true">✦</span>{nonLu && <span className="dz-as-pastille-v2__point" aria-hidden="true" />}
        </button>
      )}
    </>
  );
}
