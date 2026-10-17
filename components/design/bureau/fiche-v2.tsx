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
import { CarteBulle } from './bulle-v2';
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

export default function FicheV2({ f }: { f: FicheCtx }) {
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
