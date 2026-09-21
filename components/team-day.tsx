'use client';

// « Mon équipe aujourd'hui » — visible du seul CHEF D'ÉQUIPE (étape 19).
//
// CE QU'IL FAIT. Le chef voit les salariés présents sur SON chantier le jour
// même, avec leurs heures, et peut préparer ou corriger les leurs. C'est la
// feuille d'heures d'équipe, celle que le chef remplit le soir dans la
// camionnette.
//
// SON VOCABULAIRE EST CELUI DU SALARIÉ (étape 20). Cet écran y avait échappé —
// un oubli, pas une décision : il est lu par un homme de chantier, au même
// titre que /poseur. Un seul verbe, ENVOYER ; et les mots du bureau — saisir,
// déclarer, brouillon, enregistrer, valider, intervention, en attente — n'y
// ont pas leur place. Les trois états affichés sont MOT POUR MOT ceux que le
// salarié voit sur sa propre journée : exporté, envoyé, à envoyer. Deux
// vocabulaires pour les mêmes trois états, c'est deux personnes qui ne parlent
// pas de la même chose en se croyant d'accord.
//
// CE QU'IL NE FAIT PAS, ET C'EST DÉLIBÉRÉ.
//
//   Il n'ENVOIE pas à la place de ses salariés. Le chef prépare, le salarié
//   envoie. Envoyer, c'est déclarer ses heures ; on ne déclare pas à la place
//   d'un autre. La base le refuse aussi, pas seulement cet écran.
//
//   Il ne voit ni taux horaire, ni coût, ni paie, ni réglages. Rien de tout
//   cela n'est demandé ici, et la base le lui refuserait de toute façon : son
//   rôle est séparé de celui du bureau, il n'en hérite aucun droit.
//
//   « Son équipe » n'est pas une liste à tenir à jour : c'est qui partage son
//   chantier, ce jour-là. Une liste séparée serait fausse le jour où le bureau
//   déplace quelqu'un.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { corrigerHeures } from '@/lib/corrections';
import { isCounted } from '@/lib/status';
import { TimeCylinder, snapToGrid } from '@/components/time-cylinder';
import { Loader2, Users, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { User } from '@/lib/types';

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
  /** Jour affiché (ISO). */
  date: string;
  /** Chantiers du chef ce jour-là : c'est ce qui définit son équipe. */
  myWorksiteIds: string[];
  worksiteName: (id: string) => string;
  onChanged: () => void;
}

const TD_CSS = `
.bt-td{background:#fff;border:1px solid rgba(21,18,15,.12);border-radius:16px;padding:13px 14px;margin-bottom:10px}
.bt-td-h{display:flex;align-items:center;gap:7px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#6E6A63;font-weight:700}
.bt-td-sub{font-size:12px;color:#9a948a;font-weight:600;margin-top:3px;line-height:1.45}
.bt-td-row{display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid rgba(21,18,15,.07)}
.bt-td-row:last-child{border-bottom:none}
.bt-td-name{flex:1;min-width:0;font-weight:800;font-size:14px;color:#15120F;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-td-h2{font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:700;color:#3a352f;flex:none}
.bt-td-tag{font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:800;text-transform:uppercase;border-radius:6px;padding:2px 6px;flex:none}
.bt-td-tag.envoye{background:#EAF6EF;color:#1F7A4D}
.bt-td-tag.aenvoyer{background:#FFF6E0;color:#8a6d05}
.bt-td-tag.verrou{background:#EFEDE8;color:#5c574f}
.bt-td-edit{flex:none;border:1.5px solid rgba(21,18,15,.2);background:#fff;border-radius:8px;padding:5px 9px;font-family:inherit;font-weight:800;font-size:12px;color:#15120F;cursor:pointer}
.bt-td-edit:disabled{opacity:.45}
.bt-td-empty{font-size:13px;color:#9a948a;font-weight:600;padding:12px 0;text-align:center;line-height:1.5}
.bt-td-form{margin-top:10px;padding-top:10px;border-top:1px solid rgba(21,18,15,.09)}
.bt-td-formh{display:flex;align-items:center;justify-content:space-between;font-weight:800;font-size:13.5px;margin-bottom:8px}
.bt-td-close{border:none;background:none;color:#9a948a;cursor:pointer;padding:2px}
.bt-td-two{display:flex;gap:10px}
.bt-td-two > div{flex:1;min-width:0}
.bt-td-lab{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6E6A63;font-weight:700;margin-bottom:3px}
.bt-td-save{width:100%;margin-top:10px;border:none;border-radius:11px;padding:11px;background:#FFC21A;color:#15120F;font-family:inherit;font-weight:900;font-size:15px;cursor:pointer;box-shadow:0 3px 0 #C99300}
.bt-td-save:disabled{opacity:.6}
`;

const fmtHM = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};

export default function TeamDay({ me, date, myWorksiteIds, worksiteName, onChanged }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [planned, setPlanned] = useState<{ user_id: string; worksite_id: string | null }[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ userId: string; rowId: string | null } | null>(null);
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('17:00');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // La RLS fait le tri : seules remontent les lignes des salariés qui
    // partagent un chantier avec le chef ce jour-là. On ne refiltre pas ici —
    // un filtre côté écran laisserait croire que la protection est là.
    const [entRes, planRes, usrRes] = await Promise.all([
      supabase.from('time_entries')
        .select('id, user_id, worksite_id, start_time, end_time, total_minutes, status, locked')
        .eq('work_date', date).neq('status', 'cancelled').order('start_time'),
      // Le PLANNING aussi : un collègue affecté au chantier qui n'a encore rien
      // saisi n'apparaissait pas — donc le chef ne pouvait pas lui créer sa
      // première ligne, qui est précisément l'usage principal de cet écran.
      supabase.from('planning').select('user_id, worksite_id').eq('work_date', date),
      supabase.from('users').select('*').eq('company_id', me.company_id).eq('is_active', true).order('first_name'),
    ]);
    if (!entRes.error) setRows((entRes.data || []) as Row[]);
    if (!planRes.error) setPlanned((planRes.data || []) as { user_id: string; worksite_id: string | null }[]);
    if (!usrRes.error) setPeople((usrRes.data || []) as User[]);
    setLoading(false);
  }, [date, me.company_id]);

  useEffect(() => { load(); }, [load]);

  /** Les salariés présents sur MES chantiers du jour, moi excepté. */
  const team = useMemo(() => {
    const onMySites = (w: string | null | undefined) => !!w && myWorksiteIds.includes(w);
    const ids = new Set<string>();
    for (const r of rows) if (r.user_id !== me.id && onMySites(r.worksite_id)) ids.add(r.user_id);
    for (const p of planned) if (p.user_id !== me.id && onMySites(p.worksite_id)) ids.add(p.user_id);
    return people.filter((p) => ids.has(p.id));
  }, [rows, planned, people, me.id, myWorksiteIds]);

  /**
   * TOUS les passages du collègue sur mes chantiers, pas le premier. Un
   * collègue peut venir deux fois dans la journée ; n'en montrer qu'un cachait
   * l'autre, et pouvait faire corriger les heures d'un chantier qui n'est pas
   * le mien.
   */
  const rowsFor = (userId: string) =>
    rows.filter((r) => r.user_id === userId && r.worksite_id && myWorksiteIds.includes(r.worksite_id));

  const openEditor = (userId: string, r: Row | null) => {
    setStart(snapToGrid(r?.start_time?.slice(0, 5) || '08:00'));
    setEnd(snapToGrid(r?.end_time?.slice(0, 5) || '17:00'));
    setEditing({ userId, rowId: r?.id ?? null });
  };

  const save = async () => {
    if (!editing) return;
    if (start === end) { toast.error('Début et fin identiques : rien à compter.'); return; }
    const worksiteId = rows.find((r) => r.id === editing.rowId)?.worksite_id || myWorksiteIds[0];
    if (!worksiteId) { toast.error('Aucun chantier pour aujourd’hui.'); return; }
    setSaving(true);
    try {
      if (editing.rowId) {
        const existante = rows.find((r) => r.id === editing.rowId);

        // CORRIGER LES HEURES DE QUELQU'UN D'AUTRE, C'EST LE PRÉVENIR.
        //
        // La trace existait déjà pour le chef (vérifié en base : `modified_at`
        // et `modified_by` sont bien posés). Ce qui manquait, c'est la
        // notification — et le salarié s'en moque de savoir qui a corrigé : de
        // son point de vue, ses heures ont changé sans lui. On passe donc par
        // le MÊME chemin que le bureau.
        //
        // DEUX CAS QUI N'EN SONT PAS, ET IL FAUT LES ÉCARTER TOUS LES DEUX :
        //
        //   · SES PROPRES HEURES. Le chef y reste un salarié ordinaire : pas
        //     de journal, pas de notification à soi-même.
        //
        //   · LES HEURES QUI NE COMPTENT PAS ENCORE. `isCounted` — la règle
        //     unique de `lib/status.ts`. Préparer les heures d'un collègue qui
        //     n'a encore rien envoyé, c'est justement LE travail de cet écran,
        //     pas une correction. Sans ce test, chaque préparation du soir
        //     aurait notifié « tes heures ont été corrigées » sur une journée
        //     que le salarié n'a pas encore envoyée — et il n'aurait rien
        //     compris. Ce qu'il voit alors est juste : ses heures l'attendent,
        //     à lui de les envoyer.
        if (existante && existante.user_id !== me.id && isCounted(existante.status)) {
          const r = await corrigerHeures({ entryId: existante.id, newStart: start, newEnd: end });
          if (!r.ok) throw new Error(r.message);
          setEditing(null);
          await load();
          onChanged();
          if (r.notified) toast.success(r.message); else toast.warning(r.message);
          return;
        }

        // `.select('id')` : une modification refusée par la RLS renvoie 0 ligne
        // SANS erreur, et le chef croirait avoir corrigé.
        const { data, error } = await supabase.from('time_entries')
          .update({ start_time: start, end_time: end }).eq('id', editing.rowId).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Ces heures ne se corrigent plus.');
      } else {
        const { error } = await supabase.from('time_entries').insert({
          company_id: me.company_id, user_id: editing.userId, worksite_id: worksiteId,
          work_date: date, start_time: start, end_time: end,
          break_minutes: 0, meal_allowance: false, status: 'draft',
        });
        if (error) throw error;
      }
      setEditing(null);
      await load();
      onChanged();
      toast.success('C’est noté — le salarié devra l’envoyer lui-même');
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Ça n’a pas pu être noté.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  const editingName = editing
    ? (people.find((p) => p.id === editing.userId)
        ? `${people.find((p) => p.id === editing.userId)!.first_name} ${people.find((p) => p.id === editing.userId)!.last_name}`
        : 'Salarié')
    : '';

  return (
    <div className="bt-td">
      <style dangerouslySetInnerHTML={{ __html: TD_CSS }} />
      <div className="bt-td-h"><Users className="h-3.5 w-3.5" /> Mon équipe aujourd&apos;hui</div>
      <div className="bt-td-sub">
        Les salariés présents sur {myWorksiteIds.length > 1 ? 'tes chantiers' : 'ton chantier'} aujourd&apos;hui
        {myWorksiteIds.length === 1 ? ` — ${worksiteName(myWorksiteIds[0])}` : ''}.
        Tu prépares leurs heures ; <strong>c&apos;est à eux de les envoyer</strong>.
      </div>

      {team.length === 0 ? (
        <div className="bt-td-empty">
          Personne d&apos;autre sur ton chantier pour l&apos;instant.<br />
          Dès qu&apos;un collègue y est attendu ou y travaille, il apparaît ici.
        </div>
      ) : (
        team.map((p) => {
          const rs = rowsFor(p.id);
          if (rs.length === 0) {
            return (
              <div key={p.id} className="bt-td-row">
                <span className="bt-td-name">{p.first_name} {p.last_name}</span>
                <span className="bt-td-h2" style={{ color: '#9a948a' }}>pas d&apos;heures</span>
                <button type="button" className="bt-td-edit" onClick={() => openEditor(p.id, null)}>
                  <Plus className="inline h-3 w-3" /> Ajouter
                </button>
              </div>
            );
          }
          // Une ligne par passage : deux passages dans la journée sont deux
          // lignes, et chacune se corrige pour elle-même.
          return rs.map((r, i) => (
            <div key={r.id} className="bt-td-row">
              <span className="bt-td-name">
                {i === 0 ? `${p.first_name} ${p.last_name}` : ''}
              </span>
              <span className="bt-td-h2">{r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)} · {fmtHM(r.total_minutes)}</span>
              {/* MOT POUR MOT les trois états de la journée du salarié.
                  `isCounted` plutôt qu'un test sur 'submitted' : l'ancien
                  statut 'validated' traîne encore en base, et il compte. */}
              <span className={`bt-td-tag ${r.locked ? 'verrou' : isCounted(r.status) ? 'envoye' : 'aenvoyer'}`}>
                {r.locked ? 'exporté' : isCounted(r.status) ? 'envoyé' : 'à envoyer'}
              </span>
              <button type="button" className="bt-td-edit" disabled={r.locked} onClick={() => openEditor(p.id, r)}>
                Corriger
              </button>
            </div>
          ));
        })
      )}

      {editing && (
        <div className="bt-td-form">
          <div className="bt-td-formh">
            <span>{editingName}</span>
            <button type="button" className="bt-td-close" onClick={() => setEditing(null)}><X className="h-4 w-4" /></button>
          </div>
          <div className="bt-td-two">
            <div>
              <div className="bt-td-lab">Début</div>
              <TimeCylinder value={start} onChange={setStart} />
            </div>
            <div>
              <div className="bt-td-lab">Fin</div>
              <TimeCylinder value={end} onChange={setEnd} />
            </div>
          </div>
          <button type="button" className="bt-td-save" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'OK'}
          </button>
        </div>
      )}
    </div>
  );
}
