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

/** Étiquettes de la carte 1a (`styleItem`) : la planche ne redit pas « ENVOYÉ » (l'horaire « ✓ … » le dit) ; « EN DIRECT » seul (l'horaire dit « ● depuis … »). */
function etiquettes1a(e: Etiquette[]): Etiquette[] {
  return e.filter((x) => x.ton !== 'envoye').map((x) => (x.ton === 'direct' ? { ...x, texte: 'En direct' } : x.ton === 'reserve' ? { ...x, texte: '⚠ Réserve à traiter' } : x));
}

/** Le contenu visuel d'une bulle (sans glisser-déposer). `grand` : téléphone. `planche1a` : la grille de l'ordinateur (titre, horaire et étiquettes écrits comme la carte 1a). */
export function CarteBulle({ d, sel, grand, raison, planche1a = false }: { d: DonneesBulle; sel?: SelState; grand?: boolean; raison?: string | null; planche1a?: boolean }) {
  const b0 = lireBulle(d);
  const b = planche1a ? (() => { const x = lireBulle2a(d); return { ...b0, titre: x.titre, heure: x.heure, etiquettes: etiquettes1a(b0.etiquettes) }; })() : b0;
  return (
    <div className={`dzp-bulle dzp-c${b.couleur}`} data-etat={b.etat} data-creneau={b.creneau} data-grand={grand ? '' : undefined} data-withdrawn={b.etat === 'retiree' ? '1' : undefined} data-testid="bubble">
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

/** « 4h00 » : la durée telle que l'écrit la planche 2a (heures, « h », minutes sur deux chiffres). */
export const duree2a = (minutes: number): string => { const m = Math.max(0, Math.round(minutes)); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };

/** Minutes écoulées depuis « 07:45 » (heure de Paris), ou null si l'heure n'est pas lisible (pointage d'un autre jour : « jeu. 07:45 »). */
export function minutesDepuis(depuis: string, maintenant = new Date()): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(depuis.trim());
  if (!m) return null;
  const [h, mn] = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(maintenant).split(':').map(Number);
  const d = h * 60 + mn - (Number(m[1]) * 60 + Number(m[2]));
  return d >= 0 ? d : null;
}

/**
 * La bulle de la GRILLE, telle que la dessine la planche 2a (`styleItem` du script, réglage « envoyées sombres » allumé) : fond du créneau, liseré de 4 px,
 * titre 800 12,5 px, horaire en mono 11 px, une seule étiquette. Mêmes états que la bulle d'avant (lus par lireBulle), seuls le dessin et les libellés suivent la planche.
 */
export function lireBulle2a(d: DonneesBulle) {
  const b = lireBulle(d);
  const { p, real, draft, live } = d;
  const prevu = p.estimated_start ? (p.estimated_end ? `${hhmm(p.estimated_start)}–${hhmm(p.estimated_end)}` : `${hhmm(p.estimated_start)} · fin à préciser`) : 'sans horaire';
  let heure = prevu;
  let etiquette: string | null = null;
  if (b.etat === 'envoyee' && real) heure = `✓ ${hhmm(real.start)}–${hhmm(real.end)} · ${duree2a(real.minutes)}`;
  else if (b.etat === 'a-envoyer' && draft) { heure = `${hhmm(draft.start)}–${hhmm(draft.end)} · ${duree2a(draft.minutes)}`; etiquette = 'À ENVOYER'; }
  else if (b.etat === 'en-cours' && live) { const n = minutesDepuis(live); heure = `● depuis ${live}${n !== null ? ` · ${duree2a(n)}` : ''}`; etiquette = 'EN DIRECT'; }
  else if (b.etat === 'retiree') etiquette = 'RETIRÉE PAR LE SALARIÉ';
  else if (b.etat === 'ajoutee') {
    const min = real?.minutes ?? draft?.minutes ?? null;
    heure = min !== null ? `${duree2a(min)} · hors planning` : `${prevu} · hors planning`;
    etiquette = 'AJOUTÉE PAR LE SALARIÉ';
  }
  // « Autre » nommé par le salarié : la planche titre la carte par ce nom (« Dépannage SAV »), même quand des heures existent.
  const titre = p.worksite?.client_name === 'Autre' && p.notes?.trim() ? p.notes.trim() : b.titre;
  return { ...b, titre, heure, etiquette };
}

/** Une carte de la grille 2a (aussi utilisée pour une réunion et pour les heures ajoutées hors planning). */
export function Carte2a({ etat, creneau, titre, heure, etiquette, sel, testId = 'bubble', title }: {
  etat: EtatBulle | 'reunion'; creneau: string; titre: ReactNode; heure: ReactNode; etiquette?: string | null; sel?: SelState; testId?: string; title?: string;
}) {
  return (
    <div className="dzp-carte" data-etat={etat} data-creneau={creneau} data-withdrawn={etat === 'retiree' ? '1' : undefined} data-testid={testId} title={title}>
      <span className="dzp-carte__lisere" aria-hidden="true" />
      <span className="dzp-carte__titre" data-testid={testId === 'bubble' ? 'bubble-title' : undefined}>{titre}</span>
      <span className="dzp-carte__heure" data-testid={testId === 'bubble' ? 'bubble-hours' : undefined}>{heure}</span>
      {etiquette ? <span className="dzp-carte__tag" data-testid={etat === 'en-cours' ? 'bubble-live' : undefined}>{etiquette}</span> : null}
      {sel && <CaseCoche sel={sel} classe="dzp-bulle__case dzp-carte__case" />}
    </div>
  );
}

/** Une bulle de la grille : on la prend (déplacer, copier) et on peut la viser (réordonner). Mêmes identifiants et repères que la bulle d'avant. */
export function BulleV2({ d, sel, onEdit, onToggle, raison, mise = '2a' }: {
  d: DonneesBulle; sel?: SelState; onEdit: (p: PlanningWithWorksite) => void; onToggle?: (p: PlanningWithWorksite, lock: string | null) => void; raison?: string | null;
  /** '1a' : la bulle du lot 1 (ordinateur, 1 024 px et plus) ; '2a' : la carte compacte de la planche 2a (tablette). */
  mise?: '1a' | '2a';
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
        {mise === '1a' ? <CarteBulle d={d} sel={sel} raison={raison} planche1a /> : (
          <>
            {(() => { const b = lireBulle2a(d); return <Carte2a etat={b.etat} creneau={b.creneau} titre={b.titre} heure={b.heure} etiquette={b.etiquette} sel={sel} title={b.sous || undefined} />; })()}
            {raison ? <span className="dzp-bulle__raison" role="status">{raison}</span> : null}
          </>
        )}
      </div>
    </div>
  );
}

export function Ghost({ titre, ligne, marque }: { titre: ReactNode; ligne?: ReactNode; marque?: string }) {
  return <div className="dzp-fantome" data-testid="drag-overlay">{marque ? <i aria-hidden="true">{marque}</i> : null}<b>{titre}</b>{ligne ? <span>{ligne}</span> : null}</div>;
}
