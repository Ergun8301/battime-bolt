'use client';

// Design du bureau (v2b « Couleur ») · la bulle d'intervention : UN composant pour la grille (compacte), le téléphone (grande) et le fantôme du glisser.
// Planche v2b (docs/design-brief/designer-planning-v2/SPEC-v2b.md) : DEUX lignes au plus (client, puis horaire), aucune étiquette en majuscules,
// un seul code couleur par état (couleurs de la légende des Statistiques) : contour clair = prévue, vert d'eau = en cours, rouge = à envoyer (seul mot écrit),
// violet = envoyée (« ✓ »), barrée = retirée ; coin jaune = ajoutée par le salarié. Le reste (durée, ville, réserve, documents) va dans l'infobulle et la fiche.
// Aucune règle métier ici : l'état se lit sur les mêmes données que la bulle d'avant (heures envoyées, brouillon, pointage en direct, retrait, jour en attente).
import type { ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Check } from 'lucide-react';
import type { PlanningWithWorksite } from '@/lib/types';
import type { RealAgg } from '@/lib/planning-cells';
import { bubbleTitleOf } from '@/lib/planning-cells';
import { hashStr } from '@/components/planning-bubble';
import type { SelState } from './contexte-v2';

export type EtatBulle = 'prevue' | 'sans-horaire' | 'a-envoyer' | 'envoyee' | 'en-cours' | 'retiree';

export interface DonneesBulle {
  p: PlanningWithWorksite; real?: RealAgg; draft?: RealAgg; docs: number; live?: string; withdrawn?: boolean;
  /** Jour passé sans heures envoyées (journée à relancer). */
  enRetard?: boolean;
}

/** « 8 h », « 7 h 30 » (heure d'horloge « 07:30 » ou « 07:30:00 »). */
export function heureFr(t: string): string {
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
/** Une durée en minutes : « 24 h », « 7 h 30 », « 0 h ». */
export function dureeFr(min: number): string {
  const t = Math.max(0, Math.round(min));
  const h = Math.floor(t / 60); const m = t % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
const plageFr = (a?: string | null, b?: string | null) => (a ? `${heureFr(a)}${b ? `–${heureFr(b)}` : ''}` : null);
/** Index (0 à 6) de la couleur du chantier (tiroir Clients seulement : la bulle v2b n'a plus de couleur de chantier). */
export const indexCouleur = (id: string | null | undefined, repli: string): number => hashStr(id || repli) % 7;

/** Tout ce que la bulle montre, sans JSX : l'état, les deux lignes, le coin et l'infobulle. */
export function lireBulle(d: DonneesBulle) {
  const { p, real, draft, live, withdrawn } = d;
  const autre = p.worksite?.client_name === 'Autre' && !!p.notes?.trim();
  const sous = autre ? 'Autre' : [p.worksite?.product_type, p.worksite?.city].filter(Boolean).join(' · ');
  const titre = real || draft ? (p.worksite?.client_name || 'Chantier') : bubbleTitleOf(p);
  const prevu = plageFr(p.estimated_start, p.estimated_end);
  let etat: EtatBulle = prevu ? 'prevue' : 'sans-horaire';
  let ligne = prevu || 'Sans horaire';
  let duree: number | null = null;
  if (real) { etat = 'envoyee'; ligne = `✓ ${plageFr(real.start, real.end)}`; duree = real.minutes; }
  else if (draft) { etat = 'a-envoyer'; ligne = plageFr(draft.start, draft.end) || ligne; duree = draft.minutes; }
  else if (live) etat = 'en-cours';
  else if (withdrawn) etat = 'retiree';
  else if (d.enRetard) etat = 'a-envoyer';
  // L'infobulle (survol) : ce que la bulle ne dit plus (planche v2b : chantier, durée, qui l'a créée), plus la réserve et les documents.
  const info = [
    p.worksite?.client_name || titre, sous,
    duree !== null ? `${dureeFr(duree)} ${etat === 'envoyee' ? 'envoyées' : 'notées, pas encore envoyées'}` : prevu ? `Prévu ${prevu}` : 'Sans horaire',
    live ? `En cours depuis ${live}` : '',
    etat === 'a-envoyer' && !draft ? 'Heures pas encore envoyées' : '',
    etat === 'retiree' ? 'Retirée par le salarié' : '',
    real?.reception === 'avec' ? (real.reserveOpen ? 'Réserve à traiter' : 'Réserve levée') : real?.reception === 'sans' ? 'Sans réserve' : real?.reception === 'en_cours' ? 'Chantier en cours' : '',
    d.docs > 0 ? `${d.docs} document${d.docs > 1 ? 's' : ''}` : '',
    p.added_by_worker ? 'Ajoutée par le salarié' : 'Ajoutée par le bureau',
  ].filter(Boolean).join(' · ');
  return { etat, titre, ligne, info, ajoutee: !!p.added_by_worker, live: !!live };
}

export function CaseCoche({ sel, classe = 'dzp-bulle__case' }: { sel: SelState; classe?: string }) {
  return <span className={classe} aria-hidden="true">{sel.lock ? '–' : sel.on ? <Check className="h-3 w-3" strokeWidth={3.5} /> : null}</span>;
}

/** Le dessin d'une bulle à deux lignes (sans glisser-déposer). Sert aussi aux heures « hors planning » ajoutées par le salarié. */
export function DessinBulle({ etat, titre, ligne, ajoutee, live, info, sel, grand, raison, testId = 'bubble', liveDepuis }: {
  etat: EtatBulle; titre: ReactNode; ligne: ReactNode; ajoutee?: boolean; live?: boolean; info?: string; sel?: SelState; grand?: boolean; raison?: string | null; testId?: string; liveDepuis?: string;
}) {
  return (
    <span className="dzp-bulle" data-etat={etat} data-grand={grand ? '' : undefined} data-ajoutee={ajoutee ? '' : undefined} data-withdrawn={etat === 'retiree' ? '1' : undefined} data-testid={testId} title={info}>
      {ajoutee && <span className="dzp-bulle__coin" aria-hidden="true" />}
      <span className="dzp-bulle__l1">
        {live && <span className="dzp-bulle__point" data-testid="bubble-live" aria-label={liveDepuis ? `En cours depuis ${liveDepuis}` : 'En cours'} role="img" />}
        <span className="dzp-bulle__titre" data-testid={testId === 'bubble' ? 'bubble-title' : undefined}>{titre}</span>
        {sel && <CaseCoche sel={sel} />}
      </span>
      <span className="dzp-bulle__l2">
        <span className="dzp-bulle__heure" data-testid={testId === 'bubble' ? 'bubble-hours' : undefined}>{ligne}</span>
        {etat === 'a-envoyer' && <span className="dzp-bulle__mot">à envoyer</span>}
      </span>
      {raison ? <span className="dzp-bulle__raison" role="status">{raison}</span> : null}
    </span>
  );
}

/** Le contenu visuel d'une bulle d'intervention. `grand` : téléphone. */
export function CarteBulle({ d, sel, grand, raison }: { d: DonneesBulle; sel?: SelState; grand?: boolean; raison?: string | null }) {
  const b = lireBulle(d);
  return <DessinBulle etat={b.etat} titre={b.titre} ligne={b.ligne} ajoutee={b.ajoutee} live={b.live} liveDepuis={d.live} info={sel ? undefined : b.info} sel={sel} grand={grand} raison={raison} />;
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
        title={sel ? (sel.lock || (sel.on ? 'Cliquer pour décocher' : 'Cliquer pour cocher')) : undefined}>
        <CarteBulle d={d} sel={sel} raison={raison} />
      </div>
    </div>
  );
}

export function Ghost({ titre, ligne, marque }: { titre: ReactNode; ligne?: ReactNode; marque?: string }) {
  return <div className="dzp-fantome" data-testid="drag-overlay">{marque ? <i aria-hidden="true">{marque}</i> : null}<b>{titre}</b>{ligne ? <span>{ligne}</span> : null}</div>;
}
