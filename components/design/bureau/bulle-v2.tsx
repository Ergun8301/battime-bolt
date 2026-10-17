'use client';

// Design du bureau (v2) · la bulle d'intervention : UN composant pour la grille (compacte), le téléphone (grande) et le fantôme du glisser.
// Règles de la planche : bande gauche = créneau ; pastille = couleur du chantier ; prévue = pointillés ; à envoyer = trait ambre ;
// envoyée = fond encre, heure jaune, « ENVOYÉ » vert ; en direct = fond vert pâle ; retirée = barrée, grisée ; ajoutée par le salarié = trait encre.
// Aucune règle métier ici : l'état se lit sur les mêmes données que la bulle d'avant (heures envoyées, brouillon, pointage en direct, retrait).
import type { ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Check } from 'lucide-react';
import type { PlanningWithWorksite } from '@/lib/types';
import type { RealAgg } from '@/lib/planning-cells';
import { bubbleTitleOf } from '@/lib/planning-cells';
import { dayPartTint } from '@/supabase/functions/_shared/day-part';
import { hashStr } from '@/components/planning-bubble';
import { hm } from '@/supabase/functions/_shared/bureau-vue';
import type { SelState } from './contexte-v2';

export type EtatBulle = 'prevue' | 'a-envoyer' | 'envoyee' | 'en-cours' | 'retiree' | 'ajoutee';
type Ton = 'envoye' | 'a-envoyer' | 'reserve' | 'levee' | 'sans' | 'cours' | 'ajoutee' | 'direct' | 'retiree' | 'relance';
export interface Etiquette { ton: Ton; texte: string }

export interface DonneesBulle {
  p: PlanningWithWorksite; real?: RealAgg; draft?: RealAgg; docs: number; live?: string; withdrawn?: boolean;
  /** Jour passé sans heures envoyées (« PAS D'HEURES ENVOYÉES »). */
  enRetard?: boolean;
}

const hhmm = (t: string) => t.slice(0, 5);
const plage = (p: PlanningWithWorksite) => (p.estimated_start ? `${hhmm(p.estimated_start)}${p.estimated_end ? `–${hhmm(p.estimated_end)}` : ''}` : null);
/** Index (0 à 6) de la couleur du chantier : la même règle que la bulle d'avant et le menu Clients. */
export const indexCouleur = (id: string | null | undefined, repli: string): number => hashStr(id || repli) % 7;

/** Tout ce que la bulle montre, sans JSX : l'état, le créneau, les lignes de texte et les étiquettes. */
export function lireBulle(d: DonneesBulle) {
  const { p, real, draft, live, withdrawn } = d;
  const autre = p.worksite?.client_name === 'Autre' && !!p.notes?.trim();
  const sous = autre ? 'Autre' : [p.worksite?.product_type, p.worksite?.city].filter(Boolean).join(' · ');
  const titre = real || draft ? (p.worksite?.client_name || 'Chantier') : bubbleTitleOf(p);
  const etiquettes: Etiquette[] = [];
  let etat: EtatBulle = 'prevue';
  let heure = plage(p) || 'Sans horaire';
  // Le créneau (bande de gauche) se lit sur l'horaire : celui des heures du salarié si elles existent, sinon l'horaire prévu.
  const creneau = (draft ? dayPartTint(draft.start, draft.end) : null)?.key ?? dayPartTint(p.estimated_start, p.estimated_end)?.key ?? (real ? dayPartTint(real.start, real.end)?.key : undefined) ?? 'journee';
  if (real) {
    etat = 'envoyee';
    heure = `${hhmm(real.start)}–${hhmm(real.end)} · ${hm(real.minutes)}`;
    etiquettes.push({ ton: 'envoye', texte: 'Envoyé' });
    if (real.reception === 'avec') etiquettes.push(real.reserveOpen ? { ton: 'reserve', texte: 'Réserve à traiter' } : { ton: 'levee', texte: 'Réserve levée' });
    else if (real.reception === 'sans') etiquettes.push({ ton: 'sans', texte: 'Sans réserve' });
    else if (real.reception === 'en_cours') etiquettes.push({ ton: 'cours', texte: 'Chantier en cours' });
  } else if (draft) {
    etat = 'a-envoyer';
    heure = `${hhmm(draft.start)}–${hhmm(draft.end)} · ${hm(draft.minutes)}`;
    etiquettes.push({ ton: 'a-envoyer', texte: 'À envoyer' });
  } else if (withdrawn && !live) {
    etat = 'retiree';
    etiquettes.push({ ton: 'retiree', texte: 'Retirée par le salarié' });
  } else if (d.enRetard && !live) {
    etiquettes.push({ ton: 'relance', texte: 'Pas d’heures envoyées' });
  }
  if (live) {
    if (!real && !draft) { etat = 'en-cours'; heure = plage(p) ? `Prévu ${plage(p)}` : 'Sans horaire'; }
    etiquettes.push({ ton: 'direct', texte: `● En cours depuis ${live}` });
  }
  if (p.added_by_worker && etat !== 'en-cours') {
    etat = 'ajoutee';
    // La planche ne redit pas « ENVOYÉ » : la durée affichée dit déjà que les heures comptent.
    const i = etiquettes.findIndex((e) => e.ton === 'envoye'); if (i >= 0) etiquettes.splice(i, 1);
    etiquettes.unshift({ ton: 'ajoutee', texte: 'Ajoutée par le salarié' });
  }
  return { etat, creneau, titre, sous, heure, etiquettes, couleur: indexCouleur(p.worksite_id, p.id) };
}

export function CaseCoche({ sel, classe = 'dzp-bulle__case' }: { sel: SelState; classe?: string }) {
  return <span className={classe} aria-hidden="true">{sel.lock ? '–' : sel.on ? <Check className="h-3 w-3" strokeWidth={3.5} /> : null}</span>;
}

/** Le contenu visuel d'une bulle (sans glisser-déposer). `grand` : téléphone. */
export function CarteBulle({ d, sel, grand, raison }: { d: DonneesBulle; sel?: SelState; grand?: boolean; raison?: string | null }) {
  const b = lireBulle(d);
  return (
    <div className={`dzp-bulle dzp-c${b.couleur}`} data-etat={b.etat} data-creneau={b.creneau} data-grand={grand ? '' : undefined} data-testid="bubble">
      <span className="dzp-bulle__bande" aria-hidden="true" />
      <div className="dzp-bulle__tete">
        <span className="dzp-bulle__pastille" aria-hidden="true" />
        <span className="dzp-bulle__titre" data-testid="bubble-title">{b.titre}</span>
        {d.docs > 0 && <span className="dzp-bulle__docs" title={`${d.docs} document${d.docs > 1 ? 's' : ''}`}>⧉ {d.docs}</span>}
        {sel && <CaseCoche sel={sel} />}
      </div>
      {b.sous && <span className="dzp-bulle__sous">{b.sous}</span>}
      <span className="dzp-bulle__heure" data-testid="bubble-hours">{b.heure}</span>
      {b.etiquettes.length > 0 && (
        <div className="dzp-etiquettes">
          {b.etiquettes.map((e) => <span key={e.texte} className="dzp-etiquette" data-ton={e.ton} data-testid={e.ton === 'direct' ? 'bubble-live' : undefined}>{e.texte}</span>)}
        </div>
      )}
      {raison ? <span className="dzp-bulle__raison" role="status">{raison}</span> : null}
    </div>
  );
}

/** Une bulle de la grille : on la prend (déplacer, copier) et on peut la viser (réordonner). Mêmes identifiants et repères que la bulle d'avant. */
export function BulleV2({ d, sel, onEdit, onToggle, raison }: {
  d: DonneesBulle; sel?: SelState; onEdit: (p: PlanningWithWorksite) => void; onToggle?: (p: PlanningWithWorksite, lock: string | null) => void; raison?: string | null;
}) {
  const { p } = d;
  const drag = useDraggable({ id: p.id, data: { type: 'move' }, disabled: !!sel });
  const drop = useDroppable({ id: `bub|${p.id}` });
  const attr = sel ? (sel.lock ? 'lock' : sel.on ? 'on' : 'off') : undefined;
  return (
    <div ref={drop.setNodeRef} className="dzp-bulle-wrap" data-sur={drop.isOver ? '' : undefined} data-glisse={drag.isDragging ? '' : undefined}
      data-sel={attr} data-pid={sel ? p.id : undefined} data-bub={p.id} data-guide="bureau-planning.bulle">
      <div ref={drag.setNodeRef} {...drag.attributes} {...drag.listeners} className="dzp-prise"
        onClick={(e) => { e.stopPropagation(); if (sel) onToggle?.(p, sel.lock); else onEdit(p); }}
        title={sel ? (sel.lock || (sel.on ? 'Cliquer pour décocher' : 'Cliquer pour cocher')) : ''}>
        <CarteBulle d={d} sel={sel} raison={raison} />
      </div>
    </div>
  );
}

export function Ghost({ titre, ligne, marque }: { titre: ReactNode; ligne?: ReactNode; marque?: string }) {
  return <div className="dzp-fantome" data-testid="drag-overlay">{marque ? <i aria-hidden="true">{marque}</i> : null}<b>{titre}</b>{ligne ? <span>{ligne}</span> : null}</div>;
}
