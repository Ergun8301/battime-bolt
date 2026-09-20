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
import { TimeCylinder } from '@/components/time-cylinder';
import { Play, Square, Clock, AlertTriangle, Loader2 } from 'lucide-react';
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
.bt-lt-btn.stop{background:#F2EDE3;color:#15120F;box-shadow:0 3px 0 #b5ae9f;width:100%}
.bt-lt-btn:active{transform:translateY(2px);box-shadow:none}
.bt-lt-btn:disabled{opacity:.6}
.bt-lt-note{font-size:12px;color:#a59c86;font-weight:600;margin-top:9px;line-height:1.45}
.bt-lt-note b{color:#FFC21A}
.bt-lt-ask{margin-top:11px;background:rgba(242,237,227,.06);border-radius:12px;padding:10px}
.bt-lt-asklab{font-size:13.5px;font-weight:800;margin-bottom:6px}
`;

/** Heure locale (Europe/Paris) d'un instant, au format HH:mm. */
function parisHHmm(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso)).replace('h', ':');
}

const fmtElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export default function LiveTimer({
  userId, companyId, today, worksites, planningIdFor, frozen, onSaved,
}: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState('');
  const [now, setNow] = useState(() => Date.now());
  // Heure de fin proposée quand le chrono a été oublié d'un jour sur l'autre.
  const [endGuess, setEndGuess] = useState('17:00');
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
    try {
      const { error } = await supabase.from('active_sessions').insert({
        user_id: userId, company_id: companyId, worksite_id: pick,
        planning_id: planningIdFor(pick), work_date: today,
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
  const stop = async (endTime?: string) => {
    if (!session) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('stop_active_session', {
        p_end: endTime ? `${endTime}:00` : null,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as
        { start_time: string; end_time: string } | null;
      setSession(null);
      onSaved();
      toast.success(row
        ? `Pointage enregistré — ${row.start_time.slice(0, 5)} à ${row.end_time.slice(0, 5)}`
        : 'Pointage enregistré');
    } catch (e) {
      // Le chrono reste ouvert et reste affiché : rien n'a été écrit.
      await load();
      toast.error((e as { message?: string })?.message || "L'enregistrement a échoué. Le pointage reste ouvert.");
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
        <div className="bt-lt-site">{site?.client_name || 'Chantier'}</div>
        <div className="bt-lt-since">
          Commencé {stale ? format(parseISO(session.work_date), 'EEEE d MMMM', { locale: fr }) + ' ' : ''}à {startedHHmm}
        </div>

        {stale ? (
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
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />} Enregistrer cette journée
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="bt-lt-big">{fmtElapsed(elapsed)}</div>
            <div className="bt-lt-row">
              <button type="button" className="bt-lt-btn stop" disabled={busy} onClick={() => stop()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />} J&apos;ai fini
              </button>
            </div>
            <div className="bt-lt-note">
              Tant que tu n&apos;as pas fermé, <b>rien n&apos;est compté</b> : ce temps n&apos;apparaît ni dans ton
              total, ni au bureau, ni en paie.
            </div>
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
        Tu peux aussi saisir tes heures à la main, comme avant. Le pointage en direct évite juste
        d&apos;avoir à s&apos;en souvenir le soir.
      </div>
    </div>
  );
}
