'use client';

// Design bureau · « Tout valider » : les journées oubliées d'un salarié ou de toute l'entreprise, sur un jour, une semaine ou un mois, envoyées ou validées
// en une fois. Ouvert depuis la tuile « À relancer », la liste « Salariés » et la feuille d'heures d'un salarié. Lecture et écriture : lib/office-send.ts
// (chargerAValider, validerEnLot), chargé avec cette fenêtre.
import { useEffect, useMemo, useState } from 'react';
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CheckCheck, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { User } from '@/lib/types';
import { chargerAValider, validerEnLot, type AValider, type JourAValider } from '@/lib/office-send';
import { Alerte, Btn, Coque, Seg, Squelettes, Vide } from './lot3a-ui';
import './valider-tout-v2.css';

type Periode = 'jour' | 'semaine' | 'mois';
const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const duree = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;

function bornes(periode: Periode, ancre: Date): [Date, Date] {
  if (periode === 'jour') return [ancre, ancre];
  if (periode === 'semaine') return [startOfWeek(ancre, { weekStartsOn: 1 }), endOfWeek(ancre, { weekStartsOn: 1 })];
  return [startOfMonth(ancre), endOfMonth(ancre)];
}
function libellePeriode(periode: Periode, a: Date, b: Date) {
  if (periode === 'jour') return format(a, 'EEEE d MMMM', { locale: fr });
  if (periode === 'semaine') return `S-${format(a, 'I')} · ${format(a, 'd MMM', { locale: fr })} – ${format(b, 'd MMM', { locale: fr })}`;
  return format(a, 'MMMM yyyy', { locale: fr });
}

export default function ValiderToutV2({ open, onOpenChange, companyId, officeUserId, workers, worksiteNames, today, userId: userIdInitial = null, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; companyId: string; officeUserId: string; workers: User[]; worksiteNames: Map<string, string>;
  today: string; userId?: string | null; onDone: () => void;
}) {
  const [userId, setUserId] = useState<string | null>(userIdInitial);
  const [periode, setPeriode] = useState<Periode>('mois');
  const [ancre, setAncre] = useState(() => parseISO(today));
  const [data, setData] = useState<AValider | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [retires, setRetires] = useState<Set<string>>(new Set());
  const [confirmer, setConfirmer] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [tour, setTour] = useState(0);
  const [a, b] = bornes(periode, ancre);
  const from = iso(a), to = iso(b);
  const futur = from > today;

  useEffect(() => { setUserId(userIdInitial); }, [userIdInitial]);
  useEffect(() => {
    if (!open) return;
    let fini = false;
    setData(null); setErreur(null); setRetires(new Set()); setConfirmer(false);
    if (futur) { setData({ jours: [], aVoir: [] }); return; }
    chargerAValider({ companyId, from, to, today, userId }).then((r) => { if (!fini) setData(r); }, (e: { message?: string }) => { if (!fini) setErreur(e?.message || 'Lecture impossible'); });
    return () => { fini = true; };
  }, [open, companyId, from, to, today, userId, futur, tour]);

  const nomDe = useMemo(() => { const m = new Map(workers.map((w) => [w.id, `${w.first_name || ''} ${w.last_name || ''}`.trim() || 'Salarié'])); return (id: string) => m.get(id) || 'Ancien salarié'; }, [workers]);
  const groupes = useMemo(() => {
    const g = new Map<string, JourAValider[]>();
    for (const j of data?.jours || []) { const l = g.get(j.user_id) || []; l.push(j); g.set(j.user_id, l); }
    return Array.from(g, ([uid, jours]) => ({ uid, jours })).sort((x, y) => nomDe(x.uid).localeCompare(nomDe(y.uid), 'fr'));
  }, [data, nomDe]);
  const choisis = (data?.jours || []).filter((j) => !retires.has(j.cle));
  const totalMin = choisis.reduce((n, j) => n + j.minutes, 0);
  const nbSal = new Set(choisis.map((j) => j.user_id)).size;
  const basculer = (cles: string[], garder: boolean) => setRetires((s) => { const n = new Set(s); cles.forEach((k) => (garder ? n.delete(k) : n.add(k))); return n; });
  const deplacer = (sens: 1 | -1) => setAncre((d) => (periode === 'jour' ? addDays(d, sens) : periode === 'semaine' ? addWeeks(d, sens) : addMonths(d, sens)));

  const valider = async () => {
    setOccupe(true);
    try {
      const r = await validerEnLot({ companyId, officeUserId, jours: choisis });
      if (r.faits) toast.success(`${r.faits} journée${r.faits > 1 ? 's' : ''} validée${r.faits > 1 ? 's' : ''} : ${nbSal > 1 ? 'chaque salarié est prévenu' : 'le salarié est prévenu'}`);
      if (r.ignores) toast.message(`${r.ignores} journée${r.ignores > 1 ? 's avaient' : ' avait'} déjà changé : laissée${r.ignores > 1 ? 's' : ''} telle${r.ignores > 1 ? 's' : ''} quelle${r.ignores > 1 ? 's' : ''}.`);
      onDone(); setTour((t) => t + 1);
    } catch (e) {
      const msg = (e as { message?: string })?.message || 'Validation impossible';
      toast.error(/submitted_by/.test(msg) ? 'Mise à jour de la base en attente : validation impossible pour le moment.' : msg);
    } finally { setOccupe(false); setConfirmer(false); }
  };

  const pied = data && choisis.length > 0 ? (confirmer ? (
    <div className="vt-confirme" data-testid="valider-tout-confirm">
      <span>Valider {choisis.length} journée{choisis.length > 1 ? 's' : ''} ({duree(totalMin)}) pour {nbSal} salarié{nbSal > 1 ? 's' : ''} ? Elles compteront, et chacun sera prévenu une fois.</span>
      <div className="vt-confirme__btns">
        <Btn disabled={occupe} onClick={() => setConfirmer(false)}>Annuler</Btn>
        <button type="button" className="vt-go" disabled={occupe} onClick={valider} data-testid="valider-tout-ok">
          {occupe ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-5 w-5" aria-hidden="true" />} Valider
        </button>
      </div>
    </div>
  ) : (
    <button type="button" className="vt-go" onClick={() => setConfirmer(true)} data-testid="valider-tout-go">
      <CheckCheck className="h-5 w-5" aria-hidden="true" /> Valider {choisis.length} journée{choisis.length > 1 ? 's' : ''} · {duree(totalMin)}
    </button>
  )) : null;

  return (
    <Coque open={open} onOpenChange={onOpenChange} forme="panneau" largeur={720} kicker="Heures" titre="Tout valider" testId="valider-tout"
      sous="Les journées oubliées, envoyées ou validées en une seule fois" pied={pied}>
      <div className="vt-filtres">
        <label className="vt-qui">
          <span>Qui</span>
          <select value={userId || ''} onChange={(e) => setUserId(e.target.value || null)} data-testid="valider-tout-qui">
            <option value="">Toute l’entreprise</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{nomDe(w.id)}</option>)}
          </select>
        </label>
        <div className="vt-periode">
          <div className="vt-qui"><span>Période</span><Seg valeur={periode} onChange={(v) => { setPeriode(v); setAncre(parseISO(today)); }}
            options={[{ v: 'jour', l: 'Jour', testId: 'vt-jour' }, { v: 'semaine', l: 'Semaine', testId: 'vt-semaine' }, { v: 'mois', l: 'Mois', testId: 'vt-mois' }]} /></div>
          <div className="vt-nav">
            <button type="button" className="vt-rond" onClick={() => deplacer(-1)} aria-label="Période précédente" data-testid="vt-prec"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
            <b className="vt-nav__l" data-testid="vt-libelle">{libellePeriode(periode, a, b)}</b>
            <button type="button" className="vt-rond" onClick={() => deplacer(1)} aria-label="Période suivante" disabled={iso(b) >= today}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        </div>
      </div>

      {erreur ? <Alerte ton="erreur" titre="Lecture impossible">{erreur}</Alerte>
        : !data ? <Squelettes n={4} />
        : data.jours.length === 0 ? <Vide t="Rien à valider sur cette période ✅" s={futur ? 'Cette période n’est pas encore passée.' : 'Toutes les journées prévues ont leurs heures envoyées.'} testId="valider-tout-vide" />
        : (
          <div className="vt-liste" data-testid="valider-tout-liste">
            {groupes.map(({ uid, jours }) => {
              const cles = jours.map((j) => j.cle);
              const tous = cles.every((k) => !retires.has(k));
              const min = jours.filter((j) => !retires.has(j.cle)).reduce((n, j) => n + j.minutes, 0);
              return (
                <section key={uid} className="vt-groupe">
                  <label className="vt-groupe__tete">
                    <input type="checkbox" checked={tous} onChange={(e) => basculer(cles, e.target.checked)} />
                    <span className="vt-groupe__nom">{nomDe(uid)}</span>
                    <span className="vt-groupe__n">{jours.length} journée{jours.length > 1 ? 's' : ''} · {duree(min)}</span>
                  </label>
                  <ul>
                    {jours.map((j) => (
                      <li key={j.cle}>
                        <label className="vt-jour" data-testid="valider-tout-jour">
                          <input type="checkbox" checked={!retires.has(j.cle)} onChange={(e) => basculer([j.cle], e.target.checked)} />
                          <span className="vt-jour__d">{format(parseISO(j.work_date), 'EEE d MMM', { locale: fr })}</span>
                          <span className="vt-jour__c">{(j.worksite_id && worksiteNames.get(j.worksite_id)) || 'Chantier'}</span>
                          <span className="vt-jour__h">{j.debut} → {j.fin} · {duree(j.minutes)}</span>
                          <span className="vt-tag" data-sorte={j.sorte} title={j.sorte === 'saisi' ? 'Saisi par le salarié, pas envoyé' : 'Prévu au planning, rien de saisi : l’horaire prévu sera validé'}>
                            {j.sorte === 'saisi' ? 'saisi' : 'prévu'}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      {data && data.aVoir.length > 0 ? (
        <p className="vt-avoir" data-testid="valider-tout-avoir">
          {data.aVoir.length} journée{data.aVoir.length > 1 ? 's' : ''} à voir une par une ({Array.from(new Set(data.aVoir.map((x) => x.raison))).join(', ')}) : ouvrez-les depuis le planning.
        </p>
      ) : null}
    </Coque>
  );
}
