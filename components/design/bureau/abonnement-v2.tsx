'use client';

// Design du bureau · lot 3 B · RG12, RG13, RG15, XM12 : « Choisissez votre abonnement », l'écran de blocage d'essai et l'activation après paiement.
// HABILLAGE SEULEMENT : le paiement ne change pas. Les forfaits, le choix recommandé, le bouton qui appelle la fonction `stripe-checkout` et la redirection
// restent ceux de components/subscribe-panel.tsx, passé par app/admin/page.tsx (prop `Panneau`) et rendu ici TEL QUEL (seule la feuille lot3b-v2.css l'habille, sous .dz-l3-abo). Le blocage et l'attente
// d'activation (lecture de subscription_status) restent décidés par app/admin/page.tsx. Chargée en différé, seulement avec `?ui=2`.
// Écart assumé à la planche (RG13) : la barre noire de l'écran de blocage ne montre que le logo (l'Assistant et le menu du compte vivent dans le
// planning, qui n'est pas affiché quand l'essai bloque).
import type { ComponentType } from 'react';
import CoqueL3 from './coque-l3';
import './lot3b-v2.css';

type Panneau = ComponentType<{ workerCount?: number }>;
type Props =
  | { mode: 'fenetre'; open: boolean; onOpenChange: (o: boolean) => void; workerCount: number; Panneau: Panneau }
  | { mode: 'blocage'; workerCount: number; apercu: boolean; Panneau: Panneau }
  | { mode: 'activation' };

const s = (n: number) => (n > 1 ? 's' : '');

export default function AbonnementV2(p: Props) {
  if (p.mode === 'activation') {
    return (
      <div className="dz-l3-activation dz-portail" role="status" data-testid="activation-v2">
        <div className="dz-l3-activation__boite">
          <div className="dz-l3-rond" aria-hidden="true" />
          <h2>Activation de votre abonnement…</h2>
          <p>Merci ! Nous confirmons votre paiement, un instant.</p>
        </div>
      </div>
    );
  }
  if (p.mode === 'blocage') {
    const n = p.workerCount;
    return (
      <div className="dz-l3-page dz-portail" data-testid="blocage-v2">
        <div className="dz-l3-page__barre"><span className="dz-l3-logo" aria-label="BEMEXO">BEME<i>X</i>O</span></div>
        <main className="dz-l3-page__corps dz-l3-abo">
          <h1 className="dz-l3-page__titre">Votre essai gratuit est terminé.</h1>
          <p className="dz-l3-page__sous">
            {n > 0 ? <>Vous avez <b>{n} salarié{s(n)}</b> enregistré{s(n)} — voici l&apos;offre qui correspond à votre équipe.</>
              : <>Choisissez l&apos;offre adaptée à votre équipe pour continuer à utiliser BEMEXO.</>}
          </p>
          <p.Panneau workerCount={n} />
          {p.apercu && <p className="dz-l3-page__note">Aperçu : ce blocage n&apos;est actif qu&apos;en preview tant que le paywall n&apos;est pas activé en production.</p>}
        </main>
      </div>
    );
  }
  return (
    <CoqueL3 open={p.open} onOpenChange={p.onOpenChange} forme="centree" titre="Choisissez votre abonnement" testId="subscribe-dialog" portee="dz-l3-abo">
      {p.workerCount > 0 && <p className="dz-l3-abo__sous">{p.workerCount} salarié{s(p.workerCount)} actif{s(p.workerCount)}.</p>}
      <p.Panneau workerCount={p.workerCount} />
    </CoqueL3>
  );
}
