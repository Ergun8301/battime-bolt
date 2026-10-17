'use client';

// Design du bureau (v2b) · la fiche d'une intervention (panneau latéral de 480 px ; feuille du bas sous 1 024 px). Contenu seulement :
// les états, les enregistrements et les garde-fous restent dans admin-planning.tsx (saveAffectation, deleteAffectation, copier, dupliquer, tâche).
// Planche v2b : titre = client (26 px), sous-titre « produit · ville », UNE phrase d'état dans sa couleur (rouge à envoyer, gris envoyée, vert en cours),
// lignes libellé / valeur (Salarié, Jour, Prévu, Heures envoyées, Ajoutée par, Note), pied « Supprimer » · « Copier vers… » · bouton plein. Mêmes champs, mêmes actions.
import type { ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import type { PlanningWithWorksite, User } from '@/lib/types';
import type { RealAgg } from '@/lib/planning-cells';
import { BoutonBureau, FenetreBureau } from './fenetre-bureau';
import { dureeFr, heureFr, lireBulle } from './bulle-v2';
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
  const { p, real, draft } = f;
  const jour = format(parseISO(p.work_date), 'EEEE d MMMM', { locale: fr });
  const prenom = f.worker?.first_name || 'le salarié';
  const nom = f.worker ? `${f.worker.first_name} ${f.worker.last_name}` : '—';
  const ws = p.worksite;
  const sous = [ws?.product_type, ws?.city].filter(Boolean).join(' · ');
  const b = lireBulle({ p, real, draft, docs: f.docs, live: f.live, withdrawn: f.withdrawn, enRetard: f.enRetard });
  const bloque = f.dirty ? 'Enregistrez d’abord vos changements : la copie reprend l’intervention telle qu’elle est enregistrée.' : null;
  const arret = f.copyBusy || !!bloque;
  // Une seule phrase d'état, dans sa couleur (rien quand l'intervention est simplement prévue).
  const etat = b.etat === 'a-envoyer'
    ? { ton: 'rouge', texte: draft ? `Heures notées par ${prenom}, pas encore envoyées.` : `Heures pas envoyées par ${prenom} pour cette journée.` }
    : b.etat === 'envoyee' ? { ton: 'gris', texte: `Heures envoyées${real ? ` : ${heureFr(real.start)}–${heureFr(real.end)} · ${dureeFr(real.minutes)}` : ''}.` }
    : b.etat === 'en-cours' ? { ton: 'vert', texte: `Pointe depuis ${f.live}.` }
    : b.etat === 'retiree' ? { ton: 'gris', texte: 'Retirée par le salarié : ses heures retirées restent dans sa fiche.' }
    : null;
  return (
    <FenetreBureau open onOpenChange={(o) => { if (!o) f.onClose(); }} forme="panneau" titre={ws?.client_name || 'Intervention'} testId="fiche-intervention" className="dzp-fiche-v2b"
      pied={(
        <>
          <button type="button" className="dzp-fiche__supprimer" onClick={f.onDelete} disabled={f.deleting} data-testid="edit-delete" data-guide="bureau-edit.supprimer">
            {f.deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Supprimer
          </button>
          <span className="dzp-fiche__espace" />
          <BoutonBureau onClick={f.onCopyTo} disabled={arret} data-testid="edit-copy-to">Copier vers…</BoutonBureau>
          <BoutonBureau ton="sombre" onClick={f.onSave} disabled={f.saving} data-guide="bureau-edit.enregistrer">
            {f.saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Enregistrer
          </BoutonBureau>
        </>
      )}>
      <div className="dzp-fiche">
        {sous && <p className="dzp-fiche__sous">{sous}</p>}
        {etat && <p className="dzp-fiche__etat" data-ton={etat.ton} data-testid={b.etat === 'retiree' ? 'edit-withdrawn' : 'fiche-etat'}>{etat.texte}</p>}
        <dl className="dzp-fiche__lignes">
          <dt>Salarié</dt><dd>{nom}</dd>
          <dt>Jour</dt><dd>{jour.charAt(0).toUpperCase() + jour.slice(1)}</dd>
          <dt>Prévu</dt><dd className="dzp-fiche__horaire">{f.horaire}</dd>
          <dt>Heures envoyées</dt>
          <dd>{real ? `${heureFr(real.start)} – ${heureFr(real.end)} · ${dureeFr(real.minutes)}${real.count > 1 ? ` (${real.count} saisies)` : ''}` : 'Pas encore'}</dd>
          <dt>Ajoutée par</dt><dd>{p.added_by_worker ? `${nom} (salarié)` : 'Le bureau'}</dd>
          {real?.reception && (
            <>
              <dt>Réception</dt>
              <dd data-ton={real.reception === 'avec' && real.reserveOpen ? 'rouge' : undefined}>
                {real.reception === 'avec' ? (real.reserveOpen ? 'Avec réserve, à traiter' : 'Avec réserve, levée') : real.reception === 'sans' ? 'Sans réserve' : 'Chantier en cours'}
                {real.reception === 'avec' && ws && <> · <button type="button" className="dzp-fiche__lien" onClick={f.onDocs}>photos / documents</button></>}
              </dd>
            </>
          )}
          {real?.note && <><dt>Mot du salarié</dt><dd>« {real.note} »</dd></>}
          <dt><label htmlFor="dzp-fiche-note">Note</label></dt>
          <dd><textarea id="dzp-fiche-note" className="dzp-fiche__note" value={f.note} onChange={(e) => f.setNote(e.target.value)} rows={3} placeholder="Pour le poseur : code portail 1234, attention au chien…" /></dd>
        </dl>
        {!real && f.emptyDraft && <p className="dzp-fiche__aide" data-testid="edit-empty-draft">Brouillon vide du salarié (0 min) : supprimé avec l’intervention.</p>}
        {ws && (
          <div className="dzp-fiche__liens">
            <BoutonBureau onClick={f.onFiche}>Fiche client</BoutonBureau>
            <BoutonBureau onClick={f.onDocs} data-guide="bureau-edit.documents">Documents{f.docs > 0 ? ` (${f.docs})` : ''}</BoutonBureau>
          </div>
        )}
        <div className="dzp-fiche__actions" role="group" aria-label="Actions sur cette intervention" data-testid="edit-actions">
          <button type="button" className="dzp-fiche__action" disabled={arret} onClick={f.onDuplicate} data-testid="edit-duplicate">Dupliquer au lendemain</button>
          {f.onAddTask && <button type="button" className="dzp-fiche__action" disabled={arret} onClick={f.onAddTask} data-testid="edit-add-task">Ajouter une tâche à ce créneau</button>}
        </div>
        {bloque && <p className="dzp-fiche__aide" data-testid="edit-actions-note">{bloque}</p>}
      </div>
    </FenetreBureau>
  );
}
