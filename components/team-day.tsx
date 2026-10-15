'use client';

// « Mon équipe » — visible du seul CHEF D'ÉQUIPE (étape 19, lot 14).
//
// CE QU'IL FAIT. Le chef choisit un JOUR (les 7 derniers, aujourd'hui compris)
// et un SALARIÉ de l'entreprise, voit ses heures de ce jour-là et peut les
// préparer ou les corriger. C'est la feuille d'heures d'équipe, celle que le
// chef remplit le soir dans la camionnette — ou le lendemain matin.
//
// LOT 14 (demande d'Ergun) : plus besoin d'être sur le même chantier que le
// salarié, ni de saisir le jour même. La base décide seule de ce qui est
// permis (is_my_team_member, nouvelle version) : salariés et chefs actifs de
// l'entreprise, 7 derniers jours, jamais une ligne validée ou verrouillée,
// jamais un mois ou un salarié clôturé, jamais un compte du bureau. Chaque
// ligne saisie ou corrigée ici garde la trace « par le chef d'équipe ».
//
// SON VOCABULAIRE EST CELUI DU SALARIÉ (étape 20). Un seul verbe, ENVOYER ; les
// trois états affichés sont MOT POUR MOT ceux de la journée du salarié : chez
// le comptable, envoyé, à envoyer.
//
// LOT 14, CORRECTIF : dans certaines entreprises, les salariés n'ouvrent jamais
// l'appli — c'est le chef qui saisit. « OK » ENREGISTRE ET ENVOIE donc au
// bureau (lead_send_entries) : la journée arrive chez le patron comme une
// journée envoyée, badge « par le chef d'équipe ». Le salarié qui utilise
// l'appli peut encore la corriger tant qu'elle n'est pas validée (« modifié
// après envoi » côté bureau). Le chef ne voit ni taux horaire, ni coût, ni
// paie, ni réglages.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { corrigerHeures } from '@/lib/corrections';
import { isCounted } from '@/lib/status';
import { TimeField, TIME_HINT } from '@/components/time-field';
import { Loader2, Users, Plus, X } from 'lucide-react';
import { addDays, format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import type { User, Worksite } from '@/lib/types';
import { choosableWorksites } from '@/supabase/functions/_shared/chantier-statut';

interface Row {
  id: string;
  user_id: string;
  worksite_id: string | null;
  start_time: string;
  end_time: string;
  total_minutes: number;
  status: string;
  locked: boolean;
}

interface Props {
  me: User;
  /** Aujourd'hui (ISO, Paris) : le choix va d'aujourd'hui à 6 jours avant. */
  today: string;
  /** Chantiers actifs de l'entreprise (choix du chantier d'une nouvelle ligne). */
  worksites: Worksite[];
  onChanged: () => void;
}

/** Envoi au bureau par le chef (lot 14). `missing` = serveur pas encore à jour. */
async function sendForWorker(ids: string[]): Promise<'ok' | 'missing'> {
  const { error } = await supabase.rpc('lead_send_entries', { p_ids: ids });
  if (!error) return 'ok';
  const code = (error as { code?: string }).code;
  if (code === 'PGRST202' || code === '42883') return 'missing';
  throw error;
}

/** Lot 14 : 7 derniers jours, aujourd'hui compris (même fenêtre qu'en base). */
export const LEAD_DAYS = 7;

const fmtHM = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};

export default function TeamDay({ me, today, worksites, onChanged }: Props) {
  const days = useMemo(() => Array.from({ length: LEAD_DAYS }, (_, i) => format(addDays(parseISO(today), -i), 'yyyy-MM-dd')), [today]);
  const [day, setDay] = useState(today);
  const [who, setWho] = useState<string>('');
  const [rows, setRows] = useState<Row[]>([]);
  const [planned, setPlanned] = useState<{ user_id: string; worksite_id: string | null }[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ rowId: string | null; start0: string; end0: string } | null>(null);
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('17:00');
  const [site, setSite] = useState('');
  const [bad, setBad] = useState({ s: false, e: false });
  const [saving, setSaving] = useState(false);

  // Le jour qui change : on repart propre (pas de fiche ouverte sur un autre jour).
  useEffect(() => { setEditing(null); }, [day, who]);

  const load = useCallback(async () => {
    setLoading(true);
    // La RLS fait le tri : seules remontent les lignes que le chef a le droit
    // de voir (salariés actifs de l'entreprise, 7 derniers jours). On ne
    // refiltre pas la sécurité ici — un filtre d'écran n'en serait pas une.
    const [entRes, planRes, usrRes] = await Promise.all([
      supabase.from('time_entries')
        .select('id, user_id, worksite_id, start_time, end_time, total_minutes, status, locked')
        .eq('work_date', day).neq('status', 'cancelled').order('start_time'),
      supabase.from('planning').select('user_id, worksite_id').eq('work_date', day),
      supabase.from('users').select('*').eq('company_id', me.company_id).eq('is_active', true).order('first_name'),
    ]);
    if (!entRes.error) setRows((entRes.data || []) as Row[]);
    if (!planRes.error) setPlanned((planRes.data || []) as { user_id: string; worksite_id: string | null }[]);
    if (!usrRes.error) setPeople((usrRes.data || []) as User[]);
    setLoading(false);
  }, [day, me.company_id]);

  useEffect(() => { load(); }, [load]);

  /** Salariés et chefs actifs de l'entreprise, moi excepté (jamais le bureau). */
  const team = useMemo(() => people.filter((p) => p.id !== me.id && (p.role === 'worker' || p.role === 'lead')), [people, me.id]);
  // Salarié par défaut : le premier prévu avec moi ce jour-là, sinon le premier de la liste.
  useEffect(() => {
    if (!team.length || (who && team.some((p) => p.id === who))) return;
    const mine = new Set(planned.filter((p) => p.user_id === me.id && p.worksite_id).map((p) => p.worksite_id));
    const withMe = team.find((p) => planned.some((x) => x.user_id === p.id && x.worksite_id && mine.has(x.worksite_id)));
    setWho((withMe ?? team[0]).id);
  }, [team, planned, who, me.id]);

  const person = team.find((p) => p.id === who) ?? null;
  const theirRows = rows.filter((r) => r.user_id === who);
  const siteName = (id: string | null) => worksites.find((w) => w.id === id)?.client_name || 'Chantier';

  /** Chantier proposé pour une nouvelle ligne : le sien ce jour-là, sinon le mien. */
  const defaultSite = () => {
    const taken = new Set(theirRows.map((r) => r.worksite_id));
    const cands = [
      ...planned.filter((p) => p.user_id === who).map((p) => p.worksite_id),
      ...planned.filter((p) => p.user_id === me.id).map((p) => p.worksite_id),
      ...rows.filter((r) => r.user_id === me.id).map((r) => r.worksite_id),
    ].filter((w): w is string => !!w && choosableWorksites(worksites, [], day).some((x) => x.id === w));
    return cands.find((w) => !taken.has(w)) ?? cands[0] ?? '';
  };

  const openEditor = (r: Row | null) => {
    const s0 = r?.start_time?.slice(0, 5) || '08:00';
    const e0 = r?.end_time?.slice(0, 5) || '17:00';
    setStart(s0); setEnd(e0); setBad({ s: false, e: false });
    setSite(r?.worksite_id || defaultSite());
    setEditing({ rowId: r?.id ?? null, start0: s0, end0: e0 });
  };

  const save = async () => {
    if (!editing || !person) return;
    if (bad.s || bad.e) { toast.error(`Heure non comprise. ${TIME_HINT}`); return; }
    if (start === end) { toast.error('Début et fin identiques : rien à compter.'); return; }
    // Lot 14 : une ligne existe déjà ce jour-là sur ce chantier → on la corrige,
    // on n'en crée pas une deuxième (la base le refuse aussi).
    const existing = editing.rowId
      ? rows.find((r) => r.id === editing.rowId) ?? null
      : theirRows.find((r) => r.worksite_id === site) ?? null;
    if (!existing && !site) { toast.error('Choisis le chantier.'); return; }
    if (existing && start === existing.start_time.slice(0, 5) && end === existing.end_time.slice(0, 5)) { setEditing(null); return; }
    setSaving(true);
    let savedId: string | null = null;
    try {
      if (existing) {
        if (existing.locked) throw new Error('Ces heures sont chez le comptable : elles ne se corrigent plus.');
        // Corriger des heures DÉJÀ ENVOYÉES, c'est prévenir le salarié (même
        // chemin que le bureau : journal + notification).
        if (isCounted(existing.status)) {
          const r = await corrigerHeures({ entryId: existing.id, newStart: start, newEnd: end });
          if (!r.ok) throw new Error(r.message);
          setEditing(null); await load(); onChanged();
          if (r.notified) toast.success(r.message); else toast.warning(r.message);
          return;
        }
        // `.select('id')` : une modification refusée par la RLS renvoie 0 ligne
        // SANS erreur. Seulement l'heure qui a changé : l'autre garde sa minute.
        const { data, error } = await supabase.from('time_entries')
          .update({
            ...(start !== existing.start_time.slice(0, 5) ? { start_time: start } : {}),
            ...(end !== existing.end_time.slice(0, 5) ? { end_time: end } : {}),
          }).eq('id', existing.id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Ces heures ne se corrigent plus (validées, verrouillées ou clôturées).');
        savedId = existing.id;
      } else {
        const { data, error } = await supabase.from('time_entries').insert({
          company_id: me.company_id, user_id: person.id, worksite_id: site,
          work_date: day, start_time: start, end_time: end,
          break_minutes: 0, meal_allowance: false, status: 'draft',
        }).select('id');
        if (error) throw error;
        savedId = (data as { id: string }[] | null)?.[0]?.id ?? null;
      }
      // Lot 14 : « OK » envoie au bureau (le salarié n'ouvre peut-être jamais l'appli).
      const sent = savedId ? await sendForWorker([savedId]) : 'missing';
      setEditing(null);
      await load();
      onChanged();
      if (sent === 'ok') toast.success(`Envoyé au bureau pour ${person.first_name} — « par le chef d’équipe »`);
      else toast.message(`C’est noté pour ${person.first_name} (envoi au bureau bientôt disponible).`);
    } catch (e) {
      const msg = (e as { message?: string })?.message || '';
      toast.error(/cl[ôo]tur/i.test(msg) ? 'Heures clôturées par le bureau : plus de saisie sur ce jour.'
        : /row-level security|violates/i.test(msg) ? 'Ce jour ou ce salarié n’est pas modifiable.'
        : msg || 'Ça n’a pas pu être noté.');
    } finally {
      setSaving(false);
    }
  };

  /** Une ligne en brouillon (notée par le salarié sans l'envoyer) : le chef l'envoie. */
  const sendOne = async (r: Row) => {
    if (!person) return;
    setSaving(true);
    try {
      const sent = await sendForWorker([r.id]);
      await load(); onChanged();
      if (sent === 'ok') toast.success(`Envoyé au bureau pour ${person.first_name} — « par le chef d’équipe »`);
      else toast.message('Envoi au bureau bientôt disponible.');
    } catch (e) {
      const msg = (e as { message?: string })?.message || '';
      toast.error(/cl[ôo]tur/i.test(msg) ? 'Heures clôturées par le bureau : plus d’envoi sur ce jour.'
        : /indiquez l/i.test(msg) ? 'Sortie oubliée : mets d’abord l’heure de fin.' : msg || 'Envoi impossible.');
    } finally { setSaving(false); }
  };

  const dayLabel = (d: string, i: number) => (i === 0 ? 'Aujourd’hui' : i === 1 ? 'Hier' : format(parseISO(d), 'EEE d', { locale: fr }));

  return (
    <div className="bt-td" data-testid="team-day">
      <div className="bt-td-h"><Users className="h-3.5 w-3.5" /> Mon équipe</div>
      <div className="bt-td-sub">Tu saisis ou corriges les heures de l&apos;équipe (7 derniers jours). <strong>« OK » les envoie au bureau</strong>, marquées « par le chef d&apos;équipe ».</div>

      <div className="bt-td-days" role="group" aria-label="Jour" data-guide="equipe.jour">
        {days.map((d, i) => (
          <button key={d} type="button" className="bt-td-day" aria-pressed={d === day} data-testid="td-day" data-day={d} onClick={() => setDay(d)}>
            {dayLabel(d, i)}<small>{format(parseISO(d), 'dd/MM')}</small>
          </button>
        ))}
      </div>

      {loading && !people.length ? null : team.length === 0 ? (
        <div className="bt-td-empty">Aucun salarié dans l&apos;équipe pour l&apos;instant.</div>
      ) : (
        <>
          <div className="bt-td-pick">
            <div className="bt-td-lab">Salarié</div>
            <select className="bt-td-sel" value={who} onChange={(e) => setWho(e.target.value)} data-testid="td-who" aria-label="Salarié" data-guide="equipe.salarie">
              {team.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
            </select>
          </div>

          {theirRows.length === 0 ? (
            <div className="bt-td-empty" data-testid="td-none">Pas d&apos;heures ce jour-là.</div>
          ) : theirRows.map((r) => (
            <div key={r.id} className="bt-td-row" data-testid="td-row">
              <span className="bt-td-name">{siteName(r.worksite_id)}</span>
              <span className="bt-td-h2">{r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)} · {fmtHM(r.total_minutes)}</span>
              <span className={`bt-td-tag ${r.locked ? 'verrou' : isCounted(r.status) ? 'envoye' : 'aenvoyer'}`}>
                {r.locked ? 'chez le comptable' : isCounted(r.status) ? 'envoyé' : 'à envoyer'}
              </span>
              <button type="button" className="bt-td-edit" disabled={r.locked || r.status === 'validated'} onClick={() => openEditor(r)} data-testid="td-edit" data-guide="equipe.corriger">
                Corriger
              </button>
              {r.status === 'draft' && !r.locked && (
                <button type="button" className="bt-td-edit send" disabled={saving} onClick={() => void sendOne(r)} data-testid="td-send">Envoyer</button>
              )}
            </div>
          ))}
          {person && !editing && (
            <button type="button" className="bt-td-add" onClick={() => openEditor(null)} data-testid="td-add" data-guide="equipe.ajouter">
              <Plus className="inline h-3.5 w-3.5" /> Ajouter des heures pour {person.first_name}
            </button>
          )}
        </>
      )}

      {editing && person && (
        <div className="bt-td-form" data-testid="td-form">
          <div className="bt-td-formh">
            <span>{person.first_name} {person.last_name} · {format(parseISO(day), 'EEEE d MMMM', { locale: fr })}</span>
            <button type="button" className="bt-td-close" onClick={() => setEditing(null)} aria-label="Fermer"><X className="h-4 w-4" /></button>
          </div>
          {editing.rowId ? (
            <div className="bt-td-note" style={{ marginTop: 0 }}>{siteName(rows.find((r) => r.id === editing.rowId)?.worksite_id ?? null)}</div>
          ) : (
            <div>
              <div className="bt-td-lab">Chantier</div>
              <select className="bt-td-sel" value={site} onChange={(e) => setSite(e.target.value)} data-testid="td-site" aria-label="Chantier">
                <option value="">Choisir…</option>
                {/* Lot 23 : un chantier terminé n'est plus proposé pour une nouvelle ligne, sauf un jour qui n'est pas après sa fin (ses lignes existantes gardent leur nom). */}
                {choosableWorksites(worksites, [site], day).map((w) => <option key={w.id} value={w.id}>{w.client_name}</option>)}
              </select>
              {site && theirRows.some((r) => r.worksite_id === site) && (
                <div className="bt-td-note" data-testid="td-will-correct">Il a déjà une ligne sur ce chantier ce jour-là : elle sera corrigée, pas doublée.</div>
              )}
            </div>
          )}
          <div className="bt-td-two">
            <div>
              <div className="bt-td-lab">Début</div>
              <TimeField value={start} onChange={setStart} ariaLabel="Début" testId="td-start" onBadChange={(b) => setBad((x) => ({ ...x, s: b }))} />
            </div>
            <div>
              <div className="bt-td-lab">Fin</div>
              <TimeField value={end} onChange={setEnd} ariaLabel="Fin" testId="td-end" onBadChange={(b) => setBad((x) => ({ ...x, e: b }))} />
            </div>
          </div>
          <button type="button" className="bt-td-save" disabled={saving} onClick={save} data-testid="td-save" data-guide="equipe.ok">
            {saving ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'OK — envoyer au bureau'}
          </button>
          <div className="bt-td-note">Envoyé au bureau « par le chef d&apos;équipe ». S&apos;il utilise l&apos;appli, {person.first_name} peut encore corriger.</div>
        </div>
      )}
    </div>
  );
}

