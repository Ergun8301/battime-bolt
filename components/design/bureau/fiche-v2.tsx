'use client';

// Design du bureau (v2) · la fiche d'une intervention (panneau latéral de 480 px ; feuille du bas sous 1 024 px). Contenu seulement :
// les états, les enregistrements et les garde-fous restent dans admin-planning.tsx (saveAffectation, deleteAffectation, copier, dupliquer, tâche).
import type { ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import type { PlanningWithWorksite, User } from '@/lib/types';
import type { RealAgg } from '@/lib/planning-cells';
import { hm } from '@/supabase/functions/_shared/bureau-vue';
import { BoutonBureau, FenetreBureau } from './fenetre-bureau';
import { CarteBulle, duree2a } from './bulle-v2';
import { useLargeur, REQ_FEUILLE } from './pont-v2';
import './planning-v2.css';

export interface FicheCtx {
  p: PlanningWithWorksite; worker?: User; onClose: () => void;
  real?: RealAgg; draft?: RealAgg; docs: number; live?: string; withdrawn: boolean; emptyDraft: boolean; enRetard: boolean;
  /** La ligne « Horaire prévu » existante (saisie, préréglages, erreur) : même composant, mêmes contrôles. */
  horaire: ReactNode;
  note: string; setNote: (v: string) => void; dirty: boolean; saving: boolean; deleting: boolean; copyBusy: boolean;
  onSave: () => void; onDelete: () => void; onCopyTo: () => void; onDuplicate: () => void; onAddTask?: () => void;
  onFiche: () => void; onDocs: () => void;
}

/**
 * Le bloc « HEURES DÉCLARÉES » de la planche (2c, et le panneau de 2a dont il reprend les couleurs : `pStateBg`, `pStateBig`, `pStateTxt` du script).
 * Lu sur les mêmes données que la ligne d'avant : heures envoyées, saisies non envoyées, pointage en direct, retrait.
 */
function etatHeures(f: FicheCtx): { ton: string; grand: string; texte: string } {
  const { real, draft, live } = f;
  const h = (t: string) => t.slice(0, 5);
  if (real) return { ton: 'envoyee', grand: `${h(real.start)} → ${h(real.end)} · ${duree2a(real.minutes)}`, texte: `Envoyées par le salarié · comptent dans la paie${real.count > 1 ? ` · ${real.count} saisies` : ''}` };
  if (draft) return { ton: 'a-envoyer', grand: `${h(draft.start)} → ${h(draft.end)}`, texte: 'Saisies, pas encore envoyées · ne comptent pas' };
  if (live) return { ton: 'en-cours', grand: `En cours depuis ${live}`, texte: 'Pointage en direct' };
  if (f.withdrawn) return { ton: 'retiree', grand: 'Retirée', texte: 'Retirée par le salarié, gardée dans sa fiche' };
  return { ton: 'prevue', grand: 'Pas encore déclarées', texte: 'Le salarié verra cet horaire comme « prévu »' };
}

/** Planche 2c « Panneau sous 1024 px » : la fiche en feuille du bas (92 % de la hauteur), mêmes champs et mêmes actions que le panneau. */
function FicheFeuille({ f }: { f: FicheCtx }) {
  const { p, real } = f;
  const jour = format(parseISO(p.work_date), 'EEE d', { locale: fr }).toUpperCase().replace('.', '');
  const nom = f.worker ? `${f.worker.first_name} ${f.worker.last_name}`.toUpperCase() : '';
  const ws = p.worksite;
  const sous = [ws?.product_type, ws?.city].filter(Boolean).join(' · ');
  const bloque = f.dirty ? 'Enregistrez d’abord vos changements : la copie reprend l’intervention telle qu’elle est enregistrée.' : null;
  const arret = f.copyBusy || !!bloque;
  const e = etatHeures(f);
  return (
    <FenetreBureau open onOpenChange={(o) => { if (!o) f.onClose(); }} forme="panneau" className="dzp-feuille" kicker={`Intervention · ${jour}${nom ? ` · ${nom}` : ''}`} titre={ws?.client_name || 'Intervention'}
      sous={sous || undefined} testId="fiche-intervention"
      pied={(
        <button type="button" className="dzp-feuille__ok" onClick={f.onSave} disabled={f.saving} data-guide="bureau-edit.enregistrer">
          {f.saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Enregistrer
        </button>
      )}>
      <div className="dzp-feuille__corps">
        {ws && (
          <div className="dzp-feuille__onglets">
            <button type="button" onClick={f.onFiche} aria-label="Fiche client">✎ Fiche</button>
            <button type="button" onClick={f.onDocs} data-guide="bureau-edit.documents" aria-label={`Documents${f.docs > 0 ? ` (${f.docs})` : ''}`}>⧉ Documents{f.docs > 0 ? ` (${f.docs})` : ''}</button>
          </div>
        )}
        <div className="dzp-feuille__heures" data-ton={e.ton} data-testid="fiche-heures">
          <span className="dzp-feuille__k">Heures déclarées</span>
          <b>{e.grand}</b>
          <span>{e.texte}</span>
        </div>
        {!real && f.emptyDraft && <p className="dzp-fiche__aide" data-testid="edit-empty-draft">Brouillon vide du salarié (0 min) : supprimé avec l’intervention.</p>}
        {!real && f.withdrawn && <p className="dzp-fiche__aide" data-testid="edit-withdrawn">Retirée par le salarié : ses heures retirées restent dans sa fiche.</p>}
        {real?.reception === 'avec' && <p className="dzp-fiche__aide" data-ton={real.reserveOpen ? 'alerte' : 'ok'}>{real.reserveOpen ? 'Réception avec réserve — à traiter' : 'Réception avec réserve — levée'}</p>}
        {real?.reception === 'sans' && <p className="dzp-fiche__aide" data-ton="ok">Réceptionné sans réserve</p>}
        {real?.reception === 'en_cours' && <p className="dzp-fiche__aide">Chantier en cours</p>}
        {real?.note && <p className="dzp-fiche__aide">« {real.note} »</p>}
        {real?.reception === 'avec' && ws && <button type="button" className="dzp-fiche__lien" onClick={f.onDocs}>Voir les photos / documents</button>}
        <div className="dzp-feuille__horaire">{f.horaire}</div>
        <textarea className="dzp-feuille__note" value={f.note} onChange={(ev) => f.setNote(ev.target.value)} rows={2} placeholder="Note pour le poseur" aria-label="Note pour le poseur" />
        <div className="dzp-feuille__actions" role="group" aria-label="Actions sur cette intervention" data-testid="edit-actions">
          <button type="button" disabled={arret} onClick={f.onCopyTo} data-testid="edit-copy-to">Copier vers un autre jour…</button>
          <button type="button" disabled={arret} onClick={f.onDuplicate} data-testid="edit-duplicate">Dupliquer au lendemain</button>
          {f.onAddTask && <button type="button" disabled={arret} onClick={f.onAddTask} data-testid="edit-add-task">Ajouter une tâche à ce créneau</button>}
          <button type="button" data-ton="supprimer" onClick={f.onDelete} disabled={f.deleting} data-testid="edit-delete" data-guide="bureau-edit.supprimer">
            {f.deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Supprimer
          </button>
        </div>
        {bloque && <p className="dzp-fiche__aide" data-testid="edit-actions-note">{bloque}</p>}
      </div>
    </FenetreBureau>
  );
}

export default function FicheV2({ f }: { f: FicheCtx }) {
  const feuille = useLargeur(REQ_FEUILLE);
  if (feuille) return <FicheFeuille f={f} />;
  return <FichePanneau f={f} />;
}

function FichePanneau({ f }: { f: FicheCtx }) {
  const { p, real } = f;
  const jour = format(parseISO(p.work_date), 'EEE d MMM', { locale: fr }).toUpperCase().replace('.', '');
  const nom = f.worker ? `${f.worker.first_name} ${f.worker.last_name}`.toUpperCase() : '';
  const ws = p.worksite;
  const sous = [ws?.product_type, ws?.address, ws?.city].filter(Boolean).join(' · ');
  const bloque = f.dirty ? 'Enregistrez d’abord vos changements : la copie reprend l’intervention telle qu’elle est enregistrée.' : null;
  const arret = f.copyBusy || !!bloque;
  return (
    <FenetreBureau open onOpenChange={(o) => { if (!o) f.onClose(); }} forme="panneau" kicker={`Intervention · ${nom} · ${jour}`} titre={ws?.client_name || 'Intervention'} testId="fiche-intervention"
      pied={(
        <>
          <BoutonBureau ton="destructif-doux" onClick={f.onDelete} disabled={f.deleting} data-testid="edit-delete" data-guide="bureau-edit.supprimer">
            {f.deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Supprimer
          </BoutonBureau>
          <BoutonBureau ton="principal" onClick={f.onSave} disabled={f.saving} data-guide="bureau-edit.enregistrer">
            {f.saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Enregistrer
          </BoutonBureau>
        </>
      )}>
      <div className="dzp-fiche">
        {sous && <p className="dzp-fiche__sous">{sous}</p>}
        <CarteBulle d={{ p, real: f.real, draft: f.draft, docs: f.docs, live: f.live, withdrawn: f.withdrawn, enRetard: f.enRetard }} />
        {ws && (
          <div className="dzp-fiche__liens">
            <BoutonBureau onClick={f.onFiche}>Fiche client</BoutonBureau>
            <BoutonBureau onClick={f.onDocs} data-guide="bureau-edit.documents">Documents{f.docs > 0 ? ` (${f.docs})` : ''}</BoutonBureau>
          </div>
        )}
        <div className="dzp-fiche__bloc">{f.horaire}</div>
        <label className="dzp-fiche__bloc">
          <span className="dzp-fiche__lib">Note pour le poseur</span>
          <textarea className="dzp-fiche__note" value={f.note} onChange={(e) => f.setNote(e.target.value)} rows={3} placeholder="Ex : code portail 1234, attention au chien…" />
        </label>
        <div className="dzp-fiche__bloc">
          <span className="dzp-fiche__lib dzp-fiche__lib--mono">Heures déclarées (lecture seule)</span>
          <div className="dzp-fiche__heures">
            <span>Heures déclarées</span>
            <b>{real ? `${real.start.slice(0, 5)}–${real.end.slice(0, 5)} · ${hm(real.minutes)} réelles${real.count > 1 ? ` (${real.count} saisies)` : ''}` : 'Pas encore'}</b>
          </div>
          {!real && f.withdrawn && <p className="dzp-fiche__aide" data-testid="edit-withdrawn">Retirée par le salarié : ses heures retirées restent dans sa fiche.</p>}
          {!real && f.emptyDraft && <p className="dzp-fiche__aide" data-testid="edit-empty-draft">Brouillon vide du salarié (0 min) : supprimé avec l’intervention.</p>}
          {real?.reception === 'avec' && <p className="dzp-fiche__aide" data-ton={real.reserveOpen ? 'alerte' : 'ok'}>{real.reserveOpen ? 'Réception avec réserve — à traiter' : 'Réception avec réserve — levée'}</p>}
          {real?.reception === 'sans' && <p className="dzp-fiche__aide" data-ton="ok">Réceptionné sans réserve</p>}
          {real?.reception === 'en_cours' && <p className="dzp-fiche__aide">Chantier en cours</p>}
          {real?.note && <p className="dzp-fiche__aide">« {real.note} »</p>}
          {real?.reception === 'avec' && ws && <button type="button" className="dzp-fiche__lien" onClick={f.onDocs}>Voir les photos / documents</button>}
        </div>
        <div className="dzp-fiche__bloc" role="group" aria-label="Actions sur cette intervention" data-testid="edit-actions">
          <span className="dzp-fiche__lib dzp-fiche__lib--mono">Autres actions</span>
          <div className="dzp-menu__groupe">
            <button type="button" className="dzp-menu__item" disabled={arret} onClick={f.onCopyTo} data-testid="edit-copy-to">Copier vers un autre jour…<i aria-hidden="true">›</i></button>
            <button type="button" className="dzp-menu__item" disabled={arret} onClick={f.onDuplicate} data-testid="edit-duplicate">Dupliquer au lendemain<i aria-hidden="true">›</i></button>
            {f.onAddTask && <button type="button" className="dzp-menu__item" disabled={arret} onClick={f.onAddTask} data-testid="edit-add-task">Ajouter une tâche à ce créneau<i aria-hidden="true">›</i></button>}
          </div>
          {bloque && <p className="dzp-fiche__aide" data-testid="edit-actions-note">{bloque}</p>}
        </div>
      </div>
    </FenetreBureau>
  );
}
