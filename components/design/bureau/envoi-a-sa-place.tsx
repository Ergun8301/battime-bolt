'use client';

// « Envoyer à sa place » : le bloc jaune, bien en vue, posé dans la fenêtre d'une intervention du planning (fiche-v2.tsx) et dans la fiche d'une ligne de la
// feuille d'heures (feuille-heures-v2.tsx). Même dessin, même confirmation aux deux endroits ; l'écriture reste celle de lib/admin-writes.ts (sendDraftForWorker).
import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import './envoi-a-sa-place.css';

export function EnvoiASaPlace({ prenom, heures, envoyer, enCours = false, testId = 'send-for-worker' }: {
  /** Le prénom du salarié (« Envoyer ces heures pour Bruno ? »). */
  prenom: string;
  /** Les heures saisies, lisibles (« 08:00 → 12:00 »). */
  heures: string;
  envoyer: () => unknown | Promise<unknown>;
  enCours?: boolean;
  testId?: string;
}) {
  const [confirmer, setConfirmer] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const charge = enCours || occupe;
  const ok = async () => { setOccupe(true); try { await envoyer(); } finally { setOccupe(false); setConfirmer(false); } };
  return (
    <div className="dz-envoi" data-testid={`${testId}-box`}>
      <p className="dz-envoi__txt"><b>{heures} saisies, pas encore envoyées.</b> Elles ne comptent pas tant qu’elles ne sont pas envoyées.</p>
      {confirmer ? (
        <div className="dz-envoi__confirm" data-testid={`${testId}-confirm`}>
          <span>Envoyer ces heures pour {prenom} ? Elles compteront, et {prenom} sera prévenu.</span>
          <div className="dz-envoi__choix">
            <button type="button" className="dz-envoi__non" disabled={charge} onClick={() => setConfirmer(false)}>Annuler</button>
            <button type="button" className="dz-envoi__btn" disabled={charge} onClick={ok} data-testid={`${testId}-ok`}>
              {charge ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-[18px] w-[18px]" aria-hidden="true" />} Envoyer
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="dz-envoi__btn" onClick={() => setConfirmer(true)} data-testid={testId}>
          <Send className="h-5 w-5" aria-hidden="true" /> Envoyer à sa place
        </button>
      )}
    </div>
  );
}
