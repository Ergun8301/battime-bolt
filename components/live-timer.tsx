'use client';

// Pointage en direct (étape 16).
//
// POURQUOI. Jusqu'ici le salarié tapait ses heures de mémoire, souvent le soir
// ou le lendemain. C'est la source de presque tout ce qu'on a corrigé dans ce
// plan : journées oubliées, brouillons jamais envoyés, interventions du
// dimanche restées en attente. Pointer en arrivant et en partant retire la
// mémoire de l'équation.
//
// LA RÈGLE QUI COMMANDE TOUT : UN CHRONO EN COURS N'EST PAS UNE HEURE
// TRAVAILLÉE. Il vit dans sa propre table, hors de `time_entries` : ni la paie,
// ni le coût chantier, ni les récapitulatifs ne peuvent le compter par
// inadvertance. Une intervention n'existe qu'au moment où le salarié ferme.
//
// ON NE DEVINE JAMAIS L'HEURE DE FIN. Un salarié qui oublie de fermer ne
// produit pas une journée de quinze heures — et pas davantage une journée
// coupée à une heure inventée. On lui DEMANDE à quelle heure il a fini, comme
// on lui demande déjà si un trou était de la route ou une pause.

// LOT 9 : CE BLOC NE SAIT PLUS QUE MONTRER LE CHRONO QUI TOURNE. Le départ se
// fait sur la carte du chantier (« Je commence », components/poseur-day.tsx) :
// plus de liste déroulante à part, le chantier est celui qu'on touche. Et
// « J'ai fini » marche à tout moment : l'heure réelle est gardée, à la minute
// (lib/live-session.ts → finish_active_session).

// LOT 12 : UNE PETITE CARTE, PLUS UN GROS BLOC. Le téléphone ne COMMENCE plus
// de journée (avec une tablette : par le QR seulement ; sans tablette : le
// salarié saisit ses heures). Il peut seulement TERMINER un pointage ouvert —
// « Tu es pointé depuis 08:00 — Terminer ma journée » —, par exemple quand il
// a oublié de rescanner en partant. Plus de bouton « Annuler » (moins d'une
// minute = annulé tout seul), plus d'endroit demandé au téléphone.

import { useEffect, useState } from 'react';
import { finishLiveSession, announceLiveChange, type OwnLiveSession } from '@/lib/live-session';
import { parisHHmm } from '@/lib/utils';
import { TimeField } from '@/components/time-field';
import { Square, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { addDays, format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import type { Worksite } from '@/lib/types';
import { useUi2 } from '@/components/design/salarie/shell-v2'; // coque v2 (?ui=2) : la carte de pointage de la planche
import TermineLe from '@/components/termine-le'; // lot 23 : « Terminé le … » (le pointage en cours continue normalement)

interface Props {
  userId: string;
  /** Le chrono ouvert, lu et tenu à jour par la journée (useOwnLiveSession). Rien à montrer sans lui. */
  session: OwnLiveSession | null;
  /** Jour courant (ISO) : un chrono d'un autre jour est un pointage oublié. */
  today: string;
  worksites: Worksite[];
  /**
   * L'entreprise a activé l'enregistrement de l'endroit (étape 26).
   *
   * CE DRAPEAU N'EST PAS LA PROTECTION, il en est la façade. La vraie barrière
   * est en base : un trigger efface la position si l'entreprise ne l'a pas
   * activée, et la fermeture n'écrit rien dans ce cas. Ici, il sert à ne pas
   * déclencher une demande d'autorisation du navigateur pour une donnée que la
   * base jettera — demander pour rien est la meilleure façon de faire refuser
   * quelqu'un.
   */
  positionActive?: boolean;
}

const fmtElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export default function LiveTimer({ userId, session, today, worksites }: Props) {
  const ui2 = useUi2();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Heure de fin proposée quand le chrono a été oublié d'un jour sur l'autre.
  const [endGuess, setEndGuess] = useState('17:00');
  // Le chrono qu'on vient de fermer d'ici : on ne le montre plus en attendant
  // la relecture (sinon un second appui partirait sur un chrono déjà fermé).
  const [closed, setClosed] = useState<string | null>(null);
  // Pointage oublié : heure de fin indiquée avant (ou égale à) l'heure de début.
  const [endBeforeStart, setEndBeforeStart] = useState(false);

  // La pendule ne tourne que s'il y a quelque chose à compter.
  useEffect(() => {
    if (!session) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session]);

  // Un autre chrono (ou plus de chrono) : on repart propre.
  useEffect(() => { setEndBeforeStart(false); }, [session?.started_at]);

  // Fermé d'ici : on le cache tout de suite, et la journée relit (LIVE_CHANGED).
  const done = (startedAt: string) => { setClosed(startedAt); announceLiveChange(); };

  // Ouvert un jour PRÉCÉDENT : une fin avant le début est une fin le lendemain
  // (nuit à cheval, même règle que finish_active_session). Fin = début : rien.
  const finLendemain = (end: string) => !!session && session.work_date < today && end < parisHHmm(session.started_at);

  /**
   * « J'ai fini » — À N'IMPORTE QUEL MOMENT (lot 9).
   *
   * Ferme le chrono et crée l'intervention EN UNE SEULE ÉCRITURE côté serveur
   * (soit les deux, soit aucune : un réseau qui lâche entre les deux ne crée
   * plus de doublon). L'heure réelle est gardée : début tronqué à la minute,
   * fin arrondie au-dessus — jamais une minute contre le salarié.
   *
   * Moins d'une minute : ce n'était pas du travail, c'était un appui de trop.
   * Le chrono est effacé, SANS message d'erreur — l'ancien mur « tu viens de
   * démarrer » a disparu avec l'arrondi au quart d'heure.
   */
  const stop = async (endTime?: string) => {
    if (!session) return;
    // Pointage oublié : une fin avant le début n'a rien à compter, et le serveur
    // l'annulerait sans un mot. On le dit AVANT, pour qu'il corrige l'heure.
    // Sauf la NUIT À CHEVAL : chrono d'un jour précédent, fin avant le début =
    // fin le lendemain (18:00 → 00:30), écrite comme une ligne de nuit.
    if (endTime && endTime <= parisHHmm(session.started_at) && !finLendemain(endTime)) { setEndBeforeStart(true); return; }
    setEndBeforeStart(false);
    setBusy(true);
    try {
      // Même geste que l'Assistant BEMEXO : lib/live-session.ts. On ne demande
      // pas l'endroit sur un pointage oublié (domicile) ; `started_at` vient du serveur.
      // Lot 12 : aucun endroit demandé au téléphone (il ne commence plus de journée).
      const r = await finishLiveSession({ userId, startedAt: session.started_at, positionActive: false, endTime });
      if (r.kind === 'saved') {
        done(session.started_at);
        const nuit = r.end_time.slice(0, 5) < r.start_time.slice(0, 5) ? ' (le lendemain)' : '';
        toast.success(`Pointage fermé — ${r.start_time.slice(0, 5)} à ${r.end_time.slice(0, 5)}${nuit}`);
      } else if (r.kind === 'cancelled') {
        done(session.started_at);
        toast.message(endTime ? 'Pointage annulé — rien n’a été compté' : 'Pointage annulé (moins d’une minute)');
      } else if (r.kind === 'stale') {
        done(session.started_at);
        toast.message('Ce pointage était déjà fermé (borne ou autre appareil) — l’écran est à jour.');
      } else {
        // Serveur pas encore passé au lot 9 (quart d'heure) : rien n'est écrit,
        // le chrono reste ouvert. Une ligne, neutre, avec la sortie.
        toast.message('Rien à compter pour l’instant : réessaie dans quelques minutes.');
      }
    } catch (e) {
      // Le chrono reste ouvert et reste affiché : rien n'a été écrit.
      announceLiveChange();
      toast.error((e as { message?: string })?.message || 'La fermeture a échoué. Le pointage reste ouvert.');
    } finally {
      setBusy(false);
    }
  };

  // Rien qui tourne : plus rien à montrer ici. Le départ est sur les cartes.
  if (!session || session.started_at === closed) return null;

  const site = worksites.find((w) => w.id === session.worksite_id);
  const startedHHmm = parisHHmm(session.started_at);
  const elapsed = now - new Date(session.started_at).getTime();
  // Oublié d'un jour sur l'autre : on ne ferme pas à une heure inventée.
  const stale = session.work_date !== today;

  return (
    <div className={`bt-lt ${stale ? 'late' : 'on'}`} data-testid="live-timer">
      {stale ? (
        <>
          <div className="bt-lt-k"><AlertTriangle className="h-3.5 w-3.5" /> Sortie oubliée</div>
          <div className="bt-lt-line">
            <span className="bt-lt-site">{site?.client_name || 'Chantier'}</span>
            <span className="bt-lt-since">depuis {format(parseISO(session.work_date), 'EEEE d', { locale: fr })} {startedHHmm}</span>
          </div>
          <TermineLe ws={site} dark />
          <div className="bt-lt-ask">
            <div className="bt-lt-asklab">Tu as fini à quelle heure&nbsp;?</div>
            <TimeField value={endGuess} onChange={(v) => { setEndGuess(v); setEndBeforeStart(false); }} ariaLabel="Heure de fin" testId="lt-end" />
            {/* Fin avant le début sur un chrono de la veille : la nuit compte,
                et on le DIT avant d'écrire (18:00 → 06:30 = douze heures et demie). */}
            {finLendemain(endGuess) && (
              <div className="bt-lt-note" data-testid="fin-lendemain">
                Fin <b>le lendemain</b> ({format(addDays(parseISO(session.work_date), 1), 'EEEE d MMMM', { locale: fr })}) à {endGuess} :
                la nuit est comptée sur la journée du début.
              </div>
            )}
          </div>
          <div className="bt-lt-row">
            <button type="button" className="bt-lt-btn stop" disabled={busy || !endGuess} onClick={() => stop(endGuess)} data-testid="lt-finish" data-guide="journee.terminer">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />} Terminer ma journée
            </button>
          </div>
          {endBeforeStart && (
            <div className="bt-lt-note warn">
              {session.work_date < today
                ? <>Fin et début à la même heure ({startedHHmm})&nbsp;: rien à compter. Indique l&apos;heure où tu as fini.</>
                : <>Indique une heure <b>après {startedHHmm}</b>.</>}
            </div>
          )}
        </>
      ) : (
        <div className="bt-lt-one">
          {ui2 ? (
            // Coque v2 (planche, E05) : « ● POINTAGE EN COURS · DEPUIS 12:30 », le chrono en grand (h:mm), le lieu à droite, « Terminer ma journée » en crème.
            <>
              <div className="dz-pointage-k"><span className="dz-pointage-point" aria-hidden="true" />Pointage en cours · depuis {startedHHmm}</div>
              <div className="dz-pointage-ligne">
                <span className="dz-pointage-temps bt-lt-el" title="Temps écoulé">{fmtElapsed(elapsed).slice(0, -3)}</span>
                <span className="dz-pointage-lieu">{site?.client_name || 'Chantier'}{site?.city ? <><br />{site.city}</> : null}</span>
              </div>
              <TermineLe ws={site} dark />
            </>
          ) : (
            <div className="bt-lt-txt">
              <div className="bt-lt-k"><Clock className="h-3.5 w-3.5" /> Tu es pointé depuis {startedHHmm}</div>
              <div className="bt-lt-line">
                <span className="bt-lt-site">{site?.client_name || 'Chantier'}</span>
                <span className="bt-lt-since bt-lt-el" title="Temps écoulé">{fmtElapsed(elapsed)}</span>
              </div>
              <TermineLe ws={site} dark />
            </div>
          )}
          <button type="button" className="bt-lt-btn stop" disabled={busy} onClick={() => stop()} data-testid="lt-finish" data-guide="journee.terminer">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Terminer ma journée
          </button>
        </div>
      )}
    </div>
  );
}
