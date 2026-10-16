'use client';

// Design salarié, étape 5 · feuilles du bas (?ui=2 seulement).
// Ces morceaux ne contiennent QUE du contenu : titre, texte, boutons. Les états, les verrous et les appels restent dans poseur-day.tsx
// (les `<Dialog open>` et leurs gestionnaires n'ont pas bougé). Sans `ui2`, chaque morceau rend EXACTEMENT le balisage d'avant
// (v1 inchangée) : `FeuilleTete` rend l'ancien `DialogHeader`, `FeuilleCorps` ne rend rien de plus, `FeuillePied` rend l'ancienne rangée de boutons.
import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { DialogHeader } from '@/components/ui/dialog';

/** En-tête de feuille : le petit mot au-dessus (kicker, majuscules), puis le titre (DialogTitle, jamais retiré : c'est lui qui nomme la fenêtre). `suite` : texte rangé dans le corps de la feuille en v2, dans l'en-tête en v1. */
export function FeuilleTete({ ui2, kicker, titre, suite }: { ui2: boolean; kicker?: string; titre: ReactNode; suite?: ReactNode }) {
  if (!ui2) return <DialogHeader>{titre}{suite}</DialogHeader>;
  return (
    <>
      <div className="dz-feuille__tete">
        <div className="dz-feuille__titres">
          {kicker ? <span className="dz-feuille__kicker">{kicker}</span> : null}
          {titre}
        </div>
      </div>
      {suite ? <div className="dz-feuille__corps">{suite}</div> : null}
    </>
  );
}

/** Corps qui défile (en-tête et pied restent en place). En v1 : rien de plus que les enfants. */
export function FeuilleCorps({ ui2, children }: { ui2: boolean; children: ReactNode }) {
  return ui2 ? <div className="dz-feuille__corps">{children}</div> : <>{children}</>;
}

/** Pied fixe : le bouton principal y reste visible. `v1` : la classe de l'ancienne rangée de boutons. */
export function FeuillePied({ ui2, v1, children }: { ui2: boolean; v1: string; children: ReactNode }) {
  if (!ui2 && v1 === '') return <>{children}</>; // v1 : un bouton seul, sans rangée autour
  return <div className={ui2 ? 'dz-feuille__pied' : v1}>{children}</div>;
}

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '');
/** « JEU. 15 » : le jour de la journée dupliquée (petit mot de la feuille « Dupliquer »). */
export function kickerJour(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : format(d, 'EEE d', { locale: fr }).toUpperCase();
}
/** « MAISON DÉMO · 07:30 → 11:30 » : la ligne dont on parle (petit mot de « Retirer ce chantier ? »). */
export function kickerLigne(e: { worksite?: { client_name?: string | null } | null; start_time?: string | null; end_time?: string | null }): string {
  const nom = (e.worksite?.client_name || '').toUpperCase();
  const h = e.start_time && e.end_time ? `${hhmm(e.start_time)} → ${hhmm(e.end_time)}` : '';
  return [nom, h].filter(Boolean).join(' · ');
}

/** Classe d'un bouton de feuille : v2 = `dz-bouton` + `data-ton` ; v1 = la classe d'avant (à étaler dans le `Button`). */
export function boutonFeuille(ui2: boolean, ton: 'principal' | 'normal' | 'destructif', v1?: string): { className?: string; 'data-ton'?: string } {
  return ui2 ? { className: 'dz-bouton', 'data-ton': ton } : (v1 !== undefined ? { className: v1 } : {});
}
