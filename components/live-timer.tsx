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

import { useEffect, useState } from 'react';
import { finishLiveSession, cancelLiveSession, announceLiveChange, type OwnLiveSession } from '@/lib/live-session';
import { parisHHmm } from '@/lib/utils';
import { TimeCylinder } from '@/components/time-cylinder';
import { Square, Clock, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import type { Worksite } from '@/lib/types';

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

const LT_CSS = `
.bt-lt{background:#15120F;color:#F2EDE3;border-radius:16px;padding:14px 15px;margin-bottom:10px}
.bt-lt.on{background:#1C2A1F;border:1px solid rgba(70,194,129,.35)}
.bt-lt.late{background:#2A1E16;border:1px solid rgba(240,145,90,.45)}
.bt-lt-k{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#a59c86;font-weight:700;display:flex;align-items:center;gap:6px}
.bt-lt-site{font-size:16px;font-weight:900;letter-spacing:-.01em;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-lt-since{font-family:'JetBrains Mono',monospace;font-size:12px;color:#a59c86;font-weight:600;margin-top:2px}
.bt-lt-big{font-family:'JetBrains Mono',monospace;font-size:34px;font-weight:700;color:#2FD584;letter-spacing:-.02em;line-height:1.05;margin-top:6px}
.bt-lt-big.late{color:#F0915A}
.bt-lt-row{display:flex;gap:8px;margin-top:11px}
.bt-lt-btn{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:none;border-radius:11px;padding:11px 18px;font-family:inherit;font-weight:900;font-size:15px;cursor:pointer;background:#FFC21A;color:#15120F;box-shadow:0 3px 0 #C99300}
.bt-lt-btn.stop{background:#F2EDE3;color:#15120F;box-shadow:0 3px 0 #b5ae9f;flex:1;min-width:0}
.bt-lt-btn:active{transform:translateY(2px);box-shadow:none}
.bt-lt-btn:disabled{opacity:.6}
.bt-lt-note{font-size:12px;color:#a59c86;font-weight:600;margin-top:9px;line-height:1.45}
.bt-lt-note b{color:#FFC21A}
/* Bouton de sortie : présent, lisible, mais jamais plus attirant que « J'ai
   fini ». Annuler perd le temps écoulé — c'est le but, pas un accident. */
.bt-lt-btn.ghost{background:transparent;color:#F2EDE3;box-shadow:none;border:1.5px solid rgba(242,237,227,.34);font-weight:800;flex:none}
.bt-lt-btn.ghost:active{transform:translateY(1px)}
.bt-lt-btn.danger{background:#F2EDE3;color:#8a2a1c;box-shadow:0 3px 0 #b5ae9f}
.bt-lt-note.warn{color:#F0915A}
.bt-lt-ask{margin-top:11px;background:rgba(242,237,227,.06);border-radius:12px;padding:10px}
.bt-lt-asklab{font-size:13.5px;font-weight:800;margin-bottom:6px}
/* L'endroit : dit clairement, sans dramatiser. Ni rouge (ce n'est pas une
   alerte), ni invisible (une donnée personnelle collectée en silence est une
   donnée collectée illégalement). */
.bt-lt-geo{display:flex;align-items:flex-start;gap:7px;margin-top:9px;font-size:12px;color:#a59c86;font-weight:600;line-height:1.45}
.bt-lt-geo svg{flex:none;margin-top:1px}
/* Le lien est lisible sans attirer l'œil : celui qui veut savoir le trouve,
   celui qui vient pointer ne le remarque même pas. */
.bt-lt-geo-a{color:#F2EDE3;text-decoration:underline;text-underline-offset:2px;white-space:nowrap}
`;

const fmtElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export default function LiveTimer({ userId, session, today, worksites, positionActive }: Props) {
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Heure de fin proposée quand le chrono a été oublié d'un jour sur l'autre.
  const [endGuess, setEndGuess] = useState('17:00');
  // Demande de confirmation avant d'effacer un pointage en cours.
  const [confirmCancel, setConfirmCancel] = useState(false);
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

  // Un autre chrono (ou plus de chrono) : on repart propre — sinon la
  // confirmation d'annulation resterait armée sur le pointage suivant.
  useEffect(() => { setConfirmCancel(false); setEndBeforeStart(false); }, [session?.started_at]);

  // Fermé d'ici : on le cache tout de suite, et la journée relit (LIVE_CHANGED).
  const done = (startedAt: string) => { setClosed(startedAt); setConfirmCancel(false); announceLiveChange(); };

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
    if (endTime && endTime <= parisHHmm(session.started_at)) { setEndBeforeStart(true); return; }
    setEndBeforeStart(false);
    setBusy(true);
    try {
      // Même geste que l'Assistant BEMEXO : lib/live-session.ts. On ne demande
      // pas l'endroit sur un pointage oublié (domicile) ; `started_at` vient du serveur.
      const r = await finishLiveSession({ userId, startedAt: session.started_at, positionActive: !!positionActive, endTime });
      if (r.kind === 'saved') {
        done(session.started_at);
        toast.success(`Pointage fermé — ${r.start_time.slice(0, 5)} à ${r.end_time.slice(0, 5)}`);
      } else if (r.kind === 'cancelled') {
        done(session.started_at);
        toast.message(endTime ? 'Pointage annulé — rien n’a été compté' : 'Pointage annulé (moins d’une minute)');
      } else if (r.kind === 'stale') {
        done(session.started_at);
        toast.message('Ce pointage était déjà fermé (borne ou autre appareil) — l’écran est à jour.');
      } else {
        // Serveur pas encore passé au lot 9 (quart d'heure) : rien n'est écrit,
        // le chrono reste ouvert. Une ligne, neutre, avec la sortie.
        toast.message('Rien à compter pour l’instant : réessaie dans quelques minutes, ou annule ce pointage.');
      }
    } catch (e) {
      // Le chrono reste ouvert et reste affiché : rien n'a été écrit.
      announceLiveChange();
      toast.error((e as { message?: string })?.message || 'La fermeture a échoué. Le pointage reste ouvert.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Efface un pointage en cours sans rien écrire dans les heures.
   *
   * ON VISE LA SESSION AFFICHÉE, PAS « la session de ce salarié »
   * (`cancelLiveSession`, lib/live-session.ts). Le scénario : le salarié ouvre
   * la confirmation sur son téléphone, ferme ce pointage depuis la tablette, en
   * démarre un autre, travaille deux heures, puis revient au téléphone et
   * appuie sur « Oui, annuler ». Sans `started_at` dans le filtre, les deux
   * heures disparaîtraient sans un mot.
   */
  const cancel = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const gone = await cancelLiveSession({ userId, startedAt: session.started_at });
      if (!gone) {
        // Zéro ligne : ce n'est pas ce pointage-là qui tourne. On relit pour
        // montrer la vérité plutôt que d'insister sur une vue périmée.
        setConfirmCancel(false);
        announceLiveChange();
        toast.error("Ce pointage n'est plus celui en cours — l'écran vient d'être remis à jour.");
        return;
      }
      done(session.started_at);
      toast.success('Pointage annulé — rien n’a été compté');
    } catch (e) {
      announceLiveChange();
      toast.error((e as { message?: string })?.message || "Impossible d'annuler le pointage.");
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
      <style dangerouslySetInnerHTML={{ __html: LT_CSS }} />
      <div className="bt-lt-k">
        {stale ? <><AlertTriangle className="h-3.5 w-3.5" /> Pointage resté ouvert</> : <><Clock className="h-3.5 w-3.5" /> Pointage en cours</>}
      </div>
      {/* Chantier et heure de début sur UNE ligne : sur un téléphone, chaque
          ligne de ce bloc est une ligne de journée qu'on ne voit pas. */}
      <div className="bt-lt-site">{site?.client_name || 'Chantier'}</div>
      <div className="bt-lt-since">
        Commencé {stale ? format(parseISO(session.work_date), 'EEEE d MMMM', { locale: fr }) + ' ' : ''}à {startedHHmm}
      </div>

      {/* La confirmation remplace les boutons, elle ne s'ajoute pas : pas de
          saut de mise en page, et le geste dangereux reste explicite. */}
      {confirmCancel ? (
        <>
          <div className="bt-lt-note warn">
            Annuler ce pointage&nbsp;? Les <b>{stale ? 'heures écoulées' : fmtElapsed(elapsed)}</b> seront
            perdues et rien ne sera compté.
          </div>
          <div className="bt-lt-row">
            <button type="button" className="bt-lt-btn danger" disabled={busy} onClick={cancel}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Oui, annuler
            </button>
            <button type="button" className="bt-lt-btn ghost" disabled={busy} onClick={() => setConfirmCancel(false)}>
              Non
            </button>
          </div>
        </>
      ) : stale ? (
        <>
          <div className="bt-lt-note">
            Ce pointage a été ouvert <b>un autre jour</b> et n&apos;a jamais été fermé.
            Personne ne va deviner l&apos;heure à ta place : indique à quelle heure tu as fini.
          </div>
          <div className="bt-lt-ask">
            <div className="bt-lt-asklab">Tu as fini à quelle heure&nbsp;?</div>
            <TimeCylinder value={endGuess} onChange={(v) => { setEndGuess(v); setEndBeforeStart(false); }} />
          </div>
          <div className="bt-lt-row">
            <button type="button" className="bt-lt-btn stop" disabled={busy} onClick={() => stop(endGuess)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />} Fermer ce pointage
            </button>
            <button type="button" className="bt-lt-btn ghost" disabled={busy} onClick={() => setConfirmCancel(true)} aria-label="Annuler ce pointage">
              Annuler
            </button>
          </div>
          {/* Fin avant le début : rien à compter. On le dit plutôt que de
              laisser le serveur annuler sans un mot. Une nuit à cheval sur
              deux jours se note à la main (« + »). */}
          {endBeforeStart && (
            <div className="bt-lt-note warn">
              Indique une heure <b>après {startedHHmm}</b>. Nuit à cheval sur deux jours&nbsp;? Annule ce
              pointage et note tes heures avec le bouton +.
            </div>
          )}
        </>
      ) : (
        <>
          <div className="bt-lt-big">{fmtElapsed(elapsed)}</div>
          <div className="bt-lt-row">
            <button type="button" className="bt-lt-btn stop" disabled={busy} onClick={() => stop()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />} J&apos;ai fini
            </button>
            <button type="button" className="bt-lt-btn ghost" disabled={busy} onClick={() => setConfirmCancel(true)} aria-label="Annuler ce pointage">
              Annuler
            </button>
          </div>
          <div className="bt-lt-note">Rien n&apos;est compté tant que tu n&apos;as pas fini — à la minute près.</div>
          {/* La mention de l'endroit ne figure pas ici : une information se
              donne AVANT la collecte (au premier « Je commence »), pas pendant. */}
        </>
      )}
    </div>
  );
}
