'use client';

// Lot 11 — « ⚠ N réserves à lever › » sur l'accueil du salarié.
//
// Sans ce bandeau, une réserve de lundi était introuvable le mardi : « Ma
// journée » ne montre que le jour affiché. Même habillage que « journées à
// envoyer » (bt-alert). Un appui ouvre la liste (date · chantier · détail) avec,
// sous chaque réserve, le MÊME formulaire que le bureau : commentaire et photo
// facultatifs, puis « Lever la réserve ».

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useUi2 } from '@/components/design/salarie/shell-v2';
import { FeuilleCorps, FeuilleTete } from '@/components/design/salarie/feuille';
import { useRetourFerme } from '@/components/design/salarie/retour';
import { useClavier } from '@/components/design/salarie/clavier';
import { ReserveLiftForm } from '@/components/reserve-lift-lazy';
import { AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { liftReserve, undoWorkerLift, liftErrorMessage, announceReservesChanged } from '@/lib/reserve-lift';

export interface WorkerReserve {
  id: string;
  work_date: string;
  observation: string | null;
  worksite_id: string | null;
  chantier: string;
  city: string | null;
}

export default function WorkerReserves({ items, onChanged, openAsk, onAskDone }: { items: WorkerReserve[]; onChanged: () => void; /** ?ui=2 : demande d'ouverture de la liste (entrée « Réserves à lever » du menu Plus) ; `onAskDone` la consomme. */ openAsk?: boolean; onAskDone?: () => void }) {
  const { user } = useAuth();
  const ui2 = useUi2();
  const [open, setOpen] = useState(false);
  const [liftingId, setLiftingId] = useState<string | null>(null);
  // ?ui=2 : le retour du téléphone referme la liste (comme les autres feuilles de « Ma journée »).
  useRetourFerme(ui2 && open, () => { setOpen(false); setLiftingId(null); });
  useClavier(ui2 && open); // la feuille se lève au-dessus du clavier (champ « Commentaire »)

  useEffect(() => { if (openAsk) { setOpen(true); onAskDone?.(); } }, [openAsk, onAskDone]);

  // Liste vidée (relecture, levée ailleurs) : elle se referme d'elle-même.
  useEffect(() => { if (open && items.length === 0) { setOpen(false); setLiftingId(null); } }, [open, items.length]);

  const lift = async (r: WorkerReserve, note: string, photo: File | null) => {
    if (!user) return;
    try {
      const res = await liftReserve({
        role: 'worker', companyId: user.company_id, userId: user.id,
        entryId: r.id, worksiteId: r.worksite_id, note, photo,
      });
      setLiftingId(null);
      // La liste se referme après CHAQUE levée (le bandeau reste, avec une de
      // moins) : une fenêtre ouverte rend inerte tout ce qui est derrière elle,
      // y compris le message ci-dessous — son « Annuler » serait intouchable.
      setOpen(false);
      toast.success('Réserve levée', {
        duration: 10_000,
        action: {
          label: 'Annuler',
          onClick: async () => {
            try {
              await undoWorkerLift(r.id, res.photo);
              toast.success('Réserve remise à lever');
            } catch (e) {
              toast.error(liftErrorMessage(e, true));
            }
            onChanged();
            announceReservesChanged();
          },
        },
      });
      onChanged();
      announceReservesChanged();
    } catch (e) {
      toast.error(liftErrorMessage(e, true));
      throw e; // le formulaire reste ouvert, avec la saisie
    }
  };

  const n = items.length;
  if (!n && !open) return null;

  return (
    <>
      {n > 0 && (
        <button className="bt-alert" onClick={() => setOpen(true)} aria-label="Réserves à lever" data-testid="reserves-banner" data-guide="reserves.bandeau">
          <span className="bt-alert-badge"><AlertTriangle className="h-3.5 w-3.5" /></span>
          <span className="bt-alert-txt">{n} réserve{n > 1 ? 's' : ''} à lever</span>
          <span className="bt-alert-chev">›</span>
        </button>
      )}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setLiftingId(null); }}>
        <DialogContent feuille={ui2} className={ui2 ? undefined : 'bt-skin max-w-md max-h-[86vh] overflow-y-auto'} data-testid="reserves-dialog">
          <FeuilleTete ui2={ui2} kicker="RÉSERVES" titre={<DialogTitle>Réserves à lever</DialogTitle>} />
          <FeuilleCorps ui2={ui2}>
          <div className="bt-wr-list">
            {items.map((r) => (
              <div key={r.id} className="bt-wr-item" data-testid="wr-item">
                <div className="bt-wr-meta">
                  <span className="bt-wr-date">{format(parseISO(r.work_date), 'EEE d MMM', { locale: fr })}</span>
                  <span className="bt-wr-site">· {r.chantier}{r.city ? `, ${r.city}` : ''}</span>
                </div>
                {r.observation
                  ? <div className="bt-wr-obs">{r.observation}</div>
                  : <div className="bt-wr-noobs">Sans détail écrit.</div>}
                {liftingId === r.id ? (
                  <ReserveLiftForm tu onSubmit={(note, photo) => lift(r, note, photo)} onCancel={() => setLiftingId(null)} />
                ) : (
                  <button type="button" className="bt-wr-go" data-testid="wr-lift" data-guide="reserves.lever" onClick={() => setLiftingId(r.id)}>
                    ✓ Lever la réserve
                  </button>
                )}
              </div>
            ))}
          </div>
          </FeuilleCorps>
        </DialogContent>
      </Dialog>
    </>
  );
}

