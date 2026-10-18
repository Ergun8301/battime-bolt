'use client';

// Design du bureau · lot 3 B · RG10 : « Déconnecter la tablette ? » en fenêtre posée sur le panneau « Borne de pointage ».
// La question existait déjà (« Oui, déconnecter » / « Non », en ligne) : même état (confirmDisc), même appel (disconnect → fonction `kiosk`, action
// revoke), seule la forme change. Chargée en différé, seulement avec `?ui=2`.
import { FenetreL3 as FenetreBureau, BoutonL3 as BoutonBureau } from './coque-l3';
import './lot3b-v2.css';

export default function DeconnecterV2({ busy, onConfirm, onCancel }: { busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <FenetreBureau
      open onOpenChange={(o) => { if (!o && !busy) onCancel(); }} etroite titre="Déconnecter la tablette ?" testId="ka-disconnect-confirm" className="dz-l3"
      pied={(
        <>
          <BoutonBureau disabled={busy} onClick={onCancel}>Annuler</BoutonBureau>
          <BoutonBureau ton="destructif" disabled={busy} onClick={onConfirm} data-testid="ka-disconnect-yes">
            {busy && <span className="dz-l3-attente" aria-hidden="true" />} {busy ? 'Déconnexion…' : 'Déconnecter'}
          </BoutonBureau>
        </>
      )}
    >
      <p className="dz-l3-note">Ses QR ne fonctionneront plus. Pour pointer de nouveau à l’entrée, il faudra relier une tablette.</p>
    </FenetreBureau>
  );
}
