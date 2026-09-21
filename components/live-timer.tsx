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

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { demanderPosition, FENETRE_POSITION_MS } from '@/lib/position';
import { parisHHmm } from '@/lib/utils';
import { TimeCylinder } from '@/components/time-cylinder';
import { Play, Square, Clock, AlertTriangle, Loader2, Trash2, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import type { Worksite } from '@/lib/types';

interface Session {
  user_id: string;
  worksite_id: string;
  planning_id: string | null;
  work_date: string;
  started_at: string;
}

interface Props {
  userId: string;
  companyId: string;
  /** Jour affiché à l'écran (ISO). Un chrono ne se lance que sur le jour courant. */
  today: string;
  worksites: Worksite[];
  /** Créneau prévu du jour, pour rattacher le pointage au planning quand il existe. */
  planningIdFor: (worksiteId: string) => string | null;
  /** Le jour est verrouillé (mois clos) : on n'ouvre pas de chrono. */
  frozen?: boolean;
  /**
   * L'entreprise a activé l'enregistrement de l'endroit (étape 26).
   *
   * CE DRAPEAU N'EST PAS LA PROTECTION, il en est la façade. La vraie barrière
   * est en base : un trigger efface la position si l'entreprise ne l'a pas
   * activée, et `stop_active_session` n'écrit rien dans ce cas. Ici, il sert à
   * ne pas déclencher une demande d'autorisation du navigateur pour une donnée
   * que la base jettera — demander pour rien est la meilleure façon de faire
   * refuser quelqu'un.
   */
  positionActive?: boolean;
  onSaved: () => void;
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
.bt-lt-sel{flex:1;min-width:0;font-family:inherit;font-size:15px;font-weight:700;padding:11px 12px;border-radius:11px;border:1.5px solid rgba(242,237,227,.28);background:#221D17;color:#F2EDE3}
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

export default function LiveTimer({
  userId, companyId, today, worksites, planningIdFor, frozen, positionActive, onSaved,
}: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState('');
  const [now, setNow] = useState(() => Date.now());
  // Heure de fin proposée quand le chrono a été oublié d'un jour sur l'autre.
  const [endGuess, setEndGuess] = useState('17:00');
  // Le serveur a refusé de fermer : début et fin tombent dans le même quart
  // d'heure. Ce n'est pas une panne, c'est « tu viens de démarrer » — et ça
  // doit s'accompagner d'une sortie, pas d'un mur.
  const [tooShort, setTooShort] = useState(false);
  // Demande de confirmation avant d'effacer un pointage en cours.
  const [confirmCancel, setConfirmCancel] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('active_sessions')
      .select('user_id, worksite_id, planning_id, work_date, started_at')
      .eq('user_id', userId).maybeSingle();
    if (!mounted.current) return;
    // Une erreur de lecture ne doit pas afficher « aucun chrono » : ce serait
    // inviter le salarié à en ouvrir un second.
    if (!error) setSession((data as Session) || null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, [load]);

  // La pendule ne tourne que s'il y a quelque chose à compter.
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    const onFocus = () => { setNow(Date.now()); load(); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [session, load]);

  const start = async () => {
    if (!pick) { toast.error('Choisis un chantier.'); return; }
    setBusy(true);
    // On repart propre : sinon l'avertissement du pointage précédent s'affiche
    // sur le nouveau, et la confirmation d'annulation resterait armée.
    setTooShort(false);
    setConfirmCancel(false);
    try {
      // L'ENDROIT, AVANT L'ÉCRITURE, ET JAMAIS AU PRIX DU POINTAGE.
      // `demanderPosition` rend toujours la main — refus, sous-sol, vieux
      // téléphone donnent `null`. Un salarié qui refuse pointe exactement comme
      // avant : c'est ce qui rend son refus réellement libre.
      const p = positionActive ? await demanderPosition() : null;

      // ── LES COLONNES NE SONT AJOUTÉES QUE S'IL Y A QUELQUE CHOSE À METTRE ──
      //
      // CE N'EST PAS UNE COQUETTERIE. Tant que la migration de l'étape 26 n'est
      // pas appliquée, ces colonnes n'existent pas : les nommer ferait échouer
      // l'insertion avec un PGRST204, et PLUS PERSONNE NE POURRAIT DÉMARRER UN
      // POINTAGE. L'étape 25 pouvait se permettre d'échouer en avance parce
      // qu'elle ajoutait une fonction neuve ; ici on touche un geste qui marche
      // déjà, et casser un geste qui marche n'est jamais un compromis
      // acceptable.
      //
      // Quand la position est absente — interrupteur éteint, refus, colonnes
      // pas encore là — l'écriture est identique au mot près à celle d'hier.
      const { error } = await supabase.from('active_sessions').insert({
        user_id: userId, company_id: companyId, worksite_id: pick,
        planning_id: planningIdFor(pick), work_date: today,
        // L'HEURE DE LA PRISE N'EST PAS ENVOYÉE D'ICI, ET C'EST DÉLIBÉRÉ.
        // Elle l'était — `new Date()` — c'est-à-dire l'horloge du téléphone.
        // Une horloge fausse affichait une heure fausse ; une horloge avancée
        // de cinq ans produisait une ligne que la purge des douze mois
        // n'aurait pas effacée avant 2031. On ne promet pas une durée de
        // conservation en la laissant fixer par l'appareil qu'on conserve.
        // C'est le trigger qui pose `now()`, côté serveur.
        ...(p ? {
          start_lat: p.lat,
          start_lng: p.lng,
          start_accuracy_m: p.accuracy == null ? null : Math.round(p.accuracy),
        } : {}),
      });
      if (error) {
        // 23505 = un chrono tourne déjà. Le dire, et le montrer.
        if (error.code === '23505') { await load(); toast.error('Un pointage est déjà en cours.'); return; }
        throw error;
      }
      await load();
      toast.success('Pointage démarré');
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Impossible de démarrer le pointage.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Ferme le chrono et crée l'intervention, EN UNE SEULE ÉCRITURE.
   *
   * Le navigateur écrivait l'intervention puis effaçait le chrono. Si la
   * seconde requête échouait — un salarié qui perd le réseau sur un chantier,
   * c'est le quotidien — l'intervention existait et le chrono aussi : à la
   * réouverture il le fermait à nouveau et créait une SECONDE intervention pour
   * la même période. Deux fois les mêmes heures, envoyées en paie.
   *
   * Les deux écritures vivent maintenant dans une seule transaction côté
   * serveur : soit les deux, soit aucune. Et l'heure de début y est recalculée
   * à partir de `started_at`, pour que le fuseau et l'arrondi au quart d'heure
   * soient faits au même endroit pour tout le monde.
   */
  /**
   * Le serveur refuse de fermer parce que début et fin tombent sur le même
   * quart d'heure.
   *
   * Ce refus est LÉGITIME — on ne fabrique pas des heures qui n'ont pas été
   * travaillées — mais il annule toute la transaction, donc le `DELETE` de la
   * session n'a pas lieu non plus : le chrono reste ouvert. Sans issue, le
   * salarié est enfermé jusqu'au quart d'heure suivant devant un compteur
   * qu'il ne peut ni arrêter ni effacer.
   *
   * On reconnaît ce cas au texte, faute de mieux : la fonction lève un
   * `raise_exception` générique, sans code distinctif. Une migration qui lui
   * donne un SQLSTATE propre est écrite dans supabase/migrations (NON
   * appliquée) ; le jour où elle passe, ce test deviendra un test de code.
   * S'il cesse de reconnaître le message, on retombe sur l'affichage brut :
   * dégradé, jamais cassé.
   */
  const isTooShort = (e: unknown): boolean => {
    const msg = (e as { message?: string })?.message || '';
    // `BT001` est le code que propose la migration jointe (non appliquée). On
    // ne teste PAS `P0002` : c'est `no_data_found`, un code standard de
    // PostgreSQL qui peut remonter d'ailleurs — le confondre avec « trop
    // court » proposerait d'annuler un pointage pour une panne sans rapport.
    return /m[êe]me quart d/i.test(msg) || (e as { code?: string })?.code === 'BT001';
  };

  const stop = async (endTime?: string) => {
    if (!session) return;
    setBusy(true);
    setTooShort(false);
    try {
      // ── ON NE DEMANDE MÊME PAS L'ENDROIT SUR UN POINTAGE OUBLIÉ ────────────
      //
      // Le serveur écarte déjà ce point au-delà de quatorze heures. Mais il
      // l'écarte APRÈS l'avoir reçu — et pour un salarié qui ferme son pointage
      // le soir chez lui, ce qu'il a reçu est son DOMICILE. Le refuser à
      // l'arrivée ne le défait pas : la donnée a quitté le téléphone, traversé
      // le réseau, et il a vu une demande d'autorisation au pire moment.
      //
      // `session.started_at` vient du serveur, pas du navigateur : c'est la
      // seule valeur du calcul qui ne dépende pas de l'horloge du téléphone.
      // L'autre — `Date.now()` — peut mentir, et c'est exactement pourquoi le
      // garde SQL reste en place derrière celui-ci. Deux tests, deux rôles :
      // ici on évite la demande, là-bas on garantit le refus.
      const ecoule = Date.now() - new Date(session.started_at).getTime();
      const tropVieux = ecoule > FENETRE_POSITION_MS;

      // Même règle qu'au départ : on ne passe les paramètres que si on a une
      // position. Sans eux, l'appel est exactement celui d'hier et résout la
      // fonction à un seul argument — donc fermer un pointage continue de
      // marcher même si la migration n'est pas passée.
      const p = positionActive && !tropVieux ? await demanderPosition() : null;

      const { data, error } = await supabase.rpc('stop_active_session', {
        p_end: endTime ? `${endTime}:00` : null,
        ...(p ? {
          p_lat: p.lat,
          p_lng: p.lng,
          p_accuracy: p.accuracy == null ? null : Math.round(p.accuracy),
        } : {}),
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as
        { start_time: string; end_time: string } | null;
      setSession(null);
      onSaved();
      toast.success(row
        ? `Pointage fermé — ${row.start_time.slice(0, 5)} à ${row.end_time.slice(0, 5)}`
        : 'Pointage fermé');
    } catch (e) {
      // Le chrono reste ouvert et reste affiché : rien n'a été écrit.
      await load();
      if (isTooShort(e)) {
        // Pas un toast d'erreur qui disparaît : un état affiché, avec la sortie.
        setTooShort(true);
      } else {
        toast.error((e as { message?: string })?.message || "La fermeture a échoué. Le pointage reste ouvert.");
      }
    } finally {
      setBusy(false);
    }
  };

  /**
   * Efface un pointage en cours sans rien écrire dans les heures.
   *
   * C'EST LA SORTIE QUI MANQUAIT. Il n'existait aucun moyen d'annuler : le
   * composant ne savait que lire et démarrer. Un salarié qui lançait un chrono
   * par erreur restait devant un compteur géant jusqu'au quart d'heure suivant.
   *
   * Aucune migration n'est nécessaire : la policy `active_sessions_delete`
   * autorise déjà le salarié à supprimer sa propre session (vérifié en base).
   *
   * `.select('user_id')` : une suppression filtrée par la RLS renvoie zéro
   * ligne SANS erreur. Zéro ligne effacée n'est pas une réussite — et ici le
   * dire compte double, puisque le but du geste est précisément de sortir.
   *
   * ON VISE LA SESSION AFFICHÉE, PAS « la session de ce salarié ». La clé
   * primaire d'`active_sessions` est le seul `user_id` : un nouveau pointage
   * REMPLACE l'ancien. Un effacement filtré sur le seul `user_id` supprime donc
   * ce qui tourne à l'instant, pas ce que l'écran montrait.
   *
   * Le scénario : le salarié ouvre la confirmation sur son téléphone, ferme ce
   * pointage depuis la tablette, en démarre un autre, travaille deux heures,
   * puis revient au téléphone et appuie sur « Oui, annuler ». Les deux heures
   * disparaissent, sans un mot. `started_at` est immuable : l'ajouter au filtre
   * fait que la confirmation périmée ne touche rien, et on le dit.
   */
  const cancel = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('active_sessions')
        .delete().eq('user_id', userId).eq('started_at', session.started_at).select('user_id');
      if (error) throw error;
      if (!data || data.length === 0) {
        // Zéro ligne : ce n'est pas ce pointage-là qui tourne. On recharge pour
        // montrer la vérité plutôt que d'insister sur une vue périmée.
        await load();
        setConfirmCancel(false);
        toast.error("Ce pointage n'est plus celui en cours — l'écran vient d'être remis à jour.");
        return;
      }
      setSession(null);
      setTooShort(false);
      setConfirmCancel(false);
      toast.success('Pointage annulé — rien n’a été compté');
    } catch (e) {
      await load();
      toast.error((e as { message?: string })?.message || "Impossible d'annuler le pointage.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  // ── Un chrono tourne ──
  if (session) {
    const site = worksites.find((w) => w.id === session.worksite_id);
    const startedHHmm = parisHHmm(session.started_at);
    const elapsed = now - new Date(session.started_at).getTime();
    // Oublié d'un jour sur l'autre : on ne ferme pas à une heure inventée.
    const stale = session.work_date !== today;

    return (
      <div className={`bt-lt ${stale ? 'late' : 'on'}`}>
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
              <TimeCylinder value={endGuess} onChange={setEndGuess} />
            </div>
            <div className="bt-lt-row">
              <button type="button" className="bt-lt-btn stop" disabled={busy} onClick={() => stop(endGuess)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />} Fermer ce pointage
              </button>
              <button type="button" className="bt-lt-btn ghost" disabled={busy} onClick={() => setConfirmCancel(true)} aria-label="Annuler ce pointage">
                Annuler
              </button>
            </div>
            {/* Un pointage oublié peut LUI AUSSI tomber sur le même quart
                d'heure : commencé à 16:58 hier, fin indiquée à 17:00. Sans
                cette ligne, l'appui ne produisait rien du tout — ni ligne, ni
                message. Un échec muet est pire que le mur qu'on remplace. */}
            {tooShort && (
              <div className="bt-lt-note warn">
                L&apos;heure indiquée tombe sur <b>le même quart d&apos;heure</b> que le début :
                il n&apos;y a rien à compter. Indique une autre heure de fin, ou annule ce pointage.
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
            {tooShort ? (
              <div className="bt-lt-note warn">
                Tu viens de démarrer : il n&apos;y a <b>pas encore un quart d&apos;heure</b> à compter.
                Attends quelques minutes, ou annule ce pointage.
              </div>
            ) : (
              <div className="bt-lt-note">Rien n&apos;est compté tant que tu n&apos;as pas fermé.</div>
            )}
            {/* La mention de l'endroit ne figure QUE sur la carte de départ
                (plus bas), pas ici. Une information se donne AVANT la collecte,
                pas pendant : redire la même chose sur le chrono en marche
                n'apprend rien à quelqu'un qui l'a déjà lue, et deux rappels
                pour un seul fait finissent par ressembler à une alerte. */}
          </>
        )}
      </div>
    );
  }

  // ── Aucun chrono ──
  if (frozen) return null;

  return (
    <div className="bt-lt">
      <style dangerouslySetInnerHTML={{ __html: LT_CSS }} />
      <div className="bt-lt-k"><Clock className="h-3.5 w-3.5" /> Pointer en direct</div>
      <div className="bt-lt-row">
        <select className="bt-lt-sel" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Choisis un chantier…</option>
          {worksites.map((w) => <option key={w.id} value={w.id}>{w.client_name}</option>)}
        </select>
        <button type="button" className="bt-lt-btn" disabled={busy || !pick} onClick={start}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Je commence
        </button>
      </div>
      <div className="bt-lt-note">
        Tu peux aussi noter tes heures à la main, comme avant. Le pointage en direct évite juste
        d&apos;avoir à s&apos;en souvenir le soir.
      </div>
      {/* UNE PHRASE, À L'ENDROIT DU POINTAGE, AVANT LE PREMIER APPUI.
          C'est tout ce qui reste de l'écran plein écran de l'étape 27 — et
          c'est suffisant : l'obligation est que l'information soit portée à la
          connaissance du salarié avant la collecte, pas qu'elle lui barre la
          route. Elle dit les trois choses qui comptent pour lui — quoi, quelle
          étendue, et qu'il peut refuser — et le lien mène au détail complet
          pour ceux qui veulent vraiment savoir. */}
      {positionActive && (
        <div className="bt-lt-geo">
          <MapPin className="h-3.5 w-3.5" />
          <span>
            Ton entreprise note <b style={{ color: '#F2EDE3' }}>l&apos;endroit</b> au départ et à la
            fin du pointage — rien entre les deux, et tu peux refuser.{' '}
            <a href="/confidentialite" className="bt-lt-geo-a">En savoir plus</a>
          </span>
        </div>
      )}
    </div>
  );
}
