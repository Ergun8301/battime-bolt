'use client';

// Design bureau · lot 2 · HP17 à HP19, HP23 à HP31, HM05, HM07 : « Exporter l'équipe » (panneau), clôture du mois (question), « Exporter un salarié » (choix).
// HABILLAGE SEULEMENT. Ce fichier ne lit rien, n'écrit rien : la période, les exports, l'alerte de verrou, la clôture et la réouverture sont les fonctions de
// components/admin-planning.tsx (inchangées) ; elles arrivent ici en propriétés. Chargé en différé quand `useBureauUi2()` est vrai.
//
// Ce que la planche dessine et que le code ne permet pas (donc PAS ajouté) :
//   · « Heures envoyées » et « Salariés » de la période (HP18) : il n'existe aucun chiffre pour une période choisie avant l'export (le comptage se fait au clic, pour l'alerte) ;
//   · le nom du cabinet (« Envoyer à Cabinet Exemple ») : seule l'adresse du comptable est enregistrée ;
//   · « Clôturé le 15/10 par Sam Patron » et la liste des jours en brouillon (HP28, HP29) : le code ne compte que le NOMBRE de brouillons et ne garde pas qui a clos ;
//   · « Annuler » après la clôture (HP29) : la réouverture passe par « Rouvrir… ».
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { addDays, format, getISOWeek, isSameDay, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Loader2, Mail } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ExportPreload } from '@/components/export-menu';
import { DAYS_IN_WEEK } from '@/lib/week';
import { FenetreB, PanneauB } from './heures-fenetre';
// Lot 3 A : ses vues voyagent dans CE morceau différé (aucun nouveau morceau : chacun coûte au chargeur partagé par toutes les pages). Voir lot3a-v2.ts.
export * from './lot3a-v2';

export type ExportChoix = 'pdf' | 'excel' | 'csv' | 'comptable';
export interface Periode { from: Date; to: Date }

export interface MoisClotureV2 { mois: string; clos: boolean; courant: boolean }

export interface ExporterV2Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  periode: Periode | null;
  setPeriode: (p: Periode) => void;
  /** Lundi de la semaine affichée au planning (« Cette semaine »). */
  semaine: Date;
  exporting: boolean;
  onPick: (k: ExportChoix) => void;
  comptableEmail: string | null;
  mois: MoisClotureV2[];
  clotureBusy: boolean;
  onCloturer: (mois: string) => void;
  onRouvrir: (mois: string) => void;
  onUnSalarie: () => void;
  /** Bascule « Un salarié » : l'équipe (mêmes salariés que « Exporter un salarié ») et le choix d'un salarié (ouvre sa fiche en « Feuille d'heures », sans verrou). */
  workers?: SalarieBrut[];
  onChoisirSalarie?: (id: string) => void;
  onAjouterSalarie?: () => void;
}

const jour = (d: Date) => format(d, 'yyyy-MM-dd');
const moisEnLettres = (m: string) => format(new Date(`${m}-01T00:00:00`), 'MMMM yyyy', { locale: fr });

/** « S-42 · 12 – 18 octobre » pour une semaine entière du planning, sinon « 12 oct. → 18 oct. 2026 ». */
export function libellePeriodeV2(p: Periode, semaine: Date): string {
  const finSemaine = addDays(semaine, DAYS_IN_WEEK - 1);
  if (jour(p.from) === jour(semaine) && jour(p.to) === jour(finSemaine)) {
    const m1 = format(p.from, 'MMMM', { locale: fr });
    const m2 = format(p.to, 'MMMM', { locale: fr });
    return `S-${getISOWeek(p.from)} · ${format(p.from, 'd')}${m1 === m2 ? '' : ` ${m1}`} – ${format(p.to, 'd')} ${m2}`;
  }
  if (isSameDay(p.from, p.to)) return format(p.from, 'EEEE d MMMM yyyy', { locale: fr });
  return `${format(p.from, 'd MMM', { locale: fr })} → ${format(p.to, 'd MMM yyyy', { locale: fr })}`;
}

export function ChoixPeriode({ periode, setPeriode, semaine, disabled, popoverAlign = 'end' }: {
  periode: Periode | null; setPeriode: (p: Periode) => void; semaine: Date; disabled?: boolean; popoverAlign?: 'start' | 'end';
}) {
  const auj = startOfDay(new Date());
  const finSemaine = addDays(semaine, DAYS_IN_WEEK - 1);
  const choix = !periode ? '' : isSameDay(periode.from, auj) && isSameDay(periode.to, auj) ? 'jour'
    : jour(periode.from) === jour(semaine) && jour(periode.to) === jour(finSemaine) ? 'semaine' : 'creneau';
  return (
    <div className="dz-hb-seg" role="group" aria-label="Période">
      <button type="button" aria-pressed={choix === 'jour'} disabled={disabled} onClick={() => setPeriode({ from: auj, to: auj })}>{"Aujourd'hui"}</button>
      <button type="button" aria-pressed={choix === 'semaine'} disabled={disabled} onClick={() => setPeriode({ from: semaine, to: finSemaine })}>Cette semaine</button>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-pressed={choix === 'creneau'} disabled={disabled}>Créneau</button>
        </PopoverTrigger>
        <PopoverContent className="bt-skin dz-portail w-auto p-0" align={popoverAlign}>
          <Calendar mode="range" numberOfMonths={1} locale={fr}
            selected={periode ?? undefined}
            defaultMonth={periode?.from}
            onSelect={(r) => { if (r?.from) setPeriode({ from: r.from, to: r.to ?? r.from }); }} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

const PASTILLES: { k: Exclude<ExportChoix, 'comptable'>; nom: string }[] = [
  { k: 'pdf', nom: 'PDF' }, { k: 'excel', nom: 'Excel' }, { k: 'csv', nom: 'CSV paie' },
];

export default function ExporterV2(p: ExporterV2Props) {
  const libelle = useMemo(() => (p.periode ? libellePeriodeV2(p.periode, p.semaine) : ''), [p.periode, p.semaine]);
  const sansPeriode = !p.periode;
  // L'alerte de verrouillage v2 se charge pendant qu'on choisit la période (jamais au premier affichage de /admin).
  useEffect(() => { void import('./verrou-v2'); }, []);
  // EN HAUT du panneau : « Toute l'équipe | Un salarié ». Présentation seulement : « Toute l'équipe » est le contenu d'avant (mêmes gestionnaires, même
  // verrou) ; « Un salarié » montre la liste de « Exporter un salarié » sur place (même choix : la fiche du salarié, rien n'est verrouillé). C'est le SEUL
  // accès à l'export d'un salarié dans ce panneau : l'ancien lien du bas « Un seul salarié ? » (doublon de la bascule) est retiré.
  const [mode, setMode] = useState<'equipe' | 'salarie'>('equipe');
  useEffect(() => { if (p.open) setMode('equipe'); }, [p.open]);
  const avecSalarie = !!p.workers && !!p.onChoisirSalarie;
  return (
    <PanneauB open={p.open} onOpenChange={p.onOpenChange} large testId="team-export" kicker="Paie" titre={mode === 'salarie' ? 'Exporter un salarié' : "Exporter l'équipe"}
      sousTete={avecSalarie ? (
        <div className="dz-hb-bascule">
          <div className="dz-hb-seg" role="group" aria-label="Qui exporter" data-testid="export-bascule">
            <button type="button" aria-pressed={mode === 'equipe'} onClick={() => setMode('equipe')} data-testid="export-bascule-equipe">Toute l&apos;équipe</button>
            <button type="button" aria-pressed={mode === 'salarie'} onClick={() => setMode('salarie')} data-testid="export-bascule-salarie">Un salarié</button>
          </div>
        </div>
      ) : undefined}>
      <ExportPreload />
      {mode === 'salarie' && avecSalarie ? (
        <ListeSalaries salaries={versChoix(p.workers!)} onChoisir={p.onChoisirSalarie!} onAjouter={p.onAjouterSalarie ?? p.onUnSalarie} />
      ) : (<>
      <div className="dz-hb-champ">
        <span className="dz-hb-nom">Période</span>
        <ChoixPeriode periode={p.periode} setPeriode={p.setPeriode} semaine={p.semaine} disabled={p.exporting} />
      </div>
      {p.periode ? (
        <ul className="dz-hb-kv dz-hb-carte" data-testid="export-recap">
          <li>Période<b data-texte="ui">{libelle}</b></li>
        </ul>
      ) : (
        <div className="dz-hb-carte">
          <p className="dz-hb-vide" data-testid="export-sans-periode">Choisissez une période.</p>
        </div>
      )}
      <p className="dz-hb-aide">Seules les heures envoyées sortent.</p>

      <div className="dz-hb-champ" data-guide="bureau-export.menu">
        <span className="dz-hb-etiquette" data-ton="neutre">Fichier</span>
        <div className="dz-hb-fichiers">
          {PASTILLES.map(({ k, nom }) => (
            <button key={k} type="button" className="dz-hb-btn" data-ton="encre" data-testid={`team-export-menu-${k}`}
              disabled={p.exporting || sansPeriode} onClick={() => p.onPick(k)}>{nom}</button>
          ))}
          {p.exporting ? <span className="dz-hb-attente-fichier" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Export en cours…</span> : null}
        </div>
      </div>

      <div className="dz-hb-champ">
        <span className="dz-hb-etiquette" data-ton="neutre">Comptable</span>
        <div className="dz-hb-carte dz-hb-comptable">
          <div>
            <b>Envoyer au comptable</b>
            <small>{p.comptableEmail ? `${p.comptableEmail} · tableur Excel en pièce jointe` : 'Ajoutez l’adresse du comptable dans les réglages.'}</small>
          </div>
          <button type="button" className="dz-hb-btn" data-ton="principal" data-testid="send-accountant" data-guide="bureau-export.comptable"
            disabled={p.exporting || sansPeriode || !p.comptableEmail}
            title={p.comptableEmail ? `Envoyer le tableur à ${p.comptableEmail}` : 'Enregistrez l’adresse de votre comptable dans les réglages'}
            onClick={() => p.onPick('comptable')}>
            {p.exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />} Envoyer
          </button>
        </div>
      </div>

      <div className="dz-hb-note" data-testid="export-verrouille">
        <b>Exporter verrouille les heures de la période</b>
        <span>Le salarié ne peut plus les modifier ; le bureau peut encore. Une alerte vous dit combien de lignes avant de verrouiller.</span>
      </div>

      <div className="dz-hb-champ" data-guide="bureau-export.mois">
        <span className="dz-hb-etiquette" data-ton="neutre">Clôture du mois</span>
        <ul className="dz-hb-mois dz-hb-carte">
          {p.mois.map((m) => (
            <li key={m.mois}>
              <div>
                <b>{moisEnLettres(m.mois)}</b>
                <small>{m.clos ? 'Les salariés ne peuvent plus rien y changer' : m.courant ? 'en cours' : 'mois terminé'}</small>
              </div>
              <div className="dz-hb-droite">
                {m.clos ? <span className="dz-hb-chip" data-etat="clos">Clos</span> : null}
                <button type="button" className="dz-hb-btn" data-ton={m.clos || m.courant ? undefined : 'encre'} disabled={p.clotureBusy}
                  data-testid={m.clos ? `rouvrir-${m.mois}` : `cloturer-${m.mois}`}
                  onClick={() => (m.clos ? p.onRouvrir(m.mois) : p.onCloturer(m.mois))}>
                  {m.clos ? 'Rouvrir…' : 'Clôturer…'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      </>)}
    </PanneauB>
  );
}

/** « Clôturer septembre 2026 ? » (HP28, HM07) : ce qui restera bloqué, avant de le faire. */
export function ClotureV2({ mois, brouillons, busy, onCancel, onConfirm }: {
  mois: string | null; brouillons: number; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const label = mois ? moisEnLettres(mois) : '';
  const nomMois = mois ? format(new Date(`${mois}-01T00:00:00`), 'MMMM', { locale: fr }) : '';
  return (
    <FenetreB alerte open={mois != null} onOpenChange={(o) => { if (!o) onCancel(); }} testId="closure-confirm"
      titre={<span className="capitalize">Clôturer {label} ?</span>}
      pied={(
        <>
          <button type="button" className="dz-hb-btn" onClick={onCancel}>Annuler</button>
          <button type="button" className="dz-hb-btn" data-ton="encre" data-taille="principal" disabled={busy} data-testid="closure-confirm-btn" onClick={onConfirm}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null} Clôturer <span className="capitalize">{nomMois}</span>
          </button>
        </>
      )}>
      {brouillons > 0 ? (
        <div className="dz-hb-note" data-ton="attention" data-testid="closure-drafts">
          <b>{brouillons} journée{brouillons > 1 ? 's' : ''} en brouillon resteront bloquée{brouillons > 1 ? 's' : ''}</b>
          <span>Elles ne sont pas envoyées, donc pas dans l’export — et après la clôture, le salarié ne pourra plus les envoyer.</span>
        </div>
      ) : null}
      <p>Les salariés ne pourront plus rien saisir, modifier ni envoyer sur ce mois. Vous gardez la main et pouvez rouvrir à tout moment.</p>
    </FenetreB>
  );
}

export interface SalarieChoix { id: string; nom: string; initiales: string; sous?: string }
/** Un salarié tel que le planning le lit (la mise en forme pour la liste se fait ici, dans le morceau différé). */
export interface SalarieBrut { id: string; first_name?: string | null; last_name?: string | null; role?: string | null }
const versChoix = (ws: SalarieBrut[]): SalarieChoix[] => ws.map((w) => ({
  id: w.id, nom: `${w.first_name || ''} ${w.last_name || ''}`.trim(), initiales: `${(w.first_name || '?')[0]}${(w.last_name || '')[0] || ''}`.toUpperCase(),
  sous: w.role === 'lead' ? 'Chef d’équipe' : undefined,
}));

/** La liste des salariés (« Exporter un salarié » et la bascule « Un salarié » du panneau Exporter) : le choix ouvre la fiche, rien ne part d'ici. */
function ListeSalaries({ salaries, onChoisir, onAjouter }: { salaries: SalarieChoix[]; onChoisir: (id: string) => void; onAjouter: () => void }) {
  return salaries.length === 0 ? (
    <>
      <p className="dz-hb-vide">Aucun salarié à exporter pour le moment.</p>
      <button type="button" className="dz-hb-btn" data-ton="principal" onClick={onAjouter}>Ajouter un salarié</button>
    </>
  ) : (
    <>
      <ul className="dz-hb-choix" data-testid="export-salaries">
        {salaries.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onChoisir(s.id)}>
              <span className="dz-hb-initiales" aria-hidden="true">{s.initiales}</span>
              <span>{s.nom}{s.sous ? <small>{s.sous}</small> : null}</span>
              <i aria-hidden="true">›</i>
            </button>
          </li>
        ))}
      </ul>
      <p className="dz-hb-aide">Ouvre sa fiche en « Feuille d’heures » : l’export d’un seul salarié ne verrouille rien.</p>
    </>
  );
}

/** « Exporter un salarié » (HP31) : le choix ouvre la fiche, rien ne part d'ici. */
export function ExportSalarieV2({ open, onOpenChange, workers, onChoisir, onAjouter }: {
  open: boolean; onOpenChange: (o: boolean) => void; workers: SalarieBrut[]; onChoisir: (id: string) => void; onAjouter: () => void;
}): ReactNode {
  return (
    <FenetreB open={open} onOpenChange={onOpenChange} testId="export-worker" titre="Exporter un salarié"
      pied={undefined}>
      <ListeSalaries salaries={versChoix(workers)} onChoisir={onChoisir} onAjouter={onAjouter} />
    </FenetreB>
  );
}

